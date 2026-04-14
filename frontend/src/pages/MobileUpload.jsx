import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { parseExcelStudentList, parseExcelQuestions } from '../utils/excelParser';
import { parseWordQuestions } from '../utils/wordParser';
import { Upload, Smartphone, CheckCircle2, AlertCircle, Loader2, LogOut, FileText, Users } from 'lucide-react';

export default function MobileUpload() {
  const [password, setPassword] = useState('');
  const [isLogged, setIsLogged] = useState(false);
  const [status, setStatus] = useState('disconnected');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    const handleConnect = () => setStatus('connected');
    const handleDisconnect = () => setStatus('disconnected');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) setStatus('connected');

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    socket.emit('admin:login', { password }, (res) => {
      setLoading(false);
      if (res.success) {
        setIsLogged(true);
        setMessage({ text: 'Đăng nhập thành công!', type: 'success' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      } else {
        setMessage({ text: res.message || 'Mật khẩu sai!', type: 'error' });
      }
    });
  };

  const handleFileChange = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setMessage({ text: `Đang xử lý ${file.name}...`, type: 'info' });

    try {
      if (type === 'students') {
        const students = await parseExcelStudentList(file);
        if (students.length === 0) throw new Error('File không có dữ liệu thí sinh hợp lệ');
        
        socket.emit('admin:upload_students', students, (res) => {
          setLoading(false);
          if (res.success) {
            setMessage({ text: `Đã nạp ${res.count} thí sinh!`, type: 'success' });
          } else {
            setMessage({ text: res.message, type: 'error' });
          }
        });
      } else {
        let questions = [];
        if (file.name.endsWith('.docx')) {
          questions = await parseWordQuestions(file);
        } else if (file.name.endsWith('.json')) {
          const text = await file.text();
          questions = JSON.parse(text);
        } else {
          questions = await parseExcelQuestions(file);
        }

        if (questions.length === 0) throw new Error('File không có câu hỏi hợp lệ');

        // Note: admin:upload_questions isn't a direct event that updates global list in server.js
        // The current Admin.jsx manages questions list locally in state.
        // To fix this for mobile, we either need a server-side questions state 
        // OR a way to tell the main Admin to refresh from a shared state.
        // For now, I'll emit a custom event that Admin.jsx can listen to.
        
        socket.emit('admin:mobile_upload_questions', questions, (res) => {
          setLoading(false);
          setMessage({ text: `Đã nạp ${questions.length} câu hỏi!`, type: 'success' });
        });
      }
    } catch (err) {
      setLoading(false);
      setMessage({ text: 'Lỗi: ' + err.message, type: 'error' });
    }
    e.target.value = ''; // Reset input
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <Smartphone size={40} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Tên Mobile Upload</h1>
          <p className="text-slate-400 text-center mb-8 text-sm">Vui lòng nhập mật khẩu Admin để tiếp tục</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu Admin"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
            />
            <button
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Đăng Nhập'}
            </button>
          </form>

          {message.text && (
            <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
              {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              {message.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {status === 'connected' ? 'Server Connected' : 'Disconnected'}
            </span>
          </div>
          <button onClick={() => setIsLogged(false)} className="text-slate-400 hover:text-white transition-colors">
            <LogOut size={20} />
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl font-black text-white">Nạp từ Điện Thoại</h2>
          <p className="text-slate-400">Chọn file từ <span className="text-blue-400 font-bold">Bộ nhớ trong</span> hoặc <span className="text-blue-400 font-bold">Tải về</span> của điện thoại.</p>
        </div>

        {/* Upload Cards */}
        <div className="grid gap-4">
          <label className="group relative bg-slate-800 p-8 rounded-3xl border border-slate-700 flex flex-col items-center justify-center gap-4 transition-all active:scale-[0.98] active:bg-slate-750 cursor-pointer overflow-hidden shadow-xl">
            <div className="p-4 bg-teal-500/10 rounded-2xl text-teal-500 group-hover:scale-110 transition-transform">
              <Users size={48} />
            </div>
            <div className="text-center">
              <span className="block text-xl font-bold text-white mb-1">📂 Nạp Thí Sinh</span>
              <span className="text-slate-400 text-sm">Truy cập bộ nhớ máy (.xlsx)</span>
            </div>
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => handleFileChange(e, 'students')} />
          </label>

          <label className="group relative bg-slate-800 p-8 rounded-3xl border border-slate-700 flex flex-col items-center justify-center gap-4 transition-all active:scale-[0.98] active:bg-slate-750 cursor-pointer overflow-hidden shadow-xl">
            <div className="p-4 bg-indigo-500/10 rounded-2xl text-indigo-500 group-hover:scale-110 transition-transform">
              <FileText size={48} />
            </div>
            <div className="text-center">
              <span className="block text-xl font-bold text-white mb-1">📂 Nạp Câu Hỏi</span>
              <span className="text-slate-400 text-sm">Truy cập bộ nhớ máy (Word/Excel)</span>
            </div>
            <input type="file" accept=".xlsx, .xls, .docx, .json" className="hidden" onChange={(e) => handleFileChange(e, 'questions')} />
          </label>
        </div>

        {/* Global Loading / Status Message */}
        {message.text && (
          <div className={`p-5 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-300 shadow-2xl ${
            message.type === 'error' ? 'bg-red-500 text-white' : 
            message.type === 'success' ? 'bg-green-600 text-white' : 
            'bg-blue-600 text-white'
          }`}>
            {loading ? <Loader2 className="animate-spin shrink-0" /> : 
             message.type === 'error' ? <AlertCircle className="shrink-0" /> : 
             <CheckCircle2 className="shrink-0" />}
            <span className="font-bold">{message.text}</span>
          </div>
        )}

        <div className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] text-center pt-8">
           Hệ Thống Rung Chuông Vàng - Mobile Utility
        </div>
      </div>
    </div>
  );
}
