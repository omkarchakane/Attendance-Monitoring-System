// backend/services/excelService.js
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

class ExcelService {
  constructor() {
    this.templatesPath = path.join(__dirname, '../templates');
    this.exportsPath = path.join(__dirname, '../exports');
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [
      path.join(this.exportsPath, 'daily_sheets'),
      path.join(this.exportsPath, 'reports'),
      path.join(this.exportsPath, 'monthly_reports'),
      this.templatesPath
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async createDailyAttendanceSheet(classId, date, studentsData) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`Attendance - ${date}`);

      // Add MIT-ADT University header
      worksheet.mergeCells('A1:G1');
      worksheet.getCell('A1').value = 'MIT-ADT UNIVERSITY';
      worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0066CC' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A2:G2');
      worksheet.getCell('A2').value = 'PUNE, INDIA - A leap towards World Class Education';
      worksheet.getCell('A2').font = { bold: true, size: 10 };
      worksheet.getCell('A2').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A3:G3');
      worksheet.getCell('A3').value = 'DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING';
      worksheet.getCell('A3').font = { bold: true, size: 12 };
      worksheet.getCell('A3').alignment = { horizontal: 'center' };

      // Add class and date info
      worksheet.mergeCells('A4:G4');
      worksheet.getCell('A4').value = `DAILY ATTENDANCE SHEET`;
      worksheet.getCell('A4').font = { bold: true, size: 14 };
      worksheet.getCell('A4').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A5:C5');
      worksheet.getCell('A5').value = `Class: ${classId}`;
      worksheet.getCell('A5').font = { bold: true };

      worksheet.mergeCells('E5:G5');
      worksheet.getCell('E5').value = `Date: ${date}`;
      worksheet.getCell('E5').font = { bold: true };
      worksheet.getCell('E5').alignment = { horizontal: 'right' };

      // Add column headers
      const headers = ['Sr. No.', 'Student ID', 'Student Name', 'Time In', 'Status', 'Method', 'Signature'];
      const headerRow = worksheet.addRow([]);
      worksheet.addRow(headers);
      
      const headerRowIndex = 7;
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(headerRowIndex, index + 1);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0066CC' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Add student data
      let rowIndex = headerRowIndex + 1;
      studentsData.forEach((student, index) => {
        const row = worksheet.getRow(rowIndex);
        row.values = [
          index + 1,
          student.studentId,
          student.name,
          student.timeIn || '',
          student.status || 'Absent',
          student.method || '',
          '' // Signature column
        ];

        // Style the row
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Color code based on status
        const statusCell = row.getCell(5);
        if (student.status === 'Present') {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF90EE90' } // Light green
          };
        } else {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF6B6B' } // Light red
          };
        }

