/**
 * Resizes and compresses an image client-side to optimize Base64 data sizes.
 * @param {File} file - The file object from input.
 * @param {number} maxWidth - Maximum width/height of the resized image (default 800).
 * @param {number} quality - JPEG compression quality (0.0 to 1.0, default 0.8).
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export function optimizeImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Compress to JPEG with specified quality
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve({
          base64,
          mimeType: 'image/jpeg'
        });
      };
      img.onerror = (err) => reject(new Error('Failed to load image element: ' + err.message));
    };
    reader.onerror = (err) => reject(new Error('Failed to read file: ' + err.message));
  });
}
