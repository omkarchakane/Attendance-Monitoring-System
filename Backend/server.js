const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Load environment variables
require('dotenv').config();

// Import database configuration
const database = require('./config/database');

// Import routes
const attendanceRoutes = require('./routes/attendance');
const studentRoutes = require('./routes/students');
const reportRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/upload');

// Import middleware
const { handleUploadErrors } = require('./middleware/upload');
const { authenticateToken, optionalAuth } = require('./middleware/auth');

// Create Express app
const app = express();
const server = createServer(app);

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173" // Vite default
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all requests
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Body parsing middleware
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' 
}));

// Static files middleware
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/exports', express.static(path.join(__dirname, 'exports')));

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Add Socket.IO instance to request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`👤 User connected: ${socket.id}`);
  
  // Store user info
  socket.userData = {
    connectedAt: new Date(),
    ipAddress: socket.handshake.address
  };
  
  // Join class room for real-time updates
  socket.on('joinClass', (classId) => {
    socket.join(classId);
    socket.currentClass = classId;
    console.log(`📚 User ${socket.id} joined class: ${classId}`);
    
    // Send current online users count to the class
    const room = io.sockets.adapter.rooms.get(classId);
    const userCount = room ? room.size : 0;
    io.to(classId).emit('classUserCount', userCount);
  });
  
  // Leave class room
  socket.on('leaveClass', (classId) => {
    socket.leave(classId);
    console.log(`📚 User ${socket.id} left class: ${classId}`);
    
    // Send updated user count
    const room = io.sockets.adapter.rooms.get(classId);
    const userCount = room ? room.size : 0;
    io.to(classId).emit('classUserCount', userCount);
  });
  
  // Handle attendance marking events
  socket.on('markAttendance', (data) => {
    console.log(`📝 Attendance marked by ${socket.id}:`, data);
    // Broadcast to all users in the same class
    if (socket.currentClass) {
      socket.to(socket.currentClass).emit('attendanceUpdate', {
        type: 'attendance_marked',
        data: data,
        timestamp: new Date()
      });
    }
  });
  
  // Handle real-time monitoring toggle
  socket.on('toggleMonitoring', (data) => {
    console.log(`🔄 Monitoring toggled by ${socket.id}:`, data);
    if (data.classId) {
      socket.to(data.classId).emit('monitoringStatus', {
        monitoring: data.monitoring,
        userId: socket.id,
        timestamp: new Date()
      });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`👋 User disconnected: ${socket.id}, reason: ${reason}`);
    
    // Update class user count if user was in a class
    if (socket.currentClass) {
      const room = io.sockets.adapter.rooms.get(socket.currentClass);
      const userCount = room ? room.size : 0;
      io.to(socket.currentClass).emit('classUserCount', userCount);
    }
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// API Routes
app.use('/api/attendance', attendanceRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/upload', uploadRoutes);

// Auth routes with stricter rate limiting
app.use('/api/auth', authLimiter, (req, res, next) => {
  // Add auth routes here if you have them
  next();
});

// Health check endpoints
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    const memoryUsage = process.memoryUsage();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: dbHealth,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
      },
      socketConnections: io.engine.clientsCount
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database health check
app.get('/api/health/database', async (req, res) => {
  try {
    const health = await database.healthCheck();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Socket.IO health check
app.get('/api/health/socket', (req, res) => {
  res.json({
    status: 'healthy',
    connections: io.engine.clientsCount,
    rooms: Array.from(io.sockets.adapter.rooms.keys()),
    timestamp: new Date().toISOString()
  });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'MIT-ADT Smart Attendance Management System API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'RESTful API for face recognition-based attendance system',
    endpoints: {
      attendance: {
        'POST /api/attendance/capture': 'Mark attendance via camera capture',
        'POST /api/attendance/upload': 'Mark attendance via photo upload',
        'GET /api/attendance/live/:classId': 'Get real-time attendance data',
        'GET /api/attendance/stats/:classId': 'Get attendance statistics'
      },
      students: {
        'GET /api/students': 'Get all students',
        'GET /api/students/class/:classId': 'Get students by class',
        'POST /api/students/register': 'Register new student',
        'PUT /api/students/:studentId': 'Update student information',
        'DELETE /api/students/:studentId': 'Delete student'
      },
      reports: {
        'POST /api/reports/generate-daily-sheet': 'Generate daily attendance sheet',
        'POST /api/reports/generate-monthly': 'Generate monthly report',
        'GET /api/reports/list/:classId': 'List available reports',
        'GET /api/reports/download/daily/:filename': 'Download daily sheet',
        'GET /api/reports/download/reports/:filename': 'Download monthly report'
      },
      upload: {
        'POST /api/upload/image': 'Upload single image',
        'POST /api/upload/images': 'Upload multiple images',
        'POST /api/upload/faces/:studentId': 'Upload face images for student',
        'POST /api/upload/students-csv': 'Upload CSV for bulk student import'
      }
    },
    realtime: {
      events: {
        'joinClass': 'Join a class room for real-time updates',
        'leaveClass': 'Leave a class room',
        'markAttendance': 'Mark attendance event',
        'toggleMonitoring': 'Toggle attendance monitoring'
      },
      listeners: {
        'attendanceMarked': 'New attendance marked',
        'batchAttendanceMarked': 'Batch attendance processed',
        'attendanceUpdate': 'Real-time attendance update',
        'monitoringStatus': 'Monitoring status change',
        'classUserCount': 'Number of users in class'
      }
    }
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// File upload error handling
app.use(handleUploadErrors);

// Global error handler
app.use((error, req, res, next) => {
  console.error(`❌ Server Error [${req.id}]:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Mongoose validation error
  if (error.name === 'ValidationError') {
    return res.status(400).json({ 
      success: false, 
      error: 'Validation Error',
      details: Object.values(error.errors).map(e => e.message),
      requestId: req.id
    });
  }
  
  // Mongoose cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid ID format',
      requestId: req.id
    });
  }
  
  // MongoDB duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(409).json({
      success: false,
      error: `${field} already exists`,
      field: field,
      value: error.keyValue[field],
      requestId: req.id
    });
  }
  
  // CORS error
  if (error.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation',
      requestId: req.id
    });
  }
  
  // Default server error
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    requestId: req.id
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: '/api/docs'
  });
});

// 404 handler for all other routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error closing server:', err);
      process.exit(1);
    }
    
    console.log('🔒 HTTP server closed');
    
    // Close Socket.IO connections
    io.close((err) => {
      if (err) {
        console.error('❌ Error closing Socket.IO:', err);
        process.exit(1);
      }
      
      console.log('🔒 Socket.IO connections closed');
      
      // Close database connection
      database.mongoose.connection.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err);
          process.exit(1);
        }
        
        console.log('🔒 Database connection closed');
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      });
    });
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Function to start the server
async function startServer() {
  try {
    console.log('🚀 Starting MIT-ADT Smart Attendance System...');
    console.log(`📅 Date: ${new Date().toLocaleString('en-IN')}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize database connection
    await database.initialize();
    
    // Get port from environment
    const PORT = process.env.PORT || 5000;
    
    // Start the server
    server.listen(PORT, () => {
      console.log('\n✅ Server started successfully!');
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`🤖 ML Service: ${process.env.ML_SERVICE_URL || 'http://localhost:5001'}`);
      console.log(`📡 Socket.IO ready for real-time communication`);
      console.log(`📊 API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`💓 Health Check: http://localhost:${PORT}/api/health`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n🔧 Development Mode Features:');
        console.log('   - Detailed error messages');
        console.log('   - Request logging');
        console.log('   - Hot reload support');
      }
      
      console.log('\n📚 MIT-ADT University Smart Attendance System');
      console.log('   Developed by: Venkat Tarun, Chanakya Marbate, Soham Kokate, Siddhant Dakhane');
      console.log('   Faculty Guide: Dr. Shubhra Mathur\n');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
module.exports = { app, server, io };
