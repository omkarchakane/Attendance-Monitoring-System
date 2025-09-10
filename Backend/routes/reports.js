const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Import services
const excelService = require('../services/excelService');
const attendanceService = require('../services/attendanceService');
const emailService = require('../services/emailService');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');

// Generate daily attendance sheet
router.post('/generate-daily-sheet', async (req, res) => {
  try {
    const { classId, date } = req.body;
    
    if (!classId || !date) {
      return res.status(400).json({
        success: false,
        error: 'Class ID and date are required'
      });
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format'
      });
    }
    
    // Get all students in class
    const allStudents = await Student.find({ 
      class: classId, 
      isActive: true 
    }).sort({ studentId: 1 });
    
    if (allStudents.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active students found in this class'
      });
    }
    
    // Get attendance records for the date
    const attendanceRecords = await Attendance.find({
      classId,
      date,
      status: { $in: ['Present', 'Late'] }
    });
    
    // Merge student data with attendance
    const studentsWithAttendance = allStudents.map(student => {
      const attendanceRecord = attendanceRecords.find(a => 
        a.studentId === student.studentId
      );
      
      return {
        studentId: student.studentId,
        name: student.name,
        timeIn: attendanceRecord ? 
          attendanceRecord.timestamp.toLocaleTimeString() : '',
        status: attendanceRecord ? attendanceRecord.status : 'Absent',
        method: attendanceRecord ? attendanceRecord.method : '',
        confidence: attendanceRecord ? attendanceRecord.confidence : null
      };
    });
    
    // Generate Excel sheet
    const result = await excelService.createDailyAttendanceSheet(
      classId, 
      date, 
      studentsWithAttendance
    );
    
    res.json({
      success: true,
      message: 'Daily attendance sheet generated successfully',
      excel: result,
      statistics: result.statistics
    });
    
  } catch (error) {
    console.error('Daily sheet generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate daily sheet',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Generate monthly report
router.post('/generate-monthly', async (req, res) => {
  try {
    const { classId, month, year } = req.body;
    
    if (!classId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Class ID, month, and year are required'
      });
    }
    
    // Validate month and year
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be between 1 and 12'
      });
    }
    
    if (year < 2020 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year'
      });
    }
    
    // Generate monthly report
    const result = await excelService.generateMonthlyReport(classId, month, year);
    
    res.json({
      success: true,
      message: 'Monthly report generated successfully',
      report: result,
      statistics: result.statistics
    });
    
  } catch (error) {
    console.error('Monthly report generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate monthly report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get list of available reports
router.get('/list/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    
    const exportsPath = path.join(__dirname, '../exports');
    const dailySheetsPath = path.join(exportsPath, 'daily_sheets');
    const reportsPath = path.join(exportsPath, 'reports');
    
    let dailySheets = [];
    let monthlyReports = [];
    
    // Get daily sheets
    if (fs.existsSync(dailySheetsPath)) {
      const dailyFiles = fs.readdirSync(dailySheetsPath)
        .filter(file => file.includes(classId) && file.endsWith('.xlsx'))
        .map(file => {
          const stats = fs.statSync(path.join(dailySheetsPath, file));
          const dateMatch = file.match(/\d{4}_\d{2}_\d{2}/);
          const date = dateMatch ? dateMatch[0].replace(/_/g, '-') : null;
          
          return {
            type: 'daily',
            filename: file,
            downloadUrl: `/api/reports/download/daily/${file}`,
            date: date,
            createdAt: stats.birthtime,
            size: stats.size
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      dailySheets = dailyFiles;
    }
    
    // Get monthly reports
    if (fs.existsSync(reportsPath)) {
      const monthlyFiles = fs.readdirSync(reportsPath)
        .filter(file => file.includes(classId) && file.endsWith('.xlsx'))
        .map(file => {
          const stats = fs.statSync(path.join(reportsPath, file));
          const monthMatch = file.match(/(\d{1,2})_(\d{4})/);
          const month = monthMatch ? `${monthMatch[1]}/${monthMatch[2]}` : null;
          
          return {
            type: 'monthly',
            filename: file,
            downloadUrl: `/api/reports/download/reports/${file}`,
            month: month,
            createdAt: stats.birthtime,
            size: stats.size
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      monthlyReports = monthlyFiles;
    }
    
    res.json({
      success: true,
      reports: {
        daily: dailySheets,
        monthly: monthlyReports
      },
      classId,
      totalReports: dailySheets.length + monthlyReports.length
    });
    
  } catch (error) {
    console.error('Get reports list error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get reports list' 
    });
  }
});

// Download daily attendance sheet
router.get('/download/daily/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!/^[\w\-_\.]+\.xlsx$/.test(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    const filepath = path.join(__dirname, '../exports/daily_sheets', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send file
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: 'Failed to download file' 
          });
        }
      }
    });
    
  } catch (error) {
    console.error('Download daily sheet error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to download file' 
    });
  }
});

