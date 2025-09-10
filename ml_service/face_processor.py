import cv2
import numpy as np
import tensorflow as tf
from mtcnn import MTCNN
import pickle
import os
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
import logging
from sklearn.metrics.pairwise import cosine_similarity
from deepface import DeepFace

from utils import (
    ImageUtils, FileUtils, ValidationUtils, MathUtils, 
    LoggingUtils, DEFAULT_CONFIDENCE_THRESHOLD
)

# Set up logging
logger = LoggingUtils.setup_logger(__name__, 'logs/face_processor.log')

class FaceProcessor:
    """
    Advanced face processing class for detection, recognition, and registration
    """
    
    def __init__(self):
        """Initialize the face processor with required models and data"""
        self.detector = MTCNN(min_face_size=40, scale_factor=0.709)
        self.known_face_encodings = []
        self.known_face_names = []
        self.known_student_ids = []
        self.model_name = 'Facenet512'  # Using Facenet512 for better accuracy
        
        # File paths
        self.data_dir = 'data'
        self.encodings_file = os.path.join(self.data_dir, 'face_encodings.pkl')
        self.metadata_file = os.path.join(self.data_dir, 'student_metadata.json')
        
        # Ensure data directory exists
        FileUtils.ensure_directory_exists(self.data_dir)
        
        # Load existing data
        self.load_student_database()
        
        logger.info(f"FaceProcessor initialized with {len(self.known_face_encodings)} registered students")
    
    def load_student_database(self) -> bool:
        """
        Load registered students' face encodings and metadata
        
        Returns:
            True if loaded successfully
        """
        try:
            # Load face encodings
            if os.path.exists(self.encodings_file):
                with open(self.encodings_file, 'rb') as f:
                    data = pickle.load(f)
                    self.known_face_encodings = data.get('encodings', [])
                    self.known_face_names = data.get('names', [])
                    self.known_student_ids = data.get('student_ids', [])
                
                logger.info(f"Loaded {len(self.known_face_encodings)} face encodings")
            
            return True
            
        except Exception as e:
            logger.error(f"Error loading student database: {str(e)}")
            return False
    
    def save_student_database(self) -> bool:
        """
        Save face encodings and metadata to files
        
        Returns:
            True if saved successfully
        """
        try:
            # Save face encodings
            encodings_data = {
                'encodings': self.known_face_encodings,
                'names': self.known_face_names,
                'student_ids': self.known_student_ids,
                'saved_at': datetime.now().isoformat(),
                'model_name': self.model_name,
                'total_students': len(self.known_face_encodings)
            }
            
            with open(self.encodings_file, 'wb') as f:
                pickle.dump(encodings_data, f)
            
            # Save metadata
            metadata = {
                'total_students': len(self.known_face_encodings),
                'last_updated': datetime.now().isoformat(),
                'model_version': self.model_name,
                'students': [
                    {
                        'student_id': sid,
                        'name': name,
                        'registered_at': datetime.now().isoformat()
                    }
                    for sid, name in zip(self.known_student_ids, self.known_face_names)
                ]
            }
            
            FileUtils.save_json(metadata, self.metadata_file)
            
            logger.info(f"Saved database with {len(self.known_face_encodings)} students")
            return True
            
        except Exception as e:
            logger.error(f"Error saving student database: {str(e)}")
            return False
    
    @LoggingUtils.log_performance
    def detect_faces(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detect faces in an image using MTCNN
        
        Args:
            image: Input image
            
        Returns:
            List of detected faces with metadata
        """
        try:
            # Enhance image quality
            enhanced_image = ImageUtils.enhance_image_quality(image)
            
            # Convert BGR to RGB for MTCNN
            rgb_image = cv2.cvtColor(enhanced_image, cv2.COLOR_BGR2RGB)
            
            # Detect faces
            detections = self.detector.detect_faces(rgb_image)
            
            faces = []
            for detection in detections:
                confidence = detection['confidence']
                
                # Filter by confidence threshold
                if confidence > 0.95:
                    x, y, w, h = detection['box']
                    
                    # Ensure coordinates are within image bounds
                    height, width = rgb_image.shape[:2]
                    x = max(0, x)
                    y = max(0, y)
                    w = min(w, width - x)
                    h = min(h, height - y)
                    
                    # Check minimum face size
                    if w > 60 and h > 60:
                        face_img = rgb_image[y:y+h, x:x+w]
                        
                        # Calculate face quality score
                        quality_score = self._calculate_face_quality(face_img)
                        
                        faces.append({
                            'face': face_img,
                            'box': (x, y, w, h),
                            'confidence': confidence,
                            'quality': quality_score,
                            'landmarks': detection.get('keypoints', {}),
                            'size': (w, h)
                        })
            
            # Sort faces by confidence and quality
            faces.sort(key=lambda x: x['confidence'] * x['quality'], reverse=True)
            
            logger.info(f"Detected {len(faces)} faces in image")
            return faces
            
        except Exception as e:
            logger.error(f"Error detecting faces: {str(e)}")
            return []
    
    def _calculate_face_quality(self, face_img: np.ndarray) -> float:
        """
        Calculate face quality score based on various factors
        
        Args:
            face_img: Face image
            
        Returns:
            Quality score (0-1)
        """
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(face_img, cv2.COLOR_RGB2GRAY)
            
            # Calculate sharpness using Laplacian variance
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            sharpness_score = min(laplacian_var / 1000, 1.0)
            
            # Calculate brightness
            brightness = np.mean(gray) / 255.0
            brightness_score = 1.0 - abs(brightness - 0.5) * 2
            
            # Calculate contrast
            contrast_score = gray.std() / 128.0
            contrast_score = min(contrast_score, 1.0)
            
            # Size score (prefer faces that are not too small or too large)
            height, width = face_img.shape[:2]
            size_score = 1.0
            if width < 100 or height < 100:
                size_score = min(width, height) / 100.0
            elif width > 300 or height > 300:
                size_score = 300.0 / max(width, height)
            
            # Combined quality score
            quality = (sharpness_score * 0.4 + brightness_score * 0.3 + 
                      contrast_score * 0.2 + size_score * 0.1)
            
            return min(quality, 1.0)
            
        except Exception as e:
            logger.error(f"Error calculating face quality: {str(e)}")
            return 0.5  # Default quality score
    
    @LoggingUtils.log_performance
    def get_face_embedding(self, face_img: np.ndarray) -> Optional[np.ndarray]:
        """
        Generate face embedding using DeepFace
        
        Args:
            face_img: Face image (RGB format)
            
        Returns:
            Face embedding vector or None if failed
        """
        try:
            # Ensure face image is in correct format
            if face_img.shape[2] == 3:  # RGB
                face_img = cv2.cvtColor(face_img, cv2.COLOR_RGB2BGR)
            
            # Resize face to standard size
            face_img = cv2.resize(face_img, (160, 160))
            
            # Get embedding using DeepFace
            embedding = DeepFace.represent(
                img_path=face_img,
                model_name=self.model_name,
                enforce_detection=False,
                detector_backend='skip'  # Skip detection since we already have the face
            )
            
            if embedding and len(embedding) > 0:
                return np.array(embedding[0]['embedding'])
            
            return None
            
        except Exception as e:
            logger.error(f"Error generating face embedding: {str(e)}")
            return None
    
    @LoggingUtils.log_performance
    def recognize_face(self, face_embedding: np.ndarray, threshold: float = DEFAULT_CONFIDENCE_THRESHOLD) -> Tuple[Optional[Dict[str, Any]], float]:
        """
        Recognize face by comparing with known encodings
        
        Args:
            face_embedding: Face embedding to match
            threshold: Similarity threshold
            
        Returns:
            Tuple of (student_info, distance) or (None, distance)
        """
        if len(self.known_face_encodings) == 0:
            return None, 1.0
        
        try:
            # Calculate distances to all known faces
            distances = []
            similarities = []
            
            for known_encoding in self.known_face_encodings:
                # Euclidean distance
                distance = MathUtils.calculate_euclidean_distance(face_embedding, known_encoding)
                distances.append(distance)
                
                # Cosine similarity
                similarity = MathUtils.calculate_cosine_similarity(face_embedding, known_encoding)
                similarities.append(similarity)
            
            # Find best match
            min_distance_idx = np.argmin(distances)
            max_similarity_idx = np.argmax(similarities)
            
            min_distance = distances[min_distance_idx]
            max_similarity = similarities[max_similarity_idx]
            
            # Use the match with higher confidence
            if max_similarity > (1 - threshold):  # Convert distance threshold to similarity
                best_idx = max_similarity_idx
                confidence = max_similarity
            elif min_distance < threshold:
                best_idx = min_distance_idx
                confidence = 1 - (min_distance / threshold)
            else:
                return None, min_distance
            
            # Return student information
            student_info = {
                'student_id': self.known_student_ids[best_idx],
                'name': self.known_face_names[best_idx],
                'confidence': confidence,
                'similarity_score': similarities[best_idx],
                'distance_score': distances[best_idx]
            }
            
            return student_info, distances[best_idx]
            
        except Exception as e:
            logger.error(f"Error recognizing face: {str(e)}")
            return None, 1.0
    
    @LoggingUtils.log_performance
    def process_image(self, image_data: str, confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD) -> Dict[str, Any]:
        """
        Process image for face recognition
        
        Args:
            image_data: Base64 encoded image
            confidence_threshold: Recognition confidence threshold
            
        Returns:
            Processing results
        """
        try:
            # Validate input
            if not ValidationUtils.validate_image_data(image_data):
                return {
                    'success': False,
                    'error': 'Invalid image data',
                    'recognized_students': [],
                    'faces_detected': 0
                }
            
            # Decode image
            image = ImageUtils.decode_base64_to_image(image_data)
            if image is None:
                return {
                    'success': False,
                    'error': 'Failed to decode image',
                    'recognized_students': [],
                    'faces_detected': 0
                }
            
            # Resize image if too large
            image = ImageUtils.resize_image(image)
            
            # Detect faces
            detected_faces = self.detect_faces(image)
            
            # Process each detected face
            recognized_students = []
            unregistered_faces = 0
            
            for face_data in detected_faces:
                # Get face embedding
                embedding = self.get_face_embedding(face_data['face'])
                
                if embedding is not None:
                    # Recognize face
                    student_info, distance = self.recognize_face(embedding, confidence_threshold)
                    
                    if student_info:
                        # Avoid duplicates
                        existing_student = next(
                            (s for s in recognized_students if s['student_id'] == student_info['student_id']),
                            None
                        )
                        
                        if not existing_student or student_info['confidence'] > existing_student['confidence']:
                            if existing_student:
                                recognized_students.remove(existing_student)
                            
                            student_info.update({
                                'detection_box': face_data['box'],
                                'face_quality': face_data['quality'],
                                'face_size': face_data['size']
                            })
                            recognized_students.append(student_info)
                    else:
                        unregistered_faces += 1
            
            return {
                'success': True,
                'recognized_students': recognized_students,
                'faces_detected': len(detected_faces),
                'unregistered_faces': unregistered_faces,
                'processing_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error processing image: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'recognized_students': [],
                'faces_detected': 0
            }
    
    def register_student(self, student_id: str, name: str, face_images: List[str]) -> bool:
        """
        Register new student with multiple face images
        
        Args:
            student_id: Student ID
            name: Student name
            face_images: List of base64 encoded face images
            
        Returns:
            True if registration successful
        """
        try:
            # Validate inputs
            if not ValidationUtils.validate_student_id(student_id):
                logger.error(f"Invalid student ID: {student_id}")
                return False
            
            if not name or not isinstance(name, str):
                logger.error(f"Invalid student name: {name}")
                return False
            
            if not face_images or len(face_images) < 2:
                logger.error("At least 2 face images required for registration")
                return False
            
            student_id = student_id.strip().upper()
            name = name.strip()
            
            # Process face images
            valid_embeddings = []
            
            for i, img_data in enumerate(face_images):
                if not ValidationUtils.validate_image_data(img_data):
                    logger.warning(f"Invalid image data for image {i+1}")
                    continue
                
                # Decode image
                image = ImageUtils.decode_base64_to_image(img_data)
                if image is None:
                    logger.warning(f"Failed to decode image {i+1}")
                    continue
                
                # Detect faces
                faces = self.detect_faces(image)
                
                if faces:
                    # Use the best quality face
                    best_face = max(faces, key=lambda x: x['quality'] * x['confidence'])
                    
                    # Get embedding
                    embedding = self.get_face_embedding(best_face['face'])
                    
                    if embedding is not None:
                        valid_embeddings.append(embedding)
                        logger.info(f"Processed image {i+1} for student {student_id}")
            
            if len(valid_embeddings) < 2:
                logger.error(f"Insufficient valid face images for student {student_id}")
                return False
            
            # Calculate average embedding
            avg_embedding = np.mean(valid_embeddings, axis=0)
            avg_embedding = MathUtils.normalize_vector(avg_embedding)
            
            # Check if student already exists
            if student_id in self.known_student_ids:
                # Update existing student
                idx = self.known_student_ids.index(student_id)
                self.known_face_encodings[idx] = avg_embedding
                self.known_face_names[idx] = name
                logger.info(f"Updated existing student: {student_id}")
            else:
                # Add new student
                self.known_face_encodings.append(avg_embedding)
                self.known_face_names.append(name)
                self.known_student_ids.append(student_id)
                logger.info(f"Registered new student: {student_id}")
            
            # Save to database
            success = self.save_student_database()
            
            if success:
                logger.info(f"Successfully registered student {student_id} - {name}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error registering student {student_id}: {str(e)}")
            return False
    
    def get_registered_students(self) -> List[Dict[str, str]]:
        """
        Get list of all registered students
        
        Returns:
            List of student information
        """
        try:
            return [
                {
                    'student_id': student_id,
                    'name': name
                }
                for student_id, name in zip(self.known_student_ids, self.known_face_names)
            ]
        except Exception as e:
            logger.error(f"Error getting registered students: {str(e)}")
            return []
    
    def delete_student(self, student_id: str) -> bool:
        """
        Delete a registered student
        
        Args:
            student_id: Student ID to delete
            
        Returns:
            True if deleted successfully
        """
        try:
            student_id = student_id.strip().upper()
            
            if student_id in self.known_student_ids:
                idx = self.known_student_ids.index(student_id)
                
                # Remove from all lists
                self.known_student_ids.pop(idx)
                self.known_face_names.pop(idx)
                self.known_face_encodings.pop(idx)
                
                # Save updated database
                success = self.save_student_database()
                
                if success:
                    logger.info(f"Deleted student: {student_id}")
                
                return success
            else:
                logger.warning(f"Student not found: {student_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error deleting student {student_id}: {str(e)}")
            return False
    
    def get_system_stats(self) -> Dict[str, Any]:
        """
        Get system statistics
        
        Returns:
            System statistics
        """
        try:
            return {
                'total_registered_students': len(self.known_face_encodings),
                'model_name': self.model_name,
                'last_updated': datetime.now().isoformat(),
                'database_file_exists': os.path.exists(self.encodings_file),
                'metadata_file_exists': os.path.exists(self.metadata_file)
            }
        except Exception as e:
            logger.error(f"Error getting system stats: {str(e)}")
            return {}
