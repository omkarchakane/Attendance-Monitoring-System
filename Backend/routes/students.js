const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Import models and services
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const faceRecognitionService = require('../services/faceRecognition');

// Configure multer for face image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/faces');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `face-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get all students
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      class: className, 
      department, 
      isActive, 
      search 
    } = req.query;
    
    const skip = (page - 1) * limit;
    const query = {};
    
    // Build query filters
    if (className) query.class = className;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const students = await Student.find(query)
      .select('-faceEncodings -averageFaceEncoding') // Exclude large binary data
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Student.countDocuments(query);
    
    res.json({
      success: true,
      students,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalStudents: total,
        hasNext: skip + students.length < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch students' 
    });
  }
});

// Get students by class
router.get('/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { includeStats = false } = req.query;
    
    let students;
    
    if (includeStats === 'true') {
      // Get students with attendance statistics
      students = await Student.find({ class: classId, isActive: true })
        .select('-faceEncodings -averageFaceEncoding')
        .sort({ name: 1 });
      
      // Add recent attendance data for each student
      for (let student of students) {
        const recentAttendance = await Attendance.find({
          studentId: student.studentId,
          classId
        })
        .sort({ timestamp: -1 })
        .limit(10);
        
        student._doc.recentAttendance = recentAttendance;
      }
    } else {
      students = await Student.find({ class: classId, isActive: true })
        .select('-faceEncodings -averageFaceEncoding')
        .sort({ name: 1 });
    }
    
    res.json({
      success: true,
      students,
      classId,
      totalStudents: students.length
    });
    
  } catch (error) {
    console.error('Get students by class error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch students for class' 
    });
  }
});

// Get single student by ID
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { includeAttendance = false } = req.query;
    
    const student = await Student.findOne({ 
      studentId: studentId.toUpperCase(), 
      isActive: true 
    }).select('-faceEncodings -averageFaceEncoding');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    let responseData = { student };
    
    if (includeAttendance === 'true') {
      // Get student's attendance history
      const attendanceHistory = await Attendance.find({
        studentId: student.studentId
      })
      .sort({ timestamp: -1 })
      .limit(100);
      
      responseData.attendanceHistory = attendanceHistory;
      
      // Calculate attendance statistics
      const totalClasses = attendanceHistory.length;
      const presentClasses = attendanceHistory.filter(a => 
        a.status === 'Present' || a.status === 'Late'
      ).length;
      
      responseData.attendanceStats = {
        totalClasses,
        presentClasses,
        absentClasses: totalClasses - presentClasses,
        attendancePercentage: totalClasses > 0 ? 
          ((presentClasses / totalClasses) * 100).toFixed(2) : 0
      };
    }
    
    res.json({
      success: true,
      ...responseData
    });
    
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch student' 
    });
  }
});

// Register new student with face images
router.post('/register', async (req, res) => {
  try {
    const {
      studentId,
      name,
      email,
      department,
      class: className,
      semester,
      phoneNumber,
      address,
      faceImages // Array of base64 encoded images
    } = req.body;
    
    // Validate required fields
    if (!studentId || !name || !email || !department || !className) {
      return res.status(400).json({
        success: false,
        error: 'Student ID, name, email, department, and class are required'
      });
    }
    
    // Check if student already exists
    const existingStudent = await Student.findOne({ 
      $or: [
        { studentId: studentId.toUpperCase() },
        { email: email.toLowerCase() }
      ]
    });
    
    if (existingStudent) {
      return res.status(409).json({
        success: false,
        error: 'Student with this ID or email already exists'
      });
    }
    
    // Create new student
    const student = new Student({
      studentId: studentId.toUpperCase(),
      name: name.trim(),
      email: email.toLowerCase(),
      department,
      class: className,
      semester: semester || 1,
      phoneNumber,
      address,
      registrationMethod: 'manual',
      registeredBy: req.user ? req.user._id : null
    });
    
    // Process face images if provided
    if (faceImages && faceImages.length > 0) {
      try {
        // Register faces with ML service
        const registrationResult = await faceRecognitionService.registerStudent({
          studentId: student.studentId,
          name: student.name,
          faceImages
        });
        
        if (registrationResult.success) {
          student.faceEncodings = registrationResult.encodings || [];
          student.isVerified = true;
        } else {
          console.warn(`Face registration failed for ${student.studentId}: ${registrationResult.message}`);
        }
      } catch (faceError) {
        console.error('Face registration error:', faceError);
        // Continue with student registration even if face registration fails
      }
    }
    
    await student.save();
    
    // Add student to class if it exists
    try {
      const classDoc = await Class.findOne({ classId: className });
      if (classDoc) {
        await classDoc.addStudent({
          studentId: student.studentId,
          name: student.name,
          rollNumber: student.rollNumber
        });
      }
    } catch (classError) {
      console.error('Add to class error:', classError);
      // Continue even if adding to class fails
    }
    
    // Remove sensitive data before sending response
    const responseStudent = student.toObject();
    delete responseStudent.faceEncodings;
    delete responseStudent.averageFaceEncoding;
    
    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      student: responseStudent,
      faceRegistered: faceImages && faceImages.length > 0
    });
    
  } catch (error) {
    console.error('Student registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to register student' 
    });
  }
});

