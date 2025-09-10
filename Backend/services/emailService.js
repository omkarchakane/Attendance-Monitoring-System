const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = null;
    this.from = process.env.EMAIL_FROM || 'noreply@mitadt.edu.in';
    this.initializeTransporter();
  }

  // Initialize email transporter
  initializeTransporter() {
    try {
      // Configure transporter based on email service
      const emailService = process.env.EMAIL_SERVICE || 'gmail';
      
      switch (emailService.toLowerCase()) {
        case 'gmail':
          this.transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD // Use app password for Gmail
            }
          });
          break;
          
        case 'outlook':
          this.transporter = nodemailer.createTransporter({
            service: 'outlook',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD
            }
          });
          break;
          
        case 'smtp':
          this.transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD
            }
          });
          break;
          
        default:
          // Default Gmail configuration
          this.transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD
            }
          });
      }
      
      // Verify transporter configuration
      this.verifyTransporter();
      
    } catch (error) {
      console.error('Email transporter initialization error:', error);
    }
  }

  // Verify email configuration
  async verifyTransporter() {
    try {
      if (this.transporter) {
        await this.transporter.verify();
        console.log('✅ Email service is ready');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Email service verification failed:', error);
      return false;
    }
  }

  // Send basic email
  async sendEmail({ to, subject, text, html, attachments = [] }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Ensure to is an array
      const recipients = Array.isArray(to) ? to : [to];

      const mailOptions = {
        from: `MIT-ADT Attendance System <${this.from}>`,
        to: recipients.join(', '),
        subject: subject,
        text: text,
        html: html,
        attachments: attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        response: result.response,
        recipients: recipients.length
      };

    } catch (error) {
      console.error('Send email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send attendance report via email
  async sendReportEmail({ to, subject, message, attachments = [] }) {
    try {
      const htmlTemplate = this.generateReportEmailTemplate(message);
      
      return await this.sendEmail({
        to,
        subject: subject || 'Attendance Report - MIT-ADT University',
        text: message || 'Please find the attached attendance report.',
        html: htmlTemplate,
        attachments
      });

    } catch (error) {
      console.error('Send report email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send attendance alert to students
  async sendAttendanceAlert({ studentEmail, studentName, classId, attendancePercentage, threshold = 75 }) {
    try {
      const isLowAttendance = attendancePercentage < threshold;
      
      const subject = isLowAttendance ? 
        `⚠️ Low Attendance Alert - ${classId}` : 
        `✅ Attendance Update - ${classId}`;

      const htmlContent = this.generateAttendanceAlertTemplate({
        studentName,
        classId,
        attendancePercentage,
        threshold,
        isLowAttendance
      });

      return await this.sendEmail({
        to: studentEmail,
        subject,
        html: htmlContent
      });

    } catch (error) {
      console.error('Send attendance alert error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send bulk attendance alerts
  async sendBulkAttendanceAlerts(students) {
    try {
      const results = {
        sent: [],
        failed: []
      };

      for (const student of students) {
        try {
          const result = await this.sendAttendanceAlert(student);
          
          if (result.success) {
            results.sent.push({
              email: student.studentEmail,
              name: student.studentName
            });
          } else {
            results.failed.push({
              email: student.studentEmail,
              name: student.studentName,
              error: result.error
            });
          }
          
          // Add delay to prevent rate limiting
          await this.sleep(100);
          
        } catch (error) {
          results.failed.push({
            email: student.studentEmail,
            name: student.studentName,
            error: error.message
          });
        }
      }

      return {
        success: true,
        totalSent: results.sent.length,
        totalFailed: results.failed.length,
        results
      };

    } catch (error) {
      console.error('Send bulk attendance alerts error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send daily attendance summary to teachers
  async sendDailyAttendanceSummary({ teacherEmail, classId, date, statistics }) {
    try {
      const subject = `Daily Attendance Summary - ${classId} (${date})`;
      
      const htmlContent = this.generateDailySummaryTemplate({
        classId,
        date,
        statistics
      });

      return await this.sendEmail({
        to: teacherEmail,
        subject,
        html: htmlContent
      });

    } catch (error) {
      console.error('Send daily summary error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send system notifications
  async sendSystemNotification({ to, type, title, message, data = {} }) {
    try {
      const subject = `[System Alert] ${title}`;
      
      const htmlContent = this.generateSystemNotificationTemplate({
        type,
        title,
        message,
        data
      });

      return await this.sendEmail({
        to,
        subject,
        html: htmlContent
      });

    } catch (error) {
      console.error('Send system notification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate HTML templates
  generateReportEmailTemplate(message) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #1F4E79; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { color: #1F4E79; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .subtitle { color: #666; font-size: 14px; }
          .content { line-height: 1.6; color: #333; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎓 MIT-ADT UNIVERSITY</div>
            <div class="subtitle">Smart Attendance Management System</div>
          </div>
          <div class="content">
            <h3>Attendance Report</h3>
            <p>${message}</p>
            <p>Please find the attendance report attached to this email.</p>
            <p>If you have any questions or need assistance, please contact the IT department.</p>
          </div>
          <div class="footer">
            <p>This is an automated email from MIT-ADT University Attendance System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateAttendanceAlertTemplate({ studentName, classId, attendancePercentage, threshold, isLowAttendance }) {
    const statusColor = isLowAttendance ? '#ff4444' : '#44aa44';
    const statusIcon = isLowAttendance ? '⚠️' : '✅';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #1F4E79; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { color: #1F4E79; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .alert-status { font-size: 48px; margin: 20px 0; }
          .percentage { font-size: 36px; font-weight: bold; color: ${statusColor}; margin: 20px 0; }
          .message { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎓 MIT-ADT UNIVERSITY</div>
            <div class="subtitle">Attendance Alert System</div>
          </div>
          <div class="content" style="text-align: center;">
            <div class="alert-status">${statusIcon}</div>
            <h2>Dear ${studentName},</h2>
            <p>Your current attendance for class <strong>${classId}</strong> is:</p>
            <div class="percentage">${attendancePercentage}%</div>
            
            <div class="message">
              ${isLowAttendance ? `
                <p style="color: #ff4444; font-weight: bold;">⚠️ WARNING: Your attendance is below the required ${threshold}%</p>
                <p>Please ensure regular attendance to meet the minimum requirement. Contact your class teacher if you need assistance.</p>
              ` : `
                <p style="color: #44aa44; font-weight: bold;">✅ Great! Your attendance meets the required standards.</p>
                <p>Keep up the excellent work maintaining regular attendance.</p>
              `}
            </div>
            
            <p>For any queries, please contact your class teacher or the academic office.</p>
          </div>
          <div class="footer">
            <p>This is an automated alert from MIT-ADT University Attendance System.</p>
            <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateDailySummaryTemplate({ classId, date, statistics }) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 700px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #1F4E79; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { color: #1F4E79; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
          .stat-card { background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
          .stat-number { font-size: 32px; font-weight: bold; color: #1F4E79; }
          .stat-label { color: #666; font-size: 14px; margin-top: 5px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎓 MIT-ADT UNIVERSITY</div>
            <div class="subtitle">Daily Attendance Summary</div>
          </div>
          <div class="content">
            <h3>Attendance Summary for ${classId}</h3>
            <p><strong>Date:</strong> ${new Date(date).toLocaleDateString('en-IN', { 
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            })}</p>
            
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-number" style="color: #28a745;">${statistics.present || 0}</div>
                <div class="stat-label">Present</div>
              </div>
              <div class="stat-card">
                <div class="stat-number" style="color: #ffc107;">${statistics.late || 0}</div>
                <div class="stat-label">Late</div>
              </div>
              <div class="stat-card">
                <div class="stat-number" style="color: #dc3545;">${statistics.absent || 0}</div>
                <div class="stat-label">Absent</div>
              </div>
              <div class="stat-card">
                <div class="stat-number" style="color: #1F4E79;">${statistics.attendancePercentage || 0}%</div>
                <div class="stat-label">Attendance Rate</div>
              </div>
            </div>
            
            <p>Total Enrolled Students: <strong>${statistics.totalEnrolled || 0}</strong></p>
          </div>
          <div class="footer">
            <p>Daily attendance summary generated automatically.</p>
            <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateSystemNotificationTemplate({ type, title, message, data }) {
    const typeColors = {
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8',
      success: '#28a745'
    };
    
    const typeIcons = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    };
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #1F4E79; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { color: #1F4E79; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .alert-type { font-size: 48px; margin: 20px 0; }
          .message { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${typeColors[type] || '#17a2b8'}; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎓 MIT-ADT UNIVERSITY</div>
            <div class="subtitle">System Notification</div>
          </div>
          <div class="content" style="text-align: center;">
            <div class="alert-type">${typeIcons[type] || 'ℹ️'}</div>
            <h2>${title}</h2>
            <div class="message">
              <p>${message}</p>
              ${data && Object.keys(data).length > 0 ? `
                <hr>
                <p><strong>Additional Information:</strong></p>
                ${Object.entries(data).map(([key, value]) => `
                  <p><strong>${key}:</strong> ${value}</p>
                `).join('')}
              ` : ''}
            </div>
          </div>
          <div class="footer">
            <p>System notification from MIT-ADT University Attendance System.</p>
            <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Helper method for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Test email configuration
  async testEmailConfiguration(testEmail) {
    try {
      const testResult = await this.sendEmail({
        to: testEmail,
        subject: 'Test Email - MIT-ADT Attendance System',
        text: 'This is a test email to verify the email configuration.',
        html: `
          <h3>Test Email</h3>
          <p>This is a test email to verify the email configuration for MIT-ADT Attendance System.</p>
          <p>If you received this email, the email service is working correctly.</p>
          <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
        `
      });

      return testResult;

    } catch (error) {
      console.error('Test email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService();
