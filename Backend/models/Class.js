// backend/models/Class.js
const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  classId: {
    type: String,
    required: true,
    unique: true
  },
  className: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  semester: {
    type: Number,
    required: true
  },
  teacher: {
    name: String,
    email: String,
    id: String
  },
  schedule: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    },
    startTime: String,
    endTime: String,
    subject: String
  }],
  students: [{
    type: String,
    ref: 'Student'
  }],
  totalStudents: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

classSchema.index({ classId: 1 });
classSchema.index({ department: 1 });

module.exports = mongoose.model('Class', classSchema);