// Download monthly report
router.get('/download/reports/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename
    if (!/^[\w\-_\.]+\.xlsx$/.test(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    const filepath = path.join(__dirname, '../exports/reports', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send file
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            error: 'Failed to download file' 
          });
        }
      }
    });
    
  } catch (error) {
    console.error('Download report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to download file' 
    });
  }
});

// Get attendance analytics/insights
router.get('/analytics/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { 
      startDate, 
      endDate, 
      period = 'month' 
    } = req.query;
    
    let dateFilter = {};
    
    if (startDate && endDate) {
      dateFilter = { date: { $gte: startDate, $lte: endDate } };
    } else {
      // Default to current month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString().split('T')[0];
      dateFilter = { date: { $gte: firstDay, $lte: lastDay } };
    }
    
    // Get attendance analytics
    const analytics = await Attendance.aggregate([
      {
        $match: {
          classId: classId,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: {
            date: '$date',
            status: '$status'
          },
          count: { $sum: 1 },
          students: { $addToSet: '$studentId' }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          statusCounts: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          },
          totalStudents: { $sum: '$count' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);
    
    // Calculate overall statistics
    const totalDays = analytics.length;
    let totalPresent = 0;
    let totalAbsent = 0;
    
    analytics.forEach(day => {
      const presentCount = day.statusCounts.find(s => 
        s.status === 'Present' || s.status === 'Late'
      )?.count || 0;
      const absentCount = day.statusCounts.find(s => 
        s.status === 'Absent'
      )?.count || 0;
      
      totalPresent += presentCount;
      totalAbsent += absentCount;
    });
    
    const overallStats = {
      totalDays,
      totalPresent,
      totalAbsent,
      averageAttendanceRate: totalDays > 0 ? 
        ((totalPresent / (totalPresent + totalAbsent)) * 100).toFixed(2) : 0
    };
    
    // Get top performing students
    const topStudents = await Attendance.aggregate([
      {
        $match: {
          classId: classId,
          ...dateFilter,
          status: { $in: ['Present', 'Late'] }
        }
      },
      {
        $group: {
          _id: '$studentId',
          name: { $first: '$studentName' },
          presentDays: { $sum: 1 }
        }
      },
      {
        $sort: { presentDays: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    res.json({
      success: true,
      analytics: {
        dailyBreakdown: analytics,
        overallStats,
        topStudents,
        period: {
          startDate: startDate || dateFilter.date.$gte,
          endDate: endDate || dateFilter.date.$lte,
          type: period
        }
      },
      classId
    });
    
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate analytics' 
    });
  }
});

// Email report to stakeholders
router.post('/email/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { recipients, subject, message } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required'
      });
    }
    
    // Determine file path based on type
    let filepath;
    if (filename.includes('monthly_report')) {
      filepath = path.join(__dirname, '../exports/reports', filename);
    } else {
      filepath = path.join(__dirname, '../exports/daily_sheets', filename);
    }
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'Report file not found'
      });
    }
    
    // Send email with attachment
    await emailService.sendReportEmail({
      to: recipients,
      subject: subject || `Attendance Report - ${filename}`,
      message: message || 'Please find the attached attendance report.',
      attachments: [{
        filename: filename,
        path: filepath
      }]
    });
    
    res.json({
      success: true,
      message: `Report sent to ${recipients.length} recipient(s)`,
      recipients: recipients.length
    });
    
  } catch (error) {
    console.error('Email report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send report via email' 
    });
  }
});

// Delete report file
router.delete('/:type/:filename', async (req, res) => {
  try {
    const { type, filename } = req.params;
    
    if (!['daily', 'reports'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report type'
      });
    }
    
    // Validate filename
    if (!/^[\w\-_\.]+\.xlsx$/.test(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    const folderName = type === 'daily' ? 'daily_sheets' : 'reports';
    const filepath = path.join(__dirname, '../exports', folderName, filename);
    
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
      message: 'Report deleted successfully',
      filename
    });
    
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete report' 
    });
  }
});

module.exports = router;
