import { io } from 'socket.io-client';

// Xác định URL của Server dựa trên môi trường đang chạy (localhost hoặc đưa lên mạng)
const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:4000' 
  : window.location.origin;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  // Cấu hình cực kỳ quan trọng khi deploy lên Render hoặc các dịch vụ đám mây:
  // Ép hệ thống ưu tiên sử dụng giao thức WebSocket, nếu mạng lỗi mới lùi về Polling.
  // Điều này giúp tránh lỗi 502 Bad Gateway và các vấn đề rớt mạng (Connection Refused).
  transports: ['websocket', 'polling']
});