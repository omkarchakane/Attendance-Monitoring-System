const Joi = require('joi');
const validator = require('validator');

class ValidationMiddleware {
  
  // Generic validation middleware using Joi schemas
  static validate(schema) {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.body, {
          abortEarly: false, // Return all validation errors
          stripUnknown: true, // Remove unknown fields
          convert: true // Convert types when possible
        });
        
        if (error) {
          const errorDetails = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context.value
          }));
          
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errorDetails
          });
        }
        
        // Replace req.body with validated and sanitized data
        req.body = value;
        next();
        
      } catch (validationError) {
        console.error('Validation middleware error:', validationError);
        return res.status(500).json({
          success: false,
          error: 'Validation service error'
        });
      }
    };
  }
  
  // Validate query parameters
  static validateQuery(schema) {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });
        
        if (error) {
          const errorDetails = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context.value
          }));
          
          return res.status(400).json({
            success: false,
            error: 'Query validation failed',
            code: 'QUERY_VALIDATION_ERROR',
            details: errorDetails
          });
        }
        
        req.query = value;
        next();
        
      } catch (validationError) {
        console.error('Query validation middleware error:', validationError);
        return res.status(500).json({
          success: false,
          error: 'Query validation service error'
        });
      }
    };
  }
  
  // Validate URL parameters
  static validateParams(schema) {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });
        
        if (error) {
          const errorDetails = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context.value
          }));
          
          return res.status(400).json({
            success: false,
            error: 'Parameter validation failed',
            code: 'PARAMS_VALIDATION_ERROR',
            details: errorDetails
          });
        }
        
        req.params = value;
        next();
        
      } catch (validationError) {
        console.error('Params validation middleware error:', validationError);
        return res.status(500).json({
          success: false,
          error: 'Parameter validation service error'
        });
      }
    };
  }
  
  // Student registration validation schema
  static get studentRegistrationSchema() {
    return Joi.object({
      studentId: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .min(5)
        .max(20)
        .required()
        .messages({
          'string.pattern.base': 'Student ID must contain only uppercase letters, numbers, and hyphens',
          'string.min': 'Student ID must be at least 5 characters long',
          'string.max': 'Student ID cannot exceed 20 characters'
        }),
      
      name: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[a-zA-Z\s.'-]+$/)
        .required()
        .messages({
          'string.pattern.base': 'Name must contain only letters, spaces, dots, hyphens, and apostrophes',
          'string.min': 'Name must be at least 2 characters long',
          'string.max': 'Name cannot exceed 100 characters'
        }),
      
      email: Joi.string()
        .email()
        .required()
        .custom((value, helpers) => {
          if (!validator.isEmail(value)) {
            return helpers.error('any.invalid');
          }
          return value.toLowerCase();
        })
        .messages({
          'any.invalid': 'Please provide a valid email address'
        }),
      
      department: Joi.string()
        .valid(
          'Computer Science & Engineering',
          'Information Technology',
          'Electronics Engineering',
          'Mechanical Engineering',
          'Civil Engineering',
          'Electrical Engineering'
        )
        .required(),
      
      class: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .required(),
      
      semester: Joi.number()
        .integer()
        .min(1)
        .max(8)
        .default(1),
      
      phoneNumber: Joi.string()
        .pattern(/^\d{10}$/)
        .optional()
        .messages({
          'string.pattern.base': 'Phone number must be exactly 10 digits'
        }),
      
      address: Joi.object({
        street: Joi.string().max(200).optional(),
        city: Joi.string().max(100).optional(),
        state: Joi.string().max(50).optional(),
        pincode: Joi.string().pattern(/^\d{6}$/).optional().messages({
          'string.pattern.base': 'Pincode must be exactly 6 digits'
        })
      }).optional(),
      
      faceImages: Joi.array()
        .items(Joi.string().dataUri())
        .min(1)
        .max(10)
        .optional()
    });
  }
  
  // Attendance marking validation schema
  static get attendanceSchema() {
    return Joi.object({
      studentId: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .required(),
      
      classId: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .required(),
      
      status: Joi.string()
        .valid('Present', 'Absent', 'Late', 'Excused')
        .default('Present'),
      
      timestamp: Joi.date()
        .iso()
        .default(() => new Date()),
      
      reason: Joi.string()
        .max(500)
        .optional(),
      
      imageData: Joi.string()
        .dataUri()
        .optional(),
      
      confidence: Joi.number()
        .min(0)
        .max(1)
        .optional()
    });
  }
  
  // Class creation validation schema
  static get classSchema() {
    return Joi.object({
      classId: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .required(),
      
      className: Joi.string()
        .min(2)
        .max(100)
        .required(),
      
      department: Joi.string()
        .valid(
          'Computer Science & Engineering',
          'Information Technology',
          'Electronics Engineering',
          'Mechanical Engineering',
          'Civil Engineering',
          'Electrical Engineering'
        )
        .required(),
      
      semester: Joi.number()
        .integer()
        .min(1)
        .max(8)
        .required(),
      
      capacity: Joi.number()
        .integer()
        .min(1)
        .max(300)
        .default(60)
    });
  }
  
  // Report generation validation schema
  static get reportSchema() {
    return Joi.object({
      classId: Joi.string()
        .pattern(/^[A-Z0-9-]+$/)
        .required(),
      
      date: Joi.date()
        .iso()
        .max('now')
        .optional(),
      
      month: Joi.number()
        .integer()
        .min(1)
        .max(12)
        .optional(),
      
      year: Joi.number()
        .integer()
        .min(2020)
        .max(new Date().getFullYear() + 1)
        .optional(),
      
      startDate: Joi.date()
        .iso()
        .max('now')
        .optional(),
      
      endDate: Joi.date()
        .iso()
        .max('now')
        .when('startDate', {
          is: Joi.exist(),
          then: Joi.date().min(Joi.ref('startDate')).required(),
          otherwise: Joi.optional()
        })
    });
  }
  
  // Pagination validation schema
  static get paginationSchema() {
    return Joi.object({
      page: Joi.number()
        .integer()
        .min(1)
        .default(1),
      
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20),
      
      sortBy: Joi.string()
        .valid('name', 'studentId', 'createdAt', 'updatedAt', 'timestamp')
        .default('createdAt'),
      
      sortOrder: Joi.string()
        .valid('asc', 'desc', 'ascending', 'descending', '1', '-1')
        .default('desc'),
      
      search: Joi.string()
        .min(1)
        .max(100)
        .optional()
    });
  }
  
  // Email validation middleware
  static validateEmail(req, res, next) {
    try {
      const emails = [];
      
      // Check different possible email fields
      if (req.body.email) emails.push(req.body.email);
      if (req.body.to) {
        if (Array.isArray(req.body.to)) {
          emails.push(...req.body.to);
        } else {
          emails.push(req.body.to);
        }
      }
      if (req.body.recipients) {
        if (Array.isArray(req.body.recipients)) {
          emails.push(...req.body.recipients);
        } else {
          emails.push(req.body.recipients);
        }
      }
      
      // Validate each email
      for (const email of emails) {
        if (!validator.isEmail(email)) {
          return res.status(400).json({
            success: false,
            error: `Invalid email address: ${email}`,
            code: 'INVALID_EMAIL'
          });
        }
      }
      
      next();
      
    } catch (error) {
      console.error('Email validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Email validation service error'
      });
    }
  }
  
  // Date range validation middleware
  static validateDateRange(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      if (startDate && !validator.isISO8601(startDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid start date format. Use YYYY-MM-DD',
          code: 'INVALID_START_DATE'
        });
      }
      
      if (endDate && !validator.isISO8601(endDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid end date format. Use YYYY-MM-DD',
          code: 'INVALID_END_DATE'
        });
      }
      
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          success: false,
          error: 'Start date cannot be after end date',
          code: 'INVALID_DATE_RANGE'
        });
      }
      
      // Check if dates are not too far in the future
      const maxFutureDate = new Date();
      maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);
      
      if (endDate && new Date(endDate) > maxFutureDate) {
        return res.status(400).json({
          success: false,
          error: 'End date cannot be more than 1 year in the future',
          code: 'DATE_TOO_FAR_FUTURE'
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Date range validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Date validation service error'
      });
    }
  }
  
  // File upload validation
  static validateFileUpload(allowedTypes = ['image'], maxSize = 5 * 1024 * 1024) {
    return (req, res, next) => {
      try {
        if (!req.file && !req.files) {
          return next(); // No files uploaded, skip validation
        }
        
        const files = req.files || [req.file];
        
        for (const file of files) {
          if (!file) continue;
          
          // Check file size
          if (file.size > maxSize) {
            return res.status(400).json({
              success: false,
              error: `File ${file.originalname} exceeds maximum size of ${maxSize / (1024 * 1024)}MB`,
              code: 'FILE_TOO_LARGE'
            });
          }
          
          // Check file type
          let isValidType = false;
          
          if (allowedTypes.includes('image') && file.mimetype.startsWith('image/')) {
            isValidType = true;
          }
          
          if (allowedTypes.includes('document') && (
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'text/csv' ||
            file.mimetype.includes('sheet') ||
            file.mimetype.includes('excel')
          )) {
            isValidType = true;
          }
          
          if (!isValidType) {
            return res.status(400).json({
              success: false,
              error: `File ${file.originalname} has invalid type. Allowed types: ${allowedTypes.join(', ')}`,
              code: 'INVALID_FILE_TYPE'
            });
          }
        }
        
        next();
        
      } catch (error) {
        console.error('File upload validation error:', error);
        return res.status(500).json({
          success: false,
          error: 'File validation service error'
        });
      }
    };
  }
  
  // Sanitization middleware
  static sanitizeInput(req, res, next) {
    try {
      // Recursively sanitize object
      const sanitizeObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
          return typeof obj === 'string' ? validator.escape(obj.trim()) : obj;
        }
        
        if (Array.isArray(obj)) {
          return obj.map(sanitizeObject);
        }
        
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      };
      
      // Sanitize request body
      if (req.body) {
        req.body = sanitizeObject(req.body);
      }
      
      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeObject(req.query);
      }
      
      next();
      
    } catch (error) {
      console.error('Input sanitization error:', error);
      return res.status(500).json({
        success: false,
        error: 'Input sanitization service error'
      });
    }
  }
}

module.exports = ValidationMiddleware;

// Export individual methods and schemas for convenience
module.exports.validate = ValidationMiddleware.validate;
module.exports.validateQuery = ValidationMiddleware.validateQuery;
module.exports.validateParams = ValidationMiddleware.validateParams;
module.exports.validateEmail = ValidationMiddleware.validateEmail;
module.exports.validateDateRange = ValidationMiddleware.validateDateRange;
module.exports.validateFileUpload = ValidationMiddleware.validateFileUpload;
module.exports.sanitizeInput = ValidationMiddleware.sanitizeInput;

// Export schemas
module.exports.schemas = {
  studentRegistration: ValidationMiddleware.studentRegistrationSchema,
  attendance: ValidationMiddleware.attendanceSchema,
  class: ValidationMiddleware.classSchema,
  report: ValidationMiddleware.reportSchema,
  pagination: ValidationMiddleware.paginationSchema
};
