import React, { useRef, useState, useEffect } from 'react';
import { captureAttendance } from '../services/apiService';

const CameraCapture = ({ classId, onAttendanceMarked }) => {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [isCapturing, setIsCapturing] = useState(false);
  const [recognizedStudents, setRecognizedStudents] = useState([]);
  const [cameraStatus, setCameraStatus] = useState('inactive');
  const [excelInfo, setExcelInfo] = useState(null);

  useEffect(() => {
    initializeCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
        videoRef.current.onloadedmetadata = () => {
          setCameraStatus('active');
        };
      }
      
    } catch (error) {
      console.error('Camera initialization error:', error);
      setCameraStatus('error');
      alert('Please allow camera access for attendance marking');
    }
  };

  const captureFrame = async () => {
    if (isCapturing || cameraStatus !== 'active') return;
    
    setIsCapturing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      
      showProcessingFeedback();
      
      const response = await captureAttendance({
        imageData,
        classId,
        captureType: 'camera',
        timestamp: new Date().toISOString()
      });
      
      if (response.success && response.recognizedStudents.length > 0) {
        setRecognizedStudents(prev => [...prev, ...response.recognizedStudents]);
        showCaptureSuccess(response.recognizedStudents);
        
        if (response.excelSheet) {
          setExcelInfo(response.excelSheet);
        }
        
        onAttendanceMarked(response.recognizedStudents);
      } else {
        showNoRecognitionFeedback();
      }
      
    } catch (error) {
      console.error('Capture error:', error);
      showErrorFeedback();
    } finally {
      setIsCapturing(false);
    }
  };

  const showProcessingFeedback = () => {
    const feedback = document.createElement('div');
    feedback.className = 'processing-feedback';
    feedback.innerHTML = `
      <div class="feedback-popup processing">
        <div class="spinner"></div>
        <p>🔍 Processing faces...</p>
      </div>
    `;
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 3000);
  };

  const showCaptureSuccess = (students) => {
    const successDiv = document.createElement('div');
    successDiv.className = 'capture-success';
    successDiv.innerHTML = `
      <div class="success-popup">
        <h3>✅ Attendance Marked Successfully!</h3>
        <p>${students.length} student(s) recognized:</p>
        <ul>
          ${students.map(s => `
            <li>
              <strong>${s.name}</strong> (${s.studentId}) 
              <span class="confidence">${(s.confidence * 100).toFixed(1)}%</span>
            </li>
          `).join('')}
        </ul>
        ${excelInfo ? `<p class="excel-info">📊 Excel sheet updated: ${excelInfo.filename}</p>` : ''}
      </div>
    `;
    document.body.appendChild(successDiv);
    
    setTimeout(() => successDiv.remove(), 5000);
  };

  const showNoRecognitionFeedback = () => {
    const feedback = document.createElement('div');
    feedback.className = 'no-recognition-feedback';
    feedback.innerHTML = `
      <div class="feedback-popup warning">
        <h3>⚠️ No Students Recognized</h3>
        <p>Please ensure students are clearly visible and properly registered</p>
      </div>
    `;
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 3000);
  };

  const showErrorFeedback = () => {
    const feedback = document.createElement('div');
    feedback.className = 'error-feedback';
    feedback.innerHTML = `
      <div class="feedback-popup error">
        <h3>❌ Processing Failed</h3>
        <p>Please try again or check your connection</p>
      </div>
    `;
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 3000);
  };

  return (
    <div className="camera-capture-container">
      <div className="camera-section">
        <div className="camera-header">
          <h2>📸 Camera Attendance Capture</h2>
          <div className={`camera-status ${cameraStatus}`}>
            <span className="status-dot"></span>
            {cameraStatus === 'active' && 'Camera Ready'}
            {cameraStatus === 'initializing' && 'Initializing Camera...'}
            {cameraStatus === 'error' && 'Camera Error'}
          </div>
        </div>
        
        <div className="video-container">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            className="camera-video"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          <div className="video-overlay">
            <div className="face-detection-guide">
              <div className="guide-box"></div>
              <p>Position faces within the guide box</p>
            </div>
          </div>
        </div>
        
        <div className="capture-controls">
          <button 
            onClick={captureFrame}
            disabled={isCapturing || cameraStatus !== 'active'}
            className={`capture-btn ${isCapturing ? 'processing' : ''}`}
          >
            {isCapturing ? (
              <>
                <div className="btn-spinner"></div>
                Processing...
              </>
            ) : (
              <>
                📸 Capture Attendance
              </>
            )}
          </button>
          
          <div className="capture-info">
            <p>Click to capture and automatically mark attendance</p>
          </div>
        </div>
      </div>
      
      <div className="recognition-panel">
        <h3>Today's Recognized Students</h3>
        <div className="recognized-list">
          {recognizedStudents.slice(-10).map((student, index) => (
            <div key={index} className="recognized-item">
              <div className="student-info">
                <span className="student-name">{student.name}</span>
                <span className="student-id">{student.studentId}</span>
              </div>
              <div className="recognition-meta">
                <span className="confidence">{(student.confidence * 100).toFixed(1)}%</span>
                <span className="timestamp">
                  {new Date(student.detectedAt || Date.now()).toLocaleTimeString()}
                </span>
              </div>
              <span className="status-present">✓</span>
            </div>
          ))}
          
          {recognizedStudents.length === 0 && (
            <div className="no-recognition">
              <p>No students recognized yet</p>
              <p>Capture faces to mark attendance</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
