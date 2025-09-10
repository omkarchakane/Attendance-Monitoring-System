// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import CameraCapture from './components/CameraCapture';
import PhotoUpload from './components/PhotoUpload';
import AttendanceDashboard from './components/AttendanceDashboard';
import StudentRegistration from './components/StudentRegistration';
import AttendanceExcel from './components/AttendanceExcel';
import LiveFeed from './components/LiveFeed';
import AdminPanel from './components/AdminPanel';
import { initializeSocket } from './services/socketService';
import './styles/App.css';

function App() {
  const [activeTab, setActiveTab] = useState('camera');
  const [classId, setClassId] = useState('LY14-CC2');
  const [attendanceData, setAttendanceData] = useState([]);
  const [userRole, setUserRole] = useState('teacher'); // teacher, admin
  const [socket, setSocket] = useState(null);
  const [liveStats, setLiveStats] = useState({
    totalPresent: 0,
    totalStudents: 0,
    lastUpdated: null
  });

  useEffect(() => {
    // Initialize socket connection
    const socketConnection = initializeSocket();
    setSocket(socketConnection);

    // Listen for real-time updates
    socketConnection.on('attendanceMarked', (data) => {
      setAttendanceData(prev => [...prev, ...data.students]);
      updateLiveStats(data);
    });

    socketConnection.on('batchAttendanceMarked', (data) => {
      setAttendanceData(prev => [...prev, ...data.students]);
      updateLiveStats(data);
    });

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const updateLiveStats = (data) => {
    setLiveStats(prev => ({
      totalPresent: prev.totalPresent + data.students.length,
      totalStudents: prev.totalStudents, // This should be fetched from database
      lastUpdated: new Date().toLocaleTimeString()
    }));
  };

  const handleAttendanceMarked = (data) => {
    setAttendanceData(prev => [...prev, ...data]);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'camera':
        return (
          <CameraCapture 
            classId={classId}
            onAttendanceMarked={handleAttendanceMarked}
            socket={socket}
          />
        );
      case 'upload':
        return (
          <PhotoUpload 
            classId={classId}
            onAttendanceMarked={handleAttendanceMarked}
            socket={socket}
          />
        );
      case 'dashboard':
        return (
          <AttendanceDashboard 
            classId={classId}
            attendanceData={attendanceData}
            liveStats={liveStats}
          />
        );
      case 'excel':
        return (
          <AttendanceExcel 
            classId={classId}
          />
        );
      case 'register':
        return (
          <StudentRegistration 
            classId={classId}
          />
        );
      case 'live':
        return (
          <LiveFeed 
            classId={classId}
            socket={socket}
          />
        );
      case 'admin':
        return userRole === 'admin' ? (
          <AdminPanel />
        ) : (
          <div>Access Denied</div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <div className="university-info">
            <h1>🎓 MIT-ADT University</h1>
            <p>Smart Attendance Management System</p>
          </div>
          <div className="class-controls">
            <div className="class-selector">
              <label>Class: </label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="LY14-CC1">LY14-CC1</option>
                <option value="LY14-CC2">LY14-CC2</option>
                <option value="SY15-CS1">SY15-CS1</option>
                <option value="TY16-IT1">TY16-IT1</option>
              </select>
            </div>
            <div className="live-stats">
              <span>Present: {liveStats.totalPresent}</span>
              <span>Last Update: {liveStats.lastUpdated || 'Never'}</span>
            </div>
          </div>
        </div>
      </header>

      <nav className="tab-navigation">
        <button 
          className={`nav-tab ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => setActiveTab('camera')}
        >
          📸 Camera Capture
        </button>
        <button 
          className={`nav-tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📁 Photo Upload
        </button>
        <button 
          className={`nav-tab ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          📺 Live Feed
        </button>
        <button 
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={`nav-tab ${activeTab === 'excel' ? 'active' : ''}`}
          onClick={() => setActiveTab('excel')}
        >
          📋 Excel Sheets
        </button>
        <button 
          className={`nav-tab ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => setActiveTab('register')}
        >
          ➕ Register Student
        </button>
        {userRole === 'admin' && (
          <button 
            className={`nav-tab ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            ⚙️ Admin Panel
          </button>
        )}
      </nav>

      <main className="main-content">
        {renderTabContent()}
      </main>

      <footer className="app-footer">
        <p>&copy; 2025 MIT-ADT University | Developed by: Venkat Tarun, Chanakya Marbate, Soham Kokate, Siddhant Dakhane</p>
      </footer>
    </div>
  );
}

export default App;
