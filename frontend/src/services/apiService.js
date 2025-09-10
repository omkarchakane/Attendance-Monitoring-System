import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attendance API calls
export const captureAttendance = async (data) => {
  try {
    const response = await api.post('/attendance/capture', data);
    return response.data;
  } catch (error) {
    console.error('Capture attendance error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export const uploadPhotosForAttendance = async (data) => {
  try {
    const response = await api.post('/attendance/upload', data);
    return response.data;
  } catch (error) {
    console.error('Upload photos error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export const getAttendanceData = async (classId, date) => {
  try {
    const response = await api.get(`/attendance/live/${classId}?date=${date}`);
    return response.data;
  } catch (error) {
    console.error('Get attendance data error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export const getAttendanceStats = async (classId, date) => {
  try {
    const response = await api.get(`/attendance/stats/${classId}?date=${date}`);
    return response.data;
  } catch (error) {
    console.error('Get attendance stats error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

// Student API calls
export const registerStudent = async (studentData) => {
  try {
    const response = await api.post('/students/register', studentData);
    return response.data;
  } catch (error) {
    console.error('Register student error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export const getStudents = async (classId) => {
  try {
    const response = await api.get(`/students/${classId}`);
    return response.data;
  } catch (error) {
    console.error('Get students error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

// Excel API calls
export const generateDailySheet = async (data) => {
  try {
    const response = await api.post('/reports/generate-daily', data);
    return response.data;
  } catch (error) {
    console.error('Generate daily sheet error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export const getReportsList = async (classId) => {
  try {
    const response = await api.get(`/reports/list/${classId}`);
    return response.data;
  } catch (error) {
    console.error('Get reports list error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export default api;
