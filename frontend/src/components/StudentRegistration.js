import React, { useState, useRef } from 'react';
import { registerStudent } from '../services/apiService';

const StudentRegistration = () => {
  const [studentData, setStudentData] = useState({
    studentId: '',
    name: '',
    email: '',
    department: 'Computer Science & Engineering',
    class: 'LY14-CC2',
    semester: 1
  });
  const [capturedImages, setCapturedImages] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef();
  const canvasRef = useRef();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (error) {
      console.error('Camera access error:', error);
      alert('Please allow camera access for student registration');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  const captureImage = async () => {
    if (!cameraActive || capturedImages.length >= 5) return;
    
    setIsCapturing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      
      setCapturedImages(prev => [...prev, {
        id: Date.now(),
        data: imageData,
        timestamp: new Date().toLocaleString()
      }]);
      
      // Show success feedback
      const feedback = document.createElement('div');
      feedback.className = 'capture-feedback';
      feedback.innerHTML = `<div class="feedback-popup">📸 Image ${capturedImages.length + 1}/5 captured!</div>`;
      document.body.appendChild(feedback);
      setTimeout(() => feedback.remove(), 2000);
      
    } catch (error) {
      console.error('Image capture error:', error);
      alert('Failed to capture image');
    } finally {
      setIsCapturing(false);
    }
  };

  const removeImage = (imageId) => {
    setCapturedImages(prev => prev.filter(img => img.id !== imageId));
  };

  const registerStudentWithFaces = async () => {
    if (!studentData.studentId || !studentData.name) {
      alert('Please fill in Student ID and Name');
      return;
    }

    if (capturedImages.length < 3) {
      alert('Please capture at least 3 face images for better recognition');
      return;
    }

    setIsRegistering(true);

    try {
      const faceImages = capturedImages.map(img => img.data);
      
      const response = await registerStudent({
        ...studentData,
        faceImages
      });

      if (response.success) {
        alert(`Student ${studentData.name} registered successfully!`);
        
        // Reset form
        setStudentData({
          studentId: '',
          name: '',
          email: '',
          department: 'Computer Science & Engineering',
          class: 'LY14-CC2',
          semester: 1
        });
        setCapturedImages([]);
        stopCamera();
      } else {
        alert('Registration failed: ' + response.message);
      }

    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed: ' + error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="student-registration">
      <div className="registration-header">
        <h2>➕ Student Registration</h2>
        <p>Register students with face recognition for automatic attendance</p>
      </div>

      <div className="registration-content">
        <div className="form-section">
          <h3>Student Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Student ID *</label>
              <input
                type="text"
                placeholder="e.g., MIT2025001"
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
                <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                <option value="Information Technology">Information Technology</option>
                <option value="Electronics Engineering">Electronics Engineering</option>
              </select>
            </div>

            <div className="form-group">
              <label>Class</label>
              <select
                value={studentData.class}
                onChange={(e) => setStudentData({...studentData, class: e.target.value})}
              >
                <option value="LY14-CC2">LY14-CC2</option>
                <option value="LY14-CC1">LY14-CC1</option>
                <option value="SY15-CS1">SY15-CS1</option>
                <option value="TY16-CS1">TY16-CS1</option>
              </select>
            </div>

            <div className="form-group">
              <label>Semester</label>
              <select
                value={studentData.semester}
                onChange={(e) => setStudentData({...studentData, semester: parseInt(e.target.value)})}
              >
                {[1,2,3,4,5,6,7,8].map(sem => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="face-capture-section">
          <h3>Face Recognition Setup</h3>
          <p>Capture 3-5 clear face images from different angles for better recognition accuracy</p>

          <div className="camera-container">
            {!cameraActive ? (
              <div className="camera-placeholder">
                <div className="camera-icon">📷</div>
                <p>Camera not active</p>
                <button onClick={startCamera} className="start-camera-btn">
                  Start Camera
                </button>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  className="camera-video"
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                
                <div className="camera-controls">
                  <button
                    onClick={captureImage}
                    disabled={isCapturing || capturedImages.length >= 5}
                    className="capture-image-btn"
                  >
                    {isCapturing ? 'Capturing...' : `📸 Capture (${capturedImages.length}/5)`}
                  </button>
                  
                  <button onClick={stopCamera} className="stop-camera-btn">
                    Stop Camera
                  </button>
                </div>
              </>
            )}
          </div>

          {capturedImages.length > 0 && (
            <div className="captured-images">
              <h4>Captured Images ({capturedImages.length})</h4>
              <div className="images-grid">
                {capturedImages.map((image) => (
                  <div key={image.id} className="captured-image">
                    <img src={image.data} alt="Captured face" />
                    <div className="image-controls">
                      <span className="capture-time">{image.timestamp}</span>
                      <button 
                        onClick={() => removeImage(image.id)}
                        className="remove-image-btn"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="registration-actions">
          <div className="requirements">
            <h4>Requirements:</h4>
            <ul>
              <li>✓ Student ID and Name are required</li>
              <li>✓ At least 3 face images needed</li>
              <li>✓ Clear, well-lit face images work best</li>
              <li>✓ Look directly at camera for each capture</li>
            </ul>
          </div>

          <button
            onClick={registerStudentWithFaces}
            disabled={isRegistering || !studentData.studentId || !studentData.name || capturedImages.length < 3}
            className="register-btn"
          >
            {isRegistering ? (
              <>
                <div className="btn-spinner"></div>
                Registering Student...
              </>
            ) : (
              'Register Student'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentRegistration;
