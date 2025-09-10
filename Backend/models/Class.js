const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  classId: {
    type: String,
    required: [true, 'Class ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
    match: [/^[A-Z0-9-]+$/, 'Class ID can only contain letters, numbers, and hyphens']
  },
  className: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true,
    maxlength: [100, 'Class name cannot exceed 100 characters']
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
  academicYear: {
    type: String,
    required: [true, 'Academic year is required'],
    match: [/^\d{4}-\d{4}$/, 'Academic year must be in YYYY-YYYY format']
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: [1, 'Semester must be between 1 and 8'],
    max: [8, 'Semester must be between 1 and 8']
  },
  section: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: [5, 'Section cannot exceed 5 characters']
  },
  batch: {
    type: String,
    trim: true,
    maxlength: [20, 'Batch cannot exceed 20 characters']
  },
  capacity: {
    type: Number,
    min: [1, 'Capacity must be at least 1'],
    max: [300, 'Capacity cannot exceed 300'],
    default: 60
  },
  currentStrength: {
    type: Number,
    min: [0, 'Current strength cannot be negative'],
    default: 0
  },
  teachers: [{
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    employeeId: {
      type: String,
      trim: true,
      uppercase: true
    },
    role: {
      type: String,
      enum: ['Class Teacher', 'Subject Teacher', 'Assistant Teacher', 'Lab Instructor'],
      default: 'Subject Teacher'
    },
    subjects: [{
      subjectCode: String,
      subjectName: String,
      credits: Number
    }],
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  schedule: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true
    },
    periods: [{
      periodNumber: {
        type: Number,
        min: 1,
        max: 10
      },
      startTime: {
        type: String,
        required: true,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:MM']
      },
      endTime: {
        type: String,
        required: true,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:MM']
      },
      subject: {
        code: {
          type: String,
          required: true,
          trim: true,
          uppercase: true
        },
        name: {
          type: String,
          required: true,
          trim: true
        },
        type: {
          type: String,
          enum: ['Theory', 'Practical', 'Tutorial', 'Laboratory'],
          default: 'Theory'
        },
        credits: {
          type: Number,
          min: 0,
          max: 6,
          default: 3
        }
      },
      teacher: {
        teacherId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        name: String
      },
      venue: {
        building: String,
        room: String,
        floor: String,
        capacity: Number,
        type: {
          type: String,
          enum: ['Classroom', 'Laboratory', 'Auditorium', 'Seminar Hall'],
          default: 'Classroom'
        }
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }]
  }],
  students: [{
    studentId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    rollNumber: {
      type: String,
      trim: true
    },
    enrollmentDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Transferred', 'Dropped', 'Graduated'],
      default: 'Active'
    },
    attendanceStats: {
      totalClasses: { type: Number, default: 0 },
      totalPresent: { type: Number, default: 0 },
      attendancePercentage: { type: Number, default: 0 }
    }
  }],
  classRepresentatives: [{
    studentId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    position: {
      type: String,
      enum: ['Class Representative', 'Vice Representative', 'Secretary'],
      default: 'Class Representative'
    },
    appointedDate: {
      type: Date,
      default: Date.now
    }
  }],
  attendanceSettings: {
    attendanceMode: {
      type: String,
      enum: ['face_recognition', 'manual', 'rfid', 'qr_code', 'hybrid'],
      default: 'face_recognition'
    },
    lateThreshold: {
      type: Number, // minutes
      default: 10
    },
    minimumAttendancePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 75
    },
    allowLateEntry: {
      type: Boolean,
      default: true
    },
    maxLateEntryMinutes: {
      type: Number,
      default: 30
    },
    autoMarkAbsent: {
      type: Boolean,
      default: false
    },
    notificationSettings: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      parentNotifications: { type: Boolean, default: true }
    }
  },
  statistics: {
    totalLectures: { type: Number, default: 0 },
    averageAttendance: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    tags: [{
      type: String,
      trim: true
    }],
    customFields: {
      type: Map,
      of: String
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
classSchema.index({ classId: 1 });
classSchema.index({ department: 1, semester: 1 });
classSchema.index({ academicYear: 1 });
classSchema.index({ 'students.studentId': 1 });
classSchema.index({ 'teachers.teacherId': 1 });
classSchema.index({ isActive: 1 });

// Virtual for occupancy percentage
classSchema.virtual('occupancyPercentage').get(function() {
  if (this.capacity === 0) return 0;
  return ((this.currentStrength / this.capacity) * 100).toFixed(2);
});

// Virtual for full class name
classSchema.virtual('fullClassName').get(function() {
  return `${this.className} (${this.classId})`;
});

// Virtual for active students count
classSchema.virtual('activeStudentsCount').get(function() {
  return this.students.filter(student => student.status === 'Active').length;
});

// Method to add student to class
classSchema.methods.addStudent = function(studentData) {
  // Check if student already exists
  const existingStudent = this.students.find(s => s.studentId === studentData.studentId);
  if (existingStudent) {
    throw new Error('Student already exists in this class');
  }
  
  // Check capacity
  if (this.activeStudentsCount >= this.capacity) {
    throw new Error('Class is at full capacity');
  }
  
  this.students.push({
    ...studentData,
    enrollmentDate: new Date(),
    status: 'Active'
  });
  
  this.currentStrength += 1;
  return this.save();
};

// Method to remove student from class
classSchema.methods.removeStudent = function(studentId) {
  const studentIndex = this.students.findIndex(s => s.studentId === studentId);
  if (studentIndex === -1) {
    throw new Error('Student not found in this class');
  }
  
  this.students[studentIndex].status = 'Transferred';
  this.currentStrength = Math.max(0, this.currentStrength - 1);
  
  return this.save();
};

// Method to add teacher to class
classSchema.methods.addTeacher = function(teacherData) {
  const existingTeacher = this.teachers.find(t => t.teacherId.toString() === teacherData.teacherId.toString());
  if (existingTeacher) {
    throw new Error('Teacher already assigned to this class');
  }
  
  this.teachers.push({
    ...teacherData,
    isActive: true
  });
  
  return this.save();
};

// Method to update attendance statistics
classSchema.methods.updateAttendanceStats = async function() {
  const Attendance = mongoose.model('Attendance');
  
  // Get total lectures for this class
  const totalLectures = await Attendance.distinct('date', { classId: this.classId }).length;
  
  // Calculate average attendance
  const attendanceStats = await Attendance.aggregate([
    { $match: { classId: this.classId } },
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
      $group: {
        _id: null,
        avgAttendance: { $avg: { $divide: ['$presentCount', '$totalCount'] } }
      }
    }
  ]);
  
  this.statistics.totalLectures = totalLectures;
  this.statistics.averageAttendance = attendanceStats.length > 0 ? 
    (attendanceStats[0].avgAttendance * 100).toFixed(2) : 0;
  this.statistics.lastUpdated = new Date();
  
  return this.save();
};

// Method to get today's schedule
classSchema.methods.getTodaysSchedule = function() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todaysSchedule = this.schedule.find(s => s.day === today);
  
  return todaysSchedule ? todaysSchedule.periods.filter(p => p.isActive) : [];
};

