import React, { useState, useEffect } from 'react';
import { getAttendanceData, getAttendanceStats } from '../services/apiService';

const AttendanceDashboard = ({ classId, attendanceData }) => {
  const [todayStats, setTodayStats] = useState({
    totalPresent: 0,
    totalAbsent: 0,
    attendancePercentage: 0
  });
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [classId]);

  useEffect(() => {
    if (attendanceData.length > 0) {
      setRecentAttendance(prev => [...attendanceData, ...prev].slice(0, 20));
      calculateStats();
    }
  }, [attendanceData]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [attendanceResponse, statsResponse] = await Promise.all([
        getAttendanceData(classId, today),
        getAttendanceStats(classId, today)
      ]);

      if (attendanceResponse.success) {
        setRecentAttendance(attendanceResponse.attendance);
      }

      if (statsResponse.success) {
        setTodayStats(statsResponse.stats);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = recentAttendance.filter(record => 
      record.date === today
    );

    const totalPresent = todayAttendance.length;
    const totalStudents = 60; // This should come from your student database
    const attendancePercentage = totalStudents > 0 ? 
      ((totalPresent / totalStudents) * 100).toFixed(1) : 0;

    setTodayStats({
      totalPresent,
      totalAbsent: totalStudents - totalPresent,
      attendancePercentage
    });
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="attendance-dashboard">
      <div className="dashboard-header">
        <h2>📊 Attendance Dashboard - {classId}</h2>
        <p>Real-time attendance monitoring and statistics</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card present">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-number">{todayStats.totalPresent}</div>
            <div className="stat-label">Present Today</div>
          </div>
        </div>
        
        <div className="stat-card absent">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-number">{todayStats.totalAbsent}</div>
            <div className="stat-label">Absent Today</div>
          </div>
        </div>
        
        <div className="stat-card percentage">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-number">{todayStats.attendancePercentage}%</div>
            <div className="stat-label">Attendance Rate</div>
          </div>
        </div>
        
        <div className="stat-card total">
          <div className="stat-icon">🎓</div>
          <div className="stat-content">
            <div className="stat-number">{todayStats.totalPresent + todayStats.totalAbsent}</div>
            <div className="stat-label">Total Students</div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="recent-attendance">
          <h3>Recent Attendance Activity</h3>
          <div className="attendance-list">
            {recentAttendance.length > 0 ? (
              recentAttendance.map((record, index) => (
                <div key={index} className="attendance-record">
                  <div className="student-info">
                    <span className="student-name">{record.studentName || record.name}</span>
                    <span className="student-id">{record.studentId}</span>
                  </div>
                  <div className="attendance-meta">
                    <span className="method">{record.method}</span>
                    <span className="timestamp">
                      {new Date(record.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="status-badge present">Present</div>
                </div>
              ))
            ) : (
              <div className="no-attendance">
                <p>No attendance records found for today</p>
                <p>Start capturing attendance to see activity here</p>
              </div>
            )}
          </div>
        </div>

        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <div className="action-buttons">
            <button 
              className="action-btn"
              onClick={() => window.location.reload()}
            >
              🔄 Refresh Data
            </button>
            <button 
              className="action-btn"
              onClick={() => {/* Navigate to excel tab */}}
            >
              📊 Generate Report
            </button>
            <button 
              className="action-btn"
              onClick={() => {/* Navigate to camera tab */}}
            >
              📸 Mark Attendance
            </button>
          </div>
        </div>
      </div>

      <div className="attendance-chart">
        <h3>Weekly Attendance Overview</h3>
        <div className="chart-placeholder">
          <p>Chart visualization would be implemented here using a library like Recharts</p>
        </div>
      </div>
    </div>
  );
};

export default AttendanceDashboard;
