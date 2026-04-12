const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// --- GAME STATE ---
let adminSocketId = null;
let students = {}; // Key: SBD, Value: { sbd, hoTen, lop, pin, status: 'active' | 'eliminated', currentAnswer: null, socketId: null, online: false }
let currentQuestion = null;
let gamePhase = 'idle'; // 'idle', 'question_sent', 'timer_running', 'locked', 'answer_revealed'

// Khởi tạo server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});

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
      hasAnswered: students[sbd].currentAnswer !== null
    };
  }
  io.emit('game_state_update', {
    gamePhase,
    currentQuestion: currentQuestion ? { ...currentQuestion, correct: gamePhase === 'answer_revealed' ? currentQuestion.correct : null } : null,
    students: publicStudents
  });
  
  if (adminSocketId) {
    // Admin gets full view including what answers are
    io.to(adminSocketId).emit('admin_state_update', {
      gamePhase,
      currentQuestion,
      students
    });
  }
};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // --- ADMIN EVENTS ---
  socket.on('admin:login', (data, callback) => {
    if (data.password === 'admin123') {
      adminSocketId = socket.id;
      console.log(`[Admin] Login Success: ${socket.id}`);
      if(callback) callback({ success: true });
      broadcastState();
    } else {
      if(callback) callback({ success: false, message: 'Sai mật khẩu Admin' });
    }
  });

  socket.on('admin:upload_students', (data, callback) => {
    if (socket.id !== adminSocketId) return;
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
    console.log(`[Admin] Uploaded ${data.length} students`);
    if(callback) callback({ success: true, count: data.length });
    broadcastState();
  });

  socket.on('admin:clear_students', (callback) => {
    if (socket.id !== adminSocketId) return;
    students = {};
    gamePhase = 'idle';
    currentQuestion = null;
    console.log(`[Admin] Cleared all students and reset game state`);
    if(callback) callback({ success: true });
    broadcastState();
  });

  socket.on('admin:push_question', (data) => {
    if (socket.id !== adminSocketId) return;
    currentQuestion = { 
       ...data.question, 
       isRescue: !!data.isRescue,
       isAudience: !!data.isAudience 
    }; 

    gamePhase = 'question_sent';
    // Clear old answers
    for (const key in students) {
      students[key].currentAnswer = null;
    }
    broadcastState();
    io.emit('client_play_sound', 'question_show');
  });

  socket.on('admin:start_timer', () => {
    if (socket.id !== adminSocketId) return;
    gamePhase = 'timer_running';
    broadcastState();
    io.emit('client_play_sound', 'timer_start');
  });

  socket.on('admin:lock', () => {
    if (socket.id !== adminSocketId) return;
    gamePhase = 'locked';
    broadcastState();
    io.emit('client_play_sound', 'timeout');
  });

  socket.on('admin:reveal_answer', () => {
    if (socket.id !== adminSocketId) return;
    gamePhase = 'answer_revealed';
    
    // Auto Validate
    const correctAns = currentQuestion?.correct?.toString().toLowerCase().trim();
    console.log(`[Reveal] Correct Ans: ${correctAns}`);

    // Bỏ qua nếu là câu hỏi dành cho khán giả
    if (currentQuestion?.isAudience) {
       broadcastState();
       return;
    }

    for (const key in students) {
      const student = students[key];
      
      if (currentQuestion?.isRescue) {
         // --- LOGIC GIAI ĐOẠN CỨU TRỢ ---
         if (student.status === 'eliminated') {
            const studentAns = (student.currentAnswer || "").toString().toLowerCase().trim();
            if (studentAns && studentAns === correctAns) {
               console.log(`[Rescue] SBD ${student.sbd} correct! Status -> Active`);
               student.status = 'active'; // Hồi sinh
               if (student.socketId) io.to(student.socketId).emit('you_are_rescued');
            } else {
               // Vẫn bị loại
               if (student.socketId) io.to(student.socketId).emit('you_are_eliminated');
            }
         }
      } else {
         // --- LOGIC THI ĐẤU BÌNH THƯỜNG ---
         if (student.status === 'active') {
           const studentAns = (student.currentAnswer || "").toString().toLowerCase().trim();
           if (!studentAns || studentAns !== correctAns) {
             student.status = 'eliminated';
             if (student.socketId) {
               io.to(student.socketId).emit('you_are_eliminated');
             }
           } else {
              if (student.socketId) {
               io.to(student.socketId).emit('you_passed');
             }
           }
         }
      }
    }
    broadcastState();
    io.emit('client_play_sound', 'reveal_answer');
  });

  socket.on('admin:rescue', (data, callback) => {
    if (socket.id !== adminSocketId) {
        if(callback) callback({ success: false, message: 'Từ chối: Không có quyền Admin' });
        return;
    }
    const targetStr = (data.target || data.count || '').toString().toLowerCase().trim();
    console.log(`[Admin] Rescue command received: ${targetStr}`);
    
    const eliminatedList = Object.values(students).filter(s => s.status === 'eliminated');
    let rescued = [];

    if (targetStr === 'all') {
       rescued = eliminatedList;
    } else {
       // Target contains comma-separated SBDs (e.g. "111, 112")
       const sbdList = targetStr.split(',').map(s => s.trim());
       rescued = eliminatedList.filter(s => sbdList.includes(s.sbd.toString().toLowerCase().trim()));
    }
    
    rescued.forEach(s => {
      s.status = 'active';
      if (s.socketId) io.to(s.socketId).emit('you_are_rescued');
    });

    gamePhase = 'idle'; // Reset về không thi đấu cho ván mới
    currentQuestion = null;
    for (const key in students) {
      students[key].currentAnswer = null;
    }
    
    console.log(`[Admin] Rescued ${rescued.length} students`);
    if(callback) callback({ success: true, count: rescued.length });
    broadcastState();
    io.emit('client_play_sound', 'rescue_success');
  });

  socket.on('admin:eliminate_student', (data, callback) => {
    if (socket.id !== adminSocketId) {
       if(callback) callback({ success: false, message: 'Bạn không có quyền Admin' });
       return;
    }
    const { sbd } = data;
    if (students[sbd]) {
      students[sbd].status = 'eliminated';
      if (students[sbd].socketId) io.to(students[sbd].socketId).emit('you_are_eliminated');
      console.log(`[Admin] Manually eliminated SBD: ${sbd}`);
      if(callback) callback({ success: true });
      broadcastState();
    } else {
      if(callback) callback({ success: false, message: 'Số báo danh không tồn tại' });
    }
  });

  socket.on('admin:reset_student', (data) => {
    if (socket.id !== adminSocketId) return;
    const { sbd } = data;
    if (students[sbd]) {
      console.log(`[Admin] Reset student SBD: ${sbd}`);
      if (students[sbd].socketId) io.to(students[sbd].socketId).disconnect(true);
      students[sbd].socketId = null;
      students[sbd].online = false;
      broadcastState();
    }
  });

  // --- CLIENT EVENTS ---
  socket.on('student:login', (data, callback) => {
    const { sbd, pin } = data;
    const student = students[sbd];
    
    if (!student) {
      if(callback) callback({ success: false, message: 'Số báo danh không tồn tại' });
      return;
    }
    if (student.pin.toString() !== pin.toString()) {
      if(callback) callback({ success: false, message: 'Mã PIN không hợp lệ' });
      return;
    }
    
    // Nếu có đăng nhập ở nơi khác thỉ disconnect user đó
    if (student.socketId && student.socketId !== socket.id) {
       io.to(student.socketId).emit('force_logout', { message: 'Tài khoản được đăng nhập ở nơi khác' });
       io.to(student.socketId).disconnect(true);
    }

    student.socketId = socket.id;
    student.online = true;
    socket.data.sbd = sbd; // Gắn identifier vào socket object

    if(callback) callback({ 
      success: true, 
      student: {sbd: student.sbd, hoTen: student.hoTen, lop: student.lop, status: student.status} 
    });
    
    broadcastState(); // Báo cho admin biết hs đã online
  });

  socket.on('student:submit_answer', (data, callback) => {
    const sbd = socket.data.sbd;
    if (!sbd || !students[sbd]) return;
    
    // Chỉ nhận khi phase = timer_running hoặc question_sent
    if (gamePhase !== 'timer_running' && gamePhase !== 'question_sent') {
      if(callback) callback({ success: false, message: 'Không trong thời gian nộp bài' });
      return;
    }

    if (currentQuestion?.isRescue) {
       // Trong thời gian Cứu Trợ
       if (students[sbd].status === 'active') {
          if(callback) callback({ success: false, message: 'Bạn đang an toàn, không cần làm câu cứu trợ!' });
          return;
       }
    } else {
       // Trong thời gian Thi đấu bình thường
       if (students[sbd].status !== 'active') {
          if(callback) callback({ success: false, message: 'Bạn không có quyền nộp bài' });
          return;
       }
    }

    students[sbd].currentAnswer = data.answer;
    if(callback) callback({ success: true });
    
    // Update admin real-time
    if (adminSocketId) {
      io.to(adminSocketId).emit('admin_state_update', { gamePhase, currentQuestion, students });
    }
  });

  // Sự kiện check disconnect để báo Admin ai offline
  socket.on('disconnect', () => {
    if (socket.id === adminSocketId) {
      adminSocketId = null;
    }
    const sbd = socket.data.sbd;
    if (sbd && students[sbd]) {
      // Chỉ đánh dấu offline nếu không có socketId mới ghi đè
      if (students[sbd].socketId === socket.id) {
        students[sbd].online = false;
        students[sbd].socketId = null;
        broadcastState();
      }
    }
  });
});
