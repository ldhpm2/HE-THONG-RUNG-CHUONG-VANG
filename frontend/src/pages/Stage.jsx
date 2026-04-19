import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { MathJax } from 'better-react-mathjax';
import logoBell from '../assets/logo_bell.png';
import { QRCodeSVG } from 'qrcode.react';
import { Volume2, VolumeX, Camera, ScrollText, MessageSquare, Maximize, Minimize } from 'lucide-react';
import { isYouTubeURL, getYouTubeEmbedURL } from '../utils/videoUtils';

export default function Stage() {
  const [gameState, setGameState] = useState({
    phase: 'idle',
    gameMode: 'elimination',
    question: null,
    customMessage: '',
    students: JSON.parse(localStorage.getItem('stage_students') || '{}'),
    winners: [],
    isSoundEnabled: true
  });

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [webRtcConnected, setWebRtcConnected] = useState(false);
  const [lastFrame, setLastFrame] = useState(null);
  const pcRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const [timeLeft, setTimeLeft] = useState(0);
  const [isLocalAudioUnlocked, setIsLocalAudioUnlocked] = useState(() => {
    return sessionStorage.getItem('stage_audio_unlocked') === 'true';
  });
  
  const [isFullscreen, setIsFullscreen] = useState(false);

  const audioCtxRef = useRef(null);
  const scheduledTicksRef = useRef([]);
  const timerEndRef = useRef(null);   
  const lastScheduledRef = useRef(null); 
  const mediaRef = useRef(null);        
  const rafRef = useRef(null);         

  const [fontSizeModifier, setFontSizeModifier] = useState(0);
  const [introMediaData, setIntroMediaData] = useState(null); 
  const introMediaRef = useRef(null); 
  const [victoryMediaData, setVictoryMediaData] = useState(null); 
  const victoryMediaRef = useRef(null);

  // Xử lý sự kiện thay đổi trạng thái Fullscreen bằng phím ESC
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Lỗi khi mở toàn màn hình: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    socket.on('stage:change_font_size', (data) => {
      setFontSizeModifier(prev => {
        if (data.action === 'increase') return prev + 1;
        if (data.action === 'decrease') return prev - 1;
        if (data.action === 'reset') return 0;
        return prev;
      });
    });
    return () => socket.off('stage:change_font_size');
  }, []);

  useEffect(() => {
    setFontSizeModifier(0);
  }, [gameState.question?.id]);

  const playTick = (urgent = false) => {
    try {
      if (!isLocalAudioUnlocked) return;
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
      if (!isLocalAudioUnlocked) return;
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
        o2.start(gongT + delay); o2.stop(gongT + delay + 1.5);
      });
    } catch(e) {}
  };

  const playCorrect = () => {
    try {
      if (!isLocalAudioUnlocked) return;
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

  const playVictory = () => {
    try {
      if (!isLocalAudioUnlocked) return;
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;
      const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
      freqs.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq, t + i * 0.12);
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        g.gain.setValueAtTime(0, t + i * 0.12);
        g.gain.linearRampToValueAtTime(0.3, t + i * 0.12 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 1.2);
        o.connect(filter); filter.connect(g); g.connect(ctx.destination);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.2);
      });
    } catch(e) {}
  };

  const cancelAllTicks = () => {
    scheduledTicksRef.current.forEach(s => { try { s.stop(); } catch(_) {} });
    scheduledTicksRef.current = [];
  };

  const scheduleAllTicks = (durationSec, urgent5sec) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isLocalAudioUnlocked) return;
    
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

    const gongT = now + durationSec;
    [0, 0.55, 1.1].forEach((delay, wave) => {
      const baseFreq = 140 - wave * 8;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(baseFreq, gongT + delay);
      o.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, gongT + delay + 2);
      g.gain.setValueAtTime(0, gongT + delay);
      g.gain.linearRampToValueAtTime(0.8, gongT + delay + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, gongT + delay + 2.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(gongT + delay); o.stop(gongT + delay + 2.5);
      scheduledTicksRef.current.push(o);
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = baseFreq * 2.76;
      g2.gain.setValueAtTime(0, gongT + delay);
      g2.gain.linearRampToValueAtTime(0.35, gongT + delay + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.001, gongT + delay + 1.5);
      o2.connect(g2); g2.connect(ctx.destination);
      o2.start(gongT + delay); o2.stop(gongT + delay + 1.5);
      scheduledTicksRef.current.push(o2);
    });
  };

  const handleUnlockAudio = () => {
    if (isLocalAudioUnlocked && audioCtxRef.current?.state === 'running') return;
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    setIsLocalAudioUnlocked(true);
    sessionStorage.setItem('stage_audio_unlocked', 'true');
  };

  useEffect(() => {
    const handleGlobalClick = () => { if (!isLocalAudioUnlocked) handleUnlockAudio(); };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('touchstart', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };
  }, [isLocalAudioUnlocked]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (gameState.phase !== 'timer_running' || !timerEndRef.current) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [gameState.phase]);

  useEffect(() => {
     socket.on('game_state_update', (data) => {
        setGameState(prevState => {
          if (data.gamePhase === 'timer_running' && prevState.phase !== 'timer_running') {
             const duration = data.currentQuestion?.time || 15;
             timerEndRef.current = Date.now() + duration * 1000;
             setTimeLeft(duration);
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
            customMessage: data.customMessage || '',
            winners: data.winners || []
          };
        });
      });

     socket.on('intro:media_data', (data) => setIntroMediaData(data));
     socket.on('victory:media_data', (data) => setVictoryMediaData(data));

     return () => {
      socket.off('game_state_update');
      socket.off('intro:media_data');
      socket.off('victory:media_data');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cancelAllTicks();
    };
  }, [isLocalAudioUnlocked]);

  useEffect(() => {
    const media = introMediaRef.current;
    if (gameState.phase === 'showing_intro' && introMediaData && media) {
      media.currentTime = 0;
      media.play().catch(e => console.warn(e));
    } else if (media) {
      media.pause();
    }
  }, [gameState.phase, introMediaData]);

  useEffect(() => {
    const media = victoryMediaRef.current;
    if (gameState.phase === 'winner_declared' && victoryMediaData && media) {
      media.currentTime = 0;
      media.play().catch(e => console.warn(e));
    } else if (media) {
      media.pause();
      media.currentTime = 0;
    }
  }, [gameState.phase, victoryMediaData]);

  useEffect(() => {
    const shouldPlayTicks = gameState.phase === 'timer_running' && gameState.isSoundEnabled && isLocalAudioUnlocked && timerEndRef.current;
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

    if (mediaRef.current) {
      const isMuted = !gameState.isSoundEnabled;
      if (mediaRef.current.tagName === 'VIDEO' || mediaRef.current.tagName === 'AUDIO') {
        mediaRef.current.muted = isMuted;
      } else if (mediaRef.current.tagName === 'IFRAME') {
        const command = isMuted ? 'mute' : 'unmute';
        mediaRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: '' }), '*');
      }
    }
  }, [gameState.phase, gameState.isSoundEnabled, isLocalAudioUnlocked]);

  useEffect(() => {
    if (gameState.isSoundEnabled && isLocalAudioUnlocked) {
      socket.on('client_play_sound', (data) => {
         if (data === 'reveal_answer') playCorrect();
         if (data === 'victory') {
             if (!victoryMediaData) playVictory();
         }
      });
    }
    return () => socket.off('client_play_sound');
  }, [gameState.phase, gameState.isSoundEnabled, isLocalAudioUnlocked, victoryMediaData]);

  useEffect(() => {
    localStorage.setItem('stage_students', JSON.stringify(gameState.students));
  }, [gameState.students]);

  useEffect(() => {
    const handleStatus = (data) => {
      setIsCameraActive(data.active);
      if (!data.active) {
        setRemoteStream(null);
        setLastFrame(null);
        setWebRtcConnected(false);
        pendingCandidatesRef.current = [];
        if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      }
    };
    const handleFrame = (data) => setLastFrame(data);
    const handleSignal = async (data) => {
      try {
        if (!pcRef.current) {
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pcRef.current = pc;
          pendingCandidatesRef.current = [];
          pc.ontrack = (event) => setRemoteStream(event.streams[0]);
          pc.onicecandidate = (event) => { if (event.candidate) socket.emit('stage:camera_signal', { candidate: event.candidate }); };
          pc.oniceconnectionstatechange = () => {
             if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') setWebRtcConnected(true);
             else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') setWebRtcConnected(false);
          };
        }
        if (data.sdp) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socket.emit('stage:camera_signal', { sdp: answer });
          for (const candidate of pendingCandidatesRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch(_) {}
          }
          pendingCandidatesRef.current = [];
        } else if (data.candidate) {
          if (pcRef.current.remoteDescription) await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          else pendingCandidatesRef.current.push(data.candidate);
        }
      } catch (err) {}
    };

    socket.on('camera:status_update', handleStatus);
    socket.on('camera:frame_from_admin', handleFrame);
    socket.on('camera:signal_from_admin', handleSignal);

    return () => {
      socket.off('camera:status_update', handleStatus);
      socket.off('camera:frame_from_admin', handleFrame);
      socket.off('camera:signal_from_admin', handleSignal);
    };
  }, []);

  useEffect(() => {
    if (isCameraActive && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn('Stage video play failed:', e));
    }
  }, [remoteStream, isCameraActive]);

  const studentsList = Object.values(gameState.students).sort((a,b) => parseInt(a.sbd) - parseInt(b.sbd));
  const { phase, question } = gameState;

  const rulesElimination = [
    { icon: "📜", title: "Lấy câu hỏi", desc: "Hệ thống sẽ lần lượt đưa ra các câu hỏi trắc nghiệm hoặc tự luận ngắn." },
    { icon: "⏱️", title: "Trả lời", desc: "Thí sinh có từ 15 đến 60 giây (tùy câu) để nhập đáp án lên điện thoại." },
    { icon: "❌", title: "Loại trừ", desc: "Thí sinh trả lời sai hoặc không có đáp án khi hết giờ sẽ phải rời sân thi đấu." },
    { icon: "🎗️", title: "Cứu trợ", desc: "Trong một số giai đoạn, thí sinh bị loại trả lời câu hỏi phao cứu trợ để quay lại sàn." },
    { icon: "🏆", title: "Chiến thắng", desc: "Thí sinh duy nhất còn lại trên sàn thi đấu sẽ giành quyền Rung Chuông Vàng." },
    { icon: "📱", title: "Kết nối", desc: "Luôn đảm bảo thiết bị di động được kết nối mạng ổn định suốt quá trình thi." }
  ];

  const rulesAccumulation = [
    { icon: "📜", title: "Trọn vẹn", desc: "Tất cả thí sinh được tham gia trả lời toàn bộ câu hỏi của chương trình mà không bị loại." },
    { icon: "⏱️", title: "Trả lời", desc: "Thí sinh có từ 15 đến 60 giây (tùy câu) để nhập đáp án lên điện thoại di động." },
    { icon: "⭐", title: "Tích điểm", desc: "Mỗi câu trả lời ĐÚNG sẽ được hệ thống cộng 10 điểm. Trả lời sai không bị trừ điểm." },
    { icon: "📊", title: "Xếp hạng", desc: "Bảng điểm sẽ liên tục cập nhật thứ hạng của các thí sinh ngay sau mỗi câu hỏi." },
    { icon: "🏆", title: "Chiến thắng", desc: "Thí sinh có tổng điểm tích lũy cao nhất khi kết thúc chương trình sẽ giành chiến thắng." },
    { icon: "📱", title: "Kết nối", desc: "Luôn đảm bảo thiết bị di động được kết nối mạng ổn định suốt quá trình thi." }
  ];

  const currentRules = gameState.gameMode === 'accumulation' ? rulesAccumulation : rulesElimination;

  const renderMixedText = (text) => {
    if (!text) return null;
    const restoreLatex = (str) => typeof str === 'string' ? str.replace(/\f/g, '\\f').replace(/\v/g, '\\v') : str;
    
    const match = text.match(/^(Câu\s+\d+[\.:])\s*(.*)/si);
    if (match) {
        let restPart = restoreLatex(match[2]);
        if (!restPart.includes('$') && restPart.includes('\\')) restPart = `$${restPart}$`;
        return (
          <MathJax dynamic>
            <span className="whitespace-pre-wrap break-words"><span className="text-cyan-400 font-extrabold drop-shadow-md">{match[1]} </span>{restPart}</span>
          </MathJax>
        );
    }

    let processedText = restoreLatex(text);
    processedText = processedText.replace(/\$\$/g, '$');

    if (!processedText.includes('$') && processedText.includes('\\')) processedText = `$${processedText}$`;
    
    return (
      <MathJax dynamic>
          <span className="whitespace-pre-wrap break-words">
              {processedText}
          </span>
      </MathJax>
    );
  };

  let maxOptLengthForGrid = 0;
  let hasComplexMath = false;
  if (question) {
      ['A', 'B', 'C', 'D'].forEach(opt => {
          const optText = question[`option${opt}`] || '';
          if (optText.length > maxOptLengthForGrid) maxOptLengthForGrid = optText.length;
          if (optText.includes('\\int') || optText.includes('\\sum') || optText.includes('\\frac') || optText.includes('\\lim')) {
              hasComplexMath = true;
          }
      });
  }
  const isLongOption = maxOptLengthForGrid > 25 || hasComplexMath;

  const getUnifiedSizeStyle = (questionObj, modifier) => {
    let clampStr = 'clamp(1.8rem,4.5vh,3rem)';
    let lh = 1.5;

    if (questionObj) {
      const qLen = questionObj.content ? questionObj.content.length : 0;
      let maxOptLen = 0;
      ['A', 'B', 'C', 'D'].forEach(opt => {
          const optText = questionObj[`option${opt}`];
          if (optText && optText.length > maxOptLen) maxOptLen = optText.length;
      });

      const score = qLen + (maxOptLen * 2);
      const hasMedia = questionObj.mediaType !== 'none' && questionObj.mediaUrl;

      if (hasMedia) {
          lh = 1.4;
          if (score < 150) clampStr = 'clamp(1.4rem,3.5vh,2.3rem)';
          else if (score < 300) clampStr = 'clamp(1.2rem,3vh,1.9rem)';
          else clampStr = 'clamp(1rem,2.5vh,1.6rem)';
      } else if (isLongOption) {
          clampStr = 'clamp(1.2rem, 3.2vh, 2.2rem)';
          lh = 1.3;
      } else {
          if (score < 120) { clampStr = 'clamp(2.1rem,5vh,4rem)'; lh = 1.3; }
          else if (score < 250) { clampStr = 'clamp(1.8rem,4.5vh,3.2rem)'; lh = 1.4; }
          else if (score < 400) { clampStr = 'clamp(1.5rem,3.8vh,2.6rem)'; lh = 1.5; }
          else if (score < 600) { clampStr = 'clamp(1.3rem,3.2vh,2.1rem)'; lh = 1.5; }
          else { clampStr = 'clamp(1.1rem,2.8vh,1.8rem)'; lh = 1.5; }
      }
    }

    return {
      fontSize: modifier === 0 ? clampStr : `calc(${clampStr} + ${modifier * 0.25}rem)`,
      lineHeight: lh,
      transition: 'font-size 0.2s ease-out'
    };
  };

  const unifiedStyle = getUnifiedSizeStyle(question, fontSizeModifier);

  return (
    <div className="h-screen bg-[#020617] text-white flex flex-col font-sans overflow-hidden relative">
      
      {/* NÚT FULLSCREEN GÓC TRÊN TRÁI */}
      <button 
        onClick={toggleFullScreen}
        className="fixed top-4 left-4 md:top-6 md:left-6 z-[200] p-2 md:p-3 bg-slate-800/50 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-full backdrop-blur-md border border-slate-600/50 transition-all duration-300 shadow-lg group"
        title="Toàn màn hình (Nhấn ESC để thoát)"
      >
        {isFullscreen ? <Minimize size={24} className="group-hover:scale-110 transition-transform" /> : <Maximize size={24} className="group-hover:scale-110 transition-transform" />}
      </button>

      <style>{`
        .math-nowrap, .math-nowrap * {
            white-space: nowrap !important;
        }
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>

      <div className="hidden">
         {introMediaData && (introMediaData.type.startsWith('video') ? <video ref={introMediaRef} src={introMediaData.dataUrl} loop playsInline /> : <audio ref={introMediaRef} src={introMediaData.dataUrl} loop />)}
         {victoryMediaData && (victoryMediaData.type.startsWith('video') ? <video ref={victoryMediaRef} src={victoryMediaData.dataUrl} playsInline /> : <audio ref={victoryMediaRef} src={victoryMediaData.dataUrl} />)}
      </div>

      <header className="fixed top-0 left-0 w-full h-[85px] md:h-[110px] flex items-center justify-center bg-slate-950 shadow-[0_15px_40px_rgba(0,0,0,0.8)] border-b-2 border-slate-700 z-[100] backdrop-blur-md">
         <div className="flex items-center gap-6 md:gap-10">
            <motion.img src={logoBell} alt="Logo" className="w-10 h-10 md:w-16 md:h-16 lg:w-20 lg:h-20 drop-shadow-[0_0_25px_rgba(250,204,21,0.8)]" animate={{ rotate: [0, -10, 10, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}/>
            
            <h1 className="text-3xl md:text-5xl lg:text-6xl xl:text-[4.5rem] font-black italic tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-400 to-yellow-600 drop-shadow-[0_5px_20px_rgba(250,204,21,0.8)]">
              RUNG CHUÔNG VÀNG
            </h1>

            <motion.img src={logoBell} alt="Logo" className="w-10 h-10 md:w-16 md:h-16 lg:w-20 lg:h-20 drop-shadow-[0_0_25px_rgba(250,204,21,0.8)]" animate={{ rotate: [0, 10, -10, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}/>
         </div>
      </header>

      <div className="flex-1 flex flex-row pl-2 md:pl-3 pr-6 pb-6 pt-[85px] md:pt-[110px] gap-2 md:gap-3 relative overflow-hidden">
         <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
             <AnimatePresence mode="wait">
                {phase === 'showing_intro' && (
                  <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center relative overflow-hidden bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black rounded-b-3xl rounded-t-none border-x border-b border-slate-700 shadow-2xl">
                    <div className="absolute top-8 left-0 w-full z-20 flex flex-col items-center text-center">
                      <div className="bg-slate-900/80 border-y-2 border-yellow-500/50 px-16 py-3 shadow-[0_5px_30px_rgba(234,179,8,0.2)] backdrop-blur-md">
                         <h2 className="text-4xl md:text-5xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_2px_10px_rgba(250,204,21,0.5)] leading-none">Danh Sách Thí Sinh</h2>
                      </div>
                    </div>
                    <div className="flex-1 w-full max-w-6xl mt-32 overflow-hidden relative">
                      <motion.div initial={{ y: "100vh" }} animate={{ y: "-100%" }} transition={{ duration: Math.max(30, studentsList.length * 3.5), ease: "linear", repeat: Infinity, repeatDelay: 2 }} className="flex flex-col gap-8">
                        <div className="text-center py-10"><p className="text-yellow-500 text-2xl font-black uppercase tracking-[0.4em]">Sẵn sàng tham chiến</p></div>
                        {studentsList.map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between px-12 py-6 bg-slate-800/20 border-y border-yellow-500/10 backdrop-blur-sm rounded-xl">
                            <div className="flex items-center gap-8">
                              <span className="text-6xl font-black font-mono text-yellow-500 w-32">{s.sbd}</span>
                              <div className="flex flex-col">
                                <span className="text-6xl font-black text-white tracking-wide uppercase">{s.hoTen}</span>
                                <span className="text-2xl text-yellow-400/80 uppercase tracking-widest font-bold">Lớp: {s.lop || 'N/A'}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-xl font-bold text-yellow-500/80 uppercase tracking-widest mb-2">Mã tham gia</span>
                              <span className="text-6xl font-black font-mono text-white tracking-tighter bg-slate-900/80 px-8 py-4 rounded-xl border-2 border-slate-700 shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] min-w-[180px] text-center">{s.pin || '---'}</span>
                            </div>
                          </div>
                        ))}
                        <div className="mt-32 py-32 text-center flex flex-col items-center">
                          <div className="text-8xl mb-10">🔔</div>
                          <p className="text-5xl font-black text-white italic tracking-[0.2em] uppercase mb-4">Tất cả đã sẵn sàng!</p>
                          <p className="text-2xl text-yellow-500 font-black uppercase tracking-[0.4em] opacity-80">Hãy cùng chinh phục đỉnh cao</p>
                        </div>
                      </motion.div>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-10"></div>
                    <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-10"></div>
                  </motion.div>
                )}

                {phase === 'idle' && (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-800/80 rounded-b-3xl rounded-t-none border-x border-b border-slate-700 shadow-2xl backdrop-blur-md">
                        <div className="flex gap-16 items-center justify-center mb-12">
                           <div className="w-64 h-64 border-2 border-yellow-600/30 rounded-full flex items-center justify-center bg-slate-900/40 relative shadow-[0_0_100px_rgba(234,179,8,0.05)]">
                               <div className="w-56 h-56 border-4 border-yellow-500/80 rounded-full flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 shadow-inner">
                                  <motion.span animate={{ rotate: [0, -10, 10, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 3, delay: 1 }} className="text-8xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">🔔</motion.span>
                               </div>
                               <div className="absolute inset-0 border border-yellow-500/20 rounded-full scale-110"></div>
                               <div className="absolute inset-0 border border-yellow-500/10 rounded-full scale-125"></div>
                           </div>
                           <div className="bg-white p-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[6px] border-yellow-500 flex flex-col items-center transform hover:scale-105 transition-transform duration-500">
                             <div className="bg-white p-2 rounded-xl"><QRCodeSVG value={window.location.origin} size={200} /></div>
                             <div className="mt-3 w-full text-center"><p className="text-slate-900 font-black text-xl uppercase tracking-tighter">Quét mã để thi đấu</p></div>
                           </div>
                        </div>
                        <div className="text-center space-y-8">
                           <h2 className="text-[clamp(1.5rem,4vh,3.5rem)] font-black tracking-[0.25em] text-white uppercase drop-shadow-lg">Hãy Tập Trung Khoảnh Khắc <br /> Bắt Đầu</h2>
                           <div className="flex flex-col items-center gap-6">
                                <div className="flex justify-center">
                                  <button onClick={(e) => { e.stopPropagation(); handleUnlockAudio(); sessionStorage.setItem('isLocalAudioUnlocked', 'true'); }} className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all duration-500 ${isLocalAudioUnlocked ? 'bg-green-950/20 border-green-500/50 text-green-400 group' : 'bg-amber-950/20 border-amber-500/50 text-amber-400 animate-pulse'}`}>
                                    {isLocalAudioUnlocked ? (<><Volume2 className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest">Âm thanh Sẵn sàng</span></>) : (<><VolumeX className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest italic">Nhấp bất kỳ để Kích hoạt âm thanh</span></>)}
                                  </button>
                                </div>
                                <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} className="text-yellow-500 text-xl font-mono tracking-[0.3em] opacity-80">{window.location.origin}</motion.p>
                           </div>
                        </div>
                    </motion.div>
                )}

                {phase === 'showing_rules' && (
                  <motion.div key="rules" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="w-full h-full flex flex-col items-center justify-center p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-black rounded-b-3xl rounded-t-none border-x border-b border-indigo-500/30 shadow-[0_0_100px_rgba(79,70,229,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
                       <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-600 rounded-full blur-[120px]"></div>
                       <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-600 rounded-full blur-[120px]"></div>
                    </div>
                    <div className="z-10 w-full max-w-4xl flex flex-col gap-2">
                        <div className="flex flex-col items-center text-center">
                           <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-indigo-600/20 p-2 rounded-2xl border border-indigo-500/50 mb-2"><ScrollText className="w-10 h-10 text-indigo-400" /></motion.div>
                            <h2 className="text-5xl font-black uppercase tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-400 drop-shadow-sm">Thể Lệ Cuộc Thi</h2>
                            <div className="h-1 w-32 bg-gradient-to-r from-transparent via-indigo-500 to-transparent rounded-full mt-3"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {currentRules.map((rule, i) => (
                             <motion.div key={i} initial={{ x: i % 2 === 0 ? -50 : 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 + (i * 0.1) }} className="flex items-start gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl hover:border-indigo-500/50 transition-colors group">
                               <span className="text-4xl filter grayscale group-hover:grayscale-0 transition-all">{rule.icon}</span>
                               <div className="flex flex-col">
                                 <h3 className="text-xl font-black text-indigo-300 uppercase tracking-wider mb-1">{rule.title}</h3>
                                 <p className="text-slate-400 leading-relaxed font-medium">{rule.desc}</p>
                               </div>
                             </motion.div>
                           ))}
                        </div>
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.2 }} className="text-center mt-2">
                           <p className="text-xl font-black italic text-yellow-500 uppercase tracking-[0.3em] bg-yellow-500/10 py-1 rounded-xl border border-yellow-500/20">Chúc các bạn bình tĩnh và tự tin!</p>
                        </motion.div>
                    </div>
                  </motion.div>
                )}

                {phase === 'showing_custom' && (
                  <motion.div key="custom" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full h-full flex flex-col items-center justify-center p-12 bg-slate-950 rounded-b-3xl rounded-t-none border-x border-b border-blue-500/20 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10 pointer-events-none">
                       <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600 rounded-full blur-[160px] opacity-20"></div>
                    </div>
                    <div className="z-10 w-full max-w-6xl flex flex-col items-center text-center">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12, delay: 0.2 }} className="mb-8 p-4 bg-blue-600/10 rounded-full border border-blue-500/30"><MessageSquare className="w-12 h-12 text-blue-400" /></motion.div>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="w-full">
                           <div 
                             className="inline-block font-black leading-tight text-white drop-shadow-2xl transition-all duration-300" 
                             style={fontSizeModifier !== 0 ? { fontSize: `calc(clamp(2.5rem, 6vh, 5rem) + ${fontSizeModifier * 0.25}rem)` } : { fontSize: 'clamp(2.5rem, 6vh, 5rem)' }}
                           >
                              {gameState.customMessage ? renderMixedText(gameState.customMessage) : <span className="opacity-50 italic text-slate-500 text-3xl">Đang chờ nội dung từ Ban tổ chức...</span>}
                           </div>
                        </motion.div>
                        <motion.div className="mt-16 h-1 w-32 bg-blue-500/30 rounded-full" animate={{ width: [64, 160, 64] }} transition={{ repeat: Infinity, duration: 4 }}/>
                    </div>
                  </motion.div>
                )}

                 {phase === 'winner_declared' && (
                  <motion.div key="winner" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} className="w-full h-full flex flex-col items-center justify-center p-12 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 rounded-b-3xl rounded-t-none border-x border-b border-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.3)] relative overflow-hidden">
                    {[...Array(20)].map((_, i) => (
                      <motion.div key={i} className="absolute w-3 h-3 rounded-sm" style={{ backgroundColor: ['#EAB308', '#3B82F6', '#EF4444', '#22C55E'][i % 4], top: '-5%', left: `${Math.random() * 100}%` }} animate={{ top: '105%', left: `${(Math.random() * 100)}%`, rotate: 360 }} transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2, ease: "linear" }}/>
                    ))}
                    <div className="z-10 flex flex-col items-center text-center">
                        <motion.div animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="relative mb-4">
                           <div className="absolute inset-0 bg-yellow-400 blur-3xl opacity-20 animate-pulse"></div>
                           <img src="/victory-bell.png" alt="Golden Bell" className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-[0_0_30px_rgba(234,179,8,0.8)]" onError={(e) => { e.target.onerror = null; e.target.src = "https://cdn-icons-png.flaticon.com/512/311/311081.png"; }}/>
                        </motion.div>
                        
                        <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="text-[clamp(2.5rem,6vh,4rem)] font-black uppercase text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-500 to-amber-700 tracking-tighter drop-shadow-2xl leading-normal py-3 mb-2">
                           Chúc Mừng Chiến Thắng!
                        </motion.h1>
                        
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-xl md:text-2xl font-bold text-yellow-500/80 italic tracking-widest uppercase mb-8">
                           {gameState.winners?.length > 1 ? 'Các Quán quân Rung Chuông Vàng' : 'Quán quân Rung Chuông Vàng'}
                        </motion.p>

                        {gameState.winners && gameState.winners.length > 0 && (
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }} 
                            transition={{ delay: 1.5, type: 'spring' }}
                            className="flex flex-wrap justify-center gap-6 mt-4 max-w-5xl"
                          >
                            {gameState.winners.map((w, idx) => (
                              <div key={idx} className="bg-slate-900/80 border-2 border-yellow-500 px-8 py-4 rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.5)] flex flex-col items-center">
                                <span className="text-4xl font-black text-yellow-400 mb-1">{w.sbd}</span>
                                <span className="text-2xl font-bold text-white uppercase whitespace-nowrap">{w.hoTen}</span>
                                <span className="text-sm text-slate-400 mt-1">{w.lop}</span>
                              </div>
                            ))}
                          </motion.div>
                        )}
                    </div>
                  </motion.div>
                )}

                {!['idle', 'showing_intro', 'showing_rules', 'showing_custom', 'winner_declared'].includes(phase) && (
                   <motion.div 
                     key={`question-${question?.id || 'none'}`} 
                     initial={{ opacity: 0, x: -100 }} 
                     animate={{ opacity: 1, x: 0 }} 
                     exit={{ opacity: 0, x: -100 }}
                     className="w-full h-full flex flex-col bg-slate-800/80 rounded-b-3xl rounded-t-none border-x border-b border-slate-700 p-6 pt-10 shadow-2xl backdrop-blur-md relative overflow-hidden"
                   >
                       <div className="absolute top-4 left-6 z-30">
                          {question?.isRescue && <div className="bg-purple-600 text-white px-6 py-2 rounded-full font-black shadow-lg border-2 border-purple-400 animate-pulse uppercase tracking-widest text-xl">Vòng Cứu Trợ</div>}
                          {question?.isAudience && <div className="bg-orange-600 text-white px-6 py-2 rounded-full font-black shadow-lg border-2 border-orange-400 animate-bounce uppercase tracking-widest text-xl">Câu Hỏi Khán Giả</div>}
                       </div>

                       <div className="absolute top-0 right-0 w-20 h-20 bg-slate-900/80 rounded-bl-3xl border-l border-b border-slate-600 flex items-center justify-center z-20 shadow-xl backdrop-blur-sm">
                          <span className={`text-4xl font-black font-mono tracking-tighter ${phase === 'timer_running' && timeLeft <= 5 ? 'text-red-500 animate-ping' : phase === 'timer_running' ? 'text-yellow-400' : 'text-slate-500'}`}>
                            {phase === 'timer_running' ? timeLeft : (phase === 'locked' || phase === 'answer_revealed' ? '00' : '⏳')}
                          </span>
                       </div>

                       <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full mt-4 px-2">
                           <div className="font-semibold text-slate-100 flex-shrink-0 whitespace-pre-wrap text-justify [text-align-last:center] max-w-[95%] px-6 w-full transition-all duration-300" style={unifiedStyle}>
                               {renderMixedText(question?.content)}
                           </div>
  
                           {question?.mediaType !== 'none' && question?.mediaUrl && (
                              <div className="w-full max-w-4xl mt-4 rounded-2xl overflow-hidden border border-slate-700 bg-black/40 flex items-center justify-center relative" style={{ height: '35vh', minHeight: '200px' }}>
                                 {question.mediaType === 'video' && (
                                    isYouTubeURL(question.mediaUrl) ? (
                                      <iframe ref={mediaRef} src={getYouTubeEmbedURL(question.mediaUrl, { mute: gameState.isSoundEnabled ? 0 : 1 })} className="w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="YouTube video"/>
                                    ) : (
                                      <video ref={mediaRef} src={question.mediaUrl} autoPlay loop muted={!gameState.isSoundEnabled} playsInline className="h-full w-full object-contain" />
                                    )
                                 )}
                                 {question.mediaType === 'image' && <img src={question.mediaUrl} alt="media" className="h-full w-full object-contain shadow-2xl" />}
                                 {question.mediaType === 'audio' && (
                                   <div className="flex flex-col items-center gap-4">
                                     <div className="p-8 bg-slate-900 rounded-full border-4 border-slate-700 animate-pulse"><span className="text-6xl">🎵</span></div>
                                     <audio src={question.mediaUrl} autoPlay controls muted={!gameState.isSoundEnabled} className="opacity-50 hover:opacity-100 transition-opacity" />
                                   </div>
                                 )}
                              </div>
                           )}
  
                           {question?.type === 'mcq' && (
                             <div className={`flex-shrink-0 grid ${isLongOption ? 'grid-cols-1 gap-2 md:gap-3' : 'grid-cols-2 gap-4'} mt-4 md:mt-6 w-full max-w-[95%]`}>
                                {['A', 'B', 'C', 'D'].map(opt => {
                                   const isCorrect = phase === 'answer_revealed' && question.correct === opt;
                                   const isRevealed = phase === 'answer_revealed';
                                   
                                   return (
                                     <div 
                                        key={opt} 
                                        className={`${isLongOption ? 'p-2 md:p-3' : 'p-3 md:p-4'} rounded-2xl border-4 flex flex-row items-center transition-all duration-500 overflow-hidden ${
                                          isCorrect ? 'bg-green-500 border-green-400 text-white shadow-[0_0_40px_rgba(34,197,94,0.6)] scale-[1.02]' :
                                          isRevealed ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-40 font-black' :
                                          'bg-slate-700/50 border-slate-600 text-slate-300'
                                        }`}
                                     >
                                        <div className={`flex-shrink-0 mr-3 md:mr-4 rounded-xl font-black shadow-md flex items-center justify-center ${isLongOption ? 'px-3 py-1' : 'px-4 py-2'} border-2 transition-all duration-300 ${isCorrect ? 'bg-white border-transparent text-green-600' : 'bg-slate-800 border-slate-600 text-yellow-400'}`} style={{ fontSize: `calc(clamp(1.5rem, 3.5vh, 2.5rem) + ${fontSizeModifier * 0.25}rem)` }}>{opt}</div>
                                        
                                        <div className={`text-left transition-all duration-300 flex-1 overflow-x-auto hide-scrollbar min-w-0 ${isCorrect ? 'text-white' : 'text-slate-100'}`} style={unifiedStyle}>
                                            {renderMixedText(question[`option${opt}`])}
                                        </div>
                                     </div>
                                   );
                                })}
                             </div>
                           )}
                           
                           {question?.type === 'short' && phase === 'answer_revealed' && (
                             <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex-shrink-0 self-center mt-6 px-12 py-4 bg-green-500 rounded-full border-4 border-green-400 shadow-[0_0_50px_rgba(34,197,94,0.6)] text-center">
                                <span className="text-green-900 font-bold uppercase tracking-widest block mb-1 text-sm">Đáp án chính xác</span>
                                <span className="leading-none font-black text-white text-6xl">{question.correct}</span>
                             </motion.div>
                           )}

                       </div>
                   </motion.div>
                )}
             </AnimatePresence>
         </div>

         <div className="w-[28%] md:w-1/4 flex-shrink-0 flex flex-col bg-slate-900/50 rounded-b-3xl rounded-t-none border-x border-b border-slate-800 p-3 shadow-2xl backdrop-blur-md overflow-hidden text-white">
             <div className="flex flex-col mb-4 flex-shrink-0">
               <h2 className="text-2xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 tracking-tight mb-3 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)] text-center w-full">
                 Sàn Thi Đấu
               </h2>
               <div className="flex justify-between items-center text-[10px] font-bold opacity-80 border-b border-slate-800 pb-2">
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div> Đang Thi</div>
                    {gameState.gameMode === 'elimination' && (
                       <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-red-900 shadow-[0_0_5px_rgba(153,27,27,0.5)]"></div> Loại</div>
                    )}
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.5)]"></div> Đăng Nhập</div>
                  </div>
                  <div className="bg-slate-800/50 px-2 py-0.5 rounded text-slate-300 font-mono">
                     {studentsList.length} Tổng / {studentsList.filter(s => s.online).length} Online
                  </div>
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar">
               <div className="grid grid-cols-6 gap-1 content-start font-sans">
                 {studentsList.length > 0 ? studentsList.map((st, i) => (
                   <motion.div
                     key={st.sbd}
                     initial={{ scale: 0.5, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: i * 0.002 }}
                     className={`aspect-square rounded-md flex items-center justify-center font-black text-[18px] md:text-[22px] border-2 transition-all duration-500 ${
                       gameState.gameMode === 'accumulation'
                         ? 'bg-blue-900/60 text-blue-100 border-blue-500/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]'
                         : (st.status === 'active' 
                             ? 'bg-green-500 text-green-950 border-green-400 shadow-[0_4px_10px_rgba(34,197,94,0.3)]' 
                             : 'bg-red-900 text-red-200 border-red-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]')
                     } ${phase === 'locked' && st.status==='active' && st.hasAnswered ? 'ring-2 ring-yellow-400 scale-110 z-10' : ''}`}
                   >
                     <div className="flex flex-col items-center leading-none mt-0.5">
                       <span>{st.sbd}</span>
                       {gameState.gameMode === 'accumulation' && (
                         <span className="text-[12px] text-yellow-400 mt-1 font-bold">{st.score || 0}đ</span>
                       )}
                       {st.online && <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full mt-0.5 shadow-[0_0_5px_rgba(250,204,21,0.8)]"></div>}
                     </div>
                     {st.status === 'active' && st.hasAnswered && phase !== 'idle' && (
                       <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-yellow-400 rounded-full translate-x-1/3 -translate-y-1/3 shadow-[0_0_8px_rgba(250,204,21,1)] border border-slate-900"></div>
                     )}
                   </motion.div>
                 )) : (
                   <div className="col-span-6 p-4 text-center text-slate-600 italic text-[10px]">Trống</div>
                 )}
               </div>
             </div>
         </div>
      </div>
      
      <div className="h-2 w-full bg-slate-900 border-t border-slate-800 flex-shrink-0">
         {phase === 'timer_running' && (
            <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: question.time || 15, ease: 'linear' }} className="h-full bg-gradient-to-r from-yellow-400 to-red-500" />
         )}
      </div>
      
      <AnimatePresence>
        {isCameraActive && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[200] bg-black flex items-center justify-center">
             {lastFrame && <img src={lastFrame} alt="Admin Live Feed" className={`absolute inset-0 w-full h-full object-contain ${webRtcConnected ? 'opacity-0 z-0' : 'opacity-100 z-10'}`} />}
             {remoteStream && <video ref={remoteVideoRef} autoPlay muted playsInline className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ${webRtcConnected ? 'opacity-100 z-20' : 'opacity-0 z-0'}`} />}
             {!lastFrame && !remoteStream && (
               <div className="flex flex-col items-center justify-center gap-4 text-white/50"><Camera size={48} className="animate-pulse" /><span className="text-xl font-bold tracking-widest">Đang khởi tạo camera...</span></div>
             )}
             <div className="absolute top-8 left-8 flex items-center gap-4 bg-red-600 px-6 py-2 rounded-full shadow-2xl animate-pulse z-50">
                <Camera className="text-white" size={24}/><span className="text-white font-black uppercase tracking-widest text-xl">TRỰC TIẾP TỪ BAN TỔ CHỨC</span>
             </div>
             <div className="absolute top-4 left-4 w-20 h-20 border-t-4 border-l-4 border-white/50 rounded-tl-3xl"></div>
             <div className="absolute top-4 right-4 w-20 h-20 border-t-4 border-r-4 border-white/50 rounded-tr-3xl"></div>
             <div className="absolute bottom-4 left-4 w-20 h-20 border-b-4 border-l-4 border-white/50 rounded-bl-3xl"></div>
             <div className="absolute bottom-4 right-4 w-20 h-20 border-b-4 border-r-4 border-white/50 rounded-br-3xl"></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}