        rowIndex++;
      });

      // Add summary row
      const summaryRow = worksheet.getRow(rowIndex + 1);
      const totalPresent = studentsData.filter(s => s.status === 'Present').length;
      const totalAbsent = studentsData.length - totalPresent;
      const attendancePercentage = studentsData.length > 0 ? ((totalPresent / studentsData.length) * 100).toFixed(1) : 0;

      summaryRow.values = [
        '', 
        '', 
        'SUMMARY:', 
        `Total: ${studentsData.length}`,
        `Present: ${totalPresent}`,
        `Absent: ${totalAbsent}`,
        `${attendancePercentage}%`
      ];
      
      summaryRow.font = { bold: true };
      summaryRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6E6FA' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Set column widths
      worksheet.columns = [
        { width: 8 },   // Sr. No.
        { width: 15 },  // Student ID
        { width: 25 },  // Student Name
        { width: 12 },  // Time In
        { width: 10 },  // Status
        { width: 15 },  // Method
        { width: 20 }   // Signature
      ];

      // Add teacher signature section
      const signatureRowIndex = rowIndex + 3;
      worksheet.getCell(signatureRowIndex, 1).value = 'Teacher Signature:';
      worksheet.getCell(signatureRowIndex, 1).font = { bold: true };
      
      worksheet.getCell(signatureRowIndex, 5).value = 'Date:';
      worksheet.getCell(signatureRowIndex, 5).font = { bold: true };

      // Save file
      const filename = `attendance_${classId}_${date}.xlsx`;
      const filepath = path.join(this.exportsPath, 'daily_sheets', filename);
      
      await workbook.xlsx.writeFile(filepath);
      
      return {
        success: true,
        filename,
        filepath,
        downloadUrl: `/api/reports/download/daily/${filename}`,
        summary: {
          totalStudents: studentsData.length,
          present: totalPresent,
          absent: totalAbsent,
          percentage: attendancePercentage
        }
      };

    } catch (error) {
      console.error('Excel creation error:', error);
      throw error;
    }
  }

  async updateAttendanceSheet(classId, date, attendanceUpdate) {
    try {
      const filename = `attendance_${classId}_${date}.xlsx`;
      const filepath = path.join(this.exportsPath, 'daily_sheets', filename);
      
      let workbook;
      let studentsWithAttendance;
      
      if (fs.existsSync(filepath)) {
        // Load existing file
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filepath);
        
        const worksheet = workbook.getWorksheet(`Attendance - ${date}`);
        
        // Update attendance records
        attendanceUpdate.forEach(record => {
          // Find student row by student ID
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 7 && row.getCell(2).value === record.studentId) {
              row.getCell(4).value = record.timeIn; // Time In
              row.getCell(5).value = 'Present'; // Status
              row.getCell(6).value = record.method || 'Face Recognition'; // Method
              
              // Color the status cell green
              row.getCell(5).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF90EE90' }
              };
            }
          });
        });
        
        // Update summary
        const { totalPresent, totalAbsent, percentage } = this.calculateSummary(worksheet);
        
        // Find summary row and update
        worksheet.eachRow((row, rowNumber) => {
          if (row.getCell(3).value === 'SUMMARY:') {
            row.getCell(5).value = `Present: ${totalPresent}`;
            row.getCell(6).value = `Absent: ${totalAbsent}`;
            row.getCell(7).value = `${percentage}%`;
          }
        });

        // Save updated file
        await workbook.xlsx.writeFile(filepath);
        
      } else {
        // Create new file if doesn't exist
        const allStudents = await this.getAllStudentsInClass(classId);
        
        // Mark attendance for updated students
        studentsWithAttendance = allStudents.map(student => {
          const attendanceRecord = attendanceUpdate.find(a => a.studentId === student.studentId);
          return {
            studentId: student.studentId,
            name: student.name,
            timeIn: attendanceRecord ? attendanceRecord.timeIn : '',
            status: attendanceRecord ? 'Present' : 'Absent',
            method: attendanceRecord ? (attendanceRecord.method || 'Face Recognition') : ''
          };
        });
        
        return await this.createDailyAttendanceSheet(classId, date, studentsWithAttendance);
      }
      
      return {
        success: true,
        filename,
        filepath,
        updatedRecords: attendanceUpdate.length,
        downloadUrl: `/api/reports/download/daily/${filename}`
      };

    } catch (error) {
      console.error('Excel update error:', error);
      throw error;
    }
  }

  calculateSummary(worksheet) {
    let totalPresent = 0;
    let totalStudents = 0;
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 7 && row.getCell(2).value && row.getCell(3).value !== 'SUMMARY:') {
        totalStudents++;
        if (row.getCell(5).value === 'Present') {
          totalPresent++;
        }
      }
    });
    
    const totalAbsent = totalStudents - totalPresent;
    const percentage = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : 0;
    
    return { totalPresent, totalAbsent, percentage };
  }

  async getAllStudentsInClass(classId) {
    return await Student.find({ class: classId, isActive: true })
                        .sort({ studentId: 1 })
                        .select('studentId name');
  }

  async generateMonthlyReport(classId, month, year) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${classId} - ${month}/${year}`);

      // Header
      worksheet.mergeCells('A1:AH1');
      worksheet.getCell('A1').value = 'MIT-ADT UNIVERSITY - MONTHLY ATTENDANCE REPORT';
      worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0066CC' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A2:AH2');
      worksheet.getCell('A2').value = `Class: ${classId} | Month: ${month}/${year}`;
      worksheet.getCell('A2').font = { bold: true, size: 12 };
      worksheet.getCell('A2').alignment = { horizontal: 'center' };

      // Get monthly attendance data
      const studentsData = await this.getMonthlyAttendanceData(classId, month, year);
      const daysInMonth = new Date(year, month, 0).getDate();

      // Create headers
      const headers = ['Sr. No.', 'Student ID', 'Student Name'];
      
      // Add date columns
      for (let day = 1; day <= daysInMonth; day++) {
        headers.push(day.toString());
      }
      
      headers.push('Total Present', 'Total Absent', 'Percentage');
      
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' }
      };

      // Add student data
      studentsData.forEach((student, index) => {
        const row = [index + 1, student.studentId, student.name];
        
        let totalPresent = 0;
        
        // Add attendance for each day
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const isPresent = student.attendance[dateStr];
          
          if (isPresent) {
            row.push('P');
            totalPresent++;
          } else {
            row.push('A');
          }
        }
        
        const totalAbsent = daysInMonth - totalPresent;
        const percentage = ((totalPresent / daysInMonth) * 100).toFixed(1);
        
        row.push(totalPresent, totalAbsent, `${percentage}%`);
        
        const dataRow = worksheet.addRow(row);
        
        // Color code percentage
        const percentageCell = dataRow.getCell(headers.length);
        if (percentage >= 75) {
          percentageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
        } else if (percentage >= 60) {
          percentageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        } else {
          percentageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
        }
      });

      // Set column widths
      worksheet.columns.forEach((column, index) => {
        if (index < 3) {
          column.width = index === 2 ? 25 : 15;
        } else if (index >= headers.length - 3) {
          column.width = 12;
        } else {
          column.width = 4;
        }
      });

      // Save file
      const filename = `monthly_report_${classId}_${month}_${year}.xlsx`;
      const filepath = path.join(this.exportsPath, 'reports', filename);
      
      await workbook.xlsx.writeFile(filepath);
      
      return {
        success: true,
        filename,
        filepath,
        downloadUrl: `/api/reports/download/reports/${filename}`,
        summary: {
          totalStudents: studentsData.length,
          month: `${month}/${year}`,
          daysInMonth
        }
      };

    } catch (error) {
      console.error('Monthly report generation error:', error);
      throw error;
    }
  }

  async getMonthlyAttendanceData(classId, month, year) {
    const students = await Student.find({ class: classId, isActive: true });
    const monthlyData = [];
    
    for (const student of students) {
      const attendanceRecords = await Attendance.find({
        studentId: student.studentId,
        date: {
          $regex: `^${year}-${month.toString().padStart(2, '0')}`
        }
      });
      
      const attendanceMap = {};
      attendanceRecords.forEach(record => {
        attendanceMap[record.date] = record.status === 'Present';
      });
      
      monthlyData.push({
        studentId: student.studentId,
        name: student.name,
        attendance: attendanceMap
      });
    }
    
    return monthlyData;
  }
}

module.exports = new ExcelService();
