// frontend/src/components/StudentRegistration.js
import React, { useState, useRef, useEffect } from 'react';
import { registerStudent } from '../services/apiService';

const StudentRegistration = ({ classId }) => {
  const [studentData, setStudentData] = useState({
    studentId: '',
    name: '',
    email: '',
    department: 'Computer Science & Engineering',
    class: classId,
    phone: '',
    address: ''
  });
  
  const [capturedImages, setCapturedImages] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStep, setCaptureStep] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  
  const videoRef = useRef();
  const canvasRef = useRef();
  
  const captureInstructions = [
    "Look straight at the camera",
    "Turn your head slightly to the left",
    "Turn your head slightly to the right", 
    "Look down slightly",
    "Look up slightly"
  ];

  useEffect(() => {
    if (isCapturing && !cameraInitialized) {
      initializeCamera();
    }
  }, [isCapturing, cameraInitialized]);

  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraInitialized(true);
      }
    } catch (error) {
      console.error('Camera initialization error:', error);
      alert('Please allow camera access for student registration');
      setIsCapturing(false);
    }
  };

  const startCapture = () => {
    setIsCapturing(true);
    setCaptureStep(0);
    setCapturedImages([]);
  };

  const capturePhoto = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    ctx.drawImage(videoRef.current, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    
    setCapturedImages(prev => [...prev, imageData]);
    
    if (captureStep < captureInstructions.length - 1) {
      setTimeout(() => {
        setCaptureStep(prev => prev + 1);
      }, 1000);
    } else {
      // All photos captured
      setTimeout(() => {
        stopCapture();
      }, 1000);
    }
  };

  const stopCapture = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setIsCapturing(false);
    setCameraInitialized(false);
  };

  const registerStudentWithFaces = async () => {
    if (!studentData.studentId || !studentData.name) {
      alert('Please fill in Student ID and Name');
      return;
    }
    
    if (capturedImages.length < 3) {
      alert('Please capture at least 3 face images');
      return;
    }

    setIsRegistering(true);
    
    try {
      const response = await registerStudent({
        ...studentData,
        faceImages: capturedImages
      });
      
      if (response.success) {
        alert('Student registered successfully!');
        // Reset form
        setStudentData({
          studentId: '',
          name: '',
          email: '',
          department: 'Computer Science & Engineering',
          class: classId,
          phone: '',
          address: ''
        });
        setCapturedImages([]);
        setCaptureStep(0);
      } else {
        alert('Registration failed: ' + response.message);
      }
    } catch (error) {
      alert('Registration error: ' + error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const retakePhotos = () => {
    setCapturedImages([]);
    setCaptureStep(0);
    startCapture();
  };

  return (
    <div className="student-registration-container">
      <div className="registration-header">
        <h2>➕ Student Registration</h2>
        <p>Register new student with face recognition capability</p>
      </div>

      <div className="registration-content">
        <div className="student-form">
          <h3>📝 Student Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Student ID *</label>
              <input
                type="text"
                placeholder="e.g., 2025001"
                value={studentData.studentId}
                onChange={(e) => setStudentData({...studentData, studentId: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                placeholder="Enter full name"
                value={studentData.name}
                onChange={(e) => setStudentData({...studentData, name: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="student@example.com"
                value={studentData.email}
                onChange={(e) => setStudentData({...studentData, email: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label>Department</label>
              <select
                value={studentData.department}
                onChange={(e) => setStudentData({...studentData, department: e.target.value})}
              >
                <option>Computer Science & Engineering</option>
                <option>Information Technology</option>
                <option>Electronics & Communication</option>
                <option>Mechanical Engineering</option>
                <option>Civil Engineering</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Class</label>
              <select
                value={studentData.class}
                onChange={(e) => setStudentData({...studentData, class: e.target.value})}
              >
                <option value="LY14-CC1">LY14-CC1</option>
                <option value="LY14-CC2">LY14-CC2</option>
                <option value="SY15-CS1">SY15-CS1</option>
                <option value="TY16-IT1">TY16-IT1</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                placeholder="+91 9876543210"
                value={studentData.phone}
                onChange={(e) => setStudentData({...studentData, phone: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="face-capture">
          <h3>📷 Face Capture</h3>
          
          {!isCapturing && capturedImages.length === 0 && (
            <div className="capture-instructions">
              <div className="instruction-list">
                <p><strong>📋 Capture Instructions:</strong></p>
                <ul>
                  {captureInstructions.map((instruction, index) => (
                    <li key={index}>{index + 1}. {instruction}</li>
                  ))}
                </ul>
              </div>
              <button 
                onClick={startCapture}
                className="start-capture-btn"
              >
                📸 Start Face Capture
              </button>
            </div>
          )}
          
          {isCapturing && (
            <div className="capture-session">
              <div className="video-section">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  muted
                  className="capture-video"
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                
                <div className="capture-overlay">
                  <div className="face-guide-circle"></div>
                  <div className="instruction-text">
                    <h4>Step {captureStep + 1} of {captureInstructions.length}</h4>
                    <p>{captureInstructions[captureStep]}</p>
                  </div>
                </div>
              </div>
              
              <div className="capture-controls">
                <button 
                  onClick={capturePhoto}
                  className="capture-photo-btn"
                >
                  📸 Capture ({capturedImages.length + 1}/{captureInstructions.length})
                </button>
                <button 
                  onClick={stopCapture}
                  className="stop-capture-btn"
                >
                  ❌ Stop
                </button>
              </div>
            </div>
          )}
          
          {capturedImages.length > 0 && !isCapturing && (
            <div className="captured-images">
              <h4>Captured Images ({capturedImages.length})</h4>
              <div className="images-grid">
                {capturedImages.map((image, index) => (
                  <div key={index} className="captured-image">
                    <img src={image} alt={`Capture ${index + 1}`} />
                    <span className="image-label">
                      {captureInstructions[index]}
                    </span>
                  </div>
                ))}
              </div>
              
              <div className="captured-actions">
                <button 
                  onClick={retakePhotos}
                  className="retake-btn"
                >
                  🔄 Retake Photos
                </button>
                {capturedImages.length >= 3 && (
                  <button 
                    onClick={registerStudentWithFaces}
                    disabled={isRegistering}
                    className="register-student-btn"
                  >
                    {isRegistering ? '⏳ Registering...' : '✅ Register Student'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentRegistration;
