const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');

class AttendanceService {
  
  // Mark attendance for multiple students
  async markAttendance({ students, classId, timestamp, method = 'camera_capture' }) {
    const marked = [];
    const alreadyPresent = [];
    const errors = [];
    
    try {
      const attendanceDate = new Date(timestamp).toISOString().split('T')[0];
      
      for (const student of students) {
        try {
          // Check if attendance already marked for this student today
          const existingAttendance = await Attendance.findOne({
            studentId: student.studentId,
            classId: classId,
            date: attendanceDate
          });
          
          if (!existingAttendance) {
            // Create new attendance record
            const attendanceRecord = new Attendance({
              studentId: student.studentId,
              studentName: student.name,
              classId: classId,
              date: attendanceDate,
              timestamp: new Date(timestamp),
              status: 'Present',
              method: method,
              confidence: student.confidence || 0.9,
              verificationStatus: {
                isVerified: true,
                verificationMethod: 'automatic'
              }
            });
            
            await attendanceRecord.save();
            
            marked.push({
              studentId: student.studentId,
              name: student.name,
              timestamp: timestamp,
              method: method,
              confidence: student.confidence
            });
            
          } else {
            alreadyPresent.push({
              studentId: student.studentId,
              name: student.name,
              markedAt: existingAttendance.timestamp,
              status: existingAttendance.status
            });
          }
          
        } catch (studentError) {
          console.error(`Error marking attendance for ${student.studentId}:`, studentError);
          errors.push({
            studentId: student.studentId,
            error: studentError.message
          });
        }
      }
      
      return { marked, alreadyPresent, errors };
      
    } catch (error) {
      console.error('Batch attendance marking error:', error);
      throw error;
    }
  }
  
  // Get attendance records for a specific class and date
  async getBatchAttendance({ classId, date }) {
    try {
      const attendance = await Attendance.find({
        classId: classId,
        date: date,
        status: { $in: ['Present', 'Late'] }
      })
      .sort({ timestamp: -1 })
      .populate('studentId', 'name email')
      .lean();
      
      return attendance;
      
    } catch (error) {
      console.error('Get batch attendance error:', error);
      throw error;
    }
  }
  
  // Get daily attendance statistics for a class
  async getDailyStats(classId, date) {
    try {
      const stats = await Attendance.aggregate([
        {
          $match: {
            classId: classId,
            date: date
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            students: { 
              $push: {
                studentId: '$studentId',
                studentName: '$studentName',
                timestamp: '$timestamp',
                method: '$method'
              }
            }
          }
        }
      ]);
      
      // Get total enrolled students for the class
      const totalStudents = await Student.countDocuments({
        class: classId,
        isActive: true
      });
      
      // Format statistics
      const formattedStats = {
        date: date,
        classId: classId,
        totalEnrolled: totalStudents,
        present: 0,
        absent: 0,
        late: 0,
        attendanceRate: 0,
        presentStudents: [],
        absentStudents: [],
        lateStudents: []
      };
      
      stats.forEach(stat => {
        switch (stat._id) {
          case 'Present':
            formattedStats.present = stat.count;
            formattedStats.presentStudents = stat.students;
            break;
          case 'Absent':
            formattedStats.absent = stat.count;
            formattedStats.absentStudents = stat.students;
            break;
          case 'Late':
            formattedStats.late = stat.count;
            formattedStats.lateStudents = stat.students;
            break;
        }
      });
      
      // Calculate attendance rate
      const totalMarked = formattedStats.present + formattedStats.late;
      if (totalStudents > 0) {
        formattedStats.attendanceRate = ((totalMarked / totalStudents) * 100).toFixed(2);
      }
      
      // Calculate absent students (those not marked present or late)
      formattedStats.absent = totalStudents - totalMarked;
      
      return formattedStats;
      
    } catch (error) {
      console.error('Get daily stats error:', error);
      throw error;
    }
  }
  
