/**
 * Read an image file and return a downscaled data URL.
 *
 * Uploads never leave the browser, so they are stored as data URIs. Email
 * clients strip those and they consume the localStorage quota, which is why
 * brand logos are capped much harder than content images and why the brand form
 * also asks for a hosted https URL to use in exports.
 */
export function readImageFile(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a valid image'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_WIDTH = 400;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

/**
 * Validate and prepare a brand logo upload.
 * SVG is kept verbatim (rasterising it would defeat the point); bitmaps are
 * downscaled to LOGO_MAX_WIDTH so the brand list stays inside the quota.
 */
export async function readLogoFile(file: File): Promise<string> {
  if (!LOGO_TYPES.includes(file.type)) {
    throw new Error('Use a PNG, JPG, SVG or WebP file.');
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error('That file is larger than 2 MB.');
  }
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  return readImageFile(file, LOGO_MAX_WIDTH);
}
