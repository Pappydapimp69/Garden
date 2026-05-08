import { MAX_IMAGE_DIM, IMAGE_QUALITY, REID_CROP_PCT } from '../config.js';

// File → downscaled JPEG data URL.
export function processUpload(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const maxDim = Math.max(w, h);
      if (maxDim > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / maxDim;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Crop a square chunk centered on (xPct, yPct) of the original image, sized to
// REID_CROP_PCT of each dimension. Used for batched re-ID close-ups.
export function cropFromImage(dataUrl, xPct, yPct) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight;
      const cw = Math.round(W * (REID_CROP_PCT / 100));
      const ch = Math.round(H * (REID_CROP_PCT / 100));
      const cx = Math.round(W * (xPct / 100));
      const cy = Math.round(H * (yPct / 100));
      const x = Math.max(0, Math.min(W - cw, cx - cw / 2));
      const y = Math.max(0, Math.min(H - ch, cy - ch / 2));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
