// Feature images: a web link, or a photo from this computer shrunk and saved with the
// trip as a data URL. The published copy keeps trips in browser storage (about 5 MB in
// all), so uploads are cut down to a banner-sized JPEG first.

const MAX_W = 1000;
const MAX_H = 700;

/** Shrinks a photo to fit 1000×700 and re-encodes it as JPEG; throws if the browser can't read it. */
export async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(`Couldn't read ${file.name} as an image. Try a JPEG or PNG.`);
    }
    const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A feature image has to be a web link or an uploaded image. */
export function validImage(src: string): boolean {
  return /^https?:\/\/\S+$/i.test(src) || src.startsWith('data:image/');
}
