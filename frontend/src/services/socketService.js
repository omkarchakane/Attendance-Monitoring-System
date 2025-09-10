import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export const initializeSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      upgrade: true
    });

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinClass = (classId) => {
  if (socket) {
    socket.emit('joinClass', classId);
  }
};

export const leaveClass = (classId) => {
  if (socket) {
    socket.emit('leaveClass', classId);
  }
};

export default {
  initializeSocket,
  disconnectSocket,
  joinClass,
  leaveClass
};