// Update student information
router.put('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updateData.studentId;
    delete updateData.faceEncodings;
    delete updateData.averageFaceEncoding;
    delete updateData.attendanceStats;
    
    const student = await Student.findOneAndUpdate(
      { studentId: studentId.toUpperCase() },
      { ...updateData, lastUpdated: new Date() },
      { new: true, runValidators: true }
    ).select('-faceEncodings -averageFaceEncoding');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Student updated successfully',
      student
    });
    
  } catch (error) {
    console.error('Update student error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update student' 
    });
  }
});

// Update student face encodings
router.post('/:studentId/faces', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { faceImages } = req.body; // Array of base64 images
    
    if (!faceImages || faceImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Face images are required'
      });
    }
    
    const student = await Student.findOne({ 
      studentId: studentId.toUpperCase() 
    });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    try {
      // Update faces with ML service
      const updateResult = await faceRecognitionService.updateStudentFaces({
        studentId: student.studentId,
        name: student.name,
        faceImages
      });
      
      if (updateResult.success) {
        // Update student's face encodings
        student.faceEncodings = updateResult.encodings || [];
        student.isVerified = true;
        await student.save();
        
        res.json({
          success: true,
          message: 'Face encodings updated successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to update face encodings',
          details: updateResult.message
        });
      }
    } catch (faceError) {
      console.error('Face update error:', faceError);
      res.status(500).json({
        success: false,
        error: 'Face recognition service error'
      });
    }
    
  } catch (error) {
    console.error('Update faces error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update face encodings' 
    });
  }
});

// Delete student (soft delete)
router.delete('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { permanent = false } = req.query;
    
    if (permanent === 'true') {
      // Permanent deletion
      const student = await Student.findOneAndDelete({ 
        studentId: studentId.toUpperCase() 
      });
      
      if (!student) {
        return res.status(404).json({
          success: false,
          error: 'Student not found'
        });
      }
      
      // Delete from face recognition service
      try {
        await faceRecognitionService.deleteStudent(student.studentId);
      } catch (faceError) {
        console.error('Face deletion error:', faceError);
      }
      
      res.json({
        success: true,
        message: 'Student permanently deleted'
      });
    } else {
      // Soft delete
      const student = await Student.findOneAndUpdate(
        { studentId: studentId.toUpperCase() },
        { isActive: false, lastUpdated: new Date() },
        { new: true }
      );
      
      if (!student) {
        return res.status(404).json({
          success: false,
          error: 'Student not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Student deactivated successfully'
      });
    }
    
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete student' 
    });
  }
});

// Bulk import students
router.post('/bulk-import', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'CSV file is required'
      });
    }
    
    const csv = require('csv-parser');
    const students = [];
    const errors = [];
    
    // Parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        try {
          // Validate required fields
          if (!row.studentId || !row.name || !row.email) {
            errors.push(`Row missing required fields: ${JSON.stringify(row)}`);
            return;
          }
          
          students.push({
            studentId: row.studentId.toUpperCase(),
            name: row.name.trim(),
            email: row.email.toLowerCase(),
            department: row.department || 'Computer Science & Engineering',
            class: row.class,
            semester: parseInt(row.semester) || 1,
            phoneNumber: row.phoneNumber,
            registrationMethod: 'bulk_upload'
          });
        } catch (parseError) {
          errors.push(`Row parse error: ${parseError.message}`);
        }
      })
      .on('end', async () => {
        try {
          if (students.length === 0) {
            return res.status(400).json({
              success: false,
              error: 'No valid student records found',
              errors
            });
          }
          
          // Insert students in batch
          const insertedStudents = await Student.insertMany(students, { 
            ordered: false // Continue on duplicate errors
          });
          
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          
          res.json({
            success: true,
            message: `${insertedStudents.length} students imported successfully`,
            imported: insertedStudents.length,
            errors: errors.length > 0 ? errors : undefined
          });
          
        } catch (insertError) {
          console.error('Bulk insert error:', insertError);
          
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          
          res.status(500).json({
            success: false,
            error: 'Failed to import students',
            details: insertError.message
          });
        }
      });
    
  } catch (error) {
    console.error('Bulk import error:', error);
    
    // Clean up uploaded file
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process bulk import' 
    });
  }
});

// Search students
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20 } = req.query;
    
    const students = await Student.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { studentId: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    })
    .select('studentId name email class department')
    .limit(parseInt(limit))
    .sort({ name: 1 });
    
    res.json({
      success: true,
      students,
      query,
      totalFound: students.length
    });
    
  } catch (error) {
    console.error('Search students error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search students' 
    });
  }
});

module.exports = router;
