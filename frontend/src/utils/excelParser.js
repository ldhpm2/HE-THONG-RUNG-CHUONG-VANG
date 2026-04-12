import * as XLSX from 'xlsx';

export const parseExcelStudentList = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target.result;
        // Đọc workbook
        const workbook = XLSX.read(data, { type: 'binary' });
        // Lấy sheet đầu tiên
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // Parse ra json
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        // Map lại các key cho chắc chắn (bỏ qua khoảng trắng dư và đồng bộ in hoa)
        const students = jsonData.map(row => {
          const normalizedRow = {};
          for (let key in row) {
             const cleanKey = key.toString().trim().toUpperCase();
             normalizedRow[cleanKey] = row[key];
          }
          
          return {
            sbd: (normalizedRow['SBD'] || '').toString().trim(),
            hoTen: (normalizedRow['HỌC VÀ TÊN'] || normalizedRow['HỌ TÊN'] || normalizedRow['HOTEN'] || '').toString().trim(),
            lop: (normalizedRow['LỚP'] || normalizedRow['LOP'] || '').toString().trim(),
            pin: (normalizedRow['MÃ PIN'] || normalizedRow['PIN'] || '').toString().trim()
          };
        }).filter(s => s.sbd !== ''); // bỏ dòng trống

        resolve(students);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const parseExcelQuestions = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
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

          return {
            id: index + 1,
            type: type,
            content: (nRow['CÂU HỎI'] || nRow['NỘI DUNG'] || nRow['NỘI DUNG CÂU HỎI'] || nRow['QUESTION'] || '').toString().trim(),
            optionA: (nRow['A'] || nRow['PHƯƠNG ÁN A'] || nRow['ĐÁP ÁN A'] || '').toString().trim(),
            optionB: (nRow['B'] || nRow['PHƯƠNG ÁN B'] || nRow['ĐÁP ÁN B'] || '').toString().trim(),
            optionC: (nRow['C'] || nRow['PHƯƠNG ÁN C'] || nRow['ĐÁP ÁN C'] || '').toString().trim(),
            optionD: (nRow['D'] || nRow['PHƯƠNG ÁN D'] || nRow['ĐÁP ÁN D'] || '').toString().trim(),
            correct: (nRow['ĐÁP ÁN ĐÚNG'] || nRow['ĐÁP ÁN'] || nRow['CORRECT'] || 'A').toString().toUpperCase().trim(),
            time: Number(nRow['THỜI GIAN'] || nRow['TIME']) || 15,
            mediaType: (nRow['LOẠI MEDIA'] || nRow['MEDIA TYPE'] || 'none').toString().toLowerCase().trim(),
            mediaUrl: (nRow['URL MEDIA'] || nRow['LINK MEDIA'] || '').toString().trim()
          };
        }).filter(q => q.content !== ''); 

        resolve(questions);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
