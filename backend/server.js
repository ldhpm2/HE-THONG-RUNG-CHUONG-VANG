require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e6 // 5MB
});

// --- MONGODB SETUP ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rung_chuong_vang';
let isDbConnected = false;

// Schema cho Thí sinh
const studentSchema = new mongoose.Schema({
  sbd: { type: String, unique: true, required: true },
  hoTen: String,
  lop: String,
  pin: String,
  status: { type: String, default: 'active' }, // 'active' | 'eliminated'
  currentAnswer: { type: String, default: null }
});
const Student = mongoose.model('Student', studentSchema);

// Schema cho Trạng thái Game
const gameStateSchema = new mongoose.Schema({
  id: { type: String, default: 'main_state', unique: true },
  gamePhase: { type: String, default: 'idle' },
  currentQuestion: { type: mongoose.Schema.Types.Mixed, default: null },
  customMessage: { type: String, default: '' },
  isSoundEnabled: { type: Boolean, default: true }
});
const GameState = mongoose.model('GameState', gameStateSchema);

// --- GAME STATE (In-memory) ---
let students = {};
let currentQuestion = null;
let customMessage = '';
let gamePhase = 'idle';
let isSoundEnabled = true;

// BIẾN QUẢN LÝ TỰ ĐỘNG KHÓA KHI HẾT GIỜ
let autoLockTimeout = null;

const clearAutoLock = () => {
  if (autoLockTimeout) {
    clearTimeout(autoLockTimeout);
    autoLockTimeout = null;
  }
};

// --- PERSISTENCE HELPERS (MongoDB) ---

// FIX #5: Debounce saveFullState để tránh ghi DB liên tục khi nhiều học sinh nộp bài cùng lúc
let saveTimeout = null;
const debouncedSave = () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveFullState(), 1000);
};

const saveFullState = async () => {
  if (!isDbConnected) return;
  try {
    await GameState.findOneAndUpdate(
      { id: 'main_state' },
      { gamePhase, currentQuestion, customMessage, isSoundEnabled },
      { upsert: true }
    );

    const studentOps = Object.values(students).map(s => ({
      updateOne: {
        filter: { sbd: s.sbd },
        update: {
          hoTen: s.hoTen,
          lop: s.lop,
          pin: s.pin,
          status: s.status,
          currentAnswer: s.currentAnswer
        },
        upsert: true
      }
    }));
    if (studentOps.length > 0) {
      await Student.bulkWrite(studentOps);
    }
  } catch (err) {
    console.error('[Persistence] Error saving to MongoDB:', err);
  }
};

const loadFullState = async () => {
  try {
    const gs = await GameState.findOne({ id: 'main_state' });
    if (gs) {
      gamePhase = gs.gamePhase;
      currentQuestion = gs.currentQuestion;
      customMessage = gs.customMessage || '';
      isSoundEnabled = gs.isSoundEnabled;
    }

    const dbStudents = await Student.find({});
    students = {};
    dbStudents.forEach(s => {
      students[s.sbd] = {
        sbd: s.sbd,
        hoTen: s.hoTen,
        lop: s.lop,
        pin: s.pin,
        status: s.status,
        currentAnswer: s.currentAnswer,
        socketId: null,
        online: false
      };
    });
    console.log(`[Persistence] Loaded ${Object.keys(students).length} students and game state from MongoDB`);
    broadcastState();
  } catch (err) {
    console.error('[Persistence] Error loading from MongoDB:', err);
  }
};

// KẾT NỐI DB (Không block server khởi động)
const connectDB = async () => {
  try {
    if (!MONGODB_URI || (!MONGODB_URI.startsWith('mongodb://') && !MONGODB_URI.startsWith('mongodb+srv://'))) {
      throw new Error('MONGODB_URI không hợp lệ hoặc chưa cấu hình.');
    }
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    isDbConnected = true;
    console.log('[MongoDB] Connected successfully');
    
    // Gọi loadFullState sau khi kết nối thành công
    await loadFullState();
  } catch (err) {
    isDbConnected = false;
    console.error('[MongoDB] Connection failed. Running in IN-MEMORY mode:', err.message);
  }
};