// Method to get current period
classSchema.methods.getCurrentPeriod = function() {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                     now.getMinutes().toString().padStart(2, '0');
  
  const todaysSchedule = this.getTodaysSchedule();
  
  return todaysSchedule.find(period => {
    return currentTime >= period.startTime && currentTime <= period.endTime;
  });
};

// Static method to find classes by teacher
classSchema.statics.findByTeacher = function(teacherId) {
  return this.find({
    'teachers.teacherId': teacherId,
    'teachers.isActive': true,
    isActive: true
  });
};

// Static method to find classes by department and semester
classSchema.statics.findByDepartmentAndSemester = function(department, semester) {
  return this.find({
    department,
    semester,
    isActive: true
  }).sort({ className: 1 });
};

// Pre-save middleware to update current strength
classSchema.pre('save', function(next) {
  if (this.isModified('students')) {
    this.currentStrength = this.students.filter(s => s.status === 'Active').length;
  }
  next();
});

// Pre-save middleware to validate schedule
classSchema.pre('save', function(next) {
  // Validate that end time is after start time for each period
  for (const daySchedule of this.schedule) {
    for (const period of daySchedule.periods) {
      const startTime = new Date(`1970-01-01T${period.startTime}:00`);
      const endTime = new Date(`1970-01-01T${period.endTime}:00`);
      
      if (endTime <= startTime) {
        return next(new Error(`Invalid time range for ${daySchedule.day}: End time must be after start time`));
      }
    }
  }
  next();
});

const Class = mongoose.model('Class', classSchema);

module.exports = Class;
