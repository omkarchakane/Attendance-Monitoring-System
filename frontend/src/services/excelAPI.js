import api from './apiService';

export const generateDailySheet = async (data) => {
  try {
    const response = await api.post('/reports/generate-daily-sheet', data);
    return response.data;
  } catch (error) {
    console.error('Generate daily sheet error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};

export const generateMonthlyReport = async (data) => {
  try {
    const response = await api.post('/reports/generate-monthly', data);
    return response.data;
  } catch (error) {
    console.error('Generate monthly report error:', error);
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

export const downloadReport = async (filename, type = 'daily') => {
  try {
    const response = await api.get(`/reports/download/${type}/${filename}`, {
      responseType: 'blob'
    });
    return response.data;
  } catch (error) {
    console.error('Download report error:', error);
    throw error.response?.data || { message: 'Network error' };
  }
};
