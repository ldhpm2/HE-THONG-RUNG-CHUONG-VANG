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
  maxHttpBufferSize: 50e6 // 50MB cho file media Base64
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rung_chuong_vang';
let isDbConnected = false;

const studentSchema = new mongoose.Schema({
  sbd: { type: String, unique: true, required: true },
  hoTen: String,
  lop: String,
  pin: String,
  status: { type: String, default: 'active' }, 
  score: { type: Number, default: 0 }, 
  currentAnswer: { type: String, default: null }
});
const Student = mongoose.model('Student', studentSchema);

const gameStateSchema = new mongoose.Schema({
  id: { type: String, default: 'main_state', unique: true },
  gamePhase: { type: String, default: 'idle' },
  gameMode: { type: String, default: 'elimination' }, 
  currentQuestion: { type: mongoose.Schema.Types.Mixed, default: null },
  customMessage: { type: String, default: '' },
  isSoundEnabled: { type: Boolean, default: true },
  winners: { type: Array, default: [] }
});
const GameState = mongoose.model('GameState', gameStateSchema);

let students = {};
let currentQuestion = null;
let customMessage = '';
let gamePhase = 'idle';
let gameMode = 'elimination'; 
let isSoundEnabled = true;
let winners = [];

let autoLockTimeout = null;

const clearAutoLock = () => {
  if (autoLockTimeout) {
    clearTimeout(autoLockTimeout);
    autoLockTimeout = null;
  }
};

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
      { gamePhase, gameMode, currentQuestion, customMessage, isSoundEnabled, winners },
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
          score: s.score,
          currentAnswer: s.currentAnswer
        },
        upsert: true
      }
    }));
    if (studentOps.length > 0) {
      await Student.bulkWrite(studentOps);
    }
  } catch (err) {
    console.error('[Persistence] Error saving:', err);
  }
};

const loadFullState = async () => {
  try {
    const gs = await GameState.findOne({ id: 'main_state' });
    if (gs) {
      gamePhase = gs.gamePhase;
      gameMode = gs.gameMode || 'elimination';
      currentQuestion = gs.currentQuestion;
      customMessage = gs.customMessage || '';
      isSoundEnabled = gs.isSoundEnabled;
      winners = gs.winners || [];
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
        score: s.score || 0,
        currentAnswer: s.currentAnswer,
        socketId: null,
        online: false
      };
    });
    broadcastState();
  } catch (err) {
    console.error('[Persistence] Error loading:', err);
  }
};

const connectDB = async () => {
  try {
    if (!MONGODB_URI || (!MONGODB_URI.startsWith('mongodb://') && !MONGODB_URI.startsWith('mongodb+srv://'))) {
      throw new Error('MONGODB_URI không hợp lệ.');
    }
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    isDbConnected = true;
    console.log('[MongoDB] Connected');
    await loadFullState();
  } catch (err) {
    isDbConnected = false;
    console.error('[MongoDB] Failed. In-Memory Mode:', err.message);
  }
};

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 4000;

const startServer = () => {
  server.keepAliveTimeout = 120000; 
  server.headersTimeout = 125000;   
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    connectDB();
  });
};
startServer();

const broadcastState = () => {
  const publicStudents = {};
  for (const sbd in students) {
    publicStudents[sbd] = {
      sbd: students[sbd].sbd,
      hoTen: students[sbd].hoTen,
      lop: students[sbd].lop,
      status: students[sbd].status,
      score: students[sbd].score,
      online: students[sbd].online,
      pin: students[sbd].pin,
      hasAnswered: students[sbd].currentAnswer !== null
    };
  }
  
  const payload = {
    gamePhase,
    gameMode,
    currentQuestion: currentQuestion ? { ...currentQuestion, correct: gamePhase === 'answer_revealed' ? currentQuestion.correct : null } : null,
    students: publicStudents,
    isSoundEnabled,
    customMessage,
    winners
  };

  io.emit('game_state_update', payload);

  io.to('admin_room').emit('admin_state_update', {
    gamePhase,
    gameMode,
    currentQuestion,
    customMessage,
    students,
    isSoundEnabled
  });
};

