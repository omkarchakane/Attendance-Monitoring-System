const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User'); // Assuming you have a User model

class AuthMiddleware {
  
  // JWT Authentication middleware
  static authenticateToken(req, res, next) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
      
      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Access token required',
          code: 'MISSING_TOKEN'
        });
      }
      
      jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
              success: false,
              error: 'Token expired',
              code: 'TOKEN_EXPIRED'
            });
          }
          
          if (err.name === 'JsonWebTokenError') {
            return res.status(403).json({
              success: false,
              error: 'Invalid token',
              code: 'INVALID_TOKEN'
            });
          }
          
          return res.status(403).json({
            success: false,
            error: 'Token verification failed',
            code: 'TOKEN_VERIFICATION_FAILED'
          });
        }
        
        req.user = decoded;
        next();
      });
      
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authentication service error'
      });
    }
  }
  
  // Optional authentication (for public/private hybrid routes)
  static optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
      if (err) {
        req.user = null;
      } else {
        req.user = decoded;
      }
      next();
    });
  }
  
  // Role-based authorization middleware
  static authorize(...allowedRoles) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'NOT_AUTHENTICATED'
          });
        }
        
        const userRole = req.user.role || 'student';
        
        if (!allowedRoles.includes(userRole)) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            code: 'INSUFFICIENT_PERMISSIONS',
            required: allowedRoles,
            current: userRole
          });
        }
        
        next();
      } catch (error) {
        console.error('Authorization middleware error:', error);
        return res.status(500).json({
          success: false,
          error: 'Authorization service error'
        });
      }
    };
  }
  
  // Class-based access control
  static classAccess(req, res, next) {
    try {
      const { classId } = req.params;
      const userRole = req.user?.role;
      const userClasses = req.user?.classes || [];
      
      // Admins and super admins have access to all classes
      if (['admin', 'super_admin'].includes(userRole)) {
        return next();
      }
      
      // Teachers can access their assigned classes
      if (userRole === 'teacher' && userClasses.includes(classId)) {
        return next();
      }
      
      // Students can only access their own class
      if (userRole === 'student' && userClasses.includes(classId)) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        error: 'Access denied to this class',
        code: 'CLASS_ACCESS_DENIED'
      });
      
    } catch (error) {
      console.error('Class access middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Access control service error'
      });
    }
  }
  
  // API Key authentication for external services
  static authenticateApiKey(req, res, next) {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      
      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: 'API key required',
          code: 'MISSING_API_KEY'
        });
      }
      
      const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
      
      if (!validApiKeys.includes(apiKey)) {
        return res.status(403).json({
          success: false,
          error: 'Invalid API key',
          code: 'INVALID_API_KEY'
        });
      }
      
      req.apiAccess = true;
      next();
      
    } catch (error) {
      console.error('API key authentication error:', error);
      return res.status(500).json({
        success: false,
        error: 'API authentication service error'
      });
    }
  }
  
  // Session-based authentication (alternative to JWT)
  static authenticateSession(req, res, next) {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          success: false,
          error: 'Session expired or invalid',
          code: 'SESSION_INVALID'
        });
      }
      
      // Add user info to request
      req.user = {
        id: req.session.userId,
        role: req.session.userRole,
        email: req.session.userEmail
      };
      
      next();
      
    } catch (error) {
      console.error('Session authentication error:', error);
      return res.status(500).json({
        success: false,
        error: 'Session service error'
      });
    }
  }
  
  // Rate limiting for authentication routes
  static createAuthRateLimit(windowMs = 15 * 60 * 1000, max = 5) {
    return rateLimit({
      windowMs, // 15 minutes default
      max, // limit each IP to 5 requests per windowMs
      message: {
        success: false,
        error: 'Too many authentication attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false
    });
  }
  
  // Middleware to check if user exists and is active
  static async validateUser(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: 'User identification required',
          code: 'USER_ID_MISSING'
        });
      }
      
      // Check if user exists and is active (if you have a User model)
      try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }
        
        if (!user.isActive) {
          return res.status(403).json({
            success: false,
            error: 'User account is deactivated',
            code: 'ACCOUNT_DEACTIVATED'
          });
        }
        
        // Add full user object to request
        req.userData = user;
        
      } catch (dbError) {
        console.error('User validation database error:', dbError);
        // Continue without database validation if DB is unavailable
      }
      
      next();
      
    } catch (error) {
      console.error('User validation middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'User validation service error'
      });
    }
  }
  
  // IP whitelist middleware
  static ipWhitelist(allowedIPs = []) {
    return (req, res, next) => {
      try {
        const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        
        // If no whitelist is defined, allow all
        if (allowedIPs.length === 0) {
          return next();
        }
        
        if (!allowedIPs.includes(clientIP)) {
          console.warn(`Blocked access from IP: ${clientIP}`);
          return res.status(403).json({
            success: false,
            error: 'Access denied from your IP address',
            code: 'IP_NOT_WHITELISTED'
          });
        }
        
        next();
        
      } catch (error) {
        console.error('IP whitelist middleware error:', error);
        return res.status(500).json({
          success: false,
          error: 'IP validation service error'
        });
      }
    };
  }
  
  // Time-based access control (e.g., only during class hours)
  static timeBasedAccess(allowedHours = { start: 8, end: 18 }) {
    return (req, res, next) => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Skip weekends (adjust as needed)
        if (currentDay === 0 || currentDay === 6) {
          return res.status(403).json({
            success: false,
            error: 'System access not allowed on weekends',
            code: 'WEEKEND_ACCESS_DENIED'
          });
        }
        
        if (currentHour < allowedHours.start || currentHour >= allowedHours.end) {
          return res.status(403).json({
            success: false,
            error: `System access only allowed between ${allowedHours.start}:00 and ${allowedHours.end}:00`,
            code: 'TIME_ACCESS_DENIED',
            currentTime: now.toLocaleTimeString()
          });
        }
        
        next();
        
      } catch (error) {
        console.error('Time-based access middleware error:', error);
        return res.status(500).json({
          success: false,
          error: 'Time validation service error'
        });
      }
    };
  }
}

// Export individual methods for convenience
module.exports = AuthMiddleware;

// Also export as individual functions
module.exports.authenticateToken = AuthMiddleware.authenticateToken;
module.exports.optionalAuth = AuthMiddleware.optionalAuth;
module.exports.authorize = AuthMiddleware.authorize;
module.exports.classAccess = AuthMiddleware.classAccess;
module.exports.authenticateApiKey = AuthMiddleware.authenticateApiKey;
module.exports.authenticateSession = AuthMiddleware.authenticateSession;
module.exports.validateUser = AuthMiddleware.validateUser;
module.exports.createAuthRateLimit = AuthMiddleware.createAuthRateLimit;
module.exports.ipWhitelist = AuthMiddleware.ipWhitelist;
module.exports.timeBasedAccess = AuthMiddleware.timeBasedAccess;
