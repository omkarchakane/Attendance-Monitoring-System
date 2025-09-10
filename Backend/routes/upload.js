const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const router = express.Router();

// Import services
const faceRecognitionService = require('../services/faceRecognition');

// Configure multer for different upload types
const createMulterConfig = (destination, allowedTypes = ['image/*']) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../uploads', destination);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    const isAllowed = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.mimetype.startsWith(type.slice(0, -1));
      }
      return file.mimetype === type;
    });

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`Only ${allowedTypes.join(', ')} files are allowed`), false);
    }
  };

  return multer({
    storage,
    limits: { 
      fileSize: 10 * 1024 * 1024, // 10MB limit
      files: 20 // Max 20 files
    },
    fileFilter
  });
};

// Multer configurations for different upload types
const uploadImage = createMulterConfig('images', ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);
const uploadFaces = createMulterConfig('faces', ['image/jpeg', 'image/jpg', 'image/png']);
const uploadDocuments = createMulterConfig('documents', ['application/pdf', 'text/csv', 'application/vnd.ms-excel']);
const uploadBulk = createMulterConfig('bulk', ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

// Upload single image
router.post('/image', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    // Process image with Sharp (optional optimization)
    const processedImagePath = path.join(
      path.dirname(req.file.path),
      `processed_${req.file.filename}`
    );

    await sharp(req.file.path)
      .resize(1024, 1024, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85 })
      .toFile(processedImagePath);

    // Delete original file
    fs.unlinkSync(req.file.path);

    const fileInfo = {
      originalName: req.file.originalname,
      filename: `processed_${req.file.filename}`,
      path: processedImagePath,
      size: fs.statSync(processedImagePath).size,
      mimetype: 'image/jpeg',
      uploadedAt: new Date()
    };

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      file: fileInfo,
      downloadUrl: `/api/upload/download/images/${fileInfo.filename}`
    });

  } catch (error) {
    console.error('Image upload error:', error);
    
    // Clean up files on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload image'
    });
  }
});

// Upload multiple images
router.post('/images', uploadImage.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files uploaded'
      });
    }

    const processedFiles = [];
    
    for (const file of req.files) {
      try {
        // Process each image
        const processedImagePath = path.join(
          path.dirname(file.path),
          `processed_${file.filename}`
        );

        await sharp(file.path)
          .resize(1024, 1024, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toFile(processedImagePath);

        // Delete original file
        fs.unlinkSync(file.path);

        processedFiles.push({
          originalName: file.originalname,
          filename: `processed_${file.filename}`,
          path: processedImagePath,
          size: fs.statSync(processedImagePath).size,
          mimetype: 'image/jpeg',
          uploadedAt: new Date(),
          downloadUrl: `/api/upload/download/images/processed_${file.filename}`
        });

      } catch (processError) {
        console.error(`Error processing ${file.originalname}:`, processError);
        
        // Clean up failed file
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
    }

    res.json({
      success: true,
      message: `${processedFiles.length} images uploaded successfully`,
      files: processedFiles,
      totalUploaded: processedFiles.length,
      totalFailed: req.files.length - processedFiles.length
    });

  } catch (error) {
    console.error('Multiple images upload error:', error);
    
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload images'
    });
  }
});

// Upload face images for recognition training
router.post('/faces/:studentId', uploadFaces.array('faces', 10), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No face images uploaded'
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Student name is required'
      });
    }

    // Process face images
    const processedFaces = [];
    
    for (const file of req.files) {
      try {
        // Optimize image for face recognition
        const processedImagePath = path.join(
          path.dirname(file.path),
          `face_${studentId}_${Date.now()}.jpg`
        );

        await sharp(file.path)
          .resize(300, 300, { 
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 95 })
          .toFile(processedImagePath);

        // Convert to base64 for face recognition service
        const imageBuffer = fs.readFileSync(processedImagePath);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        
        processedFaces.push(base64Image);

        // Clean up original file
        fs.unlinkSync(file.path);

      } catch (processError) {
        console.error(`Error processing face image ${file.originalname}:`, processError);
        
        // Clean up failed file
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
    }

    if (processedFaces.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid face images could be processed'
      });
    }

    // Register faces with ML service
    try {
      const registrationResult = await faceRecognitionService.registerStudent({
        studentId,
        name,
        faceImages: processedFaces
      });

      if (registrationResult.success) {
        res.json({
          success: true,
          message: 'Face images uploaded and registered successfully',
          studentId,
          totalFaces: processedFaces.length,
          registrationResult
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Face registration failed',
          details: registrationResult.message
        });
      }

    } catch (mlError) {
      console.error('ML service error:', mlError);
      res.status(500).json({
        success: false,
        error: 'Face recognition service error'
      });
    }

  } catch (error) {
    console.error('Face upload error:', error);
    
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload face images'
    });
  }
});

