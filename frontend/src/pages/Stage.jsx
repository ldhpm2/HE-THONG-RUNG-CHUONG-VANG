import React, { useState, useEffect, useRef, useMemo } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { MathJax } from 'better-react-mathjax';
import logoBell from '../assets/logo_bell.png';
import { QRCodeSVG } from 'qrcode.react';
import { Volume2, VolumeX } from 'lucide-react';
import { isYouTubeURL, getYouTubeEmbedURL } from '../utils/videoUtils';

export default function Stage() {
  const [gameState, setGameState] = useState({
    phase: 'idle',
    question: null,
    students: {},
    isSoundEnabled: true
  });

  const [timeLeft, setTimeLeft] = useState(0);
  const [isLocalAudioUnlocked, setIsLocalAudioUnlocked] = useState(() => {
    return sessionStorage.getItem('isLocalAudioUnlocked') === 'true';
  });
  
  const audioCtxRef = useRef(null);
  const scheduledTicksRef = useRef([]);
  const timerEndRef = useRef(null);
  const lastScheduledRef = useRef(null);
  const mediaRef = useRef(null);
  const rafRef = useRef(null);

  // Sound effects logic
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
      const isUrgent = (durationSec - i) <= urgent5sec;
      const t = now + i;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.025), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (data.length * 0.3));
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = isUrgent ? 3000 : 1800;
      const gain = ctx.createGain(); gain.gain.setValueAtTime(isUrgent ? 2.5 : 1.5, t);
      src.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
      src.start(t); src.stop(t + 0.025);
      scheduledTicksRef.current.push(src);
    }
  };

  const handleUnlockAudio = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    setIsLocalAudioUnlocked(true);
    sessionStorage.setItem('isLocalAudioUnlocked', 'true');
  };

  useEffect(() => {
    const unlock = () => { if (!isLocalAudioUnlocked) handleUnlockAudio(); };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => { window.removeEventListener('click', unlock); window.removeEventListener('touchstart', unlock); };
  }, [isLocalAudioUnlocked]);

  useEffect(() => {
    socket.on('game_state_update', (data) => {
      setGameState(prev => {
        if (data.gamePhase === 'timer_running' && prev.phase !== 'timer_running') {
          timerEndRef.current = Date.now() + (data.currentQuestion?.time || 15) * 1000;
        }
        return {
          phase: data.gamePhase,
          question: data.currentQuestion,
          students: data.students || {},
          isSoundEnabled: data.isSoundEnabled
        };
      });
    });
    return () => socket.off('game_state_update');
  }, []);

  useEffect(() => {
    if (gameState.phase === 'timer_running' && timerEndRef.current) {
      const remaining = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (gameState.isSoundEnabled && isLocalAudioUnlocked && lastScheduledRef.current !== timerEndRef.current) {
        lastScheduledRef.current = timerEndRef.current;
        scheduleAllTicks(remaining, 5);
      }
    } else {
      lastScheduledRef.current = null;
      cancelAllTicks();
      setTimeLeft(0);
    }
    // Sync media sound
    if (mediaRef.current) {
      const isMuted = !gameState.isSoundEnabled;
      if (mediaRef.current.tagName === 'IFRAME') {
        mediaRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: isMuted ? 'mute' : 'unmute', args: '' }), '*');
      } else {
        mediaRef.current.muted = isMuted;
      }
    }
  }, [gameState.phase, gameState.isSoundEnabled, isLocalAudioUnlocked]);

  const studentsList = useMemo(() => {
    return Object.values(gameState.students || {}).sort((a,b) => String(a.sbd || '').localeCompare(String(b.sbd || '')));
  }, [gameState.students]);

  const renderMixedText = (text) => {
    if (!text) return null;
    let t = String(text).replace(/\f/g, '\\f').replace(/\v/g, '\\v');
    if (!t.includes('$') && t.includes('\\')) t = `$${t}$`;
    return <MathJax dynamic><span className="whitespace-pre-wrap">{t}</span></MathJax>;
  };

  return (
    <div className="h-screen w-screen bg-[#020617] text-white flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-20 w-full flex items-center justify-center bg-slate-950 border-b border-slate-800 z-50">
        <div className="flex items-center gap-6">
          <motion.img src={logoBell} className="w-12 h-12" animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 4 }} />
          <h1 className="text-4xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-600">RUNG CHUÔNG VÀNG</h1>
          <motion.img src={logoBell} className="w-12 h-12" animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 4 }} />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Main Side */}
        <div className="flex-1 flex flex-col relative h-full">
          <AnimatePresence mode="wait">
            {gameState.phase === 'showing_intro' && (
              <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="pt-12 pb-8 w-full text-center z-20 bg-slate-900">
                  <h2 className="text-6xl font-black text-yellow-500 uppercase tracking-widest drop-shadow-2xl">Danh Sách Thí Sinh</h2>
                  <div className="h-1 w-64 bg-yellow-500/30 mx-auto mt-4 rounded-full"></div>
                </div>
                <div className="flex-1 w-full max-w-5xl overflow-hidden relative">
                  <motion.div
                    initial={{ y: "80vh" }}
                    animate={{ y: `-${Math.max(10, studentsList.length) * 12}vh` }}
                    transition={{ duration: Math.max(20, studentsList.length * 3), ease: "linear", repeat: Infinity }}
                    className="flex flex-col gap-6 px-10"
                  >
                    {studentsList.map((s, i) => (
                      <div key={i} className="flex justify-between items-center p-8 bg-slate-800/40 border border-slate-700 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-10">
                          <span className="text-6xl font-black text-yellow-500 font-mono">#{s.sbd}</span>
                          <span className="text-6xl font-black text-white uppercase tracking-tight">{s.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-500 text-sm uppercase font-bold tracking-widest mb-1">Mã tham gia</p>
                          <span className="text-4xl font-black font-mono text-slate-300 bg-slate-950 px-6 py-2 rounded-xl border border-slate-700">{s.pin}</span>
                        </div>
                      </div>
                    ))}
                    <div className="h-[100vh]"></div>
                  </motion.div>
                </div>
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-slate-900 to-transparent z-10 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-900 to-transparent z-10 pointer-events-none"></div>
              </motion.div>
            )}

            {gameState.phase === 'idle' && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 border border-slate-800 rounded-3xl p-10">
                <div className="flex gap-20 items-center mb-16">
                  <div className="w-72 h-72 rounded-full flex items-center justify-center bg-slate-900 border-4 border-yellow-600/20 shadow-[0_0_100px_rgba(234,179,8,0.1)] relative transition-all hover:scale-105">
                    <span className="text-9xl grayscale-[0.5] filter drop-shadow-[0_0_30px_rgba(0,0,0,0.5)]">🔔</span>
                    <div className="absolute inset-0 border border-yellow-500/20 rounded-full scale-110 animate-pulse"></div>
                  </div>
                  <div className="bg-white p-6 rounded-[3rem] border-8 border-yellow-500 shadow-2xl">
                    <QRCodeSVG value={window.location.origin} size={250} />
                    <p className="mt-4 text-slate-900 font-black text-center text-2xl uppercase tracking-tighter">Quét mã để thi đấu</p>
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="text-5xl md:text-7xl font-black uppercase text-white tracking-[0.2em] drop-shadow-2xl mb-10">Hãy Tập Trung Khoảnh Khắc</h2>
                  {!isLocalAudioUnlocked && <button onClick={handleUnlockAudio} className="px-10 py-4 bg-amber-500 text-black text-2xl font-black rounded-full shadow-[0_10px_30px_rgba(245,158,11,0.4)] animate-bounce">KÍCH HOẠT ÂM THANH</button>}
                </div>
              </motion.div>
            )}

            {!['idle', 'showing_intro'].includes(gameState.phase) && (
              <motion.div key="question" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute inset-0 flex flex-col bg-slate-800/80 rounded-3xl border border-slate-700 p-10 shadow-2xl backdrop-blur-md overflow-hidden">
                <div className="absolute top-6 right-8 w-24 h-24 bg-black/60 rounded-full border-4 border-yellow-500 flex items-center justify-center z-20 shadow-2xl">
                  <span className="text-5xl font-black text-yellow-400 font-mono italic">{timeLeft > 0 ? timeLeft : (gameState.phase === 'question_sent' ? '⏳' : '00')}</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-8 overflow-hidden">
                  <div className="text-5xl md:text-6xl font-black text-white text-center w-full leading-tight drop-shadow-lg">
                    {renderMixedText(gameState.question?.content)}
                  </div>
                  {gameState.question?.mediaType !== 'none' && gameState.question?.mediaUrl && (
                    <div className="flex-1 w-full max-h-[50vh] rounded-3xl overflow-hidden border border-slate-700 bg-black/60 flex items-center justify-center shadow-inner">
                      {gameState.question.mediaType === 'image' && <img src={gameState.question.mediaUrl} className="h-full object-contain" alt="media" />}
                      {gameState.question.mediaType === 'video' && (
                        isYouTubeURL(gameState.question.mediaUrl) 
                          ? <iframe ref={mediaRef} src={getYouTubeEmbedURL(gameState.question.mediaUrl, { mute: gameState.isSoundEnabled ? 0 : 1 })} className="w-full h-full border-0" />
                          : <video ref={mediaRef} src={gameState.question.mediaUrl} autoPlay loop playsInline className="h-full object-contain" />
                      )}
                      {gameState.question.mediaType === 'audio' && <audio ref={mediaRef} src={gameState.question.mediaUrl} autoPlay controls className="w-2/3" />}
                    </div>
                  )}
                  {gameState.question?.type === 'mcq' && (
                    <div className="grid grid-cols-2 gap-6 w-full mt-4">
                      {['A', 'B', 'C', 'D'].map(opt => (
                        <div key={opt} className={`p-6 rounded-3xl border-4 text-center transition-all duration-500 shadow-xl ${gameState.phase === 'answer_revealed' && gameState.question.correct === opt ? 'bg-green-600 border-green-400 scale-[1.02] ring-8 ring-green-600/30' : 'bg-slate-700/50 border-slate-600'}`}>
                          <span className="text-4xl font-black text-yellow-500 block mb-2">{opt}</span>
                          <span className="text-3xl font-black text-white">{renderMixedText(gameState.question[`option${opt}`])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {gameState.question?.type === 'short' && gameState.phase === 'answer_revealed' && (
                    <div className="px-16 py-6 bg-green-600 rounded-full border-4 border-green-400 shadow-[0_0_50px_rgba(34,197,94,0.4)] text-center animate-pulse">
                      <span className="text-sm uppercase font-black text-green-200 block mb-1 tracking-widest">Đáp án chính xác</span>
                      <span className="text-6xl font-black text-white">{gameState.question.correct}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar: Sàn Thi Đấu */}
        <div className="w-1/4 h-full flex flex-col bg-slate-900/60 rounded-[2rem] border border-slate-800 p-5 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="flex flex-col mb-6 flex-shrink-0">
             <h2 className="text-3xl font-black italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 tracking-tight drop-shadow-[0_0_15px_rgba(234,179,8,0.4)]">
               Sàn Thi Đấu
             </h2>
             <div className="h-1 w-full bg-slate-800 mt-2 rounded-full relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/50 to-transparent"></div>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-5 gap-2 content-start">
              {studentsList.map((st) => (
                <motion.div
                  key={st.sbd}
                  whileHover={{ scale: 1.05 }}
                  className={`aspect-square rounded-2xl flex items-center justify-center text-2xl font-black border-2 transition-all duration-500 relative ${
                    st.status === 'active' 
                      ? 'bg-green-500 text-slate-900 border-green-400 shadow-[0_5px_15px_rgba(34,197,94,0.4)]' 
                      : 'bg-red-900/40 text-red-500 border-red-800 opacity-20 shadow-none'
                  }`}
                >
                  {st.sbd}
                  {st.status === 'active' && st.hasAnswered && gameState.phase !== 'idle' && (
                    <div className="absolute top-1 right-1 w-3 h-3 bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,1)] border border-slate-900"></div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-4 w-full bg-slate-950">
        {gameState.phase === 'timer_running' && (
          <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: gameState.question?.time || 15, ease: 'linear' }} className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
        )}
      </div>
    </div>
  );
}