  // Get attendance statistics for a date range
  async getAttendanceStats({ classId, startDate, endDate }) {
    try {
      const stats = await Attendance.aggregate([
        {
          $match: {
            classId: classId,
            date: { $gte: startDate, $lte: endDate }
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
            statusBreakdown: {
              $push: {
                status: '$_id.status',
                count: '$count',
                students: '$students'
              }
            },
            totalStudents: { $sum: '$count' }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ]);
      
      return {
        classId,
        startDate,
        endDate,
        dailyStats: stats,
        totalDays: stats.length
      };
      
    } catch (error) {
      console.error('Get attendance stats error:', error);
      throw error;
    }
  }
  
  // Get student attendance history
  async getStudentAttendanceHistory(studentId, startDate, endDate, limit = 100) {
    try {
      const query = {
        studentId: studentId
      };
      
      if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      
      const history = await Attendance.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      // Calculate statistics
      const totalClasses = history.length;
      const presentClasses = history.filter(record => 
        record.status === 'Present' || record.status === 'Late'
      ).length;
      
      return {
        studentId,
        history,
        statistics: {
          totalClasses,
          presentClasses,
          absentClasses: totalClasses - presentClasses,
          attendancePercentage: totalClasses > 0 ? 
            ((presentClasses / totalClasses) * 100).toFixed(2) : 0
        }
      };
      
    } catch (error) {
      console.error('Get student attendance history error:', error);
      throw error;
    }
  }
  
  // Mark manual attendance (for admin/teacher corrections)
  async markManualAttendance({ studentId, classId, status, timestamp, reason, markedBy }) {
    try {
      const attendanceDate = new Date(timestamp).toISOString().split('T')[0];
      
      // Check if attendance already exists
      let attendanceRecord = await Attendance.findOne({
        studentId: studentId,
        classId: classId,
        date: attendanceDate
      });
      
      if (attendanceRecord) {
        // Update existing record with correction
        const previousStatus = attendanceRecord.status;
        
        attendanceRecord.addCorrection(
          markedBy,
          previousStatus,
          status,
          reason || 'Manual correction',
          `Status changed from ${previousStatus} to ${status}`
        );
        
        await attendanceRecord.save();
        
        return {
          success: true,
          message: 'Attendance updated successfully',
          record: attendanceRecord,
          type: 'update'
        };
        
      } else {
        // Create new manual attendance record
        const student = await Student.findOne({ studentId: studentId });
        if (!student) {
          throw new Error('Student not found');
        }
        
        attendanceRecord = new Attendance({
          studentId: studentId,
          studentName: student.name,
          classId: classId,
          date: attendanceDate,
          timestamp: new Date(timestamp),
          status: status,
          method: 'manual',
          verificationStatus: {
            isVerified: true,
            verifiedBy: markedBy,
            verificationMethod: 'manual_entry',
            verificationNotes: reason || 'Manual attendance marking'
          }
        });
        
        await attendanceRecord.save();
        
        return {
          success: true,
          message: 'Manual attendance marked successfully',
          record: attendanceRecord,
          type: 'create'
        };
      }
      
    } catch (error) {
      console.error('Mark manual attendance error:', error);
      throw error;
    }
  }
  
  // Bulk mark attendance (for entire class)
  async bulkMarkAttendance({ classId, date, attendanceData, markedBy }) {
    try {
      const results = {
        marked: [],
        updated: [],
        errors: []
      };
      
      for (const entry of attendanceData) {
        try {
          const result = await this.markManualAttendance({
            studentId: entry.studentId,
            classId: classId,
            status: entry.status,
            timestamp: entry.timestamp || new Date().toISOString(),
            reason: entry.reason || 'Bulk attendance marking',
            markedBy: markedBy
          });
          
          if (result.type === 'create') {
            results.marked.push(result.record);
          } else {
            results.updated.push(result.record);
          }
          
        } catch (entryError) {
          results.errors.push({
            studentId: entry.studentId,
            error: entryError.message
          });
        }
      }
      
      return results;
      
    } catch (error) {
      console.error('Bulk mark attendance error:', error);
      throw error;
    }
  }
  
  // Generate attendance summary for a class
  async generateAttendanceSummary(classId, startDate, endDate) {
    try {
      // Get all students in the class
      const students = await Student.find({
        class: classId,
        isActive: true
      }).select('studentId name email').lean();
      
      // Get attendance records for the period
      const attendanceRecords = await Attendance.find({
        classId: classId,
        date: { $gte: startDate, $lte: endDate }
      }).lean();
      
      // Calculate statistics for each student
      const studentSummaries = students.map(student => {
        const studentAttendance = attendanceRecords.filter(record => 
          record.studentId === student.studentId
        );
        
        const totalClasses = this.getWorkingDays(startDate, endDate);
        const presentCount = studentAttendance.filter(record => 
          record.status === 'Present' || record.status === 'Late'
        ).length;
        const lateCount = studentAttendance.filter(record => 
          record.status === 'Late'
        ).length;
        
        return {
          studentId: student.studentId,
          name: student.name,
          email: student.email,
          totalClasses: totalClasses,
          presentClasses: presentCount,
          absentClasses: totalClasses - presentCount,
          lateClasses: lateCount,
          attendancePercentage: totalClasses > 0 ? 
            ((presentCount / totalClasses) * 100).toFixed(2) : 0
        };
      });
      
      // Calculate class overall statistics
      const totalStudents = students.length;
      const averageAttendance = studentSummaries.reduce((sum, student) => 
        sum + parseFloat(student.attendancePercentage), 0
      ) / totalStudents;
      
      return {
        classId,
        period: { startDate, endDate },
        totalStudents,
        averageAttendance: averageAttendance.toFixed(2),
        studentSummaries: studentSummaries.sort((a, b) => 
          parseFloat(b.attendancePercentage) - parseFloat(a.attendancePercentage)
        )
      };
      
    } catch (error) {
      console.error('Generate attendance summary error:', error);
      throw error;
    }
  }
  
  // Helper method to calculate working days
  getWorkingDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let workingDays = 0;
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      // Exclude Sundays (0) - adjust based on your institution's schedule
      if (dayOfWeek !== 0) {
        workingDays++;
      }
    }
    
    return workingDays;
  }
  