// Upload CSV for bulk student import
router.post('/students-csv', uploadBulk.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    // Validate file type
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Only CSV and Excel files are allowed'
      });
    }

    // Parse CSV file
    const csv = require('csv-parser');
    const students = [];
    const errors = [];
    let rowNumber = 0;

    const parsePromise = new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          rowNumber++;
          
          try {
            // Validate required fields
            const requiredFields = ['studentId', 'name', 'email'];
            const missingFields = requiredFields.filter(field => !row[field] || !row[field].trim());
            
            if (missingFields.length > 0) {
              errors.push(`Row ${rowNumber}: Missing required fields: ${missingFields.join(', ')}`);
              return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(row.email.trim())) {
              errors.push(`Row ${rowNumber}: Invalid email format`);
              return;
            }

            students.push({
              studentId: row.studentId.trim().toUpperCase(),
              name: row.name.trim(),
              email: row.email.trim().toLowerCase(),
              department: row.department ? row.department.trim() : 'Computer Science & Engineering',
              class: row.class ? row.class.trim() : '',
              semester: row.semester ? parseInt(row.semester) : 1,
              phoneNumber: row.phoneNumber ? row.phoneNumber.trim() : '',
              registrationMethod: 'bulk_upload',
              rowNumber
            });

          } catch (parseError) {
            errors.push(`Row ${rowNumber}: Parse error - ${parseError.message}`);
          }
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error));
    });

    await parsePromise;

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid student records found in CSV',
        errors: errors.slice(0, 10), // Limit errors shown
        totalErrors: errors.length
      });
    }

    // Prepare response with parsed data (don't insert here, let the students route handle it)
    res.json({
      success: true,
      message: 'CSV file parsed successfully',
      data: {
        students,
        totalRows: rowNumber,
        validStudents: students.length,
        errors: errors.slice(0, 10), // Show first 10 errors
        totalErrors: errors.length
      },
      nextStep: 'Use POST /api/students/bulk-import to import the parsed data'
    });

  } catch (error) {
    console.error('CSV upload error:', error);
    
    // Clean up file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process CSV file'
    });
  }
});

// Upload document files
router.post('/document', uploadDocuments.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No document file uploaded'
      });
    }

    const { category, description } = req.body;

    const fileInfo = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      category: category || 'general',
      description: description || '',
      uploadedAt: new Date()
    };

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      file: fileInfo,
      downloadUrl: `/api/upload/download/documents/${fileInfo.filename}`
    });

  } catch (error) {
    console.error('Document upload error:', error);
    
    // Clean up file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload document'
    });
  }
});

// Download uploaded files
router.get('/download/:folder/:filename', (req, res) => {
  try {
    const { folder, filename } = req.params;
    
    // Validate folder to prevent directory traversal
    const allowedFolders = ['images', 'faces', 'documents', 'bulk'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid folder'
      });
    }

    // Validate filename to prevent directory traversal
    if (!/^[\w\-_\.]+\.(jpg|jpeg|png|gif|pdf|csv|xlsx|xls)$/i.test(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    const filepath = path.join(__dirname, '../uploads', folder, filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Set appropriate content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // Send file
    res.sendFile(filepath);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file'
    });
  }
});

// Get upload statistics
router.get('/stats', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../uploads');
    const folders = ['images', 'faces', 'documents', 'bulk'];
    
    const stats = {};
    let totalFiles = 0;
    let totalSize = 0;

    for (const folder of folders) {
      const folderPath = path.join(uploadsDir, folder);
      
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        let folderSize = 0;
        
        files.forEach(file => {
          const filePath = path.join(folderPath, file);
          const stat = fs.statSync(filePath);
          folderSize += stat.size;
        });

        stats[folder] = {
          fileCount: files.length,
          totalSize: folderSize,
          totalSizeMB: (folderSize / (1024 * 1024)).toFixed(2)
        };

        totalFiles += files.length;
        totalSize += folderSize;
      } else {
        stats[folder] = {
          fileCount: 0,
          totalSize: 0,
          totalSizeMB: '0.00'
        };
      }
    }

    res.json({
      success: true,
      stats: {
        byFolder: stats,
        overall: {
          totalFiles,
          totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
          totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(3)
        }
      }
    });

  } catch (error) {
    console.error('Upload stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload statistics'
    });
  }
});

// Delete uploaded file
router.delete('/:folder/:filename', (req, res) => {
  try {
    const { folder, filename } = req.params;
    
    // Validate folder
    const allowedFolders = ['images', 'faces', 'documents', 'bulk'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid folder'
      });
    }

    // Validate filename
    if (!/^[\w\-_\.]+\.(jpg|jpeg|png|gif|pdf|csv|xlsx|xls)$/i.test(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    const filepath = path.join(__dirname, '../uploads', folder, filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Delete file
    fs.unlinkSync(filepath);

    res.json({
      success: true,
      message: 'File deleted successfully',
      filename
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file'
    });
  }
});

// Clean up old files (maintenance endpoint)
router.post('/cleanup', async (req, res) => {
  try {
    const { olderThanDays = 30, folder } = req.body;
    
    const uploadsDir = path.join(__dirname, '../uploads');
    const folders = folder ? [folder] : ['images', 'faces', 'documents', 'bulk'];
    
    let deletedFiles = 0;
    let freedSpace = 0;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    for (const folderName of folders) {
      const folderPath = path.join(uploadsDir, folderName);
      
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        
        for (const file of files) {
          const filePath = path.join(folderPath, file);
          const stat = fs.statSync(filePath);
          
          if (stat.birthtime < cutoffDate) {
            freedSpace += stat.size;
            fs.unlinkSync(filePath);
            deletedFiles++;
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      deletedFiles,
      freedSpaceMB: (freedSpace / (1024 * 1024)).toFixed(2),
      olderThanDays
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup files'
    });
  }
});

module.exports = router;
