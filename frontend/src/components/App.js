import React, { useState, useEffect } from 'react';
import CameraCapture from './CameraCapture';
import PhotoUpload from './PhotoUpload';
import AttendanceDashboard from './AttendanceDashboard';
import StudentRegistration from './StudentRegistration';
import ExcelManager from './ExcelManager';
import { initializeSocket } from '../services/socketService';
import '../styles/App.css';
import '../styles/components.css';
import '../styles/dashboard.css';

function App() {
  const [activeTab, setActiveTab] = useState('camera');
  const [classId, setClassId] = useState('LY14-CC2');
  const [attendanceData, setAttendanceData] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const socketConnection = initializeSocket();
    setSocket(socketConnection);

    // Real-time attendance updates
    socketConnection.on('attendanceMarked', (data) => {
      setAttendanceData(prev => [...prev, ...data.students]);
    });

    socketConnection.on('batchAttendanceMarked', (data) => {
      setAttendanceData(prev => [...prev, ...data.students]);
    });

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const handleAttendanceMarked = (data) => {
    if (Array.isArray(data)) {
      setAttendanceData(prev => [...prev, ...data]);
    } else {
      setAttendanceData(prev => [...prev, data]);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>🎓 MIT-ADT Smart Attendance System</h1>
            <p>Face Recognition & Real-time Excel Integration</p>
          </div>
          <div className="class-selector">
            <label>Select Class: </label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="LY14-CC2">LY14-CC2</option>
              <option value="LY14-CC1">LY14-CC1</option>
              <option value="SY15-CS1">SY15-CS1</option>
              <option value="TY16-CS1">TY16-CS1</option>
            </select>
          </div>
        </div>
      </header>

      <nav className="tab-navigation">
        <button 
          className={activeTab === 'camera' ? 'active' : ''}
          onClick={() => setActiveTab('camera')}
        >
          📸 Camera Capture
        </button>
        <button 
          className={activeTab === 'upload' ? 'active' : ''}
          onClick={() => setActiveTab('upload')}
        >
          📁 Photo Upload
        </button>
        <button 
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={activeTab === 'excel' ? 'active' : ''}
          onClick={() => setActiveTab('excel')}
        >
          📋 Excel Sheets
        </button>
        <button 
          className={activeTab === 'register' ? 'active' : ''}
          onClick={() => setActiveTab('register')}
        >
          ➕ Register Student
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'camera' && (
          <CameraCapture 
            classId={classId}
            onAttendanceMarked={handleAttendanceMarked}
          />
        )}
        
        {activeTab === 'upload' && (
          <PhotoUpload 
            classId={classId}
            onAttendanceMarked={handleAttendanceMarked}
          />
        )}
        
        {activeTab === 'dashboard' && (
          <AttendanceDashboard 
            classId={classId}
            attendanceData={attendanceData}
          />
        )}
        
        {activeTab === 'excel' && (
          <ExcelManager 
            classId={classId}
          />
        )}
        
        {activeTab === 'register' && (
          <StudentRegistration />
        )}
      </main>

      <footer className="app-footer">
        <p>© 2025 MIT-ADT University - Smart Attendance System</p>
        <p>Developed by: Venkat Tarun, Chanakya Marbate, Soham Kokate, Siddhant Dakhane</p>
      </footer>
    </div>
  );
}

export default App;
