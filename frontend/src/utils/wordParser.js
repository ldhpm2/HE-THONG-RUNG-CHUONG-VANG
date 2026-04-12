import mammoth from 'mammoth';

export const parseWordQuestions = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        
        // Cấu hình Mammoth để giữ lại thuộc tính gạch chân (u) 
        // và tự động chuyển đổi ảnh trong Word sang base64
        const options = {
          styleMap: [
            "u => u",
            "b => b",
            "i => i"
          ],
          convertImage: mammoth.images.imgElement((image) => {
              return image.read("base64").then((imageBuffer) => {
                  return {
                      src: "data:" + image.contentType + ";base64," + imageBuffer
                  };
              });
          })
        };

        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        let html = result.value;

        // Phân tích HTML sinh ra từ Word file
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const questions = [];
        let currentQuestion = null;

        // Lặp qua từng block (đoạn / thẻ p)
        const elements = doc.body.children;

        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const text = el.textContent.trim();
          
          // Xử lý Hình ảnh nếu có (Áp dụng cho mọi element thuộc câu hỏi)
          const imgs = el.querySelectorAll('img');
          let foundImg = null;
          if (imgs.length > 0) {
             foundImg = imgs[0].src;
          }

          // Kiểm tra xem dòng này có bắt đầu câu hỏi mới không? (Ví dụ: "Câu 1. nội dung")
          const questionMatch = text.match(/^Câu\s+(\d+)[\.\:]\s*(.*)/i);
          
          if (questionMatch) {
             if (currentQuestion) {
                 questions.push(currentQuestion);
             }
             currentQuestion = {
                id: parseInt(questionMatch[1]),
                type: 'mcq', // Mặc định là trắc nghiệm
                content: text, // Giữ nguyên toàn bộ text bao gồm chữ "Câu 1."
                optionA: '',
                optionB: '',
                optionC: '',
                optionD: '',
                correct: 'A', // Mặc định
                time: 15,
                mediaType: foundImg ? 'image' : 'none',
                mediaUrl: foundImg || '' 
             };
          } else if (currentQuestion) {
             // Cập nhật ảnh nếu câu này có ảnh mà câu hỏi chưa có
             if (foundImg && currentQuestion.mediaType === 'none') {
                currentQuestion.mediaUrl = foundImg;
                currentQuestion.mediaType = 'image';
             }

             // Phát hiện dòng các phương án A, B, C, D
             const optionMatch = text.match(/^([A-D])[\.\:]\s*(.*)/i);
             if (optionMatch) {
                const optLetter = optionMatch[1].toUpperCase();
                const optContent = optionMatch[2];
                currentQuestion['option' + optLetter] = optContent;
                
                // Logic dò đáp án đúng bằng cách gạch chân thứ tự 
                // Ví dụ: <u>A</u>. nội dung
                const leadingU = el.querySelector('u');
                if (leadingU && leadingU.textContent.trim().toUpperCase().startsWith(optLetter)) {
                    currentQuestion.correct = optLetter;
                }
             }
             
             // Phát hiện câu tự luận hoặc câu có dòng "Đáp án: " rõ ràng
             const answerMatch = text.match(/^Đáp\s+án[\:\s]+(.*)/i);
             if (answerMatch) {
                const anstext = answerMatch[1].trim();
                if (/^[A-D]$/i.test(anstext)) {
                   // Trắc nghiệm gõ chữ Đáp án: A
                   currentQuestion.correct = anstext.toUpperCase();
                } else {
                   // Cấu trúc lạ hoặc tự luận => Ghi nhận tự luận (VD: "Đáp án: 7")
                   currentQuestion.type = 'short';
                   currentQuestion.correct = anstext;
                }
             }

             // Phần nội dung mở rộng (nếu dòng có chữ mà không thuộc loại trên)
             if (!optionMatch && !answerMatch && !questionMatch && text !== "") {
                if (currentQuestion.content) {
                   currentQuestion.content += "\n" + text;
                } else {
                   currentQuestion.content = text;
                }
             }
          }
        }
        
        if (currentQuestion) {
           questions.push(currentQuestion);
        }

        resolve(questions);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
