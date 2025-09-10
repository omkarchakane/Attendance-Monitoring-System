const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Import services
const faceRecognitionService = require('../services/faceRecognition');
const attendanceService = require('../services/attendanceService');
const excelService = require('../services/excelService');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

// Camera capture attendance
router.post('/capture', async (req, res) => {
  try {
    const { imageData, classId, timestamp } = req.body;
    
    if (!imageData || !classId) {
      return res.status(400).json({
        success: false,
        error: 'Image data and class ID are required'
      });
    }

    // Process image for face recognition
    const recognitionResult = await faceRecognitionService.processImageForAttendance(imageData);
    
    if (recognitionResult.success && recognitionResult.recognizedStudents.length > 0) {
      // Mark attendance for recognized students
      const attendanceResults = await attendanceService.markAttendance({
        students: recognitionResult.recognizedStudents,
        classId,
        timestamp: timestamp || new Date().toISOString(),
        method: 'camera_capture'
      });
      
      // Update Excel sheet
      const today = new Date().toISOString().split('T')[0];
      const excelUpdateData = attendanceResults.marked.map(student => ({
        studentId: student.studentId,
        name: student.name,
        timeIn: new Date(timestamp || Date.now()).toLocaleTimeString(),
        status: 'Present',
        method: 'Face Recognition'
      }));
      
      let excelResult = null;
      try {
        excelResult = await excelService.updateAttendanceSheet(classId, today, excelUpdateData);
      } catch (excelError) {
        console.error('Excel update error:', excelError);
        // Continue without failing the request
      }
      
      // Emit real-time update
      if (req.io) {
        req.io.emit('attendanceMarked', {
          students: recognitionResult.recognizedStudents,
          classId,
          timestamp,
          excelUpdated: excelResult ? true : false,
          downloadUrl: excelResult ? excelResult.downloadUrl : null
        });
      }
      
      res.json({
        success: true,
        recognizedStudents: recognitionResult.recognizedStudents,
        attendanceMarked: attendanceResults.marked,
        alreadyPresent: attendanceResults.alreadyPresent,
        excelSheet: excelResult ? {
          updated: true,
          filename: excelResult.filename,
          downloadUrl: excelResult.downloadUrl
        } : null,
        statistics: {
          totalRecognized: recognitionResult.recognizedStudents.length,
          newAttendance: attendanceResults.marked.length,
          duplicates: attendanceResults.alreadyPresent.length
        }
      });
      
    } else {
      res.json({
        success: false,
        message: 'No students recognized in the image',
        facesDetected: recognitionResult.facesDetected || 0,
        unregisteredFaces: recognitionResult.unregisteredFaces || 0
      });
    }
    
  } catch (error) {
    console.error('Camera capture error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process camera capture',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Photo upload attendance (batch processing)
router.post('/upload', upload.array('photos', 20), async (req, res) => {
  try {
    const { classId } = req.body;
    const uploadedFiles = req.files;
    
    if (!classId) {
      return res.status(400).json({
        success: false,
        message: 'Class ID is required'
      });
    }
    
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No photos uploaded' 
      });
    }
    
    // Process multiple images for batch face recognition
    const batchResults = await faceRecognitionService.processBatchImages(uploadedFiles);
    
    // Combine all recognized students from all images
    const allRecognizedStudents = [];
    const studentMap = new Map(); // To avoid duplicates
    
    batchResults.forEach(result => {
      if (result.success && result.recognizedStudents) {
        result.recognizedStudents.forEach(student => {
          if (!studentMap.has(student.studentId) || 
              studentMap.get(student.studentId).confidence < student.confidence) {
            studentMap.set(student.studentId, student);
          }
        });
      }
    });
    
    // Convert map to array
    studentMap.forEach(student => allRecognizedStudents.push(student));
    
    if (allRecognizedStudents.length > 0) {
      // Mark attendance for all recognized students
      const attendanceResults = await attendanceService.markAttendance({
        students: allRecognizedStudents,
        classId,
        timestamp: new Date().toISOString(),
        method: 'photo_upload'
      });
      
      // Update Excel sheet
      const today = new Date().toISOString().split('T')[0];
      const excelUpdateData = attendanceResults.marked.map(student => ({
        studentId: student.studentId,
        name: student.name,
        timeIn: new Date().toLocaleTimeString(),
        status: 'Present',
        method: 'Photo Upload'
      }));
      
      let excelResult = null;
      try {
        excelResult = await excelService.updateAttendanceSheet(classId, today, excelUpdateData);
      } catch (excelError) {
        console.error('Excel update error:', excelError);
      }
      
      // Emit real-time update
      if (req.io) {
        req.io.emit('batchAttendanceMarked', {
          students: allRecognizedStudents,
          classId,
          totalPhotos: uploadedFiles.length,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        results: {
          totalPhotosProcessed: uploadedFiles.length,
          totalFacesDetected: batchResults.reduce((sum, r) => sum + (r.facesDetected || 0), 0),
          recognizedStudents: allRecognizedStudents,
          markedAttendance: attendanceResults.marked,
          alreadyPresent: attendanceResults.alreadyPresent,
          excelSheet: excelResult ? {
            updated: true,
            filename: excelResult.filename,
            downloadUrl: excelResult.downloadUrl
          } : null
        }
      });
      
    } else {
      res.json({
        success: false,
        message: 'No students recognized in uploaded photos',
        results: {
          totalPhotosProcessed: uploadedFiles.length,
          totalFacesDetected: batchResults.reduce((sum, r) => sum + (r.facesDetected || 0), 0),
          recognizedStudents: [],
          markedAttendance: [],
          alreadyPresent: []
        }
      });
    }
    
    // Clean up temporary files
    uploadedFiles.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    });
    
  } catch (error) {
    console.error('Photo upload error:', error);
    
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('File cleanup error:', cleanupError);
        }
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process photo upload',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get real-time attendance for a class
router.get('/live/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    
    const attendanceDate = date || new Date().toISOString().split('T')[0];
    
    const todayAttendance = await attendanceService.getBatchAttendance({
      classId,
      date: attendanceDate
    });
    
    res.json({
      success: true,
      attendance: todayAttendance,
      totalPresent: todayAttendance.length,
      date: attendanceDate,
      classId
    });
    
  } catch (error) {
    console.error('Get live attendance error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch attendance data' 
    });
  }
});