  // Delete attendance record
  async deleteAttendanceRecord(attendanceId, deletedBy, reason) {
    try {
      const attendance = await Attendance.findById(attendanceId);
      
      if (!attendance) {
        throw new Error('Attendance record not found');
      }
      
      // Add deletion record before removing
      attendance.corrections.push({
        correctedBy: deletedBy,
        correctedAt: new Date(),
        previousStatus: attendance.status,
        newStatus: 'DELETED',
        reason: reason || 'Record deleted',
        notes: `Record deleted by admin/teacher`
      });
      
      await attendance.save();
      
      // Soft delete by marking as inactive or hard delete
      await Attendance.findByIdAndDelete(attendanceId);
      
      return {
        success: true,
        message: 'Attendance record deleted successfully'
      };
      
    } catch (error) {
      console.error('Delete attendance record error:', error);
      throw error;
    }
  }
  
  // Get attendance trends and analytics
  async getAttendanceTrends(classId, days = 30) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];
      
      const trends = await Attendance.aggregate([
        {
          $match: {
            classId: classId,
            date: { $gte: startDateStr, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$date',
            presentCount: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['Present', 'Late']] },
                  1,
                  0
                ]
              }
            },
            totalCount: { $sum: 1 }
          }
        },
        {
          $addFields: {
            attendanceRate: {
              $multiply: [
                { $divide: ['$presentCount', '$totalCount'] },
                100
              ]
            }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ]);
      
      return {
        classId,
        period: { startDate: startDateStr, endDate, days },
        trends,
        averageRate: trends.length > 0 ? 
          (trends.reduce((sum, day) => sum + day.attendanceRate, 0) / trends.length).toFixed(2) : 0
      };
      
    } catch (error) {
      console.error('Get attendance trends error:', error);
      throw error;
    }
  }
}

module.exports = new AttendanceService();
