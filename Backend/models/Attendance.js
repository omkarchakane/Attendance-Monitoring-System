const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    ref: 'Student',
    trim: true,
    uppercase: true
  },
  studentName: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true
  },
  classId: {
    type: String,
    required: [true, 'Class ID is required'],
    trim: true
  },
  subjectCode: {
    type: String,
    trim: true,
    uppercase: true
  },
  subjectName: {
    type: String,
    trim: true
  },
  date: {
    type: String, // YYYY-MM-DD format for easy querying
    required: [true, 'Date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  status: {
    type: String,
    enum: {
      values: ['Present', 'Absent', 'Late', 'Excused'],
      message: 'Status must be Present, Absent, Late, or Excused'
    },
    default: 'Present'
  },
  method: {
    type: String,
    enum: {
      values: ['camera_capture', 'photo_upload', 'manual', 'bulk_upload', 'rfid', 'qr_code'],
      message: 'Invalid attendance marking method'
    },
    required: [true, 'Attendance method is required']
  },
  confidence: {
    type: Number,
    min: [0, 'Confidence cannot be negative'],
    max: [1, 'Confidence cannot be greater than 1'],
    default: null
  },
  faceDetectionData: {
    boundingBox: {
      x: Number,
      y: Number,
      width: Number,
      height: Number
    },
    landmarks: [{
      type: String,
      coordinates: {
        x: Number,
        y: Number
      }
    }],
    quality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor']
    }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    address: {
      building: String,
      room: String,
      floor: String,
      campus: String
    }
  },
  deviceInfo: {
    userAgent: String,
    ipAddress: {
      type: String,
      match: [/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$/, 'Invalid IP address format']
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'kiosk']
    },
    browser: String,
    operatingSystem: String
  },
  sessionInfo: {
    sessionId: String,
    lectureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture'
    },
    duration: Number, // in minutes
    startTime: Date,
    endTime: Date
  },
  verificationStatus: {
    isVerified: {
      type: Boolean,
      default: true
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verificationMethod: {
      type: String,
      enum: ['automatic', 'manual_review', 'admin_override']
    },
    verificationNotes: String
  },
  flags: {
    isLate: {
      type: Boolean,
      default: false
    },
    isProxy: {
      type: Boolean,
      default: false
    },
    needsReview: {
      type: Boolean,
      default: false
    },
    isDoubtful: {
      type: Boolean,
      default: false
    }
  },
  metadata: {
    imageUrl: String,
    imageHash: String,
    processingTime: Number, // in milliseconds
    modelVersion: String,
    batchId: String, // For batch uploads
    originalFileName: String
  },
  corrections: [{
    correctedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    correctedAt: {
      type: Date,
      default: Date.now
    },
    previousStatus: String,
    newStatus: String,
    reason: String,
    notes: String
  }],
  notifications: {
    emailSent: {
      type: Boolean,
      default: false
    },
    smsSent: {
      type: Boolean,
      default: false
    },
    parentNotified: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for unique attendance per student per day per class
attendanceSchema.index({ 
  studentId: 1, 
  classId: 1, 
  date: 1,
  subjectCode: 1
}, { 
  unique: true,
  partialFilterExpression: { status: { $ne: 'Absent' } }
});

// Additional indexes for common queries
attendanceSchema.index({ classId: 1, date: 1 });
attendanceSchema.index({ studentId: 1, date: 1 });
attendanceSchema.index({ timestamp: -1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ method: 1 });
attendanceSchema.index({ 'flags.needsReview': 1 });
attendanceSchema.index({ location: '2dsphere' });

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return new Date(this.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for formatted time
attendanceSchema.virtual('formattedTime').get(function() {
  return this.timestamp.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
});

// Virtual for attendance delay (if late)
attendanceSchema.virtual('delayInMinutes').get(function() {
  if (!this.flags.isLate || !this.sessionInfo.startTime) return 0;
  return Math.floor((this.timestamp - this.sessionInfo.startTime) / (1000 * 60));
});

// Instance method to mark as late
attendanceSchema.methods.markAsLate = function(thresholdMinutes = 10) {
  if (this.sessionInfo.startTime) {
    const delayMinutes = (this.timestamp - this.sessionInfo.startTime) / (1000 * 60);
    if (delayMinutes > thresholdMinutes) {
      this.flags.isLate = true;
      this.status = 'Late';
    }
  }
  return this.save();
};

// Instance method to add correction
attendanceSchema.methods.addCorrection = function(correctorId, previousStatus, newStatus, reason, notes = '') {
  this.corrections.push({
    correctedBy: correctorId,
    correctedAt: new Date(),
    previousStatus,
    newStatus,
    reason,
    notes
  });
  
  this.status = newStatus;
  return this.save();
};

// Instance method to flag for review
attendanceSchema.methods.flagForReview = function(reason = '') {
  this.flags.needsReview = true;
  this.verificationStatus.verificationNotes = reason;
  return this.save();
};

// Static method to get attendance by date range
attendanceSchema.statics.getAttendanceByDateRange = function(classId, startDate, endDate, status = null) {
  const query = {
    classId,
    date: { $gte: startDate, $lte: endDate }
  };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query).sort({ date: 1, timestamp: 1 });
};

// Static method to get class attendance statistics
attendanceSchema.statics.getClassStatistics = async function(classId, date) {
  const pipeline = [
    { $match: { classId, date } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        students: { $push: { studentId: '$studentId', studentName: '$studentName', timestamp: '$timestamp' } }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Static method to get student attendance percentage
attendanceSchema.statics.getStudentAttendancePercentage = async function(studentId, startDate, endDate) {
  const totalClasses = await this.countDocuments({
    studentId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  const presentClasses = await this.countDocuments({
    studentId,
    date: { $gte: startDate, $lte: endDate },
    status: { $in: ['Present', 'Late'] }
  });
  
  return totalClasses > 0 ? ((presentClasses / totalClasses) * 100).toFixed(2) : 0;
};

// Static method to find duplicate attendance entries
attendanceSchema.statics.findDuplicateEntries = function(timeWindow = 5) {
  const pipeline = [
    {
      $group: {
        _id: { studentId: '$studentId', classId: '$classId', date: '$date' },
        count: { $sum: 1 },
        entries: { $push: '$$ROOT' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ];
  
  return this.aggregate(pipeline);
};

// Pre-save middleware to set date from timestamp
attendanceSchema.pre('save', function(next) {
  if (this.timestamp && !this.date) {
    this.date = this.timestamp.toISOString().split('T')[0];
  }
  
  // Auto-detect if late based on session start time
  if (this.sessionInfo.startTime && !this.flags.isLate) {
    const delayMinutes = (this.timestamp - this.sessionInfo.startTime) / (1000 * 60);
    if (delayMinutes > 10) { // 10 minute threshold
      this.flags.isLate = true;
      if (this.status === 'Present') {
        this.status = 'Late';
      }
    }
  }
  
  // Set doubtful flag for very low confidence
  if (this.confidence && this.confidence < 0.6) {
    this.flags.isDoubtful = true;
    this.flags.needsReview = true;
  }
  
  next();
});

// Post-save middleware to update student attendance stats
attendanceSchema.post('save', async function() {
  try {
    const Student = mongoose.model('Student');
    const student = await Student.findOne({ studentId: this.studentId });
    
    if (student) {
      await student.updateAttendanceStats(this.status === 'Present' || this.status === 'Late');
    }
  } catch (error) {
    console.error('Error updating student attendance stats:', error);
  }
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
