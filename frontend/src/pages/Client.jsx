import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { MathJax } from 'better-react-mathjax';

export default function Client() {
  const [sbd, setSbd] = useState('');
  const [pin, setPin] = useState('');
  const [isLogged, setIsLogged] = useState(false);
  const [studentInfo, setStudentInfo] = useState(null); // { sbd, hoTen, status }
  const [errorMsg, setErrorMsg] = useState('');
  
  const [gameState, setGameState] = useState({
    phase: 'idle', // idle, question_sent, timer_running, locked, answer_revealed
    question: null,
  });

  const [localAnswer, setLocalAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [eliminatedMsg, setEliminatedMsg] = useState('');

  useEffect(() => {
    socket.on('game_state_update', (data) => {
      setGameState({
        phase: data.gamePhase,
        question: data.currentQuestion
      });
      // Update local status if available
      if (studentInfo) {
         const myInfo = data.students[studentInfo.sbd];
         if (myInfo) {
           setStudentInfo(prev => ({...prev, status: myInfo.status}));
         } else {
           // Nếu không tìm thấy thông tin mình trong danh sách (do Admin xóa), tự động thoát
           setIsLogged(false);
           setStudentInfo(null);
           setErrorMsg('Thông tin thí sinh đã bị xóa khỏi hệ thống. Vui lòng kết nối lại.');
         }
      }
    });

    socket.on('you_are_eliminated', () => {
      setStudentInfo(prev => ({ ...prev, status: 'eliminated' }));
      setEliminatedMsg('Rất tiếc! Đáp án không chính xác hoặc bạn không kịp gửi bài.');
    });

    socket.on('you_passed', () => {
      setStudentInfo(prev => ({ ...prev, status: 'active' }));
      setEliminatedMsg('Tuyệt vời! Bạn đã vượt qua câu hỏi này.');
    });

    socket.on('you_are_rescued', () => {
      setStudentInfo(prev => ({ ...prev, status: 'active' }));
      setEliminatedMsg('Chúc mừng! Bạn đã được cứu trợ để quay lại sàn thi đấu.');
      setTimeout(() => setEliminatedMsg(''), 5000);
    });

    socket.on('force_logout', (data) => {
      alert(data.message);
      setIsLogged(false);
      setStudentInfo(null);
    });

    // Reset local answer state when new question is sent
    if (gameState.phase === 'question_sent' || gameState.phase === 'idle') {
      setSubmitted(false);
      setLocalAnswer('');
    }

    return () => {
      socket.off('game_state_update');
      socket.off('you_are_eliminated');
      socket.off('you_passed');
      socket.off('you_are_rescued');
      socket.off('force_logout');
    };
  }, [studentInfo, gameState.phase]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!sbd || !pin) return setErrorMsg('Vui lòng nhập đủ thông tin');
    
    socket.emit('student:login', { sbd, pin }, (res) => {
      if (res.success) {
        setIsLogged(true);
        setStudentInfo(res.student);
        setErrorMsg('');
      } else {
        setErrorMsg(res.message);
      }
    });
  };

  const handleSelectAnswer = (ans) => {
    // Chỉ cho phép chọn/đổi đáp án khi đồng hồ đang đếm ngược
    // ĐÃ XÓA ĐIỀU KIỆN CHẶN "submitted" ĐỂ CHO PHÉP ĐỔI ĐÁP ÁN
    if (gameState.phase !== 'timer_running') return;
    
    socket.emit('student:submit_answer', { answer: ans }, (res) => {
        if (res.success) {
           setLocalAnswer(ans);
           setSubmitted(true);
        } else {
           alert(res.message || 'Lỗi khi nộp bài');
        }
    });
  };

  const handleSubmitText = (e) => {
    e.preventDefault();
    // ĐÃ XÓA ĐIỀU KIỆN CHẶN "submitted"
    if (gameState.phase !== 'timer_running' || !localAnswer) return;
    
    socket.emit('student:submit_answer', { answer: localAnswer }, (res) => {
        if (res.success) setSubmitted(true);
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

  if (!isLogged) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-700"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">Rung Chuông Vàng</h1>
            <p className="text-slate-400 mt-2">Đăng nhập bằng số báo danh</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-300 mb-2 font-medium">Số Báo Danh (SBD)</label>
              <input 
                type="text" 
                value={sbd}
                onChange={e => setSbd(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-mono text-lg tracking-widest text-center"
                placeholder="VD: 001"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-2 font-medium">Mã PIN</label>
              <input 
                type="password" 
                value={pin}
                onChange={e => setPin(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-mono text-lg tracking-widest text-center"
                placeholder="****"
              />
            </div>
            
            <AnimatePresence>
              {errorMsg && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-400 text-sm text-center">
                  <AlertCircle className="inline w-4 h-4 mr-1"/>{errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              type="submit" 
              className="w-full mt-4 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-slate-900 font-bold py-3 px-4 rounded-xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5"/> Vào Phòng Thi
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (studentInfo?.status === 'eliminated' && !gameState.question?.isRescue && !gameState.question?.isAudience) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-950 px-6 text-center">
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-red-900/50 p-8 rounded-3xl border border-red-500 max-w-sm">
          <XCircle className="w-24 h-24 text-red-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-2">Đã Dừng Bước</h2>
          <p className="text-red-200 text-lg mb-8">{eliminatedMsg || 'Bạn đã trả lời sai hoặc không kịp nộp bài. Vui lòng rời sàn thi đấu và chờ đợi quyền cứu trợ.'}</p>
          <div className="animate-pulse flex items-center justify-center gap-2 text-yellow-500 font-medium">
             <Clock className="w-5 h-5"/> Đang chờ tín hiệu Cứu trợ...
          </div>
        </motion.div>
      </div>
    );
  }

  if (studentInfo?.status === 'active' && gameState.question?.isRescue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-green-950 px-6 text-center">
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-green-900/50 p-8 rounded-3xl border border-green-500 max-w-sm">
          <div className="w-24 h-24 rounded-full bg-green-800 flex items-center justify-center mx-auto mb-6">
             <span className="text-4xl text-green-300">☕</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Đang An Toàn</h2>
          <p className="text-green-200 text-lg mb-8">Đây là phần thi Phao Cứu Trợ dành riêng cho các bạn đã bị loại. Bạn hãy nghỉ ngơi và theo dõi nhé!</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-900">
      <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center shadow-md">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Thí sinh</p>
          <h3 className="font-bold text-lg text-white">{studentInfo.hoTen} <span className="text-yellow-500 ml-1">({studentInfo.sbd})</span></h3>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${
           gameState.question?.isRescue ? 'bg-purple-500/20 text-purple-400' : 
           gameState.question?.isAudience ? 'bg-orange-500/20 text-orange-400' :
           'bg-green-500/20 text-green-400'
        }`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${
             gameState.question?.isRescue ? 'bg-purple-500' : 
             gameState.question?.isAudience ? 'bg-orange-500' :
             'bg-green-500'
          }`}></span>
          {gameState.question?.isRescue ? 'Vòng Cứu Trợ' : (gameState.question?.isAudience ? 'Giao lưu Khán giả' : 'Đang thi đấu')}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4">
        {(gameState.phase === 'idle') && (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70">
            <Clock className="w-16 h-16 text-slate-500 mb-4 animate-spin-slow" style={{ animationDuration: '3s' }}/>
            <h2 className="text-2xl font-semibold text-slate-300">Vui lòng chờ</h2>
            <p className="text-slate-500 mt-2">Ban tổ chức đang chuẩn bị câu hỏi...</p>
            {eliminatedMsg && (
              <p className="text-success mt-4 font-bold text-lg">{eliminatedMsg}</p>
            )}
          </div>
        )}

        {gameState.phase !== 'idle' && gameState.question && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col">
            <div className="bg-slate-800 p-6 rounded-2xl shadow-xl flex-1 mt-2 border border-slate-700 flex flex-col relative overflow-hidden">
              
              <div className="absolute top-0 inset-x-0 h-1 bg-slate-700">
                 {gameState.phase === 'timer_running' && <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: gameState.question.time, ease: 'linear' }} className="h-full bg-yellow-500" />}
              </div>
              
                <div className="text-center mb-4">
                  <span className={`inline-block px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                    gameState.phase === 'timer_running' ? 'bg-yellow-500/20 text-yellow-500 animate-pulse' : 
                    gameState.phase === 'locked' ? 'bg-red-500/20 text-red-400' :
                    gameState.phase === 'answer_revealed' ? 'bg-green-500/20 text-green-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {gameState.phase === 'question_sent' && (
                      gameState.question?.isRescue ? 'Câu Cứu Trợ' : 
                      gameState.question?.isAudience ? 'Câu Hỏi Khán Giả' : 
                      'Đọc Câu Hỏi'
                    )}
                    {gameState.phase === 'timer_running' && 'Đang Làm Bài'}
                    {gameState.phase === 'locked' && 'Hết Giờ!'}
                    {gameState.phase === 'answer_revealed' && 'Kết Quả'}
                  </span>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-slate-700 max-h-[40vh] overflow-y-auto">
                   <div className="text-lg text-slate-100 font-medium leading-relaxed">
                      {renderMixedText(gameState.question.content)}
                   </div>
                   {gameState.question.type === 'mcq' && (
                     <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-800 pt-4">
                       {['A', 'B', 'C', 'D'].map(opt => gameState.question[`option${opt}`] && (
                        <div key={opt} className="text-sm text-slate-400 flex gap-2">
                          <span className="font-bold text-yellow-500">{opt}:</span>
                          <span>{renderMixedText(gameState.question[`option${opt}`])}</span>
                        </div>
                       ))}
                     </div>
                   )}
                </div>

               <div className="mt-auto mb-auto">
                 {gameState.question.type === 'mcq' ? (
                   <div className="grid grid-cols-2 gap-4">
                     {['A', 'B', 'C', 'D'].map((opt) => {
                       const isSelected = localAnswer === opt;
                       const isCorrect = gameState.phase === 'answer_revealed' && gameState.question.correct === opt;
                       const isWrong = gameState.phase === 'answer_revealed' && isSelected && !isCorrect;
                       
                       let btnClass = "py-8 text-4xl font-black rounded-2xl shadow-lg border-b-4 transform transition-all flex items-center justify-center ";
                       
                       if (isCorrect) {
                         btnClass += "bg-green-500 border-green-700 text-white animate-bounce";
                       } else if (isWrong) {
                         btnClass += "bg-red-500 border-red-700 text-white opacity-50";
                       } else if (gameState.phase === 'timer_running') {
                         // Nếu đang tính giờ, nút được chọn sáng lên, nút khác vẫn sáng bình thường để dễ bấm đổi
                         if (isSelected) {
                           btnClass += "bg-yellow-500 border-yellow-700 text-slate-900 ring-4 ring-yellow-300 ring-offset-2 ring-offset-slate-800 scale-95";
                         } else {
                           btnClass += "bg-slate-700 border-slate-900 text-white hover:bg-slate-600 cursor-pointer active:scale-95";
                         }
                       } else {
                         // Trạng thái đã khóa đáp án (Hết giờ / Chưa tính giờ)
                         if (isSelected) {
                           btnClass += "bg-yellow-500 border-yellow-700 text-slate-900 opacity-80 cursor-not-allowed";
                         } else {
                           btnClass += "bg-slate-800 border-slate-900 text-slate-500 opacity-50 cursor-not-allowed";
                         }
                       }

                       return (
                         <div
                           key={opt}
                           onClick={() => {
                              // Khóa hẳn thao tác nếu đồng hồ KHÔNG chạy
                              if (gameState.phase === 'timer_running') {
                                handleSelectAnswer(opt);
                              }
                           }}
                           className={btnClass}
                         >
                           {opt}
                         </div>
                       )
                     })}
                   </div>
                 ) : (
                    // Short form text input
                    <form onSubmit={handleSubmitText} className="flex flex-col gap-4">
                      <input 
                        type="text"
                        value={localAnswer}
                        onChange={e => setLocalAnswer(e.target.value.toUpperCase())}
                        // Bỏ chặn "submitted"
                        disabled={gameState.phase !== 'timer_running'}
                        placeholder="NHẬP ĐÁP ÁN..."
                        className="w-full bg-slate-900 border-2 border-slate-600 rounded-2xl text-4xl text-center py-6 text-white font-bold uppercase disabled:opacity-50 focus:border-yellow-500 focus:ring-0 outline-none transition-colors"
                      />
                      <button 
                        type="submit"
                        // Bỏ chặn "submitted"
                        disabled={gameState.phase !== 'timer_running' || !localAnswer}
                        className="w-full bg-blue-600 text-white py-4 rounded-xl text-xl font-bold font-white uppercase shadow-md disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
                      >
                       {submitted ? 'Cập Nhật Lại Đáp Án' : 'Chốt Đáp Án'}
                      </button>
                    </form>
                 )}
               </div>

               {/* Feedback Message */}
               <div className="mt-8 text-center min-h-[40px]">
                  {submitted && gameState.phase === 'timer_running' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
                       <p className="text-yellow-400 font-medium flex items-center justify-center gap-2">
                          <CheckCircle className="w-5 h-5"/> Đã ghi nhận: <span className="font-bold text-xl">{localAnswer}</span>
                       </p>
                       <p className="text-xs text-slate-400 mt-1 italic">Bạn có thể đổi đáp án trước khi hết giờ.</p>
                    </motion.div>
                  )}
                  {gameState.phase === 'answer_revealed' && (
                    <motion.p initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`font-bold text-xl flex items-center justify-center gap-2 ${gameState.question.correct === localAnswer ? 'text-green-400' : 'text-red-400'}`}>
                      {gameState.question.correct === localAnswer ? <CheckCircle className="w-6 h-6"/> : <XCircle className="w-6 h-6"/>}
                      {gameState.question.correct === localAnswer ? 'Chính Xác!' : 'Sai Rồi!'}
                    </motion.p>
                  )}
               </div>

            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}