// Helper to get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 4000;

const startServer = () => {
  // Render.com yêu cầu keepAliveTimeout > 60s để tránh 502
  server.keepAliveTimeout = 120000; // 120 giây
  server.headersTimeout = 125000;   // 125 giây (phải > keepAliveTimeout)

  // MỞ PORT NGAY LẬP TỨC ĐỂ RENDER HEALTH CHECK PASS
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server is running on 0.0.0.0:${PORT}`);
    
    // TIẾN HÀNH KẾT NỐI DB Ở CHẾ ĐỘ NỀN (BACKGROUND)
    connectDB();
  });
};

startServer();

// --- BROADCASTER ---
const broadcastState = () => {
  const publicStudents = {};
  for (const sbd in students) {
    publicStudents[sbd] = {
      sbd: students[sbd].sbd,
      hoTen: students[sbd].hoTen,
      lop: students[sbd].lop,
      status: students[sbd].status,
      online: students[sbd].online,
      pin: students[sbd].pin,
      hasAnswered: students[sbd].currentAnswer !== null
    };
  }
  io.emit('game_state_update', {
    gamePhase,
    currentQuestion: currentQuestion
      ? { ...currentQuestion, correct: gamePhase === 'answer_revealed' ? currentQuestion.correct : null }
      : null,
    students: publicStudents,
    isSoundEnabled,
    customMessage
  });

  // Admin nhận đầy đủ thông tin bao gồm đáp án học sinh
  io.to('admin_room').emit('admin_state_update', {
    gamePhase,
    currentQuestion,
    customMessage,
    students,
    isSoundEnabled
  });
};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Gửi trạng thái hiện tại ngay lập tức cho kết nối mới
  broadcastState();

  // =====================================================================
  // --- ADMIN EVENTS ---
  // =====================================================================

  socket.on('admin:login', (data, callback) => {
    if (data.password === 'admin123') {
      socket.join('admin_room');
      console.log(`[Admin] Login Success: ${socket.id}. Joined 'admin_room'`);
      if (callback) callback({ success: true });
      broadcastState();
    } else {
      console.warn(`[Admin] Login Failed for ${socket.id}: Incorrect password`);
      if (callback) callback({ success: false, message: 'Sai mật khẩu Admin' });
    }
  });

  socket.on('admin:get_server_info', (callback) => {
    const ip = getLocalIP();
    if (callback) callback({
      ip: ip,
      port: PORT,
      url: `http://${ip}:${PORT}`
    });
  });

  socket.on('admin:upload_students', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) {
      console.warn(`[Admin] Unauthorized upload_students attempt from ${socket.id}`);
      if (callback) callback({ success: false, message: 'Bạn chưa đăng nhập Admin hoặc bị mất kết nối!' });
      return;
    }
    try {
      if (isDbConnected) {
        await Student.deleteMany({});
      }
      students = {};
      data.forEach(s => {
        students[s.sbd] = {
          ...s,
          status: 'active',
          currentAnswer: null,
          socketId: null,
          online: false
        };
      });
      console.log(`[Admin] Uploaded ${data.length} students by ${socket.id}`);
      if (callback) callback({ success: true, count: data.length });
      await saveFullState();
      broadcastState();
    } catch (error) {
      console.error('[Admin] Error uploading students:', error);
      if (callback) callback({ success: false, message: 'Lỗi server khi nạp thí sinh: ' + error.message });
    }
  });

  socket.on('admin:clear_students', async (callback) => {
    if (!socket.rooms.has('admin_room')) {
      console.warn(`[Admin] Unauthorized clear_students attempt from ${socket.id}`);
      if (callback) callback({ success: false, message: 'Bạn chưa đăng nhập Admin hoặc bị mất kết nối!' });
      return;
    }
    try {
      clearAutoLock();
      students = {};
      gamePhase = 'idle';
      currentQuestion = null;
      if (isDbConnected) {
        await Student.deleteMany({});
      }
      console.log(`[Admin] All students cleared and game reset by ${socket.id}`);
      if (callback) callback({ success: true });
      await saveFullState();
      broadcastState();
    } catch (error) {
      console.error('[Admin] Error clearing students:', error);
      if (callback) callback({ success: false, message: 'Lỗi server khi xóa thí sinh: ' + error.message });
    }
  });

  socket.on('admin:mobile_upload_questions', (questions, callback) => {
    if (!socket.rooms.has('admin_room')) return;
    socket.to('admin_room').emit('admin:mobile_upload_questions', questions);
    if (callback) callback({ success: true });
  });

  socket.on('admin:set_welcome', () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'idle';
    currentQuestion = null;
    isSoundEnabled = true;
    console.log(`[Admin] Game reset to welcome screen (Sound ON) by ${socket.id}`);
    broadcastState();
  });

  socket.on('admin:show_intro', () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'showing_intro';
    currentQuestion = null;
    console.log(`[Admin] Showing contestants intro by ${socket.id}`);
    broadcastState();
  });

  socket.on('admin:intro_media', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    console.log(`[Admin] Intro media sent by ${socket.id}: ${data.name}`);
    socket.broadcast.emit('intro:media_data', data);
  });

  socket.on('admin:victory_media', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    console.log(`[Admin] Victory media sent by ${socket.id}: ${data.name}`);
    socket.broadcast.emit('victory:media_data', data);
  });

  socket.on('admin:show_rules', () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'showing_rules';
    currentQuestion = null;
    console.log(`[Admin] Showing rules by ${socket.id}`);
    broadcastState();
  });

  socket.on('admin:show_custom', async (data) => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'showing_custom';
    customMessage = data.message || '';
    currentQuestion = null;
    console.log(`[Admin] Showing custom content by ${socket.id}: ${customMessage.substring(0, 30)}...`);
    await saveFullState();
    broadcastState();
  });

  socket.on('admin:push_question', async (data) => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    currentQuestion = {
      ...data.question,
      isRescue: !!data.isRescue,
      isAudience: !!data.isAudience
    };
    gamePhase = 'question_sent';
    for (const key in students) {
      students[key].currentAnswer = null;
    }
    console.log(`[Admin] Question pushed by ${socket.id}: ${currentQuestion.id || 'N/A'}`);
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'question_show');
  });

  socket.on('admin:start_timer', () => {
    if (!socket.rooms.has('admin_room')) return;
    gamePhase = 'timer_running';
    console.log(`[Admin] Timer started by ${socket.id}`);
    broadcastState();
    io.emit('client_play_sound', 'timer_start');

    // TỰ ĐỘNG KHÓA ĐÁP ÁN KHI HẾT GIỜ
    clearAutoLock();
    const duration = currentQuestion?.time || 15; // Mặc định 15s nếu không có dữ liệu
    
    autoLockTimeout = setTimeout(async () => {
      if (gamePhase === 'timer_running') {
        gamePhase = 'locked';
        console.log(`[System] Auto-locked after ${duration}s`);
        await saveFullState();
        broadcastState();
        io.emit('client_play_sound', 'timeout');
      }
    }, duration * 1000);
  });

  socket.on('admin:lock', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock(); // Hủy tự động khóa nếu Admin đã bấm tay sớm
    gamePhase = 'locked';
    console.log(`[Admin] Answers locked manually by ${socket.id}`);
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'timeout');
  });

  socket.on('admin:toggle_sound', () => {
    if (!socket.rooms.has('admin_room')) {
      console.warn(`[Admin] Unauthorized toggle_sound attempt from ${socket.id}`);
      return;
    }
    isSoundEnabled = !isSoundEnabled;
    console.log(`[Admin] Global sound toggled by ${socket.id}: ${isSoundEnabled}`);
    broadcastState();
  });

  socket.on('admin:declare_winner', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'winner_declared';
    currentQuestion = null;
    console.log(`[Admin] WINNER DECLARED by ${socket.id}`);
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'victory');
  });

  socket.on('admin:reveal_answer', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'answer_revealed';
    console.log(`[Admin] Answer revealed by ${socket.id}`);

    const correctAns = currentQuestion?.correct?.toString().toLowerCase().trim();
    console.log(`[Reveal] Correct Ans: ${correctAns}`);

    // Bỏ qua nếu là câu hỏi dành cho khán giả
    if (currentQuestion?.isAudience) {
      broadcastState();
      io.emit('client_play_sound', 'reveal_answer');
      return;
    }

    for (const key in students) {
      const student = students[key];

      if (currentQuestion?.isRescue) {
        // --- LOGIC GIAI ĐOẠN CỨU TRỢ ---
        if (student.status === 'eliminated') {
          const studentAns = (student.currentAnswer || '').toString().toLowerCase().trim();
          if (studentAns && studentAns === correctAns) {
            console.log(`[Rescue] SBD ${student.sbd} correct! Status -> Active`);
            student.status = 'active';
            if (student.socketId) io.to(student.socketId).emit('you_are_rescued');
          } else {
            if (student.socketId) io.to(student.socketId).emit('you_are_eliminated');
          }
        }
      } else {
        // --- LOGIC THI ĐẤU BÌNH THƯỜNG ---
        if (student.status === 'active') {
          const studentAns = (student.currentAnswer || '').toString().toLowerCase().trim();
          if (!studentAns || studentAns !== correctAns) {
            student.status = 'eliminated';
            if (student.socketId) io.to(student.socketId).emit('you_are_eliminated');
          } else {
            if (student.socketId) io.to(student.socketId).emit('you_passed');
          }
        }
      }
    }
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'reveal_answer');
  });

  socket.on('admin:rescue', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) {
      if (callback) callback({ success: false, message: 'Từ chối: Không có quyền Admin' });
      return;
    }
    clearAutoLock();
    const targetStr = (data.target || data.count || '').toString().toLowerCase().trim();
    console.log(`[Admin] Rescue command received: ${targetStr}`);

    const eliminatedList = Object.values(students).filter(s => s.status === 'eliminated');
    let rescued = [];

    if (targetStr === 'all') {
      rescued = eliminatedList;
    } else {
      const sbdList = targetStr.split(',').map(s => s.trim());
      rescued = eliminatedList.filter(s => sbdList.includes(s.sbd.toString().toLowerCase().trim()));
    }

    rescued.forEach(s => {
      s.status = 'active';
      if (s.socketId) io.to(s.socketId).emit('you_are_rescued');
    });

    gamePhase = 'idle';
    currentQuestion = null;
    for (const key in students) {
      students[key].currentAnswer = null;
    }

    console.log(`[Admin] Rescued ${rescued.length} students`);
    if (callback) callback({ success: true, count: rescued.length });
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'rescue_success');
  });

  socket.on('admin:eliminate_student', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) {
      if (callback) callback({ success: false, message: 'Bạn không có quyền Admin' });
      return;
    }
    const { sbd } = data;
    if (students[sbd]) {
      students[sbd].status = 'eliminated';
      if (students[sbd].socketId) io.to(students[sbd].socketId).emit('you_are_eliminated');
      console.log(`[Admin] Manually eliminated SBD: ${sbd}`);
      if (callback) callback({ success: true });
      await saveFullState();
      broadcastState();
    } else {
      if (callback) callback({ success: false, message: 'Số báo danh không tồn tại' });
    }
  });

  socket.on('admin:reset_student', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    const { sbd } = data;
    if (students[sbd]) {
      console.log(`[Admin] Reset student SBD: ${sbd}`);
      if (students[sbd].socketId) io.to(students[sbd].socketId).disconnect(true);
      students[sbd].socketId = null;
      students[sbd].online = false;
      broadcastState();
    }
  });

  // --- CAMERA STREAMING (WebRTC Relay) ---
  socket.on('admin:camera_signal', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    socket.broadcast.emit('camera:signal_from_admin', data);
  });

  socket.on('stage:camera_signal', (data) => {
    io.to('admin_room').emit('camera:signal_from_stage', data);
  });

  socket.on('admin:camera_status', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    console.log(`[Camera] Status update from ${socket.id}: active=${data.active}`);
    io.emit('camera:status_update', data);
  });

  socket.on('admin:camera_frame', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    socket.broadcast.emit('camera:frame_from_admin', data);
  });
