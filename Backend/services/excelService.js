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

      // Set worksheet properties
      worksheet.properties.defaultRowHeight = 20;
      worksheet.views = [{ showGridLines: true }];

      // University Header
      worksheet.mergeCells('A1:H1');
      worksheet.getCell('A1').value = 'MIT-ADT UNIVERSITY';
      worksheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1F4E79' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7F3FF' }
      };
      
      worksheet.mergeCells('A2:H2');
      worksheet.getCell('A2').value = 'DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING';
      worksheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
      worksheet.getCell('A2').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A3:H3');
      worksheet.getCell('A3').value = `DAILY ATTENDANCE SHEET - Class: ${classId}`;
      worksheet.getCell('A3').font = { bold: true, size: 16 };
      worksheet.getCell('A3').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A4:H4');
      worksheet.getCell('A4').value = `Date: ${new Date(date).toLocaleDateString('en-IN', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })}`;
      worksheet.getCell('A4').font = { bold: true, size: 12 };
      worksheet.getCell('A4').alignment = { horizontal: 'center' };

      // Add spacing
      worksheet.addRow([]);

      // Column headers
      const headers = [
        'Sr. No.', 'Student ID', 'Student Name', 'Time In', 
        'Status', 'Method', 'Confidence', 'Signature'
      ];
      const headerRow = worksheet.addRow(headers);
      
      // Style header row
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E79' }
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
      studentsData.forEach((student, index) => {
        const row = worksheet.addRow([
          index + 1,
          student.studentId,
          student.name,
          student.timeIn || '',
          student.status || 'Absent',
          student.method || '',
          student.confidence ? `${(student.confidence * 100).toFixed(1)}%` : '',
          '' // Signature column
        ]);

        // Style the data row
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          // Center align certain columns
          if ([1, 4, 5, 6, 7].includes(colNumber)) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });

        // Color code based on status
        const statusCell = row.getCell(5);
        if (student.status === 'Present') {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF90EE90' } // Light green
          };
          statusCell.font = { bold: true };
        } else if (student.status === 'Late') {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' } // Yellow
          };
          statusCell.font = { bold: true };
        } else {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF9999' } // Light red
          };
          statusCell.font = { bold: true };
        }
      });

      // Set column widths
      worksheet.columns = [
        { width: 8 },   // Sr. No.
        { width: 18 },  // Student ID
        { width: 35 },  // Student Name
        { width: 15 },  // Time In
        { width: 12 },  // Status
        { width: 18 },  // Method
        { width: 12 },  // Confidence
        { width: 25 }   // Signature
      ];

      // Add summary section
      worksheet.addRow([]); // Empty row
      const totalPresent = studentsData.filter(s => s.status === 'Present').length;
      const totalLate = studentsData.filter(s => s.status === 'Late').length;
      const totalAbsent = studentsData.filter(s => s.status === 'Absent').length;
      const attendanceRate = studentsData.length > 0 ? 
        (((totalPresent + totalLate) / studentsData.length) * 100).toFixed(2) : 0;

      // Summary header
      const summaryHeaderRow = worksheet.addRow(['', '', 'ATTENDANCE SUMMARY', '', '', '', '', '']);
      summaryHeaderRow.getCell(3).font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
      summaryHeaderRow.getCell(3).alignment = { horizontal: 'center' };

      // Summary data
      const summaryRows = [
        ['', '', 'Total Students:', studentsData.length, '', '', '', ''],
        ['', '', 'Present:', totalPresent, '', '', '', ''],
        ['', '', 'Late:', totalLate, '', '', '', ''],
        ['', '', 'Absent:', totalAbsent, '', '', '', ''],
        ['', '', 'Attendance Rate:', `${attendanceRate}%`, '', '', '', '']
      ];

      summaryRows.forEach(rowData => {
        const row = worksheet.addRow(rowData);
        row.getCell(3).font = { bold: true };
        row.getCell(4).font = { bold: true };
        
        // Color code the attendance rate
        if (rowData[2] === 'Attendance Rate:') {
          const rate = parseFloat(attendanceRate);
          if (rate >= 75) {
            row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
          } else if (rate >= 60) {
            row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
          } else {
            row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9999' } };
          }
        }
      });

      // Add footer
      worksheet.addRow([]); // Empty row
      const footerRow1 = worksheet.addRow([
        '', '', 'Faculty Signature: ____________________', '', 
        'HOD Signature: ____________________', '', '', ''
      ]);
      const footerRow2 = worksheet.addRow([
        '', '', `Generated on: ${new Date().toLocaleString('en-IN')}`, '', 
        'Time: ____________________', '', '', ''
      ]);

      footerRow1.eachCell(cell => {
        cell.font = { bold: true };
      });

      // Save file
      const filename = `attendance_${classId}_${date.replace(/\-/g, '_')}.xlsx`;
      const filepath = path.join(this.exportsPath, 'daily_sheets', filename);
      
      await workbook.xlsx.writeFile(filepath);
      
      return {
        success: true,
        filename,
        filepath,
        downloadUrl: `/api/reports/download/daily/${filename}`,
        statistics: {
          totalStudents: studentsData.length,
          present: totalPresent,
          late: totalLate,
          absent: totalAbsent,
          attendancePercentage: attendanceRate
        }
      };

    } catch (error) {
      console.error('Excel creation error:', error);
      throw error;
    }
  }

  async updateAttendanceSheet(classId, date, attendanceUpdates) {
    try {
      const filename = `attendance_${classId}_${date.replace(/\-/g, '_')}.xlsx`;
      const filepath = path.join(this.exportsPath, 'daily_sheets', filename);
      
      let workbook;
      
      if (fs.existsSync(filepath)) {
        // Load existing file
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filepath);
      } else {
        // Create new file if doesn't exist
        const allStudents = await this.getAllStudentsInClass(classId);
        const studentsData = await this.prepareStudentsData(allStudents, classId, date);
        return await this.createDailyAttendanceSheet(classId, date, studentsData);
      }

      const worksheet = workbook.getWorksheet(`Attendance - ${date}`);
      
      if (!worksheet) {
        throw new Error('Worksheet not found');
      }

      // Update attendance records
      attendanceUpdates.forEach(record => {
        worksheet.eachRow((row, rowNumber) => {
          const studentIdCell = row.getCell(2);
          if (studentIdCell.value === record.studentId) {
            row.getCell(4).value = record.timeIn; // Time In
            row.getCell(5).value = 'Present'; // Status
            row.getCell(6).value = record.method || 'Face Recognition'; // Method
            
            // Color the status cell green
            row.getCell(5).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF90EE90' }
            };
            row.getCell(5).font = { bold: true };
          }
        });
      });

      // Recalculate and update summary
      await this.updateSummarySection(worksheet);

      // Save updated file
      await workbook.xlsx.writeFile(filepath);
      
      return {
        success: true,
        filename,
        filepath,
        updatedRecords: attendanceUpdates.length,
        downloadUrl: `/api/reports/download/daily/${filename}`
      };

    } catch (error) {
      console.error('Excel update error:', error);
      throw error;
    }
  }

  async generateMonthlyReport(classId, month, year) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${classId} - ${month}/${year}`);

      // Header
      worksheet.mergeCells('A1:AH1');
      worksheet.getCell('A1').value = 'MIT-ADT UNIVERSITY - MONTHLY ATTENDANCE REPORT';
      worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E79' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A2:AH2');
      worksheet.getCell('A2').value = `Class: ${classId} | Month: ${month}/${year}`;
      worksheet.getCell('A2').font = { bold: true, size: 12 };
      worksheet.getCell('A2').alignment = { horizontal: 'center' };

      // Get monthly data
      const studentsData = await this.getMonthlyAttendanceData(classId, month, year);
      const daysInMonth = new Date(year, month, 0).getDate();

      // Create headers
      const headers = ['Sr.', 'Student ID', 'Name'];
      
      // Add date columns
      for (let day = 1; day <= daysInMonth; day++) {
        headers.push(day.toString());
      }
      
      headers.push('Present', 'Absent', 'Late', 'Percentage');
      
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' }
      };

      // Add student data
      studentsData.forEach((student, index) => {
        const row = [index + 1, student.studentId, student.name];
        
        let totalPresent = 0;
        let totalLate = 0;
        let totalDays = 0;
        
        // Add attendance for each day
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const dayOfWeek = new Date(year, month - 1, day).getDay();
          
          // Skip Sundays (0) - adjust based on your institution's schedule
          if (dayOfWeek === 0) {
            row.push('-');
            continue;
          }
          
          totalDays++;
          const attendanceStatus = student.attendance[dateStr];
          
          if (attendanceStatus === 'Present') {
            row.push('P');
            totalPresent++;
          } else if (attendanceStatus === 'Late') {
            row.push('L');
            totalLate++;
          } else {
            row.push('A');
          }
        }
        
        const totalAbsent = totalDays - totalPresent - totalLate;
        const percentage = totalDays > 0 ? 
          (((totalPresent + totalLate) / totalDays) * 100).toFixed(1) : '0.0';
        
        row.push(totalPresent, totalAbsent, totalLate, `${percentage}%`);
        
        const dataRow = worksheet.addRow(row);
        
        // Color code percentage and attendance markers
        const percentageCell = dataRow.getCell(headers.length);
        const percentageValue = parseFloat(percentage);
        
        if (percentageValue >= 75) {
          percentageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
        } else if (percentageValue >= 60) {
          percentageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        } else {
          percentageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
        }
        
        // Color code attendance markers
        dataRow.eachCell((cell, colNumber) => {
          if (colNumber > 3 && colNumber <= 3 + daysInMonth) {
            cell.alignment = { horizontal: 'center' };
            if (cell.value === 'P') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
              cell.font = { bold: true, color: { argb: 'FF006600' } };
            } else if (cell.value === 'L') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
              cell.font = { bold: true, color: { argb: 'FF996600' } };
            } else if (cell.value === 'A') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9999' } };
              cell.font = { bold: true, color: { argb: 'FF990000' } };
            }
          }
        });
      });

      // Set column widths
      worksheet.getColumn(1).width = 5;   // Sr.
      worksheet.getColumn(2).width = 15;  // Student ID
      worksheet.getColumn(3).width = 30;  // Name
      
      for (let i = 4; i <= 3 + daysInMonth; i++) {
        worksheet.getColumn(i).width = 3; // Date columns
      }
      
      // Statistics columns
      worksheet.getColumn(3 + daysInMonth + 1).width = 8;  // Present
      worksheet.getColumn(3 + daysInMonth + 2).width = 8;  // Absent
      worksheet.getColumn(3 + daysInMonth + 3).width = 8;  // Late
      worksheet.getColumn(3 + daysInMonth + 4).width = 12; // Percentage

      // Add legend
      const legendStartRow = studentsData.length + 5;
      worksheet.getCell(`A${legendStartRow}`).value = 'Legend:';
      worksheet.getCell(`A${legendStartRow}`).font = { bold: true, size: 12 };
      
      const legendItems = [
        ['P = Present', 'A = Absent'],
        ['L = Late', '- = Holiday/Sunday']
      ];

      legendItems.forEach((items, index) => {
        const row = worksheet.addRow(['', ...items]);
        row.eachCell((cell, colNumber) => {
          if (colNumber > 1) {
            cell.font = { bold: true };
          }
        });
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
        statistics: this.calculateMonthlyStatistics(studentsData, daysInMonth)
      };

    } catch (error) {
      console.error('Monthly report generation error:', error);
      throw error;
    }
  }

  // Helper methods
  async getAllStudentsInClass(classId) {
    return await Student.find({ class: classId, isActive: true }).sort({ studentId: 1 });
  }

  async prepareStudentsData(students, classId, date) {
    const attendanceRecords = await Attendance.find({
      classId,
      date,
      status: { $in: ['Present', 'Late', 'Absent'] }
    });

    return students.map(student => {
      const attendanceRecord = attendanceRecords.find(a => a.studentId === student.studentId);
      return {
        studentId: student.studentId,
        name: student.name,
        timeIn: attendanceRecord ? attendanceRecord.timestamp.toLocaleTimeString() : '',
        status: attendanceRecord ? attendanceRecord.status : 'Absent',
        method: attendanceRecord ? attendanceRecord.method : '',
        confidence: attendanceRecord ? attendanceRecord.confidence : null
      };
    });
  }

  async getMonthlyAttendanceData(classId, month, year) {
    const students = await Student.find({ class: classId, isActive: true });
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    
    const attendanceRecords = await Attendance.find({
      classId,
      date: { $gte: startDate, $lte: endDate }
    });
    
    return students.map(student => {
      const studentAttendance = {};
      attendanceRecords
        .filter(record => record.studentId === student.studentId)
        .forEach(record => {
          studentAttendance[record.date] = record.status;
        });
      
      return {
        studentId: student.studentId,
        name: student.name,
        attendance: studentAttendance
      };
    });
  }

  calculateMonthlyStatistics(studentsData, totalDays) {
    const stats = {
      totalStudents: studentsData.length,
      averageAttendance: 0,
      highPerformers: 0, // >= 90%
      goodPerformers: 0,  // >= 75%
      lowPerformers: 0,   // < 60%
      criticalPerformers: 0 // < 40%
    };

    if (studentsData.length === 0) return stats;

    let totalPercentage = 0;
    
    studentsData.forEach(student => {
      // Calculate individual percentage
      let presentDays = 0;
      let lateDays = 0;
      let validDays = 0;
      
      Object.values(student.attendance).forEach(status => {
        if (status && status !== '-') {
          validDays++;
          if (status === 'Present') presentDays++;
          else if (status === 'Late') lateDays++;
        }
      });
      
      const percentage = validDays > 0 ? ((presentDays + lateDays) / validDays) * 100 : 0;
      totalPercentage += percentage;
      
      // Categorize performance
      if (percentage >= 90) stats.highPerformers++;
      else if (percentage >= 75) stats.goodPerformers++;
      else if (percentage >= 60) /* normal performers - not counted separately */;
      else if (percentage >= 40) stats.lowPerformers++;
      else stats.criticalPerformers++;
    });

    stats.averageAttendance = (totalPercentage / studentsData.length).toFixed(2);

    return stats;
  }

  async updateSummarySection(worksheet) {
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalStudents = 0;

    // Count attendance from data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 6) { // Skip header rows
        const statusCell = row.getCell(5);
        if (statusCell.value) {
          totalStudents++;
          switch (statusCell.value) {
            case 'Present':
              totalPresent++;
              break;
            case 'Late':
              totalLate++;
              break;
            case 'Absent':
              totalAbsent++;
              break;
          }
        }
      }
    });

    const attendanceRate = totalStudents > 0 ? 
      (((totalPresent + totalLate) / totalStudents) * 100).toFixed(2) : 0;

    // Update summary rows (implementation depends on worksheet structure)
    // This is a simplified version - you may need to locate and update specific cells
    worksheet.eachRow((row, rowNumber) => {
      const cell3 = row.getCell(3);
      if (cell3.value === 'Total Students:') {
        row.getCell(4).value = totalStudents;
      } else if (cell3.value === 'Present:') {
        row.getCell(4).value = totalPresent;
      } else if (cell3.value === 'Late:') {
        row.getCell(4).value = totalLate;
      } else if (cell3.value === 'Absent:') {
        row.getCell(4).value = totalAbsent;
      } else if (cell3.value === 'Attendance Rate:') {
        row.getCell(4).value = `${attendanceRate}%`;
      }
    });
  }
}

module.exports = new ExcelService();
