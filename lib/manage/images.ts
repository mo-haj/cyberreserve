// Arena logo / banner uploads: what is accepted (pure, unit-tested).
// Only PNG, JPEG and WebP, recognised by their first bytes (the file name and
// the browser's claimed type are not trusted). No SVG: it can carry scripts.

/** 'group' = a zone's photo (stored with kind "group:<id>"). */
export type ImageKind = 'logo' | 'cover' | 'group';

export const IMAGE_LIMITS: Record<ImageKind, number> = {
  logo: 512 * 1024, // 512 KB
  cover: 2 * 1024 * 1024, // 2 MB
  group: 2 * 1024 * 1024, // 2 MB
};

export const DEFAULT_COVER = '/cafes/cover-default.svg';

export function sniffImage(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return 'image/webp';
  }
  return null;
}

export type ImageCheck = { ok: true; mime: string } | { ok: false; error: 'image_type' | 'image_size' };

export function checkImage(kind: ImageKind, bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0 || bytes.length > IMAGE_LIMITS[kind]) return { ok: false, error: 'image_size' };
  const mime = sniffImage(bytes);
  return mime ? { ok: true, mime } : { ok: false, error: 'image_type' };
}
