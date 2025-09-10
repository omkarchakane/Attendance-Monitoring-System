// backend/models/Attendance.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    ref: 'Student'
  },
  studentName: {
    type: String,
    required: true
  },
  classId: {
    type: String,
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late'],
    default: 'Present'
  },
  method: {
    type: String,
    enum: ['camera_capture', 'photo_upload', 'manual', 'bulk_upload'],
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.9
  },
  location: {
    type: String,
    default: 'Classroom'
  },
  deviceInfo: {
    userAgent: String,
    ipAddress: String
  },
  verified: {
    type: Boolean,
    default: true
  },
  notes: String
}, {
  timestamps: true
});

// Compound indexes for efficient queries
attendanceSchema.index({ classId: 1, date: 1 });
attendanceSchema.index({ studentId: 1, date: 1 });
attendanceSchema.index({ date: 1, status: 1 });

// Prevent duplicate attendance for same student on same day
attendanceSchema.index(
  { studentId: 1, classId: 1, date: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('Attendance', attendanceSchema);
