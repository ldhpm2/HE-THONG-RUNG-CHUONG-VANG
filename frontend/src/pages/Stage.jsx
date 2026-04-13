import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { MathJax } from 'better-react-mathjax';
import logoBell from '../assets/logo_bell.png';
import { QRCodeSVG } from 'qrcode.react';
import { Volume2, VolumeX, Camera, CameraOff } from 'lucide-react';
import { isYouTubeURL, getYouTubeEmbedURL } from '../utils/videoUtils';


export default function Stage() {
  const [gameState, setGameState] = useState({
    phase: 'idle', // idle, showing_intro, question_sent, timer_running, locked, answer_revealed
    question: null,
    students: {},
    isSoundEnabled: true
  });

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [webRtcConnected, setWebRtcConnected] = useState(false);
  const [lastFrame, setLastFrame] = useState(null);
  const pcRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [timeLeft, setTimeLeft] = useState(0);
  const [isLocalAudioUnlocked, setIsLocalAudioUnlocked] = useState(() => {
    // Thử khôi phục từ session (nếu admin vừa refresh trang)
    return sessionStorage.getItem('stage_audio_unlocked') === 'true';
  });
  const audioCtxRef = useRef(null);
  const scheduledTicksRef = useRef([]);
  const timerEndRef = useRef(null);   // timestamp (ms) khi hết giờ
  const lastScheduledRef = useRef(null); // Để tránh schedule lặp lại cho cùng 1 mốc thời gian
  const mediaRef = useRef(null);        // Ref cho YouTube iframe, Video hoặc Audio tag
  const rafRef = useRef(null);         // requestAnimationFrame id

  // Tieng TICK co hoc - khop 1 lan/giay voi dong ho
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
        o2.start(t + delay); o2.stop(t + delay + 1.5);
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

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setIsLocalAudioUnlocked(true);
    sessionStorage.setItem('stage_audio_unlocked', 'true');
    console.log('[Audio] Stage Audio Unlocked via Interaction');
  };

  // Lắng nghe click toàn màn hình để kích hoạt âm thanh tự động
  useEffect(() => {
    const handleGlobalClick = () => {
      if (!isLocalAudioUnlocked) {
        handleUnlockAudio();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('touchstart', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };
  }, [isLocalAudioUnlocked]);

  // ── RAF-based countdown: tính từ timestamp để tránh drift setInterval ────
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (gameState.phase !== 'timer_running' || !timerEndRef.current) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
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

          if (['locked', 'idle', 'question_sent', 'showing_intro'].includes(data.gamePhase)) {
             timerEndRef.current = null;
          }

          return {
            phase: data.gamePhase,
            question: data.currentQuestion,
            students: data.students,
            isSoundEnabled: data.isSoundEnabled
          };
        });
      });

     return () => {
      socket.off('game_state_update');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cancelAllTicks();
    };
  }, [isLocalAudioUnlocked]);

  // --- EFFECT: SELF-HEALING AUDIO SYNC -----------------------------------
  // Effect này đảm bảo âm thanh luôn khớp với trạng thái game, dù mở khóa muộn hay toggle admin
  useEffect(() => {
    // 1. Đồng bộ Tiếng Tích Tắc
    const shouldPlayTicks = gameState.phase === 'timer_running' && gameState.isSoundEnabled && isLocalAudioUnlocked && timerEndRef.current;

    if (shouldPlayTicks) {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      if (remaining > 0 && lastScheduledRef.current !== timerEndRef.current) {
        console.log(`[Audio] Auto-syncing ticks: ${remaining}s left`);
        lastScheduledRef.current = timerEndRef.current;
        cancelAllTicks();
        scheduleAllTicks(remaining, 5);
      }
    } else {
      if (lastScheduledRef.current !== null) {
        console.log(`[Audio] Stopping ticks`);
        lastScheduledRef.current = null;
        cancelAllTicks();
      }
    }

    // 2. Đồng bộ Video/YouTube (Không reload iframe)
    if (mediaRef.current) {
      const isMuted = !gameState.isSoundEnabled;
      console.log(`[Audio] Syncing Media Sound: ${isMuted ? 'MUTED' : 'UNMUTED'}`);
      
      // Nếu là Video/Audio tag chuẩn
      if (mediaRef.current.tagName === 'VIDEO' || mediaRef.current.tagName === 'AUDIO') {
        mediaRef.current.muted = isMuted;
      } 
      // Nếu là YouTube Iframe
      else if (mediaRef.current.tagName === 'IFRAME') {
        const command = isMuted ? 'mute' : 'unmute';
        mediaRef.current.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: command,
          args: ''
        }), '*');
      }
    }
  }, [gameState.phase, gameState.isSoundEnabled, isLocalAudioUnlocked]);

  // Dung dap an - Hiệu ứng này vẫn giữ riêng cho âm thanh kết quả
  useEffect(() => {
    if (gameState.isSoundEnabled && gameState.phase === 'answer_revealed' && isLocalAudioUnlocked) {
      cancelAllTicks();
      playCorrect();
    }
  }, [gameState.phase, gameState.isSoundEnabled, isLocalAudioUnlocked]);

  // --- DEDICATED CAMERA LISTENERS (Independent of Audio) ---
  useEffect(() => {
    const handleStatus = (data) => {
      setIsCameraActive(data.active);
      if (!data.active) {
        setRemoteStream(null);
        setLastFrame(null);
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
      }
    };

    const handleFrame = (data) => {
      setLastFrame(data);
    };

    const handleSignal = async (data) => {
      try {
        if (!pcRef.current) {
          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          });
          pcRef.current = pc;
          pc.ontrack = (event) => setRemoteStream(event.streams[0]);
          pc.onicecandidate = (event) => {
            if (event.candidate) socket.emit('stage:camera_signal', { candidate: event.candidate });
          };
          pc.oniceconnectionstatechange = () => {
             if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                setWebRtcConnected(true);
             } else {
                setWebRtcConnected(false);
             }
          };
        }

        if (data.sdp) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socket.emit('stage:camera_signal', { sdp: answer });
        } else if (data.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error("WebRTC Error:", err);
      }
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

  const renderMixedText = (text) => {
    if (!text) return null;
    
    // Khôi phục các ký tự thoát bị trình duyệt hiểu nhầm (VD: \v trong \vec, \f trong \forall)
    const restoreLatex = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/\f/g, '\\f').replace(/\v/g, '\\v');
    };

    let processedText = restoreLatex(text);

    // Tự động nhận diện công thức: Nếu có dấu \ nhưng thiếu dấu $, tự động bao quanh $
    if (!processedText.includes('$') && processedText.includes('\\')) {
       processedText = `$${processedText}$`;
    }

    return (
      <MathJax dynamic>
        <span className="whitespace-pre-wrap">{processedText}</span>
      </MathJax>
    );
  };

  // Tính toán kích thước chữ nội dung câu hỏi (Sử dụng clamp để tự động thích ứng - Đã tăng size)
  const getDynamicFontSize = (textLength) => {
    if (!textLength) return 'text-[clamp(1.8rem,5vh,4rem)]';
    if (textLength <= 150) return 'text-[clamp(1.5rem,5.5vh,4.2rem)] leading-[1.1] font-black';
    if (textLength <= 300) return 'text-[clamp(1.3rem,4.5vh,3.5rem)] leading-[1.2] font-extrabold';
    if (textLength <= 500) return 'text-[clamp(1.2rem,3.8vh,2.8rem)] leading-snug';
    return 'text-[clamp(1rem,3vh,2.2rem)] leading-snug';
  };

  // Tính toán kích thước chữ phương án (Đã tăng size)
  const getDynamicOptionSize = (textLength) => {
    if (!textLength) return 'text-[clamp(1rem,3vh,2rem)]';
    if (textLength <= 40) return 'text-[clamp(1.5rem,4vh,2.8rem)] leading-tight font-bold';
    if (textLength <= 90) return 'text-[clamp(1.2rem,3.5vh,2.2rem)] leading-snug';
    return 'text-[clamp(1rem,2.8vh,1.8rem)] leading-snug';
  };

  return (
    <div className="h-screen bg-[#020617] text-white flex flex-col font-sans overflow-hidden">
      
      {/* HEADER LOGO - SINGLE & HIGHEST PRIORITY */}
      <header className="fixed top-0 left-0 w-full flex items-center justify-center py-2 bg-slate-950 shadow-[0_4px_30px_rgba(0,0,0,1)] border-b border-slate-800 z-[100] backdrop-blur-md">
         <div className="flex items-center gap-4">
            <motion.img 
              src={logoBell} 
              alt="Logo Chuông Vàng" 
              className="w-10 h-10 md:w-14 md:h-14 drop-shadow-[0_0_20px_rgba(250,204,21,0.7)]"
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            />
            <h1 className="text-2xl md:text-3xl lg:text-5xl font-black italic tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-400 to-yellow-600 drop-shadow-[0_2px_15px_rgba(250,204,21,0.5)]">
              RUNG CHUÔNG VÀNG <span className="text-[10px] opacity-20">v6</span>
            </h1>
            <motion.img 
              src={logoBell} 
              alt="Logo Chuông Vàng" 
              className="w-10 h-10 md:w-14 md:h-14 drop-shadow-[0_0_20px_rgba(250,204,21,0.7)]"
              animate={{ rotate: [0, 10, -10, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            />
         </div>
      </header>

      <div className="flex-1 flex flex-row p-4 pt-20 gap-6 relative overflow-hidden">
          
          {/* MAIN STAGE (LEFT PANEL - 3/4) */}
          <div className="w-3/4 flex flex-col items-center justify-center relative min-h-0">
             <AnimatePresence mode="wait">
                
                {/* 1. INTRO SCREEN (SCROLLING LIST) */}
                {phase === 'showing_intro' && (
                  <motion.div 
                    key="intro" 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="w-full h-full flex flex-col items-center relative overflow-hidden bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black rounded-3xl"
                  >
                    {/* Header Title for Intro */}
                    <div className="absolute top-10 left-0 w-full z-20 flex flex-col items-center text-center">
                      <h2 className="text-5xl font-black uppercase tracking-[0.2em] mb-4 text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_5px_15px_rgba(250,204,21,0.5)]">
                        Danh Sách Thí Sinh
                      </h2>
                      <div className="h-1 w-64 bg-yellow-500/50 rounded-full blur-sm"></div>
                    </div>

                    {/* Scrolling Container */}
                    <div className="flex-1 w-full max-w-6xl mt-48 overflow-hidden relative">
                      <motion.div
                        initial={{ y: "100vh" }}
                        animate={{ y: "-100%" }}
                        transition={{ 
                          duration: Math.max(30, studentsList.length * 3.5), 
                          ease: "linear",
                          repeat: Infinity,
                          repeatDelay: 2
                        }}
                        className="flex flex-col gap-8"
                      >
                        {/* Title at start of scroll */}
                        <div className="text-center py-10">
                           <p className="text-yellow-500 text-2xl font-black uppercase tracking-[0.4em]">Sẵn sàng tham chiến</p>
                        </div>

                        {studentsList.map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between px-12 py-6 bg-slate-800/20 border-y border-yellow-500/10 backdrop-blur-sm rounded-xl">
                            <div className="flex items-center gap-8">
                              <span className="text-5xl font-black font-mono text-yellow-500 w-24">{s.sbd}</span>
                              <div className="flex flex-col">
                                <span className="text-6xl font-black text-white tracking-wide uppercase">{s.hoTen}</span>
                                <span className="text-2xl text-yellow-400/80 uppercase tracking-widest font-bold">Lớp: {s.lop || 'N/A'}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-xs text-slate-500 uppercase tracking-widest mb-1">Mã tham gia</span>
                              <span className="text-6xl font-black font-mono text-white tracking-tighter bg-slate-900/80 px-8 py-4 rounded-xl border-2 border-slate-700 shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] min-w-[180px] text-center">
                                {s.pin || '---'}
                              </span>
                            </div>
                          </div>
                        ))}
                        
                        {/* Message at end of list */}
                        <div className="mt-32 py-32 text-center flex flex-col items-center">
                          <div className="text-8xl mb-10">🔔</div>
                          <p className="text-5xl font-black text-white italic tracking-[0.2em] uppercase mb-4">Tất cả đã sẵn sàng!</p>
                          <p className="text-2xl text-yellow-500 font-black uppercase tracking-[0.4em] opacity-80">Hãy cùng chinh phục đỉnh cao</p>
                        </div>
                      </motion.div>
                    </div>
                    
                    {/* Bottom & Top vignette to make fade effect */}
                    <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-10"></div>
                    <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-10"></div>
                  </motion.div>
                )}

                {/* 2. IDLE / WELCOME SCREEN */}
                {phase === 'idle' && (
                    <motion.div 
                      key="idle" 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      exit={{ opacity: 0 }}
                      className="w-full h-full flex flex-col items-center justify-center p-8"
                    >
                        <div className="flex gap-16 items-center justify-center mb-12">
                           {/* Bell Icon Area */}
                           <div className="w-64 h-64 border-2 border-yellow-600/30 rounded-full flex items-center justify-center bg-slate-900/40 relative shadow-[0_0_100px_rgba(234,179,8,0.05)]">
                               <div className="w-56 h-56 border-4 border-yellow-500/80 rounded-full flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 shadow-inner">
                                  <motion.span 
                                    animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                                    transition={{ repeat: Infinity, duration: 3, delay: 1 }}
                                    className="text-8xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                                  >
                                    🔔
                                  </motion.span>
                               </div>
                               {/* Decorative rings */}
                               <div className="absolute inset-0 border border-yellow-500/20 rounded-full scale-110"></div>
                               <div className="absolute inset-0 border border-yellow-500/10 rounded-full scale-125"></div>
                           </div>

                           {/* QR Code Area */}
                           <div className="bg-white p-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[6px] border-yellow-500 flex flex-col items-center transform hover:scale-105 transition-transform duration-500">
                             <div className="bg-white p-2 rounded-xl">
                                <QRCodeSVG value={window.location.origin} size={200} />
                             </div>
                             <div className="mt-3 w-full text-center">
                                <p className="text-slate-900 font-black text-xl uppercase tracking-tighter">Quét mã để thi đấu</p>
                             </div>
                           </div>
                        </div>

                        <div className="text-center space-y-8">
                           <h2 className="text-[clamp(1.5rem,4vh,3.5rem)] font-black tracking-[0.25em] text-white uppercase drop-shadow-lg">
                                Hãy Tập Trung Khoảnh Khắc <br /> Bắt Đầu
                           </h2>
                           
                           <div className="flex flex-col items-center gap-6">
                                {/* Sound Status Indicator & Unlocker */}
                                <div className="flex justify-center">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation(); // Ngăn sự kiện click toàn trang chạy 2 lần
                                      handleUnlockAudio();
                                      sessionStorage.setItem('isLocalAudioUnlocked', 'true');
                                    }}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all duration-500 ${
                                      isLocalAudioUnlocked 
                                        ? 'bg-green-950/20 border-green-500/50 text-green-400 group' 
                                        : 'bg-amber-950/20 border-amber-500/50 text-amber-400 animate-pulse'
                                    }`}
                                  >
                                    {isLocalAudioUnlocked ? (
                                      <>
                                        <Volume2 className="w-4 h-4" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Âm thanh Sẵn sàng</span>
                                      </>
                                    ) : (
                                      <>
                                        <VolumeX className="w-4 h-4" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest italic">Nhấp bất kỳ để Kích hoạt âm thanh</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                <motion.p 
                                  animate={{ opacity: [0.4, 1, 0.4] }}
                                  transition={{ repeat: Infinity, duration: 2 }}
                                  className="text-yellow-500 text-xl font-mono tracking-[0.3em] opacity-80"
                                >
                                  {window.location.origin}
                                </motion.p>
                           </div>
                        </div>
                    </motion.div>
                )}

                {/* 3. QUESTION / PLAYING SCREEN */}
                {!['idle', 'showing_intro'].includes(phase) && (
                   <motion.div 
                     key="question" 
                     initial={{ opacity: 0, x: -100 }} 
                     animate={{ opacity: 1, x: 0 }} 
                     exit={{ opacity: 0, x: -100 }}
                     className="w-full h-full flex flex-col bg-slate-800/80 rounded-3xl border border-slate-700 p-8 pt-12 shadow-2xl backdrop-blur-md relative overflow-hidden"
                   >
                       {/* Status Badge (Top Left Corner Inside) */}
                       <div className="absolute top-4 left-6 z-30">
                          {question?.isRescue && (
                            <div className="bg-purple-600 text-white px-6 py-2 rounded-full font-black shadow-lg border-2 border-purple-400 animate-pulse uppercase tracking-widest text-xl">
                              Vòng Cứu Trợ
                            </div>
                          )}
                          {question?.isAudience && (
                            <div className="bg-orange-600 text-white px-6 py-2 rounded-full font-black shadow-lg border-2 border-orange-400 animate-bounce uppercase tracking-widest text-xl">
                              Câu Hỏi Khán Giả
                            </div>
                          )}
                       </div>

                       {/* Timer Circle (Top Right Corner Inside) */}
                       <div className="absolute top-4 right-6 w-20 h-20 bg-slate-900/80 rounded-full border-4 border-slate-600 flex items-center justify-center z-20 shadow-xl backdrop-blur-sm">
                          <span className={`text-4xl font-black font-mono tracking-tighter ${
                            phase === 'timer_running' && timeLeft <= 5 ? 'text-red-500 animate-ping' : 
                            phase === 'timer_running' ? 'text-yellow-400' : 
                            'text-slate-500'
                          }`}>
                            {phase === 'timer_running' ? timeLeft : (phase === 'locked' || phase === 'answer_revealed' ? '00' : '⏳')}
                          </span>
                       </div>

                       {/* Question Content Wrapper - Priority Based Layout */}
                       <div className="flex-1 flex flex-col items-center justify-start min-h-0 overflow-hidden gap-3 mt-12 px-2">
                           {/* 1. Text Block - thu nhỏ khi có media để nhường chỗ cho ảnh */}
                           <div className={`font-semibold text-slate-100 flex-shrink-0 whitespace-pre-wrap text-justify [text-align-last:center] max-w-[95%] px-6 ${
                             (question?.mediaType !== 'none' && question?.mediaUrl)
                               ? 'text-[clamp(1rem,2.8vh,2rem)] leading-snug'
                               : getDynamicFontSize(question?.content?.length)
                           }`}>
                               {renderMixedText(question?.content)}
                           </div>
  
                           {/* 2. Media Renderer - min-h-[40vh] để ảnh luôn đủ lớn */}
                           {question?.mediaType !== 'none' && question?.mediaUrl && (
                              <div className="flex-1 min-h-[40vh] w-full rounded-2xl overflow-hidden border border-slate-700 bg-black/40 flex items-center justify-center relative">
                                 {question.mediaType === 'video' && (
                                    isYouTubeURL(question.mediaUrl) ? (
                                      <iframe 
                                        ref={mediaRef}
                                        src={getYouTubeEmbedURL(question.mediaUrl, { mute: gameState.isSoundEnabled ? 0 : 1 })} 
                                        className="w-full h-full border-0" 
                                        allow="autoplay; encrypted-media; picture-in-picture" 
                                        allowFullScreen
                                        title="YouTube video"
                                      />
                                    ) : (
                                      <video 
                                        ref={mediaRef}
                                        src={question.mediaUrl} 
                                        autoPlay 
                                        loop 
                                        muted={!gameState.isSoundEnabled} 
                                        playsInline 
                                        className="h-full w-full object-contain" 
                                      />
                                    )
                                 )}
                                 {question.mediaType === 'image' && <img src={question.mediaUrl} alt="media" className="h-full w-full object-contain shadow-2xl" />}
                                 {question.mediaType === 'audio' && (
                                   <div className="flex flex-col items-center gap-4">
                                     <div className="p-8 bg-slate-900 rounded-full border-4 border-slate-700 animate-pulse">
                                       <span className="text-6xl">🎵</span>
                                     </div>
                                     <audio 
                                       src={question.mediaUrl} 
                                       autoPlay 
                                       controls 
                                       muted={!gameState.isSoundEnabled} 
                                       className="opacity-50 hover:opacity-100 transition-opacity" 
                                     />
                                   </div>
                                 )}
                              </div>
                           )}
  
                           {/* 3. Answer Options - thu nhỏ khi có media */}
                           {question?.type === 'mcq' && (
                             <div className="flex-shrink-0 grid grid-cols-2 gap-2 pb-2 transition-all duration-500 w-full">
                                {['A', 'B', 'C', 'D'].map(opt => (
                                   <div 
                                      key={opt} 
                                      className={`${
                                        (question.mediaType !== 'none' && question.mediaUrl) ? 'p-2' : 'p-3'
                                      } rounded-2xl border-4 flex flex-col items-center justify-center transition-all duration-1000 ${
                                        phase === 'answer_revealed' && question.correct === opt ? 'bg-green-500 border-green-400 text-white shadow-[0_0_40px_rgba(34,197,94,0.6)] scale-[1.03]' :
                                        phase === 'answer_revealed' ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-30 font-black' :
                                        'bg-slate-700/50 border-slate-600 text-slate-300'
                                      }`}
                                   >
                                      <span className={`${
                                        (question.mediaType !== 'none' && question.mediaUrl) ? 'text-3xl' : 'text-5xl md:text-6xl'
                                      } text-yellow-500 font-black leading-none mb-1`}>{opt}</span>
                                      {question[`option${opt}`] && (
                                        <span className={`mt-0.5 text-center text-white whitespace-pre-wrap ${
                                          (question.mediaType !== 'none' && question.mediaUrl)
                                            ? 'text-[clamp(0.8rem,2vh,1.4rem)]'
                                            : getDynamicOptionSize(question[`option${opt}`]?.length)
                                        }`}>
                                          {renderMixedText(question[`option${opt}`])}
                                        </span>
                                      )}
                                   </div>
                                ))}
                             </div>
                           )}
                           
                           {question?.type === 'short' && phase === 'answer_revealed' && (
                             <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex-shrink-0 self-center mt-6 px-12 py-4 bg-green-500 rounded-full border-4 border-green-400 shadow-[0_0_50px_rgba(34,197,94,0.6)] text-center">
                                <span className="text-sm text-green-900 font-bold uppercase tracking-widest block mb-1">Đáp án chính xác</span>
                                <span className="text-[clamp(2.5rem,6vh,4rem)] leading-none font-black text-white">{question.correct}</span>
                             </motion.div>
                           )}
                       </div>
                   </motion.div>
                )}
             </AnimatePresence>
          </div>

          {/* LƯỚI THÍ SINH (RIGHT PANEL - 1/4) */}
          <div className="w-1/4 flex flex-col bg-slate-900/50 rounded-2xl border border-slate-800 p-3 shadow-2xl backdrop-blur-md overflow-hidden text-white">
             <div className="flex flex-col mb-4 flex-shrink-0">
               <h2 className="text-2xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 tracking-tight mb-3 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)]">Sàn Thi Đấu</h2>
               <div className="flex justify-between text-xs font-bold opacity-80 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div> Đang Thi</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.5)]"></div> Loại</div>
               </div>
             </div>
             
              {/* Danh sách thí sinh dạng lưới 6 cột (Chỉ hiện SBD) */}
              <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar">
                <div className="grid grid-cols-6 gap-1 content-start font-sans">
                  {studentsList.length > 0 ? studentsList.map((st, i) => (
                    <motion.div
                      key={st.sbd}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.002 }}
                      className={`aspect-square rounded-md flex items-center justify-center font-black text-[18px] md:text-[22px] border-2 transition-all duration-500 ${
                        st.status === 'active' 
                          ? 'bg-green-500 text-slate-900 border-green-400 shadow-[0_4px_10px_rgba(34,197,94,0.3)]' 
                          : 'bg-red-900/40 text-red-500 border-red-800 opacity-40 shadow-none'
                      } ${phase === 'locked' && st.status==='active' && st.hasAnswered ? 'ring-2 ring-yellow-400 scale-110 z-10' : ''}`}
                    >
                      {st.sbd}
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
      
      {/* Progress Bar under Stage content */}
      <div className="h-2 w-full bg-slate-900 border-t border-slate-800 flex-shrink-0">
         {phase === 'timer_running' && (
            <motion.div 
              initial={{ width: '100%' }} 
              animate={{ width: '0%' }}
              transition={{ duration: question.time || 15, ease: 'linear' }}
              className="h-full bg-gradient-to-r from-yellow-400 to-red-500"
            />
         )}
      </div>
      
      {/* FULL SCREEN CAMERA OVERLAY */}
      <AnimatePresence>
        {isCameraActive && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
          >
             {/* Background: Luôn hiện ảnh JPEG dự phòng nếu có */}
             {lastFrame && (
               <img 
                 src={lastFrame} 
                 alt="Admin Live Feed Fallback" 
                 className={`absolute inset-0 w-full h-full object-contain ${webRtcConnected ? 'opacity-0 z-0' : 'opacity-100 z-10'}`} 
               />
             )}

             {/* Foreground: Hiện Video mượt mà khi WebRTC đã kết nối */}
             {remoteStream && (
               <video 
                 ref={remoteVideoRef} 
                 autoPlay 
                 muted
                 playsInline 
                 className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ${webRtcConnected ? 'opacity-100 z-20' : 'opacity-0 z-0'}`}
               />
             )}

             {/* Loader khi hoàn toàn chưa có gì */}
             {!lastFrame && !remoteStream && (
               <div className="flex flex-col items-center justify-center gap-4 text-white/50">
                 <Camera size={48} className="animate-pulse" />
                 <span className="text-xl font-bold tracking-widest">Đang khởi tạo camera...</span>
               </div>
             )}
             
             <div className="absolute top-8 left-8 flex items-center gap-4 bg-red-600 px-6 py-2 rounded-full shadow-2xl animate-pulse">
                <Camera className="text-white" size={24}/>
                <span className="text-white font-black uppercase tracking-widest text-xl">TRỰC TIẾP TỪ BAN TỔ CHỨC</span>
             </div>
             
             {/* Decorative Corner Borders */}
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
