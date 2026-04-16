import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { parseExcelStudentList, parseExcelQuestions } from '../utils/excelParser';
import { parseWordQuestions } from '../utils/wordParser';
import { pickAndDownloadDriveFile } from '../utils/googleDrivePicker';
import { Upload, Play, Square, Presentation, Eye, UserX, Activity, HeartHandshake, Trash2, XCircle, ChevronLeft, ChevronRight, Save, Plus, RotateCcw, FileDown, Camera, CameraOff, FolderOpen, Loader2, Volume2, VolumeX, Smartphone, ScrollText, MessageSquare, Trophy, Music } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { MathJax } from 'better-react-mathjax';
import { isYouTubeURL, getYouTubeEmbedURL } from '../utils/videoUtils';

export default function Admin() {
  const [isAdminLogged, setIsAdminLogged] = useState(() => localStorage.getItem('admin_logged') === 'true');
  const [password, setPassword] = useState(() => localStorage.getItem('admin_password') || '');
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  const [gameState, setGameState] = useState({
    phase: 'idle',
    gameMode: 'elimination',
    question: null,
    students: JSON.parse(localStorage.getItem('admin_students') || '{}'),
    isSoundEnabled: true
  });

  const [questionsList, setQuestionsList] = useState(() => {
    const saved = localStorage.getItem('admin_questions');
    return saved ? JSON.parse(saved) : [];
  });
  const [customText, setCustomText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem('admin_curr_idx');
    return saved ? parseInt(saved) : -1;
  });
  const [editingIndex, setEditingIndex] = useState(null);
  const [questionDraft, setQuestionDraft] = useState({
    content: '',
    type: 'mcq', 
    options: ['A', 'B', 'C', 'D'], 
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correct: 'A',
    mediaType: 'none', 
    mediaUrl: '',
    time: 40
  });

  const [driveStudentLoading, setDriveStudentLoading] = useState(false);
  const [driveQuestionLoading, setDriveQuestionLoading] = useState(false);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const localStreamRef = useRef(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameIntervalRef = useRef(null);
  
  const [introMediaFile, setIntroMediaFile] = useState(null); 
  const introMediaInputRef = useRef(null);
  const introAudioRef = useRef(null); 

  const [victoryMediaFile, setVictoryMediaFile] = useState(null); 
  const victoryMediaInputRef = useRef(null);
  const victoryAudioRef = useRef(null); 

  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const audioCtxRef = useRef(null);
  const scheduledTicksRef = useRef([]);
  const timerEndRef = useRef(null);      
  const lastScheduledRef = useRef(null); 
  const [serverInfo, setServerInfo] = useState({ ip: 'localhost', port: '4000', url: '' });
  
  const [sortMode, setSortMode] = useState('sbd'); 

  const playTick = (urgent = false) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;
      const dur = 0.025;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = urgent ? 3000 : 1800;
      bpf.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(urgent ? 2.5 : 1.5, t);
      src.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
      src.start(t); src.stop(t + dur);
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = urgent ? 1200 : 800;
      oscGain.gain.setValueAtTime(0.2, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(oscGain); oscGain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.07);
    } catch(e) {}
  };

  const playGong = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;
      [0, 0.55, 1.1].forEach((delay, wave) => {
        const baseFreq = 140 - wave * 8;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(baseFreq, t + delay);
        o.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, t + delay + 2);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.8, t + delay + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 2.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + delay); o.stop(t + delay + 2.5);
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = 'sine';
        o2.frequency.value = baseFreq * 2.76;
        g2.gain.setValueAtTime(0, t + delay);
        g2.gain.linearRampToValueAtTime(0.35, t + delay + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, t + delay + 1.5);
        o2.connect(g2); g2.connect(ctx.destination);
        o2.start(t + delay); o2.stop(t + delay + 1.5);
      });
    } catch(e) {}
  };

  const playCorrect = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, t + i * 0.11);
        g.gain.setValueAtTime(0, t + i * 0.11);
        g.gain.linearRampToValueAtTime(0.5, t + i * 0.11 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.45);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.45);
      });
    } catch(e) {}
  };

  const cancelAllTicks = () => {
    scheduledTicksRef.current.forEach(s => { try { s.stop(); } catch(_) {} });
    scheduledTicksRef.current = [];
  };

  const scheduleAllTicks = (durationSec, urgent5sec) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    cancelAllTicks();
    const now = ctx.currentTime;
    for (let i = 0; i < durationSec; i++) {
      const tOffset = i;
      const isUrgent = (durationSec - i) <= urgent5sec;
      const t = now + tOffset;
      const dur = 0.025;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < data.length; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (data.length * 0.3));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = isUrgent ? 3000 : 1800;
      bpf.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(isUrgent ? 2.5 : 1.5, t);
      src.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
      src.start(t); src.stop(t + dur);
      scheduledTicksRef.current.push(src);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = isUrgent ? 1200 : 800;
      oscGain.gain.setValueAtTime(0.2, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(oscGain); oscGain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.07);
      scheduledTicksRef.current.push(osc);
    }
  };

  const handleEnableAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setIsAudioEnabled(!isAudioEnabled);
  };

  useEffect(() => {
    const shouldPlayTicks = gameState.phase === 'timer_running' && isAudioEnabled && timerEndRef.current;
    if (shouldPlayTicks) {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      if (remaining > 0 && lastScheduledRef.current !== timerEndRef.current) {
        lastScheduledRef.current = timerEndRef.current;
        cancelAllTicks();
        scheduleAllTicks(remaining, 5);
      }
    } else {
      if (lastScheduledRef.current !== null) {
        lastScheduledRef.current = null;
        cancelAllTicks();
      }
    }
    if (isAudioEnabled && gameState.phase === 'answer_revealed') {
      cancelAllTicks();
      playCorrect();
    }
  }, [gameState.phase, isAudioEnabled]);
  
  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      const savedPass = localStorage.getItem('admin_password');
      if (savedPass) {
        socket.emit('admin:login', { password: savedPass }, (res) => {
          if (res.success) {
            setIsAdminLogged(true);
            setIsAdminAuthenticated(true);
          } else {
            setIsAdminAuthenticated(false);
          }
        });
        socket.emit('admin:get_server_info', (info) => {
          setServerInfo(info);
        });
      }
    };

    const handleDisconnect = () => {
       setIsConnected(false);
       setIsAdminAuthenticated(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) handleConnect();

    socket.on('admin_state_update', (data) => {
      setGameState(prevState => {
        if (data.gamePhase === 'timer_running' && prevState.phase !== 'timer_running') {
            const duration = data.currentQuestion?.time || 30; 
            timerEndRef.current = Date.now() + duration * 1000;
        }
        if (['locked', 'idle', 'question_sent', 'showing_intro', 'showing_rules', 'showing_custom'].includes(data.gamePhase)) {
            timerEndRef.current = null;
        }
        return {
          phase: data.gamePhase,
          gameMode: data.gameMode || 'elimination',
          question: data.currentQuestion,
          students: data.students,
          isSoundEnabled: data.isSoundEnabled,
          customMessage: data.customMessage || ''
        };
      });
    });

    socket.on('camera:signal_from_stage', async (data) => {
      if (!pcRef.current) return;
      if (data.sdp) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on('admin:mobile_upload_questions', (questions, callback) => {
      if (questions && questions.length > 0) {
        setQuestionsList(questions);
        setCurrentIndex(0);
        setQuestionDraft(questions[0]);
        if(callback) callback({ success: true });
      }
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('admin_state_update');
      socket.off('camera:signal_from_stage');
      socket.off('admin:mobile_upload_questions');
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (isCameraActive && localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(e => console.warn('Admin video play failed:', e));
    }
    if (!isCameraActive && localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [isCameraActive]);

  const stopCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    setIsCameraActive(false);
    socket.emit('admin:camera_status', { active: false });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: "environment" } }, 
        audio: true 
      }).catch(async () => {
        return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      });
      
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.warn('Admin video play failed:', e));
      }

      setIsCameraActive(true);
      socket.emit('admin:camera_status', { active: true });

      await new Promise(resolve => setTimeout(resolve, 300));
      if (!localStreamRef.current) return;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('admin:camera_signal', { candidate: event.candidate });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('admin:camera_signal', { sdp: offer });
    } catch (err) {
      alert('Không thể mở camera: ' + err.message);
    }
  };

  useEffect(() => {
    if (isCameraActive && localStreamRef.current) {
      frameIntervalRef.current = setInterval(() => {
        if (localVideoRef.current && canvasRef.current) {
          const canvas = canvasRef.current;
          const video = localVideoRef.current;
          if (video.videoWidth > 0 && video.readyState >= 2) {
            canvas.width = 240; 
            canvas.height = Math.round((video.videoHeight / video.videoWidth) * 240);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/jpeg', 0.4); 
            socket.emit('admin:camera_frame', data);
          }
        }
      }, 100);
    } else {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    }
    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [isCameraActive]);

  const toggleCamera = () => {
    if (isCameraActive) stopCamera();
    else startCamera();
  };

  useEffect(() => {
    localStorage.setItem('admin_questions', JSON.stringify(questionsList));
    localStorage.setItem('admin_curr_idx', currentIndex.toString());
    localStorage.setItem('admin_students', JSON.stringify(gameState.students));
  }, [questionsList, currentIndex, gameState.students]);

  const handleLogin = (e) => {
    e.preventDefault();
    socket.emit('admin:login', { password }, (res) => {
      if (res.success) {
        setIsAdminLogged(true);
        setIsAdminAuthenticated(true);
        localStorage.setItem('admin_logged', 'true');
        localStorage.setItem('admin_password', password);
      } else {
        setIsAdminAuthenticated(false);
        alert(res.message);
      }
    });
  };

  const handleStudentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const students = await parseExcelStudentList(file);
      if (students.length === 0) return alert('File không có dữ liệu hợp lệ');
      socket.emit('admin:upload_students', students, (res) => {
        if(res.success) {
          alert(`Đã tải lên ${res.count} thí sinh!`);
          e.target.value = ''; 
        } else {
          alert('Lỗi máy chủ: ' + (res.message || 'Không rõ nguyên nhân'));
        }
      });
    } catch(err) {
      alert('Lỗi đọc file Excel: ' + err.message);
      e.target.value = '';
    }
  };

  const handleQuestionUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      let questions = [];
      if (file.name.endsWith('.docx')) {
        questions = await parseWordQuestions(file);
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        questions = JSON.parse(text);
      } else {
        questions = await parseExcelQuestions(file);
      }
      
      questions = questions.map(q => {
        const currentQuestion = { ...q };
        if (isYouTubeURL(currentQuestion.mediaUrl)) {
          currentQuestion.mediaType = 'video';
        }
        return currentQuestion;
      });

      if (questions.length === 0) return alert('File không có dữ liệu câu hỏi hợp lệ');
      setQuestionsList(questions);
      if (questions.length > 0) {
        setCurrentIndex(0);
        setQuestionDraft(questions[0]);
      }
      alert(`Đã nạp ${questions.length} câu hỏi thành công!`);
      e.target.value = '';
    } catch(err) {
      alert('Lỗi nạp file: ' + err.message);
      e.target.value = '';
    }
  };

  const handleStudentFromDrive = async () => {
    setDriveStudentLoading(true);
    try {
      const file = await pickAndDownloadDriveFile({
        mimeTypes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
          'application/vnd.ms-excel', 
          'application/vnd.google-apps.spreadsheet' 
        ],
        title: 'Chọn file Danh Sách Thí Sinh từ Google Drive'
      });

      const students = await parseExcelStudentList(file);
      if (students.length === 0) {
        alert('File không có dữ liệu thí sinh hợp lệ. Kiểm tra lại cột SBD, HỌ TÊN, LỚP, MÃ PIN.');
        setDriveStudentLoading(false);
        return;
      }

      socket.emit('admin:upload_students', students, (res) => {
        if (res.success) {
          alert(`✅ Đã tải ${res.count} thí sinh từ Google Drive!`);
        } else {
          alert('Lỗi: ' + res.message);
        }
      });
    } catch (err) {
      if (err.message !== 'USER_CANCELLED') {
        if (err.message.includes('Chưa cấu hình Google API')) {
          alert(err.message);
        } else {
          alert('Lỗi tải file từ Google Drive: ' + err.message);
        }
      }
    } finally {
      setDriveStudentLoading(false);
    }
  };

  const handleQuestionFromDrive = async () => {
    setDriveQuestionLoading(true);
    try {
      const file = await pickAndDownloadDriveFile({
        mimeTypes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
          'application/vnd.ms-excel', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
          'application/json', 
          'application/vnd.google-apps.spreadsheet' 
        ],
        title: 'Chọn file Câu Hỏi từ Google Drive'
      });

      let questions = [];
      if (file.name.endsWith('.docx')) {
        questions = await parseWordQuestions(file);
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        questions = JSON.parse(text);
      } else {
        questions = await parseExcelQuestions(file);
      }

      questions = questions.map(q => ({
        ...q,
        mediaType: isYouTubeURL(q.mediaUrl) ? 'video' : q.mediaType
      }));

      if (questions.length === 0) {
        alert('File không có dữ liệu câu hỏi hợp lệ.');
        setDriveQuestionLoading(false);
        return;
      }

      setQuestionsList(questions);
      setCurrentIndex(0);
      setQuestionDraft(questions[0]);
      alert(`✅ Đã nạp ${questions.length} câu hỏi từ Google Drive thành công!`);
    } catch (err) {
      if (err.message !== 'USER_CANCELLED') {
        if (err.message.includes('Chưa cấu hình Google API')) {
          alert(err.message);
        } else {
          alert('Lỗi tải file từ Google Drive: ' + err.message);
        }
      }
    } finally {
      setDriveQuestionLoading(false);
    }
  };

  const exportQuestions = () => {
    if (questionsList.length === 0) return alert('Không có câu hỏi để lưu!');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(questionsList, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `bo-de-rung-chuong-vang-${new Date().toLocaleDateString()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleAddManualQuestion = () => {
    if (!questionDraft.content) return alert("Vui lòng nhập nội dung câu hỏi!");
    const newQuestion = { ...questionDraft, id: questionsList.length + 1 };
    setQuestionsList([...questionsList, newQuestion]);
    setCurrentIndex(questionsList.length); 
    alert(`Đã thêm Câu ${newQuestion.id} vào danh sách!`);
  };

  const handleUpdateQuestion = () => {
    if (editingIndex === null) return;
    const updatedList = [...questionsList];
    updatedList[editingIndex] = { ...questionDraft };
    setQuestionsList(updatedList);
    setEditingIndex(null);
    alert(`Đã cập nhật Câu ${questionDraft.id} thành công!`);
  };

  const handleMediaUrlChange = (value) => {
    let newDraft = { ...questionDraft, mediaUrl: value };
    if (isYouTubeURL(value)) {
      newDraft.mediaType = 'video';
    }
    setQuestionDraft(newDraft);
  };

  const navQuestion = (dir) => {
    if (questionsList.length === 0) return;
    let newIndex = currentIndex + dir;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= questionsList.length) newIndex = questionsList.length - 1;
    setCurrentIndex(newIndex);
    setQuestionDraft(questionsList[newIndex]);
  };

  const pushQuestion = () => {
    if(!questionDraft.content) return alert('Chưa nhập nội dung câu hỏi');
    socket.emit('admin:push_question', { question: questionDraft });
  };

  const showCustomContent = () => {
    if (!customText.trim()) {
      alert("Vui lòng nhập nội dung tùy chỉnh trước khi chiếu!");
      return;
    }
    socket.emit('admin:show_custom', { message: customText });
  };
  
  const startTimer = () => socket.emit('admin:start_timer');
  const lockAnswer = () => socket.emit('admin:lock');
  const revealAnswer = () => socket.emit('admin:reveal_answer');
  const resetStudent = (sbd) => socket.emit('admin:reset_student', { sbd });
  
  const declareWinner = () => {
    if(!window.confirm('Xác nhận CHÚC MỪNG CHIẾN THẮNG? Màn hình sẽ chuyển sang hiệu ứng vinh danh.')) return;
    if (victoryMediaFile) {
      socket.emit('admin:victory_media', victoryMediaFile);
    }
    socket.emit('admin:declare_winner');
  };

  const rescueSpecific = () => {
     const target = prompt('Nhập SBD các học sinh muốn cứu (cách nhau bởi dấu phẩy, vd: 111, 112):');
     if (!target) return;
     socket.emit('admin:rescue', { target }, (res) => {
        if(res.success) alert(`Đã cứu thành công ${res.count} thí sinh!`);
        else alert('Lỗi: ' + res.message);
     });
  };

  const rescueAll = () => {
     if(!window.confirm('Bạn có chắc chắn muốn cứu TẤT CẢ thí sinh đang bị loại?')) return;
     socket.emit('admin:rescue', { target: 'all' }, (res) => {
        if(res.success) alert(`Đã cứu tất cả ${res.count} thí sinh!`);
        else alert('Lỗi: ' + res.message);
     });
  };

  // SỬA LỖI TRUYỀN BLOB THÀNH BASE64
  const handleIntroMediaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      alert('Dung lượng file quá lớn! Vui lòng chọn file dưới 30MB để tránh kẹt mạng.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setIntroMediaFile({ name: file.name, type: file.type, dataUrl: event.target.result });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVictoryMediaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      alert('Dung lượng file quá lớn! Vui lòng chọn file dưới 30MB để tránh kẹt mạng.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setVictoryMediaFile({ name: file.name, type: file.type, dataUrl: event.target.result });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const showIntroWithMedia = () => {
    socket.emit('admin:show_intro');
    // GỬI FILE QUA MẠNG SANG STAGE
    if (introMediaFile) {
      socket.emit('admin:intro_media', introMediaFile);
    }
    // PHÁT TRÊN LOA CỦA ADMIN
    if (introMediaFile && introAudioRef.current) {
      introAudioRef.current.src = introMediaFile.dataUrl;
      introAudioRef.current.currentTime = 0;
      introAudioRef.current.play().catch(e => console.warn('Intro play blocked:', e));
    }
  };

  const setWelcome = () => socket.emit('admin:set_welcome');

  const clearStudents = () => {
    if(!window.confirm('CẢNH BÁO: Hành động này sẽ XÓA SẠCH danh sách thí sinh và reset trạng thái game. Bạn có chắc chắn?')) return;
    socket.emit('admin:clear_students', (res) => {
      if(res.success) alert('Đã xóa sạch danh sách thí sinh!');
    });
  };

  const rescueStudent = (sbd) => {
    socket.emit('admin:rescue', { target: sbd.toString() }, (res) => {
      if(!res.success) alert('Lỗi: ' + res.message);
    });
  };

  const eliminateStudent = (sbd) => {
    if(!window.confirm(`Bạn có chắc chắn muốn LOẠI thí sinh SBD ${sbd} khỏi cuộc thi?`)) return;
    socket.emit('admin:eliminate_student', { sbd }, (res) => {
      if(!res.success) alert('Lỗi: ' + res.message);
    });
  };

  const renderMixedText = (text) => {
    if (!text) return null;
    const restoreLatex = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/\f/g, '\\f').replace(/\v/g, '\\v');
    };
    let processedText = restoreLatex(text);
    if (!processedText.includes('$') && processedText.includes('\\')) {
       processedText = `$${processedText}$`;
    }
    return (
      <MathJax dynamic>
        <span className="whitespace-pre-wrap">{processedText}</span>
      </MathJax>
    );
  };

  if (!isAdminLogged) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-xl shadow-xl w-96 border border-slate-700">
          <h2 className="text-2xl text-white font-bold mb-4 text-center">Admin Login</h2>
          <input 
             type="password"
             value={password}
             onChange={e => setPassword(e.target.value)}
             className="w-full p-3 bg-slate-900 text-white rounded mb-4"
             placeholder="Mật khẩu (admin123)"
          />
          <button type="submit" className="w-full bg-blue-600 p-3 rounded text-white hover:bg-blue-700">Đăng Nhập</button>
        </form>
      </div>
    );
  }

  const studentList = Object.values(gameState.students).sort((a, b) => {
    if (sortMode === 'score') {
      if (b.score !== a.score) return b.score - a.score; 
      return parseInt(a.sbd) - parseInt(b.sbd); 
    }
    return parseInt(a.sbd) - parseInt(b.sbd); 
  });

  const activeCount = studentList.filter(s => s.status === 'active').length;
  const eliminatedCount = studentList.filter(s => s.status === 'eliminated').length;
  const onlineCount = studentList.filter(s => s.online).length;
  const submittedCount = studentList.filter(s => s.currentAnswer !== null).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 p-6 flex flex-col gap-6">
       
       <audio ref={introAudioRef} className="hidden" />
       <audio ref={victoryAudioRef} className="hidden" />

       <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-xs text-slate-400">Server: {isConnected ? 'Đã kết nối' : 'Mất kết nối'}</span>
             </div>
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isAdminAuthenticated ? 'bg-blue-500' : 'bg-yellow-500'}`}></div>
                <span className="text-xs text-slate-400">Quyền Admin: {isAdminAuthenticated ? 'Hiện diện' : 'Chưa xác thực'}</span>
             </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700/50">
                <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Chế độ thi:</span>
                <select 
                  value={gameState.gameMode}
                  onChange={(e) => {
                    if (gameState.phase !== 'idle') {
                      alert('Chỉ được đổi chế độ thi khi ở màn hình chờ (0. Bắt đầu)');
                      return;
                    }
                    socket.emit('admin:change_mode', { mode: e.target.value }, (res) => {
                      if(res && !res.success) alert(res.message);
                    });
                  }}
                  className="bg-slate-800 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded border border-slate-600 outline-none cursor-pointer"
                >
                  <option value="elimination">1. Loại Trực Tiếp</option>
                  <option value="accumulation">2. Tích Lũy Điểm</option>
                </select>
             </div>
             <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700/50">
                <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Cỡ chữ Stage:</span>
                <button onClick={() => socket.emit('admin:font_size', { action: 'decrease' })} className="w-7 h-7 rounded-full border border-slate-600 flex items-center justify-center hover:bg-slate-700 font-bold text-slate-300 transition-colors" title="Giảm cỡ chữ">A-</button>
                <button onClick={() => socket.emit('admin:font_size', { action: 'increase' })} className="w-7 h-7 rounded-full border border-slate-600 flex items-center justify-center hover:bg-slate-700 font-bold text-slate-300 transition-colors" title="Tăng cỡ chữ">A+</button>
                <button onClick={() => socket.emit('admin:font_size', { action: 'reset' })} className="text-[10px] ml-1 text-slate-500 hover:text-slate-300 underline">Reset</button>
             </div>
             <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                Hệ thống Rung Chuông Vàng v2.1
             </div>
          </div>
       </div>

       <div className="flex-1 flex flex-col md:flex-row gap-6">
      
      <div className="w-full md:w-1/3 flex flex-col gap-6">
        
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center"><Upload className="mr-2"/> Dữ Liệu Thí Sinh</h3>
          
          <div>
            <label className="block text-xs uppercase text-slate-500 font-bold mb-2 tracking-wider">📂 Từ thiết bị (Excel)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleStudentUpload} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer" />
          </div>

          <div className="mt-4">
            <label className="block text-xs uppercase text-slate-500 font-bold mb-2 tracking-wider">☁️ Từ Google Drive</label>
            <button onClick={handleStudentFromDrive} disabled={driveStudentLoading} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#1a73e8] hover:bg-[#1558b0] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all active:scale-95 shadow-md">
              {driveStudentLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang tải.....</> : <><FolderOpen className="w-4 h-4" /> Chọn file từ Google Drive</>}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700/50 flex justify-between">
            <span className="text-slate-400">Chỉ số:</span>
            <span className="text-white font-mono">{studentList.length} Tổng / {onlineCount} Online</span>
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg flex-1 overflow-y-auto max-h-[650px] custom-scrollbar">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black uppercase text-slate-500 tracking-wider">Mô-đun Câu Hỏi (Draft)</h3>
            <button onClick={() => { if(window.confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách câu hỏi đã tải?')) setQuestionsList([]); }} className="px-2 py-1 text-[10px] font-bold bg-red-900/30 text-red-500 hover:bg-red-900/50 rounded-md border border-red-900/30 transition flex items-center gap-1 uppercase">
              <Trash2 size={12}/> Xóa tất cả
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
             {editingIndex !== null ? (
               <button onClick={handleUpdateQuestion} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded-lg transition-all shadow-md active:scale-95 text-xs flex items-center justify-center gap-2">
                 <Save size={14}/> Lưu Thay Đổi
               </button>
             ) : (
               <button onClick={handleAddManualQuestion} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded-lg transition-all shadow-md active:scale-95 text-xs flex items-center justify-center gap-2">
                 <Plus size={14}/> Thêm câu mới
               </button>
             )}
             <button onClick={() => { setEditingIndex(null); setQuestionDraft({ content: '', type: 'mcq', options: ['A', 'B', 'C', 'D'], optionA: '', optionB: '', optionC: '', optionD: '', correct: 'A', mediaType: 'none', mediaUrl: '', time: 30 }); }} className="bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold py-2 px-3 rounded-lg transition-all shadow-md active:scale-95 text-xs flex items-center justify-center gap-2">
                <RotateCcw size={14}/> Làm mới
             </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
             <button onClick={exportQuestions} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-3 rounded-lg transition-all shadow-md active:scale-95 text-xs flex items-center justify-center gap-2">
                <FileDown size={14}/> Xuất File (Backup)
             </button>
             <label className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-3 rounded-lg transition-all shadow-md active:scale-95 text-xs flex items-center justify-center gap-2 cursor-pointer">
                <Upload size={14}/> Nạp thiết bị
                <input type="file" accept=".xlsx,.xls,.csv,.docx,.json" onChange={handleQuestionUpload} className="hidden" />
             </label>
          </div>

          <button onClick={handleQuestionFromDrive} disabled={driveQuestionLoading} className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-4 rounded-lg bg-[#1a73e8] hover:bg-[#1558b0] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-xs transition-all active:scale-95 shadow-md">
            {driveQuestionLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải từ Drive...</> : <><FolderOpen className="w-3.5 h-3.5" /> Nạp câu hỏi từ Google Drive</>}
          </button>

          {questionsList.length > 0 && (
             <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-xl mb-4 border border-slate-700/50">
                <button onClick={() => navQuestion(-1)} disabled={currentIndex <= 0} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-white font-bold transition flex items-center gap-2">
                   <ChevronLeft size={18}/> Lùi
                </button>
                <div className="text-center">
                   <span className="block text-[10px] uppercase text-slate-500 font-bold tracking-widest">Đang chọn</span>
                   <span className="text-white font-black">Câu {currentIndex + 1} / {questionsList.length}</span>
                </div>
                <button onClick={() => navQuestion(1)} disabled={currentIndex >= questionsList.length - 1} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-white font-bold transition flex items-center gap-2">
                   Tiến <ChevronRight size={18}/>
                </button>
             </div>
          )}
          <div className="space-y-4">
             <div>
               <label className="block text-xs uppercase text-slate-500 mb-1">Loại Câu</label>
               <select value={questionDraft.type} onChange={e => setQuestionDraft({...questionDraft, type: e.target.value})} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white">
                 <option value="mcq">Trắc nghiệm 4 đáp án</option>
                 <option value="short">Tự luận ngắn</option>
               </select>
             </div>
             
             <div>
               <label className="block text-xs uppercase text-slate-500 mb-1">Nội dung (Text/Toán học LaTeX)</label>
               <textarea rows="3" value={questionDraft.content} onChange={e => setQuestionDraft({...questionDraft, content: e.target.value})} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white" placeholder="VD: Tính diện tích tam giác... Có thể dùng \int_0^1 f(x)dx cho toán."/>
             </div>

             {questionDraft.type === 'mcq' && (
               <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900 border border-slate-700 rounded-lg">
                 <div><label className="block text-xs uppercase text-slate-500 mb-1">Phương án A</label><input type="text" value={questionDraft.optionA || ''} onChange={e=>setQuestionDraft({...questionDraft, optionA: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung A" /></div>
                 <div><label className="block text-xs uppercase text-slate-500 mb-1">Phương án B</label><input type="text" value={questionDraft.optionB || ''} onChange={e=>setQuestionDraft({...questionDraft, optionB: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung B" /></div>
                 <div><label className="block text-xs uppercase text-slate-500 mb-1">Phương án C</label><input type="text" value={questionDraft.optionC || ''} onChange={e=>setQuestionDraft({...questionDraft, optionC: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung C" /></div>
                 <div><label className="block text-xs uppercase text-slate-500 mb-1">Phương án D</label><input type="text" value={questionDraft.optionD || ''} onChange={e=>setQuestionDraft({...questionDraft, optionD: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung D" /></div>
               </div>
             )}

             <div className="flex gap-2">
                <div className="w-1/2"><label className="block text-xs uppercase text-slate-500 mb-1">Thời gian (s)</label><input type="number" value={questionDraft.time} onChange={e => setQuestionDraft({...questionDraft, time: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white" /></div>
                <div className="w-1/2"><label className="block text-xs uppercase text-slate-500 mb-1">Đáp án Đúng</label><input type="text" value={questionDraft.correct} onChange={e => setQuestionDraft({...questionDraft, correct: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white font-bold" /></div>
             </div>

             <div>
               <label className="block text-xs uppercase text-slate-500 mb-1">Đa Phương Tiện Định kèm</label>
               <div className="flex gap-2 mb-2">
                 <select value={questionDraft.mediaType} onChange={e => setQuestionDraft({...questionDraft, mediaType: e.target.value})} className="w-1/3 bg-slate-900 border border-slate-700 p-2 rounded text-white">
                   <option value="none">Không có</option>
                   <option value="image">Hình ảnh</option>
                   <option value="video">Video</option>
                   <option value="audio">Audio</option>
                 </select>
                  <input type="text" value={questionDraft.mediaUrl} onChange={e => handleMediaUrlChange(e.target.value)} placeholder="URL của file media hoặc YouTube link" className="w-2/3 bg-slate-900 border border-slate-700 p-2 rounded text-white" disabled={questionDraft.mediaType === 'none'}/>
                </div>
                {questionDraft.mediaType === 'video' && isYouTubeURL(questionDraft.mediaUrl) && (
                  <div className="mt-2 p-2 bg-slate-900/50 rounded border border-slate-700 text-xs text-yellow-500 font-mono break-all italic">YT detected: {questionDraft.mediaUrl}</div>
                )}
              </div>
          </div>
        </div>

        {questionsList.length > 0 && (
           <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg overflow-hidden flex flex-col max-h-[600px] mt-6">
             <h3 className="text-xl font-bold text-white mb-4">Danh Sách Kịch Bản ({questionsList.length} câu)</h3>
             <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 space-y-3">
               {questionsList.map((q, i) => (
                 <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-4 hover:border-blue-500 transition-colors flex flex-col gap-2 shadow-sm">
                    <div className="flex justify-between items-start">
                       <span className="font-bold text-yellow-500 text-lg">Câu {q.id}</span>
                       <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{q.time}s | Đ/A: {q.correct}</span>
                    </div>
                    <div className="text-sm text-slate-300 font-medium mb-1">
                       {renderMixedText(q.content)}
                    </div>
                    <div className="flex gap-2 mt-auto pt-2">
                       <button onClick={() => {
                          const fullQ = {...q, options: ['A','B','C','D']};
                          setQuestionDraft(fullQ);
                          socket.emit('admin:push_question', { question: fullQ, isRescue: false });
                       }} className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white py-2 px-2 rounded-lg flex-[1.5] flex items-center justify-center shadow-md whitespace-nowrap">
                          <Presentation className="w-3 h-3 mr-1"/> Chiếu Luôn
                       </button>
                        <button onClick={() => {
                           const fullQ = {...q, options: ['A','B','C','D']};
                           setQuestionDraft(fullQ);
                           setEditingIndex(i);
                           window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} className="text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 rounded-lg flex-[0.8]">
                           Sửa
                        </button>
                       <button onClick={() => {
                          const fullQ = {...q, options: ['A','B','C','D']};
                          setQuestionDraft(fullQ);
                          socket.emit('admin:push_question', { question: fullQ, isRescue: true });
                       }} className="text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white py-2 px-2 rounded-lg flex-[1.2] flex items-center justify-center shadow-md whitespace-nowrap">
                          Phao Cứu Trợ
                       </button>
                       <button onClick={() => {
                          const fullQ = {...q, options: ['A','B','C','D']};
                          setQuestionDraft(fullQ);
                          socket.emit('admin:push_question', { question: fullQ, isAudience: true });
                       }} className="text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white py-2 px-2 rounded-lg flex-[1.2] flex items-center justify-center shadow-md whitespace-nowrap">
                          Cho Khán Giả
                       </button>
                       <button onClick={() => {
                          if (window.confirm(`Xóa Câu ${q.id} khỏi danh sách?`)) setQuestionsList(prev => prev.filter((_, idx) => idx !== i));
                       }} className="text-sm font-semibold bg-red-900/50 hover:bg-red-800 text-red-200 py-2 px-3 rounded-lg border border-red-800 flex items-center justify-center">
                          <Trash2 className="w-4 h-4"/>
                       </button>
                    </div>
                 </div>
               ))}
             </div>
           </div>
        )}
      </div>

      <div className="w-full md:w-2/3 flex flex-col gap-6">
        
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
           <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center"><Activity className="mr-2 text-yellow-500"/> Workflow Điều Khiển</span>
              <span className="text-xs px-3 py-1 bg-slate-700 rounded-full">Phase: <span className="text-white font-bold">{gameState.phase}</span></span>
           </h3>
           
           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <button onClick={setWelcome} className="bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 border-slate-600 border-dashed">
                <Activity className="mb-2 text-yellow-400"/> 0. Bắt đầu
              </button>
              <button onClick={showIntroWithMedia} className="bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 border-slate-600">
                <HeartHandshake className="mb-2 text-pink-400"/> 0.5. Giới thiệu
                {introMediaFile && <span className="text-[8px] text-green-400 mt-1 truncate max-w-[80px]">🎵 {introMediaFile.name}</span>}
              </button>
              <button onClick={() => socket.emit('admin:show_rules')} className="bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 border-slate-600">
                <ScrollText className="mb-2 text-indigo-400"/> 0.6. Thể lệ
              </button>
              <button onClick={showCustomContent} className={`py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 ${gameState.phase === 'showing_custom' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                <MessageSquare className="mb-2 text-blue-400"/> 0.7. Chiếu nội dung
              </button>
              <button onClick={pushQuestion} className="bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl flex flex-col items-center justify-center font-semibold transition active:scale-95 shadow-lg">
                <Presentation className="mb-2"/> 1. Hiện Câu Hỏi
              </button>
              <button onClick={startTimer} disabled={gameState.phase !== 'question_sent'} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
                <Play className="mb-2"/> 2. Chạy Time
              </button>
              <button onClick={lockAnswer} disabled={gameState.phase !== 'timer_running'} className="bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl flex flex-col items-center justify-center font-semibold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
                <Square className="mb-2"/> 3. Khóa
              </button>
              <button onClick={revealAnswer} disabled={gameState.phase === 'idle' || gameState.phase === 'answer_revealed'} className="bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl flex flex-col items-center justify-center font-semibold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
                <Eye className="mb-2"/> 4. Mở Đáp Án
              </button>
              <button onClick={toggleCamera} className={`py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 ${isCameraActive ? 'bg-red-600 border-red-400 text-white animate-pulse' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
               {isCameraActive ? <CameraOff className="mb-2"/> : <Camera className="mb-2"/>}
                <span className="text-[10px] uppercase opacity-80">Máy Quay</span>
                {isCameraActive ? 'Tắt Camera' : 'Bật Camera'}
              </button>
              <button onClick={() => socket.emit('admin:toggle_sound')} className={`py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 ${gameState.isSoundEnabled ? 'bg-green-600 border-green-400 text-white' : 'bg-red-600 border-red-400 text-white'}`}>
                {gameState.isSoundEnabled ? <Volume2 className="mb-2"/> : <VolumeX className="mb-2"/>}
                <span className="text-[10px] uppercase opacity-80">Sân Khấu</span>
                {gameState.isSoundEnabled ? 'Loa: Đang Bật' : 'Loa: Đang Tắt'}
              </button>
              <button onClick={handleEnableAudio} className={`py-4 rounded-xl flex flex-col items-center justify-center font-bold transition active:scale-95 shadow-lg border-2 ${isAudioEnabled ? 'bg-slate-700 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                {isAudioEnabled ? <Volume2 className="mb-2"/> : <VolumeX className="mb-2"/>}
                <span className="text-[10px] uppercase opacity-80">Máy Admin (Loa này)</span>
                {isAudioEnabled ? 'Loa: Đang Bật' : 'Kích hoạt loa'}
              </button>
              <button onClick={declareWinner} className={`py-4 rounded-xl flex flex-col items-center justify-center font-black transition active:scale-95 shadow-lg border-2 border-yellow-500/50 ${gameState.phase === 'winner_declared' ? 'bg-yellow-600 text-white' : 'bg-gradient-to-b from-amber-600 to-yellow-600 text-white'} relative`}>
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce font-bold shadow-lg">WIN</div>
                <Trophy className="mb-2 w-6 h-6"/> CHÚC MỪNG CHIẾN THẮNG
                {victoryMediaFile && <span className="text-[8px] text-green-300 mt-1 truncate max-w-[80px]">🎵 {victoryMediaFile.name}</span>}
              </button>
           </div>
           
           <div className={`mt-4 p-2 bg-black rounded-lg border border-red-500/50 ${isCameraActive ? 'block' : 'hidden'}`}>
              <p className="text-[10px] text-red-500 font-bold uppercase mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span> Live Camera Preview</p>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-40 object-cover rounded" />
              <canvas ref={canvasRef} className="hidden" />
           </div>

           <div className="mt-6 border-t border-slate-700 pt-6">
               <h4 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center"><MessageSquare size={14} className="mr-2"/> Nội dung trình chiếu tùy chỉnh</h4>
               <textarea value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Nhập nội dung bất kỳ để chiếu lên màn hình Stage (hỗ trợ MathJax)..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none resize-none h-24 mb-3"/>
               <div className="flex gap-2">
                  <button onClick={showCustomContent} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-bold text-sm shadow-lg transition active:scale-95 flex items-center justify-center"><Presentation className="mr-2 w-4 h-4"/> Chiếu nội dung này</button>
                  <button onClick={() => setCustomText('')} className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg font-bold text-sm transition active:scale-95">Xóa</button>
               </div>
            </div>

             <div className="mt-6 border-t border-slate-700 pt-6">
                <h4 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center"><Music size={14} className="mr-2"/> Nhạc / Video Giới Thiệu</h4>
                <p className="text-xs text-slate-500 mb-2">Nạp file âm thanh hoặc video sẽ tự động phát khi bấm nút "Giới thiệu" trên Stage.</p>
                <div className="flex gap-2 items-center">
                   <label className="flex-1 bg-pink-600 hover:bg-pink-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-md active:scale-95 text-sm flex items-center justify-center gap-2 cursor-pointer">
                      <Music size={16}/> {introMediaFile ? 'Đổi file' : 'Chọn file âm thanh / video'}
                      <input ref={introMediaInputRef} type="file" accept="audio/*,video/*" onChange={handleIntroMediaUpload} className="hidden"/>
                   </label>
                   {introMediaFile && <button onClick={() => setIntroMediaFile(null)} className="px-3 py-2.5 bg-red-900/40 hover:bg-red-800 text-red-300 rounded-xl border border-red-800 text-sm font-bold transition active:scale-95">Xóa</button>}
                </div>
                {introMediaFile && <div className="mt-2 px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700 text-xs text-green-400 font-mono truncate flex items-center gap-2"><Music size={12}/> {introMediaFile.name}</div>}
             </div>

             <div className="mt-6 border-t border-slate-700 pt-6">
                <h4 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center"><Trophy size={14} className="mr-2 text-yellow-500"/> Nhạc Chúc Mừng Chiến Thắng</h4>
                <p className="text-xs text-slate-500 mb-2">Nạp file âm thanh sẽ tự động phát khi bấm nút "Chúc Mừng Chiến Thắng".</p>
                <div className="flex gap-2 items-center">
                   <label className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-md active:scale-95 text-sm flex items-center justify-center gap-2 cursor-pointer">
                      <Trophy size={16}/> {victoryMediaFile ? 'Đổi file' : 'Chọn file âm thanh / video'}
                      <input ref={victoryMediaInputRef} type="file" accept="audio/*,video/*" onChange={handleVictoryMediaUpload} className="hidden"/>
                   </label>
                   {victoryMediaFile && <button onClick={() => setVictoryMediaFile(null)} className="px-3 py-2.5 bg-red-900/40 hover:bg-red-800 text-red-300 rounded-xl border border-red-800 text-sm font-bold transition active:scale-95">Xóa</button>}
                </div>
                {victoryMediaFile && <div className="mt-2 px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700 text-xs text-yellow-400 font-mono truncate flex items-center gap-2"><Trophy size={12}/> {victoryMediaFile.name}</div>}
             </div>

            {gameState.gameMode === 'elimination' && (
              <div className="mt-6 border-t border-slate-700 pt-6 space-y-3">
                 <button onClick={rescueAll} className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white py-3 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg transition active:scale-95">
                    <HeartHandshake className="mr-2"/> CỨU TẤT CẢ ({eliminatedCount})
                 </button>
                 <button onClick={rescueSpecific} className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg flex items-center justify-center text-sm font-semibold transition active:scale-95">
                    Cứu theo SBD cụ thể
                 </button>
              </div>
            )}
        </div>

        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-6 px-4 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
               <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Server: Đã kết nối</div>
               <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Quyền Admin: Cho phép</div>
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Monitoring v2.4</div>
          </div>

          <div className="flex flex-col gap-6 h-full min-h-0">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-700 pb-4">
              <div className="flex items-center gap-4">
                 <h3 className="text-xl font-bold text-white flex items-center pr-4 border-r border-slate-700"><Activity className="mr-2 text-blue-400"/> Giám Sát Real-time</h3>
                 
                 <button 
                   onClick={() => setSortMode(prev => prev === 'sbd' ? 'score' : 'sbd')}
                   className={`p-1.5 rounded-lg transition-colors border flex items-center gap-1 text-xs font-bold uppercase tracking-tighter ${
                     sortMode === 'score' ? 'bg-yellow-500 text-slate-900 border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-slate-700 text-white border-slate-600 hover:bg-slate-600'
                   }`}
                 >
                    <Trophy size={14} /> {sortMode === 'score' ? 'Đang Xếp Hạng' : 'Lọc Bảng Điểm'}
                 </button>

                 <button onClick={clearStudents} className="p-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors border border-red-900/50 flex items-center gap-1 text-xs font-bold uppercase tracking-tighter"><Trash2 size={14} /> XÓA DS</button>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20 text-green-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></div>
                  Đang chơi: {activeCount}
                </div>
                {gameState.gameMode === 'elimination' && (
                  <div className="flex items-center px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20 text-red-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2"></div>
                    Đã loại: {eliminatedCount}
                  </div>
                )}
                <div className="flex items-center px-3 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/20 text-yellow-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mr-2"></div>
                  Đã nộp: {submittedCount} / {gameState.question?.isRescue ? eliminatedCount : gameState.question?.isAudience ? studentList.length : activeCount}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-slate-700/50 bg-slate-900/30 custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-300">
                 <thead className="bg-slate-900/80 border-b border-slate-700 sticky top-0 z-10 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-4">SBD</th>
                      <th className="px-5 py-4">Họ Tên</th>
                      <th className="px-5 py-4">Lớp</th>
                      <th className="px-5 py-4 text-yellow-400">Điểm</th>
                      <th className="px-5 py-4">PIN/Connect</th>
                      <th className="px-5 py-4">Trạng thái</th>
                      <th className="px-5 py-4 text-center">Đáp án nộp</th>
                      <th className="px-5 py-4 text-right">Hành động</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-700/30">
                    {studentList.map(s => (
                       <tr key={s.sbd} className={`hover:bg-slate-800/40 transition-colors ${s.status === 'eliminated' ? 'bg-red-900/5 opacity-60' : ''}`}>
                         <td className="px-5 py-4 font-mono font-bold text-white">{s.sbd}</td>
                         <td className="px-5 py-4 font-semibold text-slate-100">{s.hoTen}</td>
                         <td className="px-5 py-4 text-slate-400">{s.lop || 'N/A'}</td>
                         <td className="px-5 py-4 font-bold text-yellow-400">{s.score || 0}</td>
                         <td className="px-5 py-4">
                           <div className="flex items-center">
                             <div className={`w-2 h-2 rounded-full mr-2 ${s.online ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-600'}`}></div>
                             <span className="font-mono text-slate-300">{s.pin}</span>
                           </div>
                         </td>
                         <td className="px-5 py-4">
                            <span className={`px-2 py-1 text-[10px] rounded uppercase font-black tracking-widest border ${s.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                              {s.status === 'active' ? 'Trong sân' : 'Đã loại'}
                            </span>
                         </td>
                         <td className="px-5 py-4 text-center">
                            {s.currentAnswer !== null ? <div className="inline-block px-3 py-1 bg-yellow-500 text-slate-900 rounded-lg font-black text-lg shadow-lg"> {s.currentAnswer} </div> : <span className="text-slate-700 font-bold">-</span>}
                         </td>
                         <td className="px-5 py-4 text-right space-x-3">
                            <button onClick={() => resetStudent(s.sbd)} title="Reset Connect" className="text-slate-500 hover:text-blue-400 transition-colors"><Activity size={18}/></button>
                             {s.status === 'eliminated' ? (
                                <button onClick={() => rescueStudent(s.sbd)} title="Cứu thí sinh này vào thi đấu" className="text-pink-500 hover:text-pink-400 transition-colors animate-pulse inline-flex items-center"><HeartHandshake size={20}/></button>
                             ) : (
                                <button onClick={() => eliminateStudent(s.sbd)} title="Loại thí sinh này (vi phạm quy chế)" className="text-slate-500 hover:text-red-500 transition-colors inline-flex items-center"><XCircle size={18}/></button>
                             )}
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
}