// Get attendance statistics
router.get('/stats/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { date, startDate, endDate } = req.query;
    
    let stats;
    
    if (startDate && endDate) {
      // Get stats for date range
      stats = await attendanceService.getAttendanceStats({
        classId,
        startDate,
        endDate
      });
    } else {
      // Get stats for specific date (default today)
      const targetDate = date || new Date().toISOString().split('T')[0];
      stats = await attendanceService.getDailyStats(classId, targetDate);
    }
    
    res.json({
      success: true,
      stats,
      classId,
      period: startDate && endDate ? `${startDate} to ${endDate}` : (date || 'today')
    });
    
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch attendance statistics' 
    });
  }
});

// Manual attendance marking (admin/teacher)
router.post('/manual', async (req, res) => {
  try {
    const { studentId, classId, status, timestamp, reason } = req.body;
    
    if (!studentId || !classId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Student ID, class ID, and status are required'
      });
    }
    
    // Find student
    const student = await Student.findOne({ studentId, isActive: true });
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    // Mark manual attendance
    const attendanceRecord = new Attendance({
      studentId: student.studentId,
      studentName: student.name,
      classId,
      date: new Date(timestamp || Date.now()).toISOString().split('T')[0],
      timestamp: new Date(timestamp || Date.now()),
      status,
      method: 'manual',
      verificationStatus: {
        verifiedBy: req.user ? req.user._id : null,
        verificationMethod: 'manual_entry',
        verificationNotes: reason || 'Manual entry by admin/teacher'
      }
    });
    
    await attendanceRecord.save();
    
    res.json({
      success: true,
      message: 'Manual attendance marked successfully',
      attendance: attendanceRecord
    });
    
  } catch (error) {
    console.error('Manual attendance error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark manual attendance' 
    });
  }
});

// Update attendance record
router.put('/:attendanceId', async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status, reason } = req.body;
    
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found'
      });
    }
    
    // Add correction record
    attendance.addCorrection(
      req.user ? req.user._id : null,
      attendance.status,
      status,
      reason || 'Status updated',
      `Updated from ${attendance.status} to ${status}`
    );
    
    await attendance.save();
    
    res.json({
      success: true,
      message: 'Attendance record updated successfully',
      attendance
    });
    
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update attendance record' 
    });
  }
});

// Delete attendance record
router.delete('/:attendanceId', async (req, res) => {
  try {
    const { attendanceId } = req.params;
    
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found'
      });
    }
    
    await Attendance.findByIdAndDelete(attendanceId);
    
    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete attendance record' 
    });
  }
});

module.exports = router;
