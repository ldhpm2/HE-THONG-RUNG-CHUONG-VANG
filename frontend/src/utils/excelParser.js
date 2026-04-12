import * as XLSX from 'xlsx';
import { isYouTubeURL } from './videoUtils';

// Hàm làm sạch chuỗi: xử lý các ký tự điều khiển ẩn và ký tự thoát lỗi khi copy-paste
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\f/g, '\\f') // Khôi phục \f trong \forall
    .replace(/\v/g, '\\v') // Khôi phục \v
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Loại bỏ các ký tự zero-width ẩn
    .trim();
};

export const parseExcelStudentList = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        const students = jsonData.map(row => {
          const normalizedRow = {};
          for (let key in row) {
             const cleanKey = key.toString().trim().toUpperCase();
             normalizedRow[cleanKey] = row[key];
          }
          
          return {
            sbd: sanitizeString(normalizedRow['SBD'] || ''),
            hoTen: sanitizeString(normalizedRow['HỌC VÀ TÊN'] || normalizedRow['HỌ TÊN'] || normalizedRow['HOTEN'] || ''),
            lop: sanitizeString(normalizedRow['LỚP'] || normalizedRow['LOP'] || ''),
            pin: sanitizeString(normalizedRow['MÃ PIN'] || normalizedRow['PIN'] || '')
          };
        }).filter(s => s.sbd !== '');

        resolve(students);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const parseExcelQuestions = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        const questions = jsonData.map((row, index) => {
          const nRow = {};
          for (let key in row) {
             const cleanKey = key.toString().trim().toUpperCase();
             nRow[cleanKey] = row[key];
          }
          
          let type = (nRow['LOẠI'] || nRow['LOẠI CÂU'] || nRow['TYPE'] || 'mcq').toString().toLowerCase().trim();
          if (type.includes('trắc nghiệm')) type = 'mcq';
          if (type.includes('tự luận')) type = 'short';

          const res = {
            id: index + 1,
            type: type,
            content: sanitizeString(nRow['CÂU HỎI'] || nRow['NỘI DUNG'] || nRow['NỘI DUNG CÂU HỎI'] || nRow['QUESTION'] || ''),
            optionA: sanitizeString(nRow['A'] || nRow['PHƯƠNG ÁN A'] || nRow['ĐÁP ÁN A'] || ''),
            optionB: sanitizeString(nRow['B'] || nRow['PHƯƠNG ÁN B'] || nRow['ĐÁP ÁN B'] || ''),
            optionC: sanitizeString(nRow['C'] || nRow['PHƯƠNG ÁN C'] || nRow['ĐÁP ÁN C'] || ''),
            optionD: sanitizeString(nRow['D'] || nRow['PHƯƠNG ÁN D'] || nRow['ĐÁP ÁN D'] || ''),
            correct: (nRow['ĐÁP ÁN ĐÚNG'] || nRow['ĐÁP ÁN'] || nRow['CORRECT'] || 'A').toString().toUpperCase().trim(),
            time: Number(nRow['THỜI GIAN'] || nRow['TIME']) || 15,
            mediaType: (nRow['LOẠI MEDIA'] || nRow['MEDIA TYPE'] || 'none').toString().toLowerCase().trim(),
            mediaUrl: sanitizeString(nRow['URL MEDIA'] || nRow['LINK MEDIA'] || '')
          };
          
          if (isYouTubeURL(res.mediaUrl)) {
             res.mediaType = 'video';
          }
          
          return res;
        }).filter(q => q.content !== ''); 

        resolve(questions);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
