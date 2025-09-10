import cv2
import numpy as np
import base64
import os
import json
import logging
from datetime import datetime
from typing import List, Tuple, Optional, Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ImageUtils:
    """Utility class for image processing operations"""
    
    @staticmethod
    def decode_base64_to_image(base64_str: str) -> Optional[np.ndarray]:
        """
        Decode base64 string to OpenCV image
        
        Args:
            base64_str: Base64 encoded image string
            
        Returns:
            OpenCV image array or None if failed
        """
        try:
            if ',' in base64_str:
                base64_str = base64_str.split(',')[1]
            
            img_data = base64.b64decode(base64_str)
            np_arr = np.frombuffer(img_data, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if img is None:
                logger.error("Failed to decode image from base64")
                return None
                
            return img
            
        except Exception as e:
            logger.error(f"Error decoding base64 image: {str(e)}")
            return None
    
    @staticmethod
    def encode_image_to_base64(img: np.ndarray, format: str = '.jpg') -> str:
        """
        Encode OpenCV image to base64 string
        
        Args:
            img: OpenCV image array
            format: Image format (default: .jpg)
            
        Returns:
            Base64 encoded image string
        """
        try:
            _, buffer = cv2.imencode(format, img)
            img_base64 = base64.b64encode(buffer).decode('utf-8')
            return f"data:image/jpeg;base64,{img_base64}"
            
        except Exception as e:
            logger.error(f"Error encoding image to base64: {str(e)}")
            return ""
    
    @staticmethod
    def resize_image(img: np.ndarray, max_width: int = 1024, max_height: int = 768) -> np.ndarray:
        """
        Resize image while maintaining aspect ratio
        
        Args:
            img: Input image
            max_width: Maximum width
            max_height: Maximum height
            
        Returns:
            Resized image
        """
        height, width = img.shape[:2]
        
        if width <= max_width and height <= max_height:
            return img
        
        # Calculate scaling factor
        scale_w = max_width / width
        scale_h = max_height / height
        scale = min(scale_w, scale_h)
        
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        return cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
    
    @staticmethod
    def enhance_image_quality(img: np.ndarray) -> np.ndarray:
        """
        Enhance image quality for better face recognition
        
        Args:
            img: Input image
            
        Returns:
            Enhanced image
        """
        try:
            # Convert to LAB color space
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Apply CLAHE to L channel
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            
            # Merge channels and convert back to BGR
            enhanced = cv2.merge([l, a, b])
            enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
            
            # Apply slight Gaussian blur to reduce noise
            enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
            
            return enhanced
            
        except Exception as e:
            logger.error(f"Error enhancing image: {str(e)}")
            return img

class FileUtils:
    """Utility class for file operations"""
    
    @staticmethod
    def ensure_directory_exists(directory_path: str) -> bool:
        """
        Ensure directory exists, create if it doesn't
        
        Args:
            directory_path: Path to directory
            
        Returns:
            True if directory exists or was created successfully
        """
        try:
            os.makedirs(directory_path, exist_ok=True)
            return True
        except Exception as e:
            logger.error(f"Error creating directory {directory_path}: {str(e)}")
            return False
    
    @staticmethod
    def save_json(data: Dict[str, Any], filepath: str) -> bool:
        """
        Save data as JSON file
        
        Args:
            data: Data to save
            filepath: File path
            
        Returns:
            True if saved successfully
        """
        try:
            FileUtils.ensure_directory_exists(os.path.dirname(filepath))
            
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            
            return True
            
        except Exception as e:
            logger.error(f"Error saving JSON to {filepath}: {str(e)}")
            return False
    
    @staticmethod
    def load_json(filepath: str) -> Optional[Dict[str, Any]]:
        """
        Load data from JSON file
        
        Args:
            filepath: File path
            
        Returns:
            Loaded data or None if failed
        """
        try:
            if not os.path.exists(filepath):
                return None
                
            with open(filepath, 'r') as f:
                return json.load(f)
                
        except Exception as e:
            logger.error(f"Error loading JSON from {filepath}: {str(e)}")
            return None

class ValidationUtils:
    """Utility class for data validation"""
    
    @staticmethod
    def validate_student_id(student_id: str) -> bool:
        """
        Validate student ID format
        
        Args:
            student_id: Student ID to validate
            
        Returns:
            True if valid
        """
        if not student_id or not isinstance(student_id, str):
            return False
        
        # Remove whitespace and convert to uppercase
        student_id = student_id.strip().upper()
        
        # Check length and format (example: MIT2025001)
        if len(student_id) < 6 or len(student_id) > 15:
            return False
        
        return True
    
    @staticmethod
    def validate_image_data(image_data: str) -> bool:
        """
        Validate base64 image data
        
        Args:
            image_data: Base64 image string
            
        Returns:
            True if valid
        """
        if not image_data or not isinstance(image_data, str):
            return False
        
        try:
            # Try to decode the image
            img = ImageUtils.decode_base64_to_image(image_data)
            return img is not None
            
        except Exception:
            return False
    
    @staticmethod
    def validate_confidence_score(confidence: float) -> bool:
        """
        Validate confidence score
        
        Args:
            confidence: Confidence score
            
        Returns:
            True if valid (between 0 and 1)
        """
        return isinstance(confidence, (int, float)) and 0 <= confidence <= 1

class MathUtils:
    """Utility class for mathematical operations"""
    
    @staticmethod
    def calculate_euclidean_distance(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """
        Calculate Euclidean distance between two vectors
        
        Args:
            vec1: First vector
            vec2: Second vector
            
        Returns:
            Euclidean distance
        """
        return np.linalg.norm(vec1 - vec2)
    
    @staticmethod
    def calculate_cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two vectors
        
        Args:
            vec1: First vector
            vec2: Second vector
            
        Returns:
            Cosine similarity (0 to 1)
        """
        dot_product = np.dot(vec1, vec2)
        norms = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        
        if norms == 0:
            return 0
        
        return dot_product / norms
    
    @staticmethod
    def normalize_vector(vector: np.ndarray) -> np.ndarray:
        """
        Normalize vector to unit length
        
        Args:
            vector: Input vector
            
        Returns:
            Normalized vector
        """
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return vector / norm

class LoggingUtils:
    """Utility class for logging operations"""
    
    @staticmethod
    def setup_logger(name: str, log_file: str = None, level: int = logging.INFO) -> logging.Logger:
        """
        Set up logger with file and console handlers
        
        Args:
            name: Logger name
            log_file: Log file path (optional)
            level: Logging level
            
        Returns:
            Configured logger
        """
        logger = logging.getLogger(name)
        logger.setLevel(level)
        
        # Clear existing handlers
        logger.handlers.clear()
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        # File handler (if specified)
        if log_file:
            FileUtils.ensure_directory_exists(os.path.dirname(log_file))
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        
        return logger
    
    @staticmethod
    def log_performance(func):
        """
        Decorator to log function performance
        
        Args:
            func: Function to wrap
            
        Returns:
            Wrapped function
        """
        def wrapper(*args, **kwargs):
            start_time = datetime.now()
            result = func(*args, **kwargs)
            end_time = datetime.now()
            
            execution_time = (end_time - start_time).total_seconds()
            logger.info(f"{func.__name__} executed in {execution_time:.4f} seconds")
            
            return result
        
        return wrapper

# Global constants
SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MIN_FACE_SIZE = (50, 50)
MAX_FACE_SIZE = (500, 500)
DEFAULT_CONFIDENCE_THRESHOLD = 0.6
