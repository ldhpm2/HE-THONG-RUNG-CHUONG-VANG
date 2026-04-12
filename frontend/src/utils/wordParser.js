import mammoth from 'mammoth';

// Hàm làm sạch chuỗi: xử lý các ký tự điều khiển ẩn và ký tự thoát lỗi khi copy-paste
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\f/g, '\\f') // Khôi phục \f trong \forall
    .replace(/\v/g, '\\v') // Khôi phục \v
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Loại bỏ các ký tự zero-width ẩn
    .trim();
};

export const parseWordQuestions = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        
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

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const questions = [];
        let currentQuestion = null;

        const elements = doc.body.children;

        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const text = sanitizeString(el.textContent);
          
          if (!text && !el.querySelector('img')) continue;

          const imgs = el.querySelectorAll('img');
          let foundImg = null;
          if (imgs.length > 0) {
             foundImg = imgs[0].src;
          }

          const questionMatch = text.match(/^Câu\s+(\d+)[\.\:]\s*(.*)/i);
          
          if (questionMatch) {
             if (currentQuestion) {
                 questions.push(currentQuestion);
             }
             currentQuestion = {
                id: parseInt(questionMatch[1]),
                type: 'mcq', 
                content: text, 
                optionA: '',
                optionB: '',
                optionC: '',
                optionD: '',
                correct: 'A', 
                time: 15,
                mediaType: foundImg ? 'image' : 'none',
                mediaUrl: foundImg || '' 
             };
          } else if (currentQuestion) {
             if (foundImg && currentQuestion.mediaType === 'none') {
                currentQuestion.mediaUrl = foundImg;
                currentQuestion.mediaType = 'image';
             }

             const optionMatch = text.match(/^([A-D])[\.\:]\s*(.*)/i);
             if (optionMatch) {
                const optLetter = optionMatch[1].toUpperCase();
                const optContent = optionMatch[2];
                currentQuestion['option' + optLetter] = optContent;
                
                const leadingU = el.querySelector('u');
                if (leadingU && leadingU.textContent.trim().toUpperCase().startsWith(optLetter)) {
                    currentQuestion.correct = optLetter;
                }
             }
             
             const answerMatch = text.match(/^Đáp\s+án[\:\s]+(.*)/i);
             if (answerMatch) {
                const anstext = answerMatch[1].trim();
                if (/^[A-D]$/i.test(anstext)) {
                   currentQuestion.correct = anstext.toUpperCase();
                } else {
                   currentQuestion.type = 'short';
                   currentQuestion.correct = anstext;
                }
             }

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
