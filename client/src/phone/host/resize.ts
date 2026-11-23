// Client-side photo shrink before upload: phones take 12MP shots, the TV needs ~1080p.
export const MAX_EDGE = 1920;
export const JPEG_QUALITY = 0.85;

/** Scale (w, h) down to fit within max on the long edge. Never upscales. */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> (some formats/older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resize to a JPEG blob. If decoding fails, returns the original file so the server can try. */
export async function resizeImage(file: File): Promise<Blob> {
  try {
    const src = await decode(file);
    const { width, height } = fitWithin(src.width, src.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(src, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** POST one photo as multipart field `photos`. Reports byte progress 0..1. */
export function uploadPhoto(blob: Blob, filename: string, pin: string, onProgress?: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append('photos', blob, filename.replace(/\.[^.]+$/, '') + '.jpg');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/photos');
    xhr.setRequestHeader('x-host-pin', pin);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.error) msg = body.error;
      } catch {
        /* not JSON */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(form);
  });
}
