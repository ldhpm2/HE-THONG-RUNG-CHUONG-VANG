/**
 * Google Drive Picker Utility
 * Cho phép người dùng chọn file từ Google Drive và tải về để xử lý
 *
 * Hướng dẫn cài đặt:
 * 1. Vào https://console.cloud.google.com/
 * 2. Tạo Project → Enable "Google Drive API" và "Google Picker API"
 * 3. Tạo OAuth 2.0 Client ID (type: Web Application)
 *    - Authorized JavaScript origins: thêm http://localhost:5173 (hoặc domain deploy)
 * 4. Tạo API Key từ "Credentials" (loại API Key, restrict Google Drive API + Picker API)
 * 5. Điền GOOGLE_CLIENT_ID và GOOGLE_API_KEY vào file .env của frontend
 *
 * File .env cần có:
 *   VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
 *   VITE_GOOGLE_API_KEY=AIzaSy...
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

// Scope yêu cầu quyền đọc file Drive
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let gapiLoaded = false;
let gisLoaded = false;
let tokenClient = null;
let accessToken = null;

/**
 * Tải Google API script nếu chưa có
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Khởi tạo GAPI (Google API Client) và GIS (Google Identity Services)
 */
export async function initGoogleAPIs() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
    throw new Error(
      'Chưa cấu hình Google API.\n\n' +
      'Vui lòng thêm vào file frontend/.env:\n' +
      'VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com\n' +
      'VITE_GOOGLE_API_KEY=AIzaSy...'
    );
  }

  // Load GAPI
  if (!gapiLoaded) {
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise((resolve) => {
      window.gapi.load('client:picker', resolve);
    });
    await window.gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiLoaded = true;
  }

  // Load GIS (Google Identity Services)
  if (!gisLoaded) {
    await loadScript('https://accounts.google.com/gsi/client');
    gisLoaded = true;
  }
}

/**
 * Xin quyền truy cập Google Drive từ người dùng
 * Trả về access token
 */
function requestAccessToken() {
  return new Promise((resolve, reject) => {
    if (accessToken) {
      resolve(accessToken);
      return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        accessToken = response.access_token;
        // Token hết hạn sau 1 giờ
        setTimeout(() => { accessToken = null; }, (response.expires_in - 60) * 1000);
        resolve(accessToken);
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Mở Google Picker để chọn file
 * @param {Object} options
 * @param {string[]} options.mimeTypes - Danh sách MIME types được phép chọn
 * @param {string} options.title - Tiêu đề của picker dialog
 * @returns {Promise<{id: string, name: string, mimeType: string}>} Thông tin file được chọn
 */
export function openGooglePicker({ mimeTypes = [], title = 'Chọn file từ Google Drive' } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      await initGoogleAPIs();
      const token = await requestAccessToken();

      let view = new window.google.picker.DocsView()
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      if (mimeTypes.length > 0) {
        view.setMimeTypes(mimeTypes.join(','));
      }

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .addView(new window.google.picker.DocsView(window.google.picker.ViewId.RECENTLY_PICKED))
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setTitle(title)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const file = data.docs[0];
            resolve({ id: file.id, name: file.name, mimeType: file.mimeType });
          } else if (data.action === window.google.picker.Action.CANCEL) {
            reject(new Error('USER_CANCELLED'));
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Tải nội dung file từ Google Drive về dạng File object (để parse như file upload thông thường)
 * @param {string} fileId - ID của file trên Drive
 * @param {string} fileName - Tên file (để xác định extension)
 * @param {string} mimeType - Định dạng MIME của file từ Drive (tuỳ chọn)
 * @returns {Promise<File>} File object
 */
export async function downloadDriveFileAsBlob(fileId, fileName, mimeType) {
  if (!accessToken) {
    throw new Error('Chưa xác thực. Vui lòng chọn file lại.');
  }

  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  // Xử lý tự động xuất (export) nếu là file của Google Workspace (như Google Sheets, Google Docs)
  if (mimeType && mimeType.includes('google-apps')) {
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
      if (!fileName.endsWith('.xlsx')) fileName += '.xlsx';
    } else if (mimeType === 'application/vnd.google-apps.document') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
      if (!fileName.endsWith('.docx')) fileName += '.docx';
    } else {
      throw new Error(`Không hỗ trợ tải trực tiếp loại file Google Workspace này: ${mimeType}`);
    }
  }

  const response = await fetch(
    url,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Lỗi tải file từ Drive: ${response.status} ${errText}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}

/**
 * Hàm tiện lợi: Mở picker và tải file về luôn
 * @param {Object} options - Tuỳ chọn cho picker
 * @returns {Promise<File>} File object sẵn sàng để parse
 */
export async function pickAndDownloadDriveFile(options = {}) {
  const fileInfo = await openGooglePicker(options);
  const file = await downloadDriveFileAsBlob(fileInfo.id, fileInfo.name, fileInfo.mimeType);
  return file;
}
