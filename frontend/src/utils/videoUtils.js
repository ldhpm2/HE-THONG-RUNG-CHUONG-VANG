/**
 * Extracts the YouTube Video ID from various URL formats.
 * @param {string} url - The YouTube URL.
 * @returns {string|null} - The Video ID or null if not found.
 */
export const getYouTubeID = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

/**
 * Checks if a URL is a YouTube link.
 * @param {string} url - The URL to check.
 * @returns {boolean} - True if it's a YouTube link.
 */
export const isYouTubeURL = (url) => {
  return !!getYouTubeID(url);
};

/**
 * Generates an embeddable YouTube URL.
 * @param {string} url - The YouTube URL.
 * @param {Object} options - Playback options (autoplay, mute, loop).
 * @returns {string|null} - The embed URL or null.
 */
export const getYouTubeEmbedURL = (url, { autoplay = 1, mute = 1, loop = 1 } = {}) => {
  const videoId = getYouTubeID(url);
  if (!videoId) return null;
  
  const params = new URLSearchParams({
    autoplay: autoplay ? 1 : 0,
    mute: mute ? 1 : 0,
    loop: loop ? 1 : 0,
    playlist: videoId, // Required for loop to work
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,
    origin: typeof window !== 'undefined' ? window.location.origin : ''
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};
