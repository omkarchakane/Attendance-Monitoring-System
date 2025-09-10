const axios = require('axios');
const fs = require('fs');
const path = require('path');

class FaceRecognitionService {
  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    this.timeout = 30000; // 30 seconds timeout
    this.retryAttempts = 3;
  }

  // Check if ML service is running
  async checkMLServiceHealth() {
    try {
      const response = await axios.get(`${this.mlServiceUrl}/health`, {
        timeout: 5000
      });
      return response.data.status === 'OK';
    } catch (error) {
      console.error('ML service health check failed:', error.message);
      return false;
    }
  }

  // Process single image for face recognition
  async processImageForAttendance(imageData, confidenceThreshold = 0.6) {
    try {
      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        throw new Error('Face recognition service is unavailable');
      }

      const response = await axios.post(`${this.mlServiceUrl}/process_single_image`, {
        imageData: imageData,
        confidence_threshold: confidenceThreshold
      }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.data.success,
        recognizedStudents: response.data.recognized_students || [],
        facesDetected: response.data.faces_detected || 0,
        unregisteredFaces: response.data.unregistered_faces || 0,
        processingTime: response.data.processing_time || 0
      };

    } catch (error) {
      console.error('Face recognition error:', error);
      
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Face recognition service is not running',
          recognizedStudents: [],
          facesDetected: 0,
          unregisteredFaces: 0
        };
      }

      if (error.code === 'ETIMEDOUT') {
        return {
          success: false,
          error: 'Face recognition service timeout',
          recognizedStudents: [],
          facesDetected: 0,
          unregisteredFaces: 0
        };
      }

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Face recognition failed',
        recognizedStudents: [],
        facesDetected: 0,
        unregisteredFaces: 0
      };
    }
  }

  // Process multiple images for batch recognition
  async processBatchImages(uploadedFiles) {
    try {
      if (!uploadedFiles || uploadedFiles.length === 0) {
        return [];
      }

      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        throw new Error('Face recognition service is unavailable');
      }

      // Convert files to base64
      const imageDataArray = [];
      for (const file of uploadedFiles) {
        try {
          const imageBuffer = fs.readFileSync(file.path);
          const imageBase64 = `data:${file.mimetype};base64,${imageBuffer.toString('base64')}`;
          imageDataArray.push(imageBase64);
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
        }
      }

      if (imageDataArray.length === 0) {
        return [];
      }

      // Send batch request to ML service
      const response = await axios.post(`${this.mlServiceUrl}/process_batch_images`, {
        images: imageDataArray,
        confidence_threshold: 0.6
      }, {
        timeout: this.timeout * 2, // Double timeout for batch processing
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data.batch_results || [];

    } catch (error) {
      console.error('Batch face recognition error:', error);
      
      // Return empty results for each file on error
      return uploadedFiles.map((file, index) => ({
        success: false,
        error: error.message,
        recognizedStudents: [],
        facesDetected: 0,
        imageIndex: index
      }));
    }
  }

  // Register new student with face encodings
  async registerStudent({ studentId, name, faceImages }) {
    try {
      if (!faceImages || faceImages.length === 0) {
        return {
          success: false,
          message: 'No face images provided'
        };
      }

      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        throw new Error('Face recognition service is unavailable');
      }

      const response = await axios.post(`${this.mlServiceUrl}/register_student`, {
        student_id: studentId,
        name: name,
        face_images: faceImages
      }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.data.success,
        message: response.data.message,
        encodings: response.data.encodings || []
      };

    } catch (error) {
      console.error('Student registration error:', error);
      
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Face registration failed',
        encodings: []
      };
    }
  }

  // Update existing student's face encodings
  async updateStudentFaces({ studentId, name, faceImages }) {
    try {
      // Delete existing student first
      await this.deleteStudent(studentId);
      
      // Register with new images
      return await this.registerStudent({ studentId, name, faceImages });

    } catch (error) {
      console.error('Update student faces error:', error);
      
      return {
        success: false,
        message: error.message || 'Failed to update face encodings'
      };
    }
  }

  // Delete student from face recognition system
  async deleteStudent(studentId) {
    try {
      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        throw new Error('Face recognition service is unavailable');
      }

      const response = await axios.post(`${this.mlServiceUrl}/delete_student`, {
        student_id: studentId
      }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.data.success,
        message: response.data.message
      };

    } catch (error) {
      console.error('Delete student error:', error);
      
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to delete student'
      };
    }
  }

  // Get list of registered students from ML service
  async getRegisteredStudents() {
    try {
      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        throw new Error('Face recognition service is unavailable');
      }

      const response = await axios.get(`${this.mlServiceUrl}/get_registered_students`, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.data.success,
        students: response.data.students || [],
        totalCount: response.data.total_count || 0
      };

    } catch (error) {
      console.error('Get registered students error:', error);
      
      return {
        success: false,
        students: [],
        totalCount: 0,
        error: error.response?.data?.error || error.message || 'Failed to get registered students'
      };
    }
  }

  // Retrain face recognition model (if supported)
  async retrainModel() {
    try {
      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        throw new Error('Face recognition service is unavailable');
      }

      const response = await axios.post(`${this.mlServiceUrl}/retrain_model`, {}, {
        timeout: this.timeout * 3, // Extended timeout for training
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.data.success,
        message: response.data.message,
        modelVersion: response.data.model_version
      };

    } catch (error) {
      console.error('Model retrain error:', error);
      
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to retrain model'
      };
    }
  }

  // Get face recognition system statistics
  async getSystemStats() {
    try {
      // Check if ML service is available
      const isHealthy = await this.checkMLServiceHealth();
      if (!isHealthy) {
        return {
          success: false,
          stats: {},
          error: 'Face recognition service is unavailable'
        };
      }

      const response = await axios.get(`${this.mlServiceUrl}/system_stats`, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        stats: response.data.stats || {}
      };

    } catch (error) {
      console.error('Get system stats error:', error);
      
      return {
        success: false,
        stats: {},
        error: error.response?.data?.error || error.message || 'Failed to get system stats'
      };
    }
  }

  // Process image with retry mechanism
  async processImageWithRetry(imageData, confidenceThreshold = 0.6) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.processImageForAttendance(imageData, confidenceThreshold);
        
        if (result.success) {
          return result;
        }
        
        lastError = result.error;
        
        // Wait before retry (exponential backoff)
        if (attempt < this.retryAttempts) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
        
      } catch (error) {
        lastError = error.message;
        
        if (attempt < this.retryAttempts) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }
    
    return {
      success: false,
      error: `Failed after ${this.retryAttempts} attempts: ${lastError}`,
      recognizedStudents: [],
      facesDetected: 0,
      unregisteredFaces: 0
    };
  }

  // Helper method for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Test ML service connection
  async testConnection() {
    try {
      const startTime = Date.now();
      const response = await axios.get(`${this.mlServiceUrl}/health`, {
        timeout: 5000
      });
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        status: response.data.status,
        responseTime: `${responseTime}ms`,
        version: response.data.version,
        serviceUrl: this.mlServiceUrl
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        serviceUrl: this.mlServiceUrl
      };
    }
  }
}

module.exports = new FaceRecognitionService();
