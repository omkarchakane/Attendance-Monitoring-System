import React, { useState, useCallback } from 'react';
import { uploadPhotosForAttendance } from '../services/apiService';

const PhotoUpload = ({ classId, onAttendanceMarked }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedResults, setProcessedResults] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    setSelectedFiles(imageFiles);
  }, []);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const processUploadedPhotos = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select at least one photo');
      return;
    }

    setIsProcessing(true);
    
    try {
      const imageDataArray = await Promise.all(
        selectedFiles.map(file => convertFileToBase64(file))
      );

      const response = await uploadPhotosForAttendance({
        images: imageDataArray,
        classId,
        uploadType: 'batch',
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        setProcessedResults(response.results);
        showUploadResults(response.results);
        onAttendanceMarked(response.results.recognizedStudents);
      } else {
        alert('Failed to process photos: ' + response.message);
      }

    } catch (error) {
      console.error('Upload processing error:', error);
      alert('Failed to process uploaded photos');
    } finally {
      setIsProcessing(false);
    }
  };

  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const showUploadResults = (results) => {
    const modal = document.createElement('div');
    modal.className = 'results-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>📊 Upload Processing Results</h3>
          <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="results-summary">
          <div class="summary-cards">
            <div class="summary-card">
              <div class="card-number">${results.totalPhotosProcessed}</div>
              <div class="card-label">Photos Processed</div>
            </div>
            <div class="summary-card">
              <div class="card-number">${results.totalFacesDetected}</div>
              <div class="card-label">Faces Detected</div>
            </div>
            <div class="summary-card success">
              <div class="card-number">${results.recognizedStudents.length}</div>
              <div class="card-label">Students Recognized</div>
            </div>
            <div class="summary-card">
              <div class="card-number">${results.markedAttendance.length}</div>
              <div class="card-label">Attendance Marked</div>
            </div>
          </div>
        </div>
        <div class="recognized-students">
          <h4>Recognized Students:</h4>
          <div class="students-grid">
            ${results.recognizedStudents.map(student => `
              <div class="student-card">
                <div class="student-name">${student.name}</div>
                <div class="student-id">${student.studentId}</div>
                <div class="confidence">${(student.confidence * 100).toFixed(1)}% confidence</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    setTimeout(() => {
      if (modal.parentElement) {
        modal.remove();
      }
    }, 10000);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="photo-upload-container">
      <div className="upload-header">
        <h2>📁 Photo Upload Attendance</h2>
        <p>Upload individual photos or group photos for batch attendance marking</p>
      </div>

      <div 
        className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="file-input"
          id="photo-upload"
        />
        <label htmlFor="photo-upload" className="upload-label">
          <div className="upload-content">
            <div className="upload-icon">📁</div>
            <h3>Drag & Drop Photos Here</h3>
            <p>or click to select files</p>
            <div className="upload-hints">
              <span>✓ Supports JPG, PNG, GIF</span>
              <span>✓ Multiple photos allowed</span>
              <span>✓ Group photos supported</span>
              <span>✓ Maximum 20 files at once</span>
            </div>
          </div>
        </label>
      </div>

      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <div className="files-header">
            <h3>Selected Photos ({selectedFiles.length})</h3>
            <button
              onClick={() => setSelectedFiles([])}
              className="clear-all-btn"
            >
              Clear All
            </button>
          </div>
          
          <div className="file-preview-grid">
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-preview">
                <img 
                  src={URL.createObjectURL(file)} 
                  alt={`Preview ${index + 1}`}
                  className="preview-image"
                />
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  <button 
                    onClick={() => removeFile(index)}
                    className="remove-btn"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={processUploadedPhotos}
            disabled={isProcessing}
            className="process-btn"
          >
            {isProcessing ? (
              <>
                <div className="btn-spinner"></div>
                Processing Photos...
              </>
            ) : (
              '🔍 Process Attendance'
            )}
          </button>
        </div>
      )}

      {processedResults && (
        <div className="processing-results">
          <h3>Processing Results Summary</h3>
          <div className="results-summary-compact">
            <div className="result-item">
              <span className="result-label">Photos Processed:</span>
              <span className="result-value">{processedResults.totalPhotosProcessed}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Faces Detected:</span>
              <span className="result-value">{processedResults.totalFacesDetected}</span>
            </div>
            <div className="result-item success">
              <span className="result-label">Students Recognized:</span>
              <span className="result-value">{processedResults.recognizedStudents.length}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Attendance Marked:</span>
              <span className="result-value">{processedResults.markedAttendance.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoUpload;
