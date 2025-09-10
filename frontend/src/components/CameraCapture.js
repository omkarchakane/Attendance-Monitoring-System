// frontend/src/components/CameraCapture.js
import React, { useRef, useState, useEffect } from 'react';
import { captureAttendance } from '../services/apiService';

const CameraCapture = ({ classId, onAttendanceMarked, socket }) => {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [isCapturing, setIsCapturing] = useState(false);
  const [recognizedStudents, setRecognizedStudents] = useState([]);
  const [excelInfo, setExcelInfo] = useState(null);
  const [cameraStatus, setCameraStatus] = useState('initializing');
  const [detectionMode, setDetectionMode] = useState('single'); // single, continuous
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    initializeCamera();
    if (socket) {
      socket.on('attendanceMarked', handleSocketUpdate);
    }
    
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [socket]);

  const handleSocketUpdate = (data) => {
    setRecognizedStudents(prev => [...prev, ...data.students]);
    if (data.excelUpdated) {
      setExcelInfo({
        updated: true,
        downloadUrl: data.downloadUrl
      });
    }
  };

  const initializeCamera = async () => {
    try {
      setCameraStatus('initializing');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraStatus('ready');
      }
    } catch (error) {
      console.error('Camera initialization error:', error);
      setCameraStatus('error');
      alert('Please allow camera access for attendance marking');
    }
  };

  const captureFrame = async () => {
    if (isCapturing || cameraStatus !== 'ready') return;
    
    setIsCapturing(true);
    
    try {
      // Capture frame from video
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Convert to base64
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      
      // Send to backend for processing
      const response = await captureAttendance({
        imageData,
        classId,
        captureType: 'camera',
        timestamp: new Date().toISOString()
      });
      
      if (response.success) {
        showCaptureSuccess(response.recognizedStudents);
        setRecognizedStudents(prev => [...prev, ...response.recognizedStudents]);
        
        // Update Excel info
        if (response.excelSheet) {
          setExcelInfo(response.excelSheet);
        }
        
        onAttendanceMarked(response.recognizedStudents);
      } else {
        showCaptureError(response.message);
      }
      
    } catch (error) {
      console.error('Capture error:', error);
      showCaptureError('Failed to process attendance');
    } finally {
      setIsCapturing(false);
    }
  };

  const startContinuousDetection = () => {
    if (isDetecting) return;
    
    setIsDetecting(true);
    const interval = setInterval(async () => {
      if (!isDetecting) {
        clearInterval(interval);
        return;
      }
      
      await captureFrame();
    }, 3000); // Capture every 3 seconds
  };

  const stopContinuousDetection = () => {
    setIsDetecting(false);
  };

  const showCaptureSuccess = (students) => {
    const notification = document.createElement('div');
    notification.className = 'capture-notification success';
    notification.innerHTML = `
      <div class="notification-content">
        <h3>✅ Attendance Marked Successfully!</h3>
        <p>${students.length} student(s) recognized:</p>
        <ul>
          ${students.map(s => `<li>${s.name} (${s.studentId}) - ${(s.confidence * 100).toFixed(1)}%</li>`).join('')}
        </ul>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  };

  const showCaptureError = (message) => {
    const notification = document.createElement('div');
    notification.className = 'capture-notification error';
    notification.innerHTML = `
      <div class="notification-content">
        <h3>❌ Recognition Failed</h3>
        <p>${message}</p>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  const getCameraStatusIndicator = () => {
    switch (cameraStatus) {
      case 'initializing':
        return <div className="status-indicator initializing">📹 Initializing Camera...</div>;
      case 'ready':
        return <div className="status-indicator ready">📹 Camera Ready</div>;
      case 'error':
        return <div className="status-indicator error">❌ Camera Error</div>;
      default:
        return null;
    }
  };

  return (
    <div className="camera-capture-container">
      <div className="camera-section">
        <div className="video-container">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            muted
            className="camera-video"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          {getCameraStatusIndicator()}
          
          {isCapturing && (
            <div className="processing-overlay">
              <div className="processing-spinner"></div>
              <p>Processing faces...</p>
            </div>
          )}
        </div>
        
        <div className="capture-controls">
          <div className="detection-mode">
            <label>
              <input 
                type="radio" 
                value="single" 
                checked={detectionMode === 'single'}
                onChange={(e) => setDetectionMode(e.target.value)}
              />
              Single Capture
            </label>
            <label>
              <input 
                type="radio" 
                value="continuous" 
                checked={detectionMode === 'continuous'}
                onChange={(e) => setDetectionMode(e.target.value)}
              />
              Continuous Detection
            </label>
          </div>
          
          {detectionMode === 'single' ? (
            <button 
              onClick={captureFrame}
              disabled={isCapturing || cameraStatus !== 'ready'}
              className="capture-btn primary"
            >
              {isCapturing ? 'Processing...' : '📸 Capture Attendance'}
            </button>
          ) : (
            <div className="continuous-controls">
              {!isDetecting ? (
                <button 
                  onClick={startContinuousDetection}
                  disabled={cameraStatus !== 'ready'}
                  className="capture-btn success"
                >
                  ▶️ Start Auto Detection
                </button>
              ) : (
                <button 
                  onClick={stopContinuousDetection}
                  className="capture-btn danger"
                >
                  ⏹️ Stop Detection
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="recognition-results">
        <div className="excel-status">
          {excelInfo && (
            <div className="excel-notification">
              <h3>📊 Excel Sheet Updated</h3>
              <button 
                onClick={() => window.open(excelInfo.downloadUrl, '_blank')}
                className="download-excel-btn"
              >
                📥 Download Updated Sheet
              </button>
            </div>
          )}
        </div>
        
        <div className="live-recognition">
          <h3>Recently Recognized ({recognizedStudents.length})</h3>
          <div className="recognized-list">
            {recognizedStudents.slice(-10).reverse().map((student, index) => (
              <div key={index} className="recognized-item">
                <div className="student-info">
                  <span className="student-name">{student.name}</span>
                  <span className="student-id">{student.studentId}</span>
                </div>
                <div className="recognition-data">
                  <span className="confidence">{(student.confidence * 100).toFixed(1)}%</span>
                  <span className="timestamp">
                    {new Date(student.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
                <span className="status-present">✓ Present</span>
              </div>
            ))}
            
            {recognizedStudents.length === 0 && (
              <div className="no-recognition">
                <p>No students recognized yet</p>
                <p>Click "Capture Attendance" to start</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
