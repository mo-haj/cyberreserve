// Browser-only: shrink a picked photo before upload so owners never hit the
// size limit. Big photos are scaled down and re-saved as WebP (keeps
// transparency), stepping the quality down until the file fits.
import { IMAGE_LIMITS, type ImageKind } from '@/lib/manage/images';

const MAX_SIDE: Record<ImageKind, number> = { logo: 512, cover: 1920, group: 1600, post: 1600, game: 512 };

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

function isSvg(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

/**
 * SVG is code, not a picture: the server never accepts it. Here the browser
 * draws it as an image (scripts inside never run when drawn this way) and we
 * upload that picture as WebP.
 */
async function svgToWebp(file: File, kind: ImageKind): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const max = MAX_SIDE[kind];
    // SVGs without a size come in as 0×0 or 300×150: draw them at full size.
    const w0 = img.naturalWidth || max;
    const h0 = img.naturalHeight || max;
    const scale = max / Math.max(w0, h0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.92, 0.85, 0.75]) {
      const blob = await encode(canvas, q);
      if (blob && blob.size <= IMAGE_LIMITS[kind]) return blob;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shrinkImage(file: File, kind: ImageKind): Promise<Blob> {
  const limit = IMAGE_LIMITS[kind];
  if (isSvg(file)) return (await svgToWebp(file, kind)) ?? file; // a failed draw is refused by the server
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // not an image the browser can read: let the server say why
  }
  const max = MAX_SIDE[kind];
  const fits = file.size <= limit && Math.max(bitmap.width, bitmap.height) <= max;
  if (fits) {
    bitmap.close();
    return file;
  }
  let scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  for (let round = 0; round < 4; round++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const q of [0.88, 0.8, 0.7, 0.6]) {
      const blob = await encode(canvas, q);
      if (blob && blob.size <= limit) {
        bitmap.close();
        return blob;
      }
    }
    scale *= 0.75;
  }
  bitmap.close();
  return file;
}
