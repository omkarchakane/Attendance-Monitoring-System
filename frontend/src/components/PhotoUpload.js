// frontend/src/components/PhotoUpload.js
import React, { useState, useCallback, useRef } from 'react';
import { uploadPhotosForAttendance } from '../services/apiService';

const PhotoUpload = ({ classId, onAttendanceMarked, socket }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedResults, setProcessedResults] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef();

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
    
    if (imageFiles.length !== files.length) {
      alert(`${files.length - imageFiles.length} non-image files were filtered out`);
    }
    
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
    setUploadProgress(0);
    
    try {
      // Create FormData for file upload
      const formData = new FormData();
      selectedFiles.forEach((file, index) => {
        formData.append('photos', file);
      });
      formData.append('classId', classId);
      formData.append('timestamp', new Date().toISOString());

      // Upload with progress tracking
      const response = await fetch('/api/attendance/upload', {
        method: 'POST',
        body: formData,
        onUploadProgress: (progressEvent) => {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          setUploadProgress(progress);
        }
      });

      const result = await response.json();

      if (result.success) {
        setProcessedResults(result.results);
        showUploadResults(result.results);
        onAttendanceMarked(result.results.recognizedStudents);
        
        // Clear files after successful upload
        setTimeout(() => {
          setSelectedFiles([]);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }, 2000);
      } else {
        alert('Failed to process photos: ' + result.message);
      }

    } catch (error) {
      console.error('Upload processing error:', error);
      alert('Failed to process uploaded photos: ' + error.message);
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const showUploadResults = (results) => {
    const notification = document.createElement('div');
    notification.className = 'upload-results-notification';
    notification.innerHTML = `
      <div class="results-summary">
        <h3>📊 Upload Processing Complete</h3>
        <div class="results-grid">
          <div class="result-item">
            <span class="result-number">${results.totalPhotosProcessed}</span>
            <span class="result-label">Photos Processed</span>
          </div>
          <div class="result-item">
            <span class="result-number">${results.totalFacesDetected}</span>
            <span class="result-label">Faces Detected</span>
          </div>
          <div class="result-item">
            <span class="result-number">${results.recognizedStudents.length}</span>
            <span class="result-label">Students Recognized</span>
          </div>
          <div class="result-item">
            <span class="result-number">${results.markedAttendance.length}</span>
            <span class="result-label">Attendance Marked</span>
          </div>
        </div>
        ${results.excelSheet ? `
          <div class="excel-update">
            <p>✅ Excel sheet updated automatically</p>
            <button onclick="window.open('${results.excelSheet.downloadUrl}', '_blank')" class="download-btn">
              📥 Download Updated Sheet
            </button>
          </div>
        ` : ''}
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 8000);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileSizeString = (bytes) => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="photo-upload-container">
      <div className="upload-header">
        <h2>📁 Photo Upload Attendance</h2>
        <p>Upload single photos or group photos to mark attendance automatically</p>
      </div>

      <div 
        className={`upload-zone ${dragActive ? 'drag-active' : ''} ${isProcessing ? 'processing' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="file-input"
          id="photo-upload"
          disabled={isProcessing}
        />
        <label htmlFor="photo-upload" className="upload-label">
          <div className="upload-content">
            <div className="upload-icon">
              {isProcessing ? '⏳' : '📁'}
            </div>
            <h3>
              {isProcessing ? 'Processing...' : 'Drag & Drop Photos Here'}
            </h3>
            <p>or click to select files</p>
            <div className="upload-hints">
              <span>✅ Supports: JPG, PNG, WEBP</span>
              <span>✅ Multiple photos at once</span>
              <span>✅ Group photos with multiple students</span>
              <span>✅ Max size: 10MB per photo</span>
            </div>
            
            {isProcessing && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <span>{uploadProgress.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </label>
      </div>

      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <div className="files-header">
            <h3>Selected Photos ({selectedFiles.length})</h3>
            <div className="files-actions">
              <button onClick={clearAllFiles} className="clear-all-btn">
                🗑️ Clear All
              </button>
              <button
                onClick={processUploadedPhotos}
                disabled={isProcessing}
                className="process-btn"
              >
                {isProcessing ? '⏳ Processing...' : '🔍 Process Attendance'}
              </button>
            </div>
          </div>
          
          <div className="file-preview-grid">
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-preview">
                <div className="image-container">
                  <img 
                    src={URL.createObjectURL(file)} 
                    alt={`Preview ${index + 1}`}
                    className="preview-image"
                    onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                  />
                  <button 
                    onClick={() => removeFile(index)}
                    className="remove-btn"
                    disabled={isProcessing}
                  >
                    ×
                  </button>
                </div>
                <div className="file-info">
                  <span className="file-name" title={file.name}>
                    {file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name}
                  </span>
                  <span className="file-size">{getFileSizeString(file.size)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {processedResults && (
        <div className="processing-results">
          <h3>📊 Processing Results</h3>
          <div className="results-summary">
            <div className="summary-cards">
              <div className="result-card">
                <span className="result-number">{processedResults.totalPhotosProcessed}</span>
                <span className="result-label">Photos Processed</span>
              </div>
              <div className="result-card">
                <span className="result-number">{processedResults.totalFacesDetected}</span>
                <span className="result-label">Faces Detected</span>
              </div>
              <div className="result-card success">
                <span className="result-number">{processedResults.recognizedStudents.length}</span>
                <span className="result-label">Students Recognized</span>
              </div>
              <div className="result-card primary">
                <span className="result-number">{processedResults.markedAttendance.length}</span>
                <span className="result-label">Attendance Marked</span>
              </div>
            </div>
          </div>
          
          {processedResults.recognizedStudents.length > 0 && (
            <div className="recognized-students-list">
              <h4>✅ Recognized Students:</h4>
              <div className="students-grid">
                {processedResults.recognizedStudents.map((student, index) => (
                  <div key={index} className="student-result-card">
                    <div className="student-info">
                      <span className="student-name">{student.name}</span>
                      <span className="student-id">{student.studentId}</span>
                    </div>
                    <div className="recognition-info">
                      <span className="confidence">{(student.confidence * 100).toFixed(1)}%</span>
                      <span className="status-present">✓ Present</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {processedResults.alreadyPresent?.length > 0 && (
            <div className="already-present-list">
              <h4>ℹ️ Already Marked Present:</h4>
              <div className="already-present-items">
                {processedResults.alreadyPresent.map((student, index) => (
                  <span key={index} className="already-present-item">
                    {student.name} ({student.studentId})
                  </span>
                ))}
              </div>
            </div>
          )}

          {processedResults.excelSheet && (
            <div className="excel-update-info">
              <h4>📊 Excel Sheet Updated</h4>
              <p>Attendance has been automatically recorded in the Excel sheet</p>
              <button 
                onClick={() => window.open(processedResults.excelSheet.downloadUrl, '_blank')}
                className="download-excel-btn"
              >
                📥 Download Updated Sheet
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PhotoUpload;
