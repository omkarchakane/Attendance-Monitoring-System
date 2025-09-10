import React, { useState, useEffect, useRef } from 'react';
import { initializeSocket } from '../services/socketService';

const LiveFeed = ({ classId }) => {
  const [liveAttendance, setLiveAttendance] = useState([]);
  const [unregisteredFaces, setUnregisteredFaces] = useState(0);
  const [systemStatus, setSystemStatus] = useState({
    camera: 'offline',
    mlService: 'offline',
    database: 'offline'
  });
  const [socket, setSocket] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const feedRef = useRef();

  useEffect(() => {
    const socketConnection = initializeSocket();
    setSocket(socketConnection);

    // Real-time event listeners
    socketConnection.on('attendanceMarked', handleAttendanceMarked);
    socketConnection.on('unregisteredFace', handleUnregisteredFace);
    socketConnection.on('systemStatus', handleSystemStatus);
    socketConnection.on('batchAttendanceMarked', handleBatchAttendance);

    // Join class room for real-time updates
    socketConnection.emit('joinClass', classId);

    // Check system status on load
    checkSystemStatus();

    return () => {
      socketConnection.off('attendanceMarked');
      socketConnection.off('unregisteredFace');
      socketConnection.off('systemStatus');
      socketConnection.off('batchAttendanceMarked');
      socketConnection.emit('leaveClass', classId);
      socketConnection.disconnect();
    };
  }, [classId]);

  const handleAttendanceMarked = (data) => {
    const newEntry = {
      id: Date.now(),
      type: 'attendance',
      timestamp: new Date(),
      students: data.students,
      method: data.method || 'camera',
      classId: data.classId
    };

    setLiveAttendance(prev => [newEntry, ...prev].slice(0, 100)); // Keep last 100 entries
    
    // Auto-scroll to top
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }

    // Show notification
    showNotification(`${data.students.length} student(s) marked present`, 'success');
  };

  const handleBatchAttendance = (data) => {
    const newEntry = {
      id: Date.now(),
      type: 'batch_attendance',
      timestamp: new Date(),
      students: data.students,
      totalPhotos: data.totalPhotos,
      method: 'photo_upload',
      classId: data.classId
    };

    setLiveAttendance(prev => [newEntry, ...prev].slice(0, 100));
    
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }

    showNotification(`Batch upload: ${data.students.length} students recognized from ${data.totalPhotos} photos`, 'success');
  };

  const handleUnregisteredFace = (data) => {
    setUnregisteredFaces(prev => prev + 1);
    
    const newEntry = {
      id: Date.now(),
      type: 'unregistered_face',
      timestamp: new Date(),
      count: data.count || 1,
      classId: data.classId
    };

    setLiveAttendance(prev => [newEntry, ...prev].slice(0, 100));
    
    showNotification(`${data.count || 1} unregistered face(s) detected`, 'warning');
  };

  const handleSystemStatus = (status) => {
    setSystemStatus(status);
  };

  const checkSystemStatus = async () => {
    try {
      // Check backend health
      const backendResponse = await fetch('/api/health');
      const backendHealth = await backendResponse.json();
      
      // Check ML service health
      const mlResponse = await fetch('http://localhost:5001/health');
      const mlHealth = await mlResponse.json();

      setSystemStatus({
        camera: 'online', // This would be determined by camera access
        mlService: mlHealth.status === 'OK' ? 'online' : 'offline',
        database: backendHealth.status === 'OK' ? 'online' : 'offline'
      });

    } catch (error) {
      console.error('System status check failed:', error);
      setSystemStatus({
        camera: 'unknown',
        mlService: 'offline',
        database: 'offline'
      });
    }
  };

  const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `live-notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">
          ${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️'}
        </span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
  };

  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    if (socket) {
      socket.emit('toggleMonitoring', { classId, monitoring: !isMonitoring });
    }
  };

  const clearFeed = () => {
    setLiveAttendance([]);
    setUnregisteredFaces(0);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#4CAF50';
      case 'offline': return '#f44336';
      default: return '#ff9800';
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getEntryIcon = (type) => {
    switch (type) {
      case 'attendance': return '👤';
      case 'batch_attendance': return '👥';
      case 'unregistered_face': return '❓';
      default: return 'ℹ️';
    }
  };

  const getEntryColor = (type) => {
    switch (type) {
      case 'attendance': return '#e8f5e8';
      case 'batch_attendance': return '#e3f2fd';
      case 'unregistered_face': return '#fff3e0';
      default: return '#f8f9fa';
    }
  };

  return (
    <div className="live-feed-container">
      <div className="live-feed-header">
        <div className="feed-title">
          <h2>📡 Live Attendance Feed</h2>
          <p>Real-time monitoring for class {classId}</p>
        </div>
        
        <div className="feed-controls">
          <button
            onClick={toggleMonitoring}
            className={`monitoring-btn ${isMonitoring ? 'active' : ''}`}
          >
            {isMonitoring ? '⏸️ Pause Monitoring' : '▶️ Start Monitoring'}
          </button>
          <button onClick={clearFeed} className="clear-feed-btn">
            🗑️ Clear Feed
          </button>
        </div>
      </div>

      <div className="system-status">
        <h3>System Status</h3>
        <div className="status-grid">
          <div className="status-item">
            <span 
              className="status-dot" 
              style={{ backgroundColor: getStatusColor(systemStatus.camera) }}
            ></span>
            <span className="status-label">Camera</span>
            <span className="status-value">{systemStatus.camera}</span>
          </div>
          
          <div className="status-item">
            <span 
              className="status-dot" 
              style={{ backgroundColor: getStatusColor(systemStatus.mlService) }}
            ></span>
            <span className="status-label">ML Service</span>
            <span className="status-value">{systemStatus.mlService}</span>
          </div>
          
          <div className="status-item">
            <span 
              className="status-dot" 
              style={{ backgroundColor: getStatusColor(systemStatus.database) }}
            ></span>
            <span className="status-label">Database</span>
            <span className="status-value">{systemStatus.database}</span>
          </div>
        </div>
      </div>

      <div className="feed-stats">
        <div className="stat-item">
          <span className="stat-number">{liveAttendance.filter(entry => entry.type === 'attendance' || entry.type === 'batch_attendance').length}</span>
          <span className="stat-label">Attendance Events</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{unregisteredFaces}</span>
          <span className="stat-label">Unregistered Faces</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">
            {liveAttendance.reduce((total, entry) => {
              if (entry.type === 'attendance' || entry.type === 'batch_attendance') {
                return total + (entry.students ? entry.students.length : 0);
              }
              return total;
            }, 0)}
          </span>
          <span className="stat-label">Total Students</span>
        </div>
      </div>

      <div className="live-feed" ref={feedRef}>
        <h3>Live Activity Stream</h3>
        
        {liveAttendance.length === 0 ? (
          <div className="no-activity">
            <div className="no-activity-icon">📭</div>
            <p>No recent activity</p>
            <p>Activity will appear here in real-time</p>
          </div>
        ) : (
          <div className="feed-list">
            {liveAttendance.map((entry) => (
              <div 
                key={entry.id} 
                className="feed-entry"
                style={{ backgroundColor: getEntryColor(entry.type) }}
              >
                <div className="entry-header">
                  <span className="entry-icon">{getEntryIcon(entry.type)}</span>
                  <span className="entry-time">{formatTime(entry.timestamp)}</span>
                  <span className="entry-method">{entry.method}</span>
                </div>
                
                <div className="entry-content">
                  {entry.type === 'attendance' && (
                    <div className="attendance-entry">
                      <h4>Attendance Marked</h4>
                      <div className="students-list">
                        {entry.students.map((student, index) => (
                          <div key={index} className="student-item">
                            <span className="student-name">{student.name}</span>
                            <span className="student-id">({student.studentId})</span>
                            <span className="confidence">
                              {(student.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {entry.type === 'batch_attendance' && (
                    <div className="batch-entry">
                      <h4>Batch Upload Processed</h4>
                      <p>{entry.students.length} students recognized from {entry.totalPhotos} photos</p>
                      <div className="students-summary">
                        {entry.students.slice(0, 3).map((student, index) => (
                          <span key={index} className="student-tag">
                            {student.name}
                          </span>
                        ))}
                        {entry.students.length > 3 && (
                          <span className="more-students">
                            +{entry.students.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {entry.type === 'unregistered_face' && (
                    <div className="unregistered-entry">
                      <h4>Unregistered Face Detected</h4>
                      <p>{entry.count} unknown face(s) detected</p>
                      <button className="alert-admin-btn">
                        🚨 Alert Administrator
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveFeed;