io.on('connection', (socket) => {
  broadcastState();

  socket.on('admin:login', (data, callback) => {
    if (data.password === 'admin123') {
      socket.join('admin_room');
      if (callback) callback({ success: true });
      broadcastState();
    } else {
      if (callback) callback({ success: false, message: 'Sai mật khẩu' });
    }
  });

  socket.on('admin:get_server_info', (callback) => {
    const ip = getLocalIP();
    if (callback) callback({ ip, port: PORT, url: `http://${ip}:${PORT}` });
  });

  socket.on('admin:change_mode', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) return;
    if (gamePhase !== 'idle') {
      if (callback) callback({ success: false, message: 'Chỉ được đổi chế độ khi đang ở màn hình chờ (Phase: idle)' });
      return;
    }
    gameMode = data.mode;
    await saveFullState();
    broadcastState();
    if (callback) callback({ success: true });
  });

  socket.on('admin:upload_students', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) return;
    try {
      if (isDbConnected) await Student.deleteMany({});
      students = {};
      data.forEach(s => {
        students[s.sbd] = { ...s, status: 'active', score: 0, currentAnswer: null, socketId: null, online: false };
      });
      if (callback) callback({ success: true, count: data.length });
      await saveFullState();
      broadcastState();
    } catch (error) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('admin:clear_students', async (callback) => {
    if (!socket.rooms.has('admin_room')) return;
    try {
      clearAutoLock();
      students = {};
      gamePhase = 'idle';
      currentQuestion = null;
      winners = [];
      if (isDbConnected) await Student.deleteMany({});
      if (callback) callback({ success: true });
      await saveFullState();
      broadcastState();
    } catch (error) {}
  });

  socket.on('admin:set_welcome', () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'idle';
    currentQuestion = null;
    winners = [];
    broadcastState();
  });

  socket.on('admin:show_intro', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'showing_intro';
    currentQuestion = null;
    await saveFullState();
    broadcastState();
  });

  socket.on('admin:show_rules', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'showing_rules';
    currentQuestion = null;
    await saveFullState();
    broadcastState();
  });

  socket.on('admin:show_custom', async (data) => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'showing_custom';
    customMessage = data.message || '';
    currentQuestion = null;
    await saveFullState();
    broadcastState();
  });

  socket.on('admin:push_question', async (data) => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    currentQuestion = { ...data.question, isRescue: !!data.isRescue, isAudience: !!data.isAudience };
    gamePhase = 'question_sent';
    for (const key in students) {
      students[key].currentAnswer = null;
    }
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'question_show');
  });

  socket.on('admin:start_timer', () => {
    if (!socket.rooms.has('admin_room')) return;
    gamePhase = 'timer_running';
    broadcastState();
    io.emit('client_play_sound', 'timer_start');

    clearAutoLock();
    const duration = currentQuestion?.time || 15;
    autoLockTimeout = setTimeout(async () => {
      if (gamePhase === 'timer_running') {
        gamePhase = 'locked';
        await saveFullState();
        broadcastState();
        io.emit('client_play_sound', 'timeout');
      }
    }, duration * 1000);
  });

  socket.on('admin:lock', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'locked';
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'timeout');
  });

  socket.on('admin:reveal_answer', async () => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    gamePhase = 'answer_revealed';
    
    const correctAns = currentQuestion?.correct?.toString().toLowerCase().trim();

    if (currentQuestion?.isAudience) {
      broadcastState();
      io.emit('client_play_sound', 'reveal_answer');
      return;
    }

    for (const key in students) {
      const student = students[key];
      const studentAns = (student.currentAnswer || '').toString().toLowerCase().trim();
      const isCorrect = studentAns && studentAns === correctAns;

      if (gameMode === 'accumulation') {
        if (student.status === 'active') {
           if (isCorrect) {
             student.score += 10;
             if (student.socketId) io.to(student.socketId).emit('you_passed');
           } else {
             if (student.socketId) io.to(student.socketId).emit('you_missed');
           }
        }
      } else {
        if (currentQuestion?.isRescue) {
          if (student.status === 'eliminated') {
            if (isCorrect) {
              student.score += 10; 
              student.status = 'active';
              if (student.socketId) io.to(student.socketId).emit('you_are_rescued');
            } else {
              if (student.socketId) io.to(student.socketId).emit('you_are_eliminated');
            }
          }
        } else {
          if (student.status === 'active') {
            if (!isCorrect) {
              student.status = 'eliminated';
              if (student.socketId) io.to(student.socketId).emit('you_are_eliminated');
            } else {
              student.score += 10; 
              if (student.socketId) io.to(student.socketId).emit('you_passed');
            }
          }
        }
      }
    }
    
    await saveFullState();
    broadcastState();
    io.emit('client_play_sound', 'reveal_answer');
  });

  socket.on('admin:rescue', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) return;
    clearAutoLock();
    const targetStr = (data.target || '').toString().toLowerCase().trim();
    const eliminatedList = Object.values(students).filter(s => s.status === 'eliminated');
    let rescued = targetStr === 'all' ? eliminatedList : eliminatedList.filter(s => targetStr.split(',').map(x=>x.trim()).includes(s.sbd.toString().toLowerCase().trim()));

    rescued.forEach(s => {
      s.status = 'active';
      if (s.socketId) io.to(s.socketId).emit('you_are_rescued');
    });

    gamePhase = 'idle';
    currentQuestion = null;
    for (const key in students) students[key].currentAnswer = null;

    if (callback) callback({ success: true, count: rescued.length });
    await saveFullState();
    broadcastState();
  });

  socket.on('admin:font_size', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    io.emit('stage:change_font_size', data);
  });

  socket.on('admin:reset_student', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    if (students[data.sbd]) {
      if (students[data.sbd].socketId) io.to(students[data.sbd].socketId).disconnect(true);
      students[data.sbd].socketId = null;
      students[data.sbd].online = false;
      broadcastState();
    }
  });

  socket.on('admin:intro_media', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    socket.broadcast.emit('intro:media_data', data);
  });

  socket.on('admin:victory_media', (data) => {
    if (!socket.rooms.has('admin_room')) return;
    socket.broadcast.emit('victory:media_data', data);
  });

  socket.on('student:login', (data, callback) => {
    const student = students[data.sbd];
    if (!student || student.pin.toString() !== data.pin.toString()) {
      if (callback) callback({ success: false, message: 'Sai SBD hoặc Mã PIN' });
      return;
    }

    if (student.socketId && student.socketId !== socket.id) {
      io.to(student.socketId).emit('force_logout', { message: 'Đăng nhập ở nơi khác' });
      io.to(student.socketId).disconnectSockets(true);
    }

    student.socketId = socket.id;
    student.online = true;
    socket.data.sbd = data.sbd;

    if (callback) callback({ success: true, student: { sbd: student.sbd, hoTen: student.hoTen, status: student.status, score: student.score } });
    broadcastState();
  });

  socket.on('student:submit_answer', async (data, callback) => {
    const sbd = socket.data.sbd;
    if (!sbd || !students[sbd]) return;

    if (gamePhase !== 'timer_running') {
      if (callback) callback({ success: false, message: 'Hết giờ!' });
      return;
    }

    if (gameMode === 'elimination') {
      if (currentQuestion?.isRescue) {
        if (students[sbd].status === 'active') {
          if (callback) callback({ success: false, message: 'Bạn đang an toàn' });
          return;
        }
      } else {
        if (students[sbd].status !== 'active') {
          if (callback) callback({ success: false, message: 'Bạn đã bị loại' });
          return;
        }
      }
    }

    students[sbd].currentAnswer = data.answer;
    if (callback) callback({ success: true });

    io.to('admin_room').emit('admin_state_update', { gamePhase, currentQuestion, students });
    debouncedSave(); 
  });

  socket.on('disconnect', () => {
    const sbd = socket.data.sbd;
    if (sbd && students[sbd] && students[sbd].socketId === socket.id) {
      students[sbd].online = false;
      students[sbd].socketId = null;
      broadcastState();
    }
  });

  socket.on('admin:eliminate_student', async (data, callback) => {
    if (!socket.rooms.has('admin_room')) return;
    if (students[data.sbd]) {
      students[data.sbd].status = 'eliminated';
      if (students[data.sbd].socketId) io.to(students[data.sbd].socketId).emit('you_are_eliminated');
      if (callback) callback({ success: true });
      await saveFullState();
      broadcastState();
    }
  });

  socket.on('admin:camera_signal', (data) => socket.broadcast.emit('camera:signal_from_admin', data));
  socket.on('stage:camera_signal', (data) => io.to('admin_room').emit('camera:signal_from_stage', data));
  socket.on('admin:camera_status', (data) => io.emit('camera:status_update', data));
  socket.on('admin:camera_frame', (data) => socket.broadcast.emit('camera:frame_from_admin', data));
  socket.on('admin:toggle_sound', () => { isSoundEnabled = !isSoundEnabled; broadcastState(); });

  socket.on('admin:declare_winner', async () => { 
    clearAutoLock(); 
    gamePhase = 'winner_declared'; 
    currentQuestion = null; 
    
    let maxScore = -1;
    for (const key in students) {
      if (students[key].score > maxScore) {
        maxScore = students[key].score;
      }
    }
    
    let topStudents = [];
    if (maxScore >= 0) {
      for (const key in students) {
        if (students[key].score === maxScore) {
          topStudents.push({ sbd: students[key].sbd, hoTen: students[key].hoTen, lop: students[key].lop });
        }
      }
    }
    winners = topStudents;

    await saveFullState(); 
    broadcastState(); 
    io.emit('client_play_sound', 'victory'); 
  });
});

const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));
app.get(/.*/, (req, res) => { res.sendFile(path.join(distPath, 'index.html')); });