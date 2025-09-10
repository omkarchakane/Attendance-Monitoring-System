// backend/models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    required: true
  },
  class: {
    type: String,
    required: true
  },
  address: {
    type: String,
    trim: true
  },
  faceEncodings: [{
    encoding: [Number],
    capturedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
studentSchema.index({ studentId: 1 });
studentSchema.index({ class: 1 });
studentSchema.index({ department: 1 });

module.exports = mongoose.model('Student', studentSchema);
