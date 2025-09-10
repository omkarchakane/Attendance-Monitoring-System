const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.connectionOptions = this.getConnectionOptions();
    this.setupEventListeners();
  }

  // Get connection options with best practices
  getConnectionOptions() {
    return {
      // Connection settings
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      // Timeout settings
      serverSelectionTimeoutMS: 10000, // 10 seconds to select server
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      connectTimeoutMS: 10000, // 10 seconds to establish connection
      
      // Connection pool settings
      maxPoolSize: 50, // Maximum number of connections in pool
      minPoolSize: 5, // Minimum number of connections in pool
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Retry settings
      retryWrites: true, // Automatically retry writes
      retryReads: true, // Automatically retry reads
      
      // Other settings
      family: 4, // Use IPv4, skip trying IPv6
      heartbeatFrequencyMS: 10000, // How often to check server status (10 seconds)
      
      // Write concern
      w: 'majority', // Wait for majority of replica set members
      
      // Authentication (if needed)
      authSource: process.env.MONGO_AUTH_SOURCE || 'admin',
    };
  }

  // Setup event listeners for connection monitoring
  setupEventListeners() {
    // Connection successful
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connection established successfully');
      console.log(`📍 Connected to: ${this.getMaskedConnectionString()}`);
      this.isConnected = true;
      this.retryCount = 0;
    });

    // Connection opened
    mongoose.connection.once('open', () => {
      console.log('🔓 MongoDB connection opened and ready for operations');
    });

    // Connection error
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error.message);
      this.isConnected = false;
      
      // Log specific error types
      if (error.name === 'MongoServerSelectionError') {
        console.error('🔍 Server selection failed - check MongoDB server status');
      } else if (error.name === 'MongoTimeoutError') {
        console.error('⏱️ Connection timeout - check network connectivity');
      } else if (error.name === 'MongoAuthenticationError') {
        console.error('🔐 Authentication failed - check credentials');
      }
    });

    // Connection disconnected
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      this.isConnected = false;
      
      if (!this.isShuttingDown) {
        console.log('🔄 Attempting to reconnect...');
        this.connectWithRetry();
      }
    });

    // Connection reconnected
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected successfully');
      this.isConnected = true;
      this.retryCount = 0;
    });

    // Connection close
    mongoose.connection.on('close', () => {
      console.log('🔒 MongoDB connection closed');
      this.isConnected = false;
    });

    // Process termination handlers
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGUSR2', () => this.gracefulShutdown('SIGUSR2')); // For nodemon
  }

  // Get masked connection string for logging (hide sensitive info)
  getMaskedConnectionString() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) return 'Unknown';
    
    // Replace password with asterisks
    return uri.replace(/:([^:@]+)@/, ':***@');
  }

  // Connect with retry logic
  async connectWithRetry() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!uri) {
      console.error('❌ MongoDB URI not found in environment variables');
      console.error('📝 Please set MONGO_URI or MONGODB_URI in your .env file');
      process.exit(1);
    }

    console.log(`🔄 MongoDB connection attempt ${this.retryCount + 1}/${this.maxRetries + 1}`);
    
    try {
      await mongoose.connect(uri, this.connectionOptions);
      return mongoose.connection;
      
    } catch (error) {
      console.error(`❌ Connection attempt ${this.retryCount + 1} failed:`, error.message);
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = this.calculateRetryDelay();
        
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await this.sleep(delay);
        
        return this.connectWithRetry();
      } else {
        console.error(`❌ Failed to connect to MongoDB after ${this.maxRetries + 1} attempts`);
        console.error('🔍 Please check:');
        console.error('   - MongoDB server is running');
        console.error('   - Connection string is correct');
        console.error('   - Network connectivity');
        console.error('   - Authentication credentials');
        
        process.exit(1);
      }
    }
  }

  // Calculate retry delay with exponential backoff
  calculateRetryDelay() {
    // Exponential backoff: delay increases with each retry
    return Math.min(this.retryDelay * Math.pow(2, this.retryCount - 1), 30000); // Max 30 seconds
  }

  // Sleep utility function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize database connection
  async initialize() {
    try {
      console.log('🚀 Initializing database connection...');
      
      // Check if already connected
      if (mongoose.connection.readyState === 1) {
        console.log('✅ Database already connected');
        return mongoose.connection;
      }

      return await this.connectWithRetry();
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  // Get connection status
  getConnectionStatus() {
    const readyStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      status: readyStates[mongoose.connection.readyState] || 'unknown',
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      isConnected: this.isConnected,
      retryCount: this.retryCount
    };
  }

  // Health check for API endpoints
  async healthCheck() {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      // Simple ping to check if connection is responsive
      await mongoose.connection.db.admin().ping();
      
      return {
        status: 'healthy',
        message: 'Database connection is working properly',
        timestamp: new Date().toISOString(),
        details: this.getConnectionStatus()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString(),
        details: this.getConnectionStatus()
      };
    }
  }

  // Graceful shutdown
  async gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Graceful shutdown initiated...`);
    this.isShuttingDown = true;
    
    try {
      if (mongoose.connection.readyState === 1) {
        console.log('🔒 Closing database connection...');
        await mongoose.connection.close();
        console.log('✅ Database connection closed successfully');
      }
      
      console.log('👋 Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Force reconnection (useful for testing)
  async forceReconnect() {
    try {
      console.log('🔄 Forcing database reconnection...');
      
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
      }
      
      this.retryCount = 0;
      return await this.connectWithRetry();
      
    } catch (error) {
      console.error('❌ Force reconnect failed:', error);
      throw error;
    }
  }

  // Get database statistics
  async getStats() {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      const stats = await mongoose.connection.db.stats();
      
      return {
        database: stats.db,
        collections: stats.collections,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        fileSize: stats.fileSize,
        nsSizeMB: stats.nsSizeMB
      };
      
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      throw error;
    }
  }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

// Export the connection instance and utility functions
module.exports = {
  // Initialize database connection
  initialize: () => dbConnection.initialize(),
  
  // Get connection status
  getConnectionStatus: () => dbConnection.getConnectionStatus(),
  
  // Health check
  healthCheck: () => dbConnection.healthCheck(),
  
  // Get database statistics
  getStats: () => dbConnection.getStats(),
  
  // Force reconnect
  forceReconnect: () => dbConnection.forceReconnect(),
  
  // Get mongoose instance
  mongoose: mongoose,
  
  // Get connection object
  connection: mongoose.connection,
  
  // Connection status constants
  STATES: {
    DISCONNECTED: 0,
    CONNECTED: 1,
    CONNECTING: 2,
    DISCONNECTING: 3
  }
};

// Auto-initialize if this file is run directly
if (require.main === module) {
  console.log('🔧 Database configuration loaded directly');
  dbConnection.initialize()
    .then(() => {
      console.log('✅ Database connection test successful');
    })
    .catch((error) => {
      console.error('❌ Database connection test failed:', error);
      process.exit(1);
    });
}
