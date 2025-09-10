const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: [
      'Computer Science & Engineering',
      'Information Technology', 
      'Electronics Engineering',
      'Mechanical Engineering',
      'Civil Engineering',
      'Electrical Engineering'
    ]
  },
  class: {
    type: String,
    required: [true, 'Class is required'],
    trim: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: [1, 'Semester must be between 1 and 8'],
    max: [8, 'Semester must be between 1 and 8']
  },
  academicYear: {
    type: String,
    default: () => {
      const currentYear = new Date().getFullYear();
      return `${currentYear}-${currentYear + 1}`;
    }
  },
  rollNumber: {
    type: String,
    sparse: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^\d{10}$/, 'Please provide a valid 10-digit phone number']
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: {
      type: String,
      match: [/^\d{6}$/, 'Please provide a valid 6-digit pincode']
    }
  },
  faceEncodings: [{
    encoding: {
      type: [Number],
      required: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.9
    },
    capturedAt: {
      type: Date,
      default: Date.now
    },
    imageMetadata: {
      resolution: String,
      lighting: String,
      angle: String
    }
  }],
  averageFaceEncoding: {
    type: [Number],
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    select: false
  },
  lastLogin: {
    type: Date
  },
  attendanceStats: {
    totalClasses: {
      type: Number,
      default: 0
    },
    totalPresent: {
      type: Number,
      default: 0
    },
    totalAbsent: {
      type: Number,
      default: 0
    },
    attendancePercentage: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'hi', 'mr']
    }
  },
  registeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  registrationMethod: {
    type: String,
    enum: ['manual', 'bulk_upload', 'self_registration'],
    default: 'manual'
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
studentSchema.index({ studentId: 1, class: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ department: 1, class: 1 });
studentSchema.index({ isActive: 1 });
studentSchema.index({ 'attendanceStats.attendancePercentage': -1 });

// Virtual for full name with title
studentSchema.virtual('fullNameWithTitle').get(function() {
  return `${this.name} (${this.studentId})`;
});

// Virtual for current attendance percentage
studentSchema.virtual('currentAttendancePercentage').get(function() {
  if (this.attendanceStats.totalClasses === 0) return 0;
  return ((this.attendanceStats.totalPresent / this.attendanceStats.totalClasses) * 100).toFixed(2);
});

// Method to update attendance statistics
studentSchema.methods.updateAttendanceStats = async function(isPresent = true) {
  this.attendanceStats.totalClasses += 1;
  if (isPresent) {
    this.attendanceStats.totalPresent += 1;
  } else {
    this.attendanceStats.totalAbsent += 1;
  }
  
  this.attendanceStats.attendancePercentage = 
    ((this.attendanceStats.totalPresent / this.attendanceStats.totalClasses) * 100);
  
  this.attendanceStats.lastUpdated = new Date();
  
  return this.save();
};

// Method to add face encoding
studentSchema.methods.addFaceEncoding = function(encoding, metadata = {}) {
  this.faceEncodings.push({
    encoding,
    capturedAt: new Date(),
    imageMetadata: metadata
  });
  
  // Calculate average encoding
  if (this.faceEncodings.length > 0) {
    const totalEncodings = this.faceEncodings.length;
    const avgEncoding = new Array(encoding.length).fill(0);
    
    this.faceEncodings.forEach(faceEnc => {
      faceEnc.encoding.forEach((val, index) => {
        avgEncoding[index] += val / totalEncodings;
      });
    });
    
    this.averageFaceEncoding = avgEncoding;
  }
  
  return this.save();
};

// Method to get latest face encoding
studentSchema.methods.getLatestFaceEncoding = function() {
  if (this.faceEncodings.length === 0) return null;
  return this.faceEncodings.sort((a, b) => b.capturedAt - a.capturedAt)[0];
};

// Static method to find students by class
studentSchema.statics.findByClass = function(className) {
  return this.find({ class: className, isActive: true }).sort({ name: 1 });
};

// Static method to find students with low attendance
studentSchema.statics.findLowAttendanceStudents = function(threshold = 75) {
  return this.find({
    'attendanceStats.attendancePercentage': { $lt: threshold },
    isActive: true
  }).sort({ 'attendanceStats.attendancePercentage': 1 });
};

// Pre-save middleware to hash sensitive data
studentSchema.pre('save', function(next) {
  // Convert student ID to uppercase
  if (this.studentId) {
    this.studentId = this.studentId.toUpperCase();
  }
  
  // Auto-generate roll number if not provided
  if (this.isNew && !this.rollNumber) {
    this.rollNumber = this.studentId.split('').reverse().join('').substring(0, 4);
  }
  
  next();
});

// Pre-remove middleware to clean up related data
studentSchema.pre('deleteOne', { document: true, query: false }, async function() {
  // Remove related attendance records
  await mongoose.model('Attendance').deleteMany({ studentId: this.studentId });
});

// Instance method to generate verification token
studentSchema.methods.generateVerificationToken = function() {
  const crypto = require('crypto');
  this.verificationToken = crypto.randomBytes(32).toString('hex');
  return this.verificationToken;
};

// Instance method to verify student
studentSchema.methods.verify = function() {
  this.isVerified = true;
  this.verificationToken = undefined;
  return this.save();
};

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
