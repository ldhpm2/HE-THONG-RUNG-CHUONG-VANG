import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { parseExcelStudentList, parseExcelQuestions } from '../utils/excelParser';
import { parseWordQuestions } from '../utils/wordParser';
import { Upload, Play, Square, Presentation, Eye, UserX, Activity, HeartHandshake, Trash2, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

export default function Admin() {
  const [isAdminLogged, setIsAdminLogged] = useState(false);
  const [password, setPassword] = useState('');
  
  const [gameState, setGameState] = useState({
    phase: 'idle',
    question: null,
    students: {}
  });

  const [questionsList, setQuestionsList] = useState([]);
  const [questionDraft, setQuestionDraft] = useState({
    content: '',
    type: 'mcq', // mcq, short
    options: ['A', 'B', 'C', 'D'], // For displaying UI
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correct: 'A',
    mediaType: 'none', // none, image, video, audio
    mediaUrl: '',
    time: 15
  });

  useEffect(() => {
    socket.on('admin_state_update', (data) => {
      setGameState({
        phase: data.gamePhase,
        question: data.currentQuestion,
        students: data.students
      });
    });

    return () => {
      socket.off('admin_state_update');
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    socket.emit('admin:login', { password }, (res) => {
      if (res.success) {
        setIsAdminLogged(true);
      } else {
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
          e.target.value = ''; // Reset input để có thể nạp lại cùng file nếu cần
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
      } else {
        questions = await parseExcelQuestions(file);
      }
      if (questions.length === 0) return alert('File không có dữ liệu câu hỏi hợp lệ');
      setQuestionsList(questions);
      alert(`Đã tải lên ${questions.length} câu hỏi thành công vào bộ nhớ Draft!`);
      e.target.value = '';
    } catch(err) {
      alert('Lỗi đọc file Câu hỏi: ' + err.message);
      e.target.value = '';
    }
  };

  const handleAddManualQuestion = () => {
    if (!questionDraft.content) return alert("Vui lòng nhập nội dung câu hỏi!");
    const newQuestion = {
       ...questionDraft,
       id: questionsList.length + 1
    };
    setQuestionsList([...questionsList, newQuestion]);
    alert(`Đã thêm Câu ${newQuestion.id} vào danh sách!`);
    
    // Xóa nháp để nhập câu tiếp theo
    setQuestionDraft({
      content: '',
      type: 'mcq',
      options: ['A', 'B', 'C', 'D'],
      optionA: '', optionB: '', optionC: '', optionD: '',
      correct: 'A',
      mediaType: 'none',
      mediaUrl: '',
      time: 15
    });
  };

  // Các thao tác điều khiển
  const pushQuestion = () => {
    if(!questionDraft.content) return alert('Chưa nhập nội dung câu hỏi');
    socket.emit('admin:push_question', { question: questionDraft });
  };
  
  const startTimer = () => socket.emit('admin:start_timer');
  const lockAnswer = () => socket.emit('admin:lock');
  const revealAnswer = () => socket.emit('admin:reveal_answer');
  const kickStudent = (sbd) => socket.emit('admin:kick_student', { sbd });
  const resetStudent = (sbd) => socket.emit('admin:reset_student', { sbd });
  
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

    // Khôi phục các ký tự thoát bị trình duyệt hiểu nhầm (VD: \v trong \vec, \f trong \forall)
    const restoreLatex = (str) => {
      return str.replace(/\f/g, '\\f').replace(/\v/g, '\\v');
    };

    // Tự động nhận diện công thức: Nếu có dấu \ (lệnh LaTeX) nhưng thiếu dấu $, tự động bao quanh $
    let processedText = text;
    if (!text.includes('$') && text.includes('\\')) {
       processedText = `$${text}$`;
    }

    const parts = processedText.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
    return parts.map((part, index) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        return <BlockMath key={index} math={restoreLatex(part.slice(2, -2))} throwOnError={false} errorColor="#ef4444" />;
      } else if (part.startsWith('$') && part.endsWith('$')) {
        return <InlineMath key={index} math={restoreLatex(part.slice(1, -1))} throwOnError={false} errorColor="#ef4444" />;
      } else {
        return <span key={index}>{part}</span>;
      }
    });
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

  const studentList = Object.values(gameState.students);
  const activeCount = studentList.filter(s => s.status === 'active').length;
  const eliminatedCount = studentList.filter(s => s.status === 'eliminated').length;
  const onlineCount = studentList.filter(s => s.online).length;
  const submittedCount = studentList.filter(s => s.currentAnswer !== null).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 p-6 flex flex-col md:flex-row gap-6">
      
      {/* CỘT TRÁI: ĐIỀU KHIỂN & CÂU HỎI */}
      <div className="w-full md:w-1/3 flex flex-col gap-6">
        
        {/* Module Upload */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center"><Upload className="mr-2"/> Dữ Liệu</h3>
          <div>
            <label className="block text-sm mb-2">Tải lên danh sách thí sinh (Excel)</label>
            <input type="file" accept=".xlsx, .xls" onChange={handleStudentUpload} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer" />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700/50 flex justify-between">
            <span className="text-slate-400">Chỉ số:</span>
            <span className="text-white font-mono">{studentList.length} Tổng / {onlineCount} Online</span>
          </div>
        </div>

        {/* Soạn Câu Hỏi */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg flex-1 overflow-y-auto max-h-[650px] custom-scrollbar">
          <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
            <h3 className="text-xl font-bold text-white flex-1 min-w-[200px]">Mô-đun Câu Hỏi (Draft)</h3>
            <div className="flex gap-2">
               <button onClick={() => {
                   if(window.confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách câu hỏi đã tải?')) {
                      setQuestionsList([]);
                   }
               }} className="text-xs font-bold bg-red-900/80 hover:bg-red-800 text-white px-3 py-1.5 rounded cursor-pointer transition shadow-md flex items-center">
                  Xóa tất cả
               </button>
               <button onClick={handleAddManualQuestion} className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded cursor-pointer transition shadow-md">
                  + Thêm câu
               </button>
               <label className="text-xs font-bold bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded cursor-pointer transition shadow-md whitespace-nowrap">
                  Nạp DS (Excel/Word)
                  <input type="file" accept=".xlsx, .xls, .docx" hidden onChange={handleQuestionUpload} />
               </label>
            </div>
          </div>
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
               <textarea 
                  rows="3"
                  value={questionDraft.content}
                  onChange={e => setQuestionDraft({...questionDraft, content: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white"
                  placeholder="VD: Tính diện tích tam giác... Có thể dùng \int_0^1 f(x)dx cho toán."
               />
             </div>

             {questionDraft.type === 'mcq' && (
               <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900 border border-slate-700 rounded-lg">
                 <div>
                   <label className="block text-xs uppercase text-slate-500 mb-1">Phương án A</label>
                   <input type="text" value={questionDraft.optionA || ''} onChange={e=>setQuestionDraft({...questionDraft, optionA: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung A" />
                 </div>
                 <div>
                   <label className="block text-xs uppercase text-slate-500 mb-1">Phương án B</label>
                   <input type="text" value={questionDraft.optionB || ''} onChange={e=>setQuestionDraft({...questionDraft, optionB: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung B" />
                 </div>
                 <div>
                   <label className="block text-xs uppercase text-slate-500 mb-1">Phương án C</label>
                   <input type="text" value={questionDraft.optionC || ''} onChange={e=>setQuestionDraft({...questionDraft, optionC: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung C" />
                 </div>
                 <div>
                   <label className="block text-xs uppercase text-slate-500 mb-1">Phương án D</label>
                   <input type="text" value={questionDraft.optionD || ''} onChange={e=>setQuestionDraft({...questionDraft, optionD: e.target.value})} className="w-full bg-slate-800 border border-slate-600 p-2 rounded text-white text-sm" placeholder="Nhập Nội dung D" />
                 </div>
               </div>
             )}

             <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="block text-xs uppercase text-slate-500 mb-1">Thời gian (s)</label>
                  <input type="number" value={questionDraft.time} onChange={e => setQuestionDraft({...questionDraft, time: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white" />
                </div>
                <div className="w-1/2">
                  <label className="block text-xs uppercase text-slate-500 mb-1">Đáp án Đúng</label>
                  <input type="text" value={questionDraft.correct} onChange={e => setQuestionDraft({...questionDraft, correct: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white font-bold" />
                </div>
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
                 <input type="text" value={questionDraft.mediaUrl} onChange={e => setQuestionDraft({...questionDraft, mediaUrl: e.target.value})} placeholder="URL của file media (tuỳ chọn)" className="w-2/3 bg-slate-900 border border-slate-700 p-2 rounded text-white" disabled={questionDraft.mediaType === 'none'}/>
               </div>
             </div>

          </div>
        </div>

        {/* Danh sách Câu hỏi trình chiếu */}
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
                       }} className="text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 rounded-lg flex-[0.8]">
                          Sửa
                       </button>
                       <button onClick={() => {
                          if (window.confirm(`Xóa Câu ${q.id} khỏi danh sách?`)) {
                             setQuestionsList(prev => prev.filter((_, idx) => idx !== i));
                          }
                       }} className="text-sm font-semibold bg-red-900/50 hover:bg-red-800 text-red-200 py-2 px-3 rounded-lg border border-red-800 flex items-center justify-center">
                          <Trash2 className="w-4 h-4"/>
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
                          const fullQ = {...q, options: ['A','B','C','D']};
                          setQuestionDraft(fullQ);
                          socket.emit('admin:push_question', { question: fullQ, isRescue: false });
                       }} className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white py-2 px-2 rounded-lg flex-[1.2] flex items-center justify-center shadow-md whitespace-nowrap">
                          <Presentation className="w-3 h-3 mr-1"/> Chiếu Luôn
                       </button>
                    </div>
                 </div>
               ))}
             </div>
           </div>
        )}

      </div>

      {/* CỘT PHẢI: WORKFLOW & GIÁM SÁT */}
      <div className="w-full md:w-2/3 flex flex-col gap-6">
        
        {/* Action Panel */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
           <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center"><Activity className="mr-2 text-yellow-500"/> Workflow Điều Khiển</span>
              <span className="text-xs px-3 py-1 bg-slate-700 rounded-full">Phase: <span className="text-white font-bold">{gameState.phase}</span></span>
           </h3>
           
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
           </div>
                      <div className="mt-6 border-t border-slate-700 pt-6 space-y-3">
               <button 
                  onClick={rescueAll} 
                  className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white py-3 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg transition active:scale-95"
               >
                  <HeartHandshake className="mr-2"/> CỨU TẤT CẢ ({eliminatedCount})
               </button>
               <button 
                  onClick={rescueSpecific} 
                  className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg flex items-center justify-center text-sm font-semibold transition active:scale-95"
               >
                  Cứu theo SBD cụ thể
               </button>
            </div>
        </div>

        {/* Monitor Panel */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-4">
                  <h3 className="text-xl font-bold text-white flex items-center"><Activity className="mr-2"/> Giám Sát Real-time</h3>
                  <button 
                    onClick={clearStudents}
                    className="p-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors border border-red-900/50 flex items-center gap-1 text-xs font-bold uppercase tracking-tighter"
                    title="Xóa sạch danh sách"
                  >
                     <Trash2 size={14} /> Xóa DS
                  </button>
               </div>
              <div className="flex gap-4 text-sm text-slate-400">
                <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div> Đang chơi: {activeCount}</span>
                <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div> Đã loại: {eliminatedCount}</span>
                <span className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></div> 
                  Đã nộp: {submittedCount}/{
                    gameState.question?.isRescue ? eliminatedCount : 
                    gameState.question?.isAudience ? studentList.length : 
                    activeCount
                  }
                </span>
              </div>
           </div>

           <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[500px]">
              <table className="w-full text-left text-sm text-slate-300">
                 <thead className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SBD</th>
                      <th className="px-4 py-3">Lớp</th>
                      <th className="px-4 py-3">Họ Tên</th>
                      <th className="px-4 py-3">PIN/Connect</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Đáp án đang có</th>
                      <th className="px-4 py-3">Hành động</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-700/50">
                    {studentList.map(s => (
                       <tr key={s.sbd} className={`hover:bg-slate-750 transition-colors ${s.status === 'eliminated' ? 'opacity-50' : ''}`}>
                         <td className="px-4 py-3 font-mono font-bold text-white">{s.sbd}</td>
                         <td className="px-4 py-3 font-medium">{s.lop}</td>
                         <td className="px-4 py-3 font-medium">{s.hoTen}</td>
                         <td className="px-4 py-3">
                           <div className="flex items-center">
                             <div className={`w-2 h-2 rounded-full mr-2 ${s.online ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                             {s.pin}
                           </div>
                         </td>
                         <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded-full font-semibold ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {s.status === 'active' ? 'Trong sân' : 'Đã loại'}
                            </span>
                         </td>
                         <td className="px-4 py-3">
                            {s.currentAnswer !== null ? <span className="font-bold text-yellow-400">{s.currentAnswer}</span> : <span className="text-slate-600">-</span>}
                         </td>
                         <td className="px-4 py-3 space-x-2">
                            <button onClick={() => resetStudent(s.sbd)} title="Reset Connect" className="text-slate-400 hover:text-white"><Activity className="w-4 h-4"/></button>
                             {s.status === 'eliminated' ? (
                                <button 
                                   onClick={() => rescueStudent(s.sbd)} 
                                   title="Cứu thí sinh này vào thi đấu" 
                                   className="ml-2 text-pink-500 hover:text-pink-400 transition-colors animate-pulse"
                                >
                                   <HeartHandshake className="w-5 h-5"/>
                                </button>
                             ) : (
                                <button 
                                   onClick={() => eliminateStudent(s.sbd)} 
                                   title="Loại thí sinh này (vi phạm quy chế)" 
                                   className="ml-2 text-red-500 hover:text-red-400 transition-colors"
                                >
                                   <XCircle className="w-4 h-4"/>
                                </button>
                             )}
                            {/* Chức năng xem QR Code */}
                         </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>

      </div>
    </div>
  );
}
