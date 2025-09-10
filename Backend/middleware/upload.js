const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

class UploadMiddleware {
  
  // Create storage configuration
  static createStorage(destination = 'uploads') {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', destination);
        
        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const hash = crypto.createHash('md5').update(file.originalname + uniqueSuffix).digest('hex');
        const extension = path.extname(file.originalname);
        
        cb(null, `${hash}${extension}`);
      }
    });
  }
  
  // File filter for images
  static imageFilter(req, file, cb) {
    try {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp'
      ];
      
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
      }
      
    } catch (error) {
      cb(error, false);
    }
  }
  
  // File filter for documents
  static documentFilter(req, file, cb) {
    try {
      const allowedMimeTypes = [
        'application/pdf',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
      ];
      
      const allowedExtensions = ['.pdf', '.csv', '.xls', '.xlsx', '.txt'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, CSV, Excel, and text files are allowed.'), false);
      }
      
    } catch (error) {
      cb(error, false);
    }
  }
  
  // File filter for face images (stricter validation)
  static faceImageFilter(req, file, cb) {
    try {
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type for face images. Only JPEG and PNG are allowed.'), false);
      }
      
    } catch (error) {
      cb(error, false);
    }
  }
  
  // Size validation middleware
  static validateFileSize(maxSize = 5 * 1024 * 1024) { // 5MB default
    return (req, res, next) => {
      if (!req.file && !req.files) {
        return next();
      }
      
      const files = req.files || [req.file];
      
      for (const file of files) {
        if (file && file.size > maxSize) {
          return res.status(400).json({
            success: false,
            error: `File ${file.originalname} is too large`,
            maxSize: `${Math.round(maxSize / (1024 * 1024))}MB`,
            actualSize: `${Math.round(file.size / (1024 * 1024))}MB`,
            code: 'FILE_TOO_LARGE'
          });
        }
      }
      
      next();
    };
  }
  
  // Image validation middleware (checks if uploaded file is actually an image)
  static validateImage(req, res, next) {
    if (!req.file && !req.files) {
      return next();
    }
    
    const files = req.files || [req.file];
    
    Promise.all(files.map(file => {
      if (!file) return Promise.resolve();
      
      return sharp(file.path)
        .metadata()
        .catch(() => {
          throw new Error(`${file.originalname} is not a valid image file`);
        });
    }))
    .then(() => next())
    .catch(error => {
      // Clean up invalid files
      files.forEach(file => {
        if (file && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_IMAGE_FILE'
      });
    });
  }
  
  // Face image processing middleware
  static processFaceImages(req, res, next) {
    if (!req.file && !req.files) {
      return next();
    }
    
    const files = req.files || [req.file];
    
    Promise.all(files.map(async (file) => {
      if (!file) return;
      
      try {
        // Process image for face recognition
        const processedPath = file.path.replace(path.extname(file.path), '_processed.jpg');
        
        await sharp(file.path)
          .resize(300, 300, { 
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ 
            quality: 95,
            mozjpeg: true 
          })
          .toFile(processedPath);
        
        // Replace original with processed
        fs.unlinkSync(file.path);
        file.path = processedPath;
        file.filename = path.basename(processedPath);
        
      } catch (error) {
        console.error('Face image processing error:', error);
        throw new Error(`Failed to process face image: ${file.originalname}`);
      }
    }))
    .then(() => next())
    .catch(error => {
      // Clean up files on error
      files.forEach(file => {
        if (file && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      
      return res.status(500).json({
        success: false,
        error: error.message,
        code: 'FACE_PROCESSING_FAILED'
      });
    });
  }
  
  // Virus scanning middleware (placeholder - integrate with actual antivirus)
  static scanForViruses(req, res, next) {
    if (!req.file && !req.files) {
      return next();
    }
    
    // This is a placeholder for virus scanning
    // In production, integrate with services like ClamAV, VirusTotal, etc.
    
    const files = req.files || [req.file];
    
    // Simple file extension blacklist
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.scr', '.pif', '.com',
      '.vbs', '.js', '.jar', '.app', '.deb', '.pkg'
    ];
    
    for (const file of files) {
      if (file) {
        const extension = path.extname(file.originalname).toLowerCase();
        
        if (dangerousExtensions.includes(extension)) {
          // Clean up dangerous file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          
          return res.status(400).json({
            success: false,
            error: `File type ${extension} is not allowed for security reasons`,
            code: 'DANGEROUS_FILE_TYPE'
          });
        }
      }
    }
    
    next();
  }
  
  // Create multer upload middleware for images
  static createImageUpload(options = {}) {
    const {
      destination = 'uploads/images',
      maxFiles = 10,
      maxSize = 5 * 1024 * 1024 // 5MB
    } = options;
    
    return multer({
      storage: this.createStorage(destination),
      limits: { 
        fileSize: maxSize,
        files: maxFiles
      },
      fileFilter: this.imageFilter
    });
  }
  
  // Create multer upload middleware for face images
  static createFaceUpload(options = {}) {
    const {
      destination = 'uploads/faces',
      maxFiles = 10,
      maxSize = 3 * 1024 * 1024 // 3MB for faces
    } = options;
    
    return multer({
      storage: this.createStorage(destination),
      limits: { 
        fileSize: maxSize,
        files: maxFiles
      },
      fileFilter: this.faceImageFilter
    });
  }
  
  // Create multer upload middleware for documents
  static createDocumentUpload(options = {}) {
    const {
      destination = 'uploads/documents',
      maxFiles = 5,
      maxSize = 10 * 1024 * 1024 // 10MB for documents
    } = options;
    
    return multer({
      storage: this.createStorage(destination),
      limits: { 
        fileSize: maxSize,
        files: maxFiles
      },
      fileFilter: this.documentFilter
    });
  }
  
  // Error handling middleware for multer errors
  static handleUploadErrors(error, req, res, next) {
    if (error instanceof multer.MulterError) {
      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          return res.status(400).json({
            success: false,
            error: 'File size too large',
            code: 'FILE_SIZE_LIMIT_EXCEEDED',
            maxSize: '5MB'
          });
          
        case 'LIMIT_FILE_COUNT':
          return res.status(400).json({
            success: false,
            error: 'Too many files uploaded',
            code: 'FILE_COUNT_LIMIT_EXCEEDED'
          });
          
        case 'LIMIT_UNEXPECTED_FILE':
          return res.status(400).json({
            success: false,
            error: 'Unexpected file field',
            code: 'UNEXPECTED_FILE_FIELD'
          });
          
        default:
          return res.status(400).json({
            success: false,
            error: 'File upload error',
            code: 'UPLOAD_ERROR',
            details: error.message
          });
      }
    }
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_FILE_TYPE'
      });
    }
    
    // Pass other errors to global error handler
    next(error);
  }
  
  // Middleware to convert images to base64 for API responses
  static convertToBase64(req, res, next) {
    if (!req.file && !req.files) {
      return next();
    }
    
    try {
      const files = req.files || [req.file];
      
      req.base64Images = files.map(file => {
        if (!file) return null;
        
        const imageBuffer = fs.readFileSync(file.path);
        const base64 = imageBuffer.toString('base64');
        
        return {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          base64: `data:${file.mimetype};base64,${base64}`
        };
      }).filter(Boolean);
      
      next();
      
    } catch (error) {
      console.error('Base64 conversion error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to process uploaded images',
        code: 'BASE64_CONVERSION_FAILED'
      });
    }
  }
  
  // Cleanup middleware to remove temporary files after processing
  static cleanupFiles(req, res, next) {
    const originalSend = res.send;
    const originalJson = res.json;
    
    const cleanup = () => {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      if (req.files) {
        req.files.forEach(file => {
          if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
    };
    
    res.send = function(body) {
      cleanup();
      return originalSend.call(this, body);
    };
    
    res.json = function(body) {
      cleanup();
      return originalJson.call(this, body);
    };
    
    next();
  }
}

module.exports = UploadMiddleware;

// Export individual methods for convenience
module.exports.imageFilter = UploadMiddleware.imageFilter;
module.exports.documentFilter = UploadMiddleware.documentFilter;
module.exports.faceImageFilter = UploadMiddleware.faceImageFilter;
module.exports.validateFileSize = UploadMiddleware.validateFileSize;
module.exports.validateImage = UploadMiddleware.validateImage;
module.exports.processFaceImages = UploadMiddleware.processFaceImages;
module.exports.scanForViruses = UploadMiddleware.scanForViruses;
module.exports.createImageUpload = UploadMiddleware.createImageUpload;
module.exports.createFaceUpload = UploadMiddleware.createFaceUpload;
module.exports.createDocumentUpload = UploadMiddleware.createDocumentUpload;
module.exports.handleUploadErrors = UploadMiddleware.handleUploadErrors;
module.exports.convertToBase64 = UploadMiddleware.convertToBase64;
module.exports.cleanupFiles = UploadMiddleware.cleanupFiles;