// --- CHUYỂN TIẾP LỆNH CHỈNH CỠ CHỮ TỪ ADMIN SANG STAGE ---
  socket.on('admin:font_size', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    io.emit('stage:change_font_size', data); // Báo cho toàn bộ Stage thay đổi
  });
  // =====================================================================
  // --- CLIENT (HỌC SINH) EVENTS ---
  // =====================================================================

  socket.on('student:login', (data, callback) => {
    const { sbd, pin } = data;
    const student = students[sbd];

    if (!student) {
      if (callback) callback({ success: false, message: 'Số báo danh không tồn tại' });
      return;
    }
    if (student.pin.toString() !== pin.toString()) {
      if (callback) callback({ success: false, message: 'Mã PIN không hợp lệ' });
      return;
    }

    // Nếu có đăng nhập ở nơi khác thì disconnect user cũ
    if (student.socketId && student.socketId !== socket.id) {
      io.to(student.socketId).emit('force_logout', { message: 'Tài khoản được đăng nhập ở nơi khác' });
      io.to(student.socketId).disconnectSockets(true);
    }

    student.socketId = socket.id;
    student.online = true;
    socket.data.sbd = sbd;

    if (callback) callback({
      success: true,
      student: { sbd: student.sbd, hoTen: student.hoTen, lop: student.lop, status: student.status }
    });

    broadcastState();
  });

  socket.on('student:submit_answer', async (data, callback) => {
    const sbd = socket.data.sbd;
    if (!sbd || !students[sbd]) return;

    // BẢO MẬT: Bắt buộc chỉ nhận đáp án khi "timer_running"
    if (gamePhase !== 'timer_running') {
      if (callback) callback({ success: false, message: 'Chưa tính giờ hoặc đã hết thời gian nộp bài!' });
      return;
    }

    if (currentQuestion?.isRescue) {
      if (students[sbd].status === 'active') {
        if (callback) callback({ success: false, message: 'Bạn đang an toàn, không cần làm câu cứu trợ!' });
        return;
      }
    } else {
      if (students[sbd].status !== 'active') {
        if (callback) callback({ success: false, message: 'Bạn không có quyền nộp bài' });
        return;
      }
    }

    students[sbd].currentAnswer = data.answer;
    if (callback) callback({ success: true });

    // Update admin real-time (không cần lưu DB ngay, dùng debounce)
    io.to('admin_room').emit('admin_state_update', { gamePhase, currentQuestion, students });
    debouncedSave(); // Gom nhiều lần nộp bài vào 1 lần ghi DB
  });

  socket.on('disconnect', () => {
    const sbd = socket.data.sbd;
    if (sbd && students[sbd]) {
      if (students[sbd].socketId === socket.id) {
        students[sbd].online = false;
        students[sbd].socketId = null;
        broadcastState();
      }
    }
  });
});

// --- PHỤC VỤ FRONTEND TĨNH ---
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// BẮT TẤT CẢ CÁC ROUTE VÀ TRẢ VỀ INDEX.HTML (Hỗ trợ SPA React/Vue)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});