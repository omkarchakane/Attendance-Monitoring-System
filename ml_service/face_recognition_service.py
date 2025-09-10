from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from flask_cors import CORS
import logging
import os
from datetime import datetime
from typing import Dict, Any
import traceback

from face_processor import FaceProcessor
from utils import LoggingUtils, ValidationUtils

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=["*"])
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Set up logging
logger = LoggingUtils.setup_logger(__name__, 'logs/face_recognition_service.log')

# Initialize face processor
try:
    face_processor = FaceProcessor()
    logger.info("Face processor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize face processor: {str(e)}")
    face_processor = None

# Global statistics
service_stats = {
    'start_time': datetime.now(),
    'total_requests': 0,
    'successful_recognitions': 0,
    'failed_recognitions': 0,
    'registrations': 0
}

def update_stats(operation: str, success: bool = True):
    """Update service statistics"""
    service_stats['total_requests'] += 1
    if operation == 'recognition':
        if success:
            service_stats['successful_recognitions'] += 1
        else:
            service_stats['failed_recognitions'] += 1
    elif operation == 'registration':
        service_stats['registrations'] += 1

@app.errorhandler(Exception)
def handle_exception(e):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify({
        'success': False,
        'error': 'Internal server error',
        'message': str(e)
    }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        uptime = (datetime.now() - service_stats['start_time']).total_seconds()
        
        health_status = {
            'status': 'OK' if face_processor is not None else 'ERROR',
            'service': 'Face Recognition ML Service',
            'version': '1.0.0',
            'timestamp': datetime.now().isoformat(),
            'uptime_seconds': uptime,
            'face_processor_available': face_processor is not None,
            'total_registered_students': len(face_processor.known_face_encodings) if face_processor else 0,
            'statistics': service_stats
        }
        
        return jsonify(health_status)
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return jsonify({
            'status': 'ERROR',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/process_single_image', methods=['POST'])
def process_single_image():
    """Process single image for face recognition"""
    try:
        if not face_processor:
            return jsonify({
                'success': False,
                'error': 'Face processor not available'
            }), 503
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        image_data = data.get('imageData')
        confidence_threshold = data.get('confidence_threshold', 0.6)
        
        # Validate inputs
        if not image_data:
            return jsonify({
                'success': False,
                'error': 'No image data provided'
            }), 400
        
        if not ValidationUtils.validate_confidence_score(confidence_threshold):
            confidence_threshold = 0.6
        
        logger.info(f"Processing single image with confidence threshold: {confidence_threshold}")
        
        # Process image
        result = face_processor.process_image(image_data, confidence_threshold)
        
        # Update statistics
        success = result.get('success', False) and len(result.get('recognized_students', [])) > 0
        update_stats('recognition', success)
        
        if success:
            logger.info(f"Successfully recognized {len(result['recognized_students'])} students")
        else:
            logger.warning("No students recognized in image")
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error processing single image: {str(e)}")
        update_stats('recognition', False)
        return jsonify({
            'success': False,
            'error': str(e),
            'recognized_students': [],
            'faces_detected': 0
        }), 500

@app.route('/process_batch_images', methods=['POST'])
def process_batch_images():
    """Process multiple images for batch attendance"""
    try:
        if not face_processor:
            return jsonify({
                'success': False,
                'error': 'Face processor not available'
            }), 503
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        images_data = data.get('images', [])
        confidence_threshold = data.get('confidence_threshold', 0.6)
        
        if not images_data:
            return jsonify({
                'success': False,
                'error': 'No images provided'
            }), 400
        
        if not ValidationUtils.validate_confidence_score(confidence_threshold):
            confidence_threshold = 0.6
        
        logger.info(f"Processing batch of {len(images_data)} images")
        
        # Process each image
        batch_results = []
        all_recognized_students = {}
        total_faces_detected = 0
        
        for idx, image_data in enumerate(images_data):
            try:
                result = face_processor.process_image(image_data, confidence_threshold)
                
                if result.get('success', False):
                    total_faces_detected += result.get('faces_detected', 0)
                    
                    # Collect unique students (keep highest confidence)
                    for student in result.get('recognized_students', []):
                        student_id = student['student_id']
                        if (student_id not in all_recognized_students or 
                            student['confidence'] > all_recognized_students[student_id]['confidence']):
                            all_recognized_students[student_id] = student
                    
                    batch_results.append({
                        'image_index': idx,
                        'success': True,
                        'faces_detected': result.get('faces_detected', 0),
                        'students_recognized': len(result.get('recognized_students', []))
                    })
                else:
                    batch_results.append({
                        'image_index': idx,
                        'success': False,
                        'error': result.get('error', 'Processing failed'),
                        'faces_detected': 0,
                        'students_recognized': 0
                    })
                    
            except Exception as e:
                logger.error(f"Error processing image {idx}: {str(e)}")
                batch_results.append({
                    'image_index': idx,
                    'success': False,
                    'error': str(e),
                    'faces_detected': 0,
                    'students_recognized': 0
                })
        
        # Prepare response
        response = {
            'success': True,
            'batch_results': batch_results,
            'total_images_processed': len(images_data),
            'successful_images': len([r for r in batch_results if r['success']]),
            'total_unique_students': len(all_recognized_students),
            'recognized_students': list(all_recognized_students.values()),
            'total_faces_detected': total_faces_detected,
            'processing_timestamp': datetime.now().isoformat()
        }
        
        # Update statistics
        update_stats('recognition', len(all_recognized_students) > 0)
        
        logger.info(f"Batch processing complete: {len(all_recognized_students)} unique students recognized")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error processing batch images: {str(e)}")
        update_stats('recognition', False)
        return jsonify({
            'success': False,
            'error': str(e),
            'batch_results': [],
            'recognized_students': []
        }), 500

@app.route('/register_student', methods=['POST'])
def register_student():
    """Register new student with face images"""
    try:
        if not face_processor:
            return jsonify({
                'success': False,
                'error': 'Face processor not available'
            }), 503
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        student_id = data.get('student_id')
        name = data.get('name')
        face_images = data.get('face_images', [])
        
        # Validate inputs
        if not student_id or not name or not face_images:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: student_id, name, face_images'
            }), 400
        
        if not ValidationUtils.validate_student_id(student_id):
            return jsonify({
                'success': False,
                'error': 'Invalid student ID format'
            }), 400
        
        if len(face_images) < 2:
            return jsonify({
                'success': False,
                'error': 'At least 2 face images required for registration'
            }), 400
        
        logger.info(f"Registering student: {student_id} - {name} with {len(face_images)} images")
        
        # Register student
        success = face_processor.register_student(student_id, name, face_images)
        
        if success:
            update_stats('registration', True)
            logger.info(f"Successfully registered student: {student_id}")
            
            return jsonify({
                'success': True,
                'message': f'Student {name} registered successfully',
                'student_id': student_id,
                'total_registered': len(face_processor.known_face_encodings)
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to register student - insufficient valid face images'
            }), 400
            
    except Exception as e:
        logger.error(f"Error registering student: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/get_registered_students', methods=['GET'])
def get_registered_students():
    """Get list of all registered students"""
    try:
        if not face_processor:
            return jsonify({
                'success': False,
                'error': 'Face processor not available'
            }), 503
        
        students = face_processor.get_registered_students()
        
        return jsonify({
            'success': True,
            'students': students,
            'total_count': len(students),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting registered students: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'students': []
        }), 500

@app.route('/delete_student', methods=['POST'])
def delete_student():
    """Delete a registered student"""
    try:
        if not face_processor:
            return jsonify({
                'success': False,
                'error': 'Face processor not available'
            }), 503
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        student_id = data.get('student_id')
        
        if not student_id:
            return jsonify({
                'success': False,
                'error': 'Student ID is required'
            }), 400
        
        logger.info(f"Deleting student: {student_id}")
        
        # Delete student
        success = face_processor.delete_student(student_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Student {student_id} deleted successfully',
                'total_registered': len(face_processor.known_face_encodings)
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Student {student_id} not found'
            }), 404
            
    except Exception as e:
        logger.error(f"Error deleting student: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system_stats', methods=['GET'])
def get_system_stats():
    """Get system statistics and status"""
    try:
        stats = {
            'service_stats': service_stats,
            'uptime_seconds': (datetime.now() - service_stats['start_time']).total_seconds(),
            'face_processor_available': face_processor is not None,
            'timestamp': datetime.now().isoformat()
        }
        
        if face_processor:
            stats.update(face_processor.get_system_stats())
        
        return jsonify({
            'success': True,
            'stats': stats
        })
        
    except Exception as e:
        logger.error(f"Error getting system stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f'Client connected: {request.sid}')
    
    # Send welcome message with system status
    socketio.emit('system_status', {
        'status': 'connected',
        'service': 'Face Recognition ML Service',
        'timestamp': datetime.now().isoformat(),
        'registered_students': len(face_processor.known_face_encodings) if face_processor else 0
    }, to=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info(f'Client disconnected: {request.sid}')

@socketio.on('ping')
def handle_ping(data):
    """Handle ping requests"""
    socketio.emit('pong', {
        'timestamp': datetime.now().isoformat(),
        'message': 'Service is alive'
    }, to=request.sid)

@socketio.on('get_stats')
def handle_get_stats():
    """Handle statistics request"""
    try:
        stats = {
            'service_stats': service_stats,
            'uptime_seconds': (datetime.now() - service_stats['start_time']).total_seconds(),
            'registered_students': len(face_processor.known_face_encodings) if face_processor else 0,
            'timestamp': datetime.now().isoformat()
        }
        
        socketio.emit('stats_update', stats, to=request.sid)
        
    except Exception as e:
        logger.error(f"Error handling stats request: {str(e)}")
        socketio.emit('error', {'message': str(e)}, to=request.sid)

if __name__ == '__main__':
    # Ensure required directories exist
    os.makedirs('logs', exist_ok=True)
    os.makedirs('data', exist_ok=True)
    
    # Log service startup
    logger.info("="*50)
    logger.info("Starting Face Recognition ML Service")
    logger.info(f"Service start time: {service_stats['start_time']}")
    logger.info(f"Face processor available: {face_processor is not None}")
    if face_processor:
        logger.info(f"Registered students: {len(face_processor.known_face_encodings)}")
    logger.info("="*50)
    
    # Start the service
    try:
        socketio.run(
            app, 
            host='0.0.0.0', 
            port=5001, 
            debug=False,
            use_reloader=False,
            log_output=True
        )
    except Exception as e:
        logger.error(f"Failed to start service: {str(e)}")
        raise
