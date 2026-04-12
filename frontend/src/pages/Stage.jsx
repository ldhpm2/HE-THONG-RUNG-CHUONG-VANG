import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { MathJax } from 'better-react-mathjax';
import logoBell from '../assets/logo_bell.png';
import { QRCodeSVG } from 'qrcode.react';
import { Volume2, VolumeX } from 'lucide-react';


export default function Stage() {
  const [gameState, setGameState] = useState({
    phase: 'idle', // idle, question_sent, timer_running, locked, answer_revealed
    question: null,
    students: {}
  });

  const [timeLeft, setTimeLeft] = useState(0);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  // Web Audio API context
  const audioCtxRef = useRef(null);

  // Helper: tạo âm thanh tick mỗi giây
  const playTick = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.08);
    } catch(e) {}
  };

  // Helper: tiếng cồng hết giờ
  const playGong = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      [220, 277, 330].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
        g.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.05 + 1.5);
        o.start(ctx.currentTime + i * 0.05);
        o.stop(ctx.currentTime + i * 0.05 + 1.5);
      });
    } catch(e) {}
  };

  // Helper: âm thanh đúng đáp án
  const playCorrect = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
        o.start(ctx.currentTime + i * 0.12);
        o.stop(ctx.currentTime + i * 0.12 + 0.3);
      });
    } catch(e) {}
  };

  // Kích hoạt AudioContext khi người dùng bấm enable
  const handleEnableAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setIsAudioEnabled(!isAudioEnabled);
  };

  // Tick mỗi giây khi đang đếm ngược
  const tickIntervalRef = useRef(null);

  useEffect(() => {
    const { phase } = gameState;
    if (isAudioEnabled && phase === 'timer_running' && timeLeft > 0) {
      playTick();
    }
  }, [timeLeft, isAudioEnabled]);

  // Gong khi hết giờ
  useEffect(() => {
    if (isAudioEnabled && gameState.phase === 'timer_running' && timeLeft === 0) {
      playGong();
    }
  }, [timeLeft, gameState.phase, isAudioEnabled]);

  // Đúng đáp án
  useEffect(() => {
    if (isAudioEnabled && gameState.phase === 'answer_revealed') {
      playCorrect();
    }
  }, [gameState.phase, isAudioEnabled]);

  useEffect(() => {
    socket.on('game_state_update', (data) => {
       setGameState(prevState => {
         // Nếu vừa bắt đầu timer
         if(data.gamePhase === 'timer_running' && prevState.phase === 'question_sent') {
            setTimeLeft(data.currentQuestion?.time || 15);
         }
         return {
           phase: data.gamePhase,
           question: data.currentQuestion,
           students: data.students
         };
       });
    });

    const timer = setInterval(() => {
       setTimeLeft(prev => {
         if (prev <= 1) return 0;
         return prev - 1;
       });
    }, 1000);

    return () => {
      socket.off('game_state_update');
      clearInterval(timer);
    };
  }, []);

  const studentsList = Object.values(gameState.students).sort((a,b) => String(a.sbd).localeCompare(String(b.sbd)));
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

  // Tính toán kích thước chữ nội dung câu hỏi (Sử dụng clamp để tự động thích ứng)
  const getDynamicFontSize = (textLength) => {
    if (!textLength) return 'text-[clamp(1.5rem,4vh,3.5rem)]';
    if (textLength <= 150) return 'text-[clamp(1.2rem,4.5vh,3.8rem)] leading-[1.1]';
    if (textLength <= 300) return 'text-[clamp(1.1rem,3.8vh,3rem)] leading-[1.2]';
    if (textLength <= 500) return 'text-[clamp(1rem,3.2vh,2.2rem)] leading-snug';
    return 'text-[clamp(0.8rem,2.5vh,1.8rem)] leading-snug';
  };

  // Tính toán kích thước chữ phương án
  const getDynamicOptionSize = (textLength) => {
    if (!textLength) return 'text-[clamp(0.8rem,2.5vh,1.8rem)]';
    if (textLength <= 40) return 'text-[clamp(1rem,3.2vh,2.2rem)] leading-tight';
    if (textLength <= 90) return 'text-[clamp(0.9rem,2.8vh,1.6rem)] leading-snug';
    return 'text-[clamp(0.7rem,2.2vh,1.3rem)] leading-snug';
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
              RUNG CHUÔNG VÀNG
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
      
      {/* IDLE / WELCOME SCREEN */}
      {phase === 'idle' ? (
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
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={handleEnableAudio}
                                  className={`flex items-center gap-4 px-10 py-5 rounded-full font-black text-2xl uppercase tracking-widest shadow-[0_0_30px_rgba(234,179,8,0.3)] transition-all duration-500 border-b-8 ${
                                    isAudioEnabled 
                                      ? 'bg-green-600 hover:bg-green-500 border-green-800 text-white' 
                                      : 'bg-yellow-500 hover:bg-yellow-400 border-yellow-700 text-slate-900 animate-pulse'
                                  }`}
                                >
                                  {isAudioEnabled ? <Volume2 size={32}/> : <VolumeX size={32}/>}
                                  {isAudioEnabled ? 'Âm thanh Đã Bật' : 'Kích hoạt Âm Thanh'}
                                </motion.button>

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
                ) : (
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
                            <div className="bg-purple-600 text-white px-5 py-1.5 rounded-full font-bold shadow-lg border-2 border-purple-400 animate-pulse uppercase tracking-widest text-lg">
                              Vòng Cứu Trợ
                            </div>
                          )}
                          {question?.isAudience && (
                            <div className="bg-orange-600 text-white px-5 py-1.5 rounded-full font-bold shadow-lg border-2 border-orange-400 animate-bounce uppercase tracking-widest text-lg">
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

                       {/* Question Content Wrapper - Perfectly fits the container */}
                       <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-8">
                           {/* 1. Text Block - Keeps its size */}
                           <div className={`font-semibold text-slate-100 flex-shrink-0 mb-4 whitespace-pre-wrap ${getDynamicFontSize(question.content?.length)}`}>
                              {renderMixedText(question.content)}
                           </div>
 
                           {/* 2. Media Renderer - Flexible and Shrinkable */}
                           {question.mediaType !== 'none' && question.mediaUrl && (
                              <div className="flex-1 min-h-0 w-full mb-4 rounded-2xl overflow-hidden border border-slate-700 bg-black/40 flex items-center justify-center relative">
                                 {question.mediaType === 'image' && <img src={question.mediaUrl} alt="media" className="max-h-full max-w-full object-contain shadow-2xl" />}
                                 {question.mediaType === 'video' && <video src={question.mediaUrl} autoPlay loop muted className="max-h-full max-w-full object-contain" />}
                                 {question.mediaType === 'audio' && <div className="p-8 bg-slate-900 rounded-full border-4 border-slate-700 animate-pulse"><span className="text-4xl">🎵</span></div>}
                              </div>
                           )}
 
                           {/* 3. Answer Options - Fixed to bottom */}
                           {question.type === 'mcq' && (
                             <div className="flex-shrink-0 mt-auto grid grid-cols-2 gap-3 pb-2">
                                {['A', 'B', 'C', 'D'].map(opt => (
                                   <div 
                                      key={opt} 
                                      className={`p-3 rounded-2xl border-4 flex flex-col items-center justify-center transition-all duration-1000 ${
                                        phase === 'answer_revealed' && question.correct === opt ? 'bg-green-500 border-green-400 text-white shadow-[0_0_40px_rgba(34,197,94,0.6)] scale-[1.03]' :
                                        phase === 'answer_revealed' ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-30 font-black' :
                                        'bg-slate-700/50 border-slate-600 text-slate-300'
                                      }`}
                                   >
                                      <span className="text-3xl text-yellow-500 font-black leading-none">{opt}</span>
                                      {question[`option${opt}`] && (
                                        <span className={`mt-0.5 text-center text-white whitespace-pre-wrap ${getDynamicOptionSize(question[`option${opt}`]?.length)}`}>
                                          {renderMixedText(question[`option${opt}`])}
                                        </span>
                                      )}
                                   </div>
                                ))}
                             </div>
                           )}
                           
                           {question.type === 'short' && phase === 'answer_revealed' && (
                             <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex-shrink-0 mt-auto self-center px-12 py-4 bg-green-500 rounded-full border-4 border-green-400 shadow-[0_0_50px_rgba(34,197,94,0.6)] text-center">
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
               <h2 className="text-lg font-bold uppercase text-slate-400 tracking-wider mb-2">Sàn Thi Đấu</h2>
               <div className="flex justify-between text-[10px] font-bold opacity-70 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-green-500"></div> Đang Thi</div>
                  <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-red-600"></div> Loại</div>
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

    </div>
  );
}
