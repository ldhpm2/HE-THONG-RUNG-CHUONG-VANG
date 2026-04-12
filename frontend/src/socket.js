import { io } from 'socket.io-client';

// Kết nối tới server node.js ở port 4000
// Khi deploy thật, thay URL này bằng biến môi trường (VD: import.meta.env.VITE_SERVER_URL)
const SOCKET_URL = 'http://localhost:4000';

export const socket = io(SOCKET_URL, {
  autoConnect: true,
});
