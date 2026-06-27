/**
 * Image Optimization Helper
 * Dynamic Resize + WebP Conversion
 */
export const getOptimizedImage = (url, width = 800, quality = 80) => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const SERVICE_URL = isLocal ? 'http://localhost:5000/api/images/proxy' : 'https://stuffy-backend-api.onrender.com/api/images/proxy';
    return `${SERVICE_URL}?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
};
