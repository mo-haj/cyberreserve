// Arena logo / banner uploads: what is accepted (pure, unit-tested).
// Only PNG, JPEG and WebP, recognised by their first bytes (the file name and
// the browser's claimed type are not trusted). No SVG: it can carry scripts.

/** 'group' = a zone's photo (stored with kind "group:<id>"). */
export type ImageKind = 'logo' | 'cover' | 'group' | 'post' | 'game';

export const IMAGE_LIMITS: Record<ImageKind, number> = {
  logo: 512 * 1024, // 512 KB
  cover: 2 * 1024 * 1024, // 2 MB
  group: 2 * 1024 * 1024, // 2 MB
  post: 2 * 1024 * 1024, // 2 MB
  game: 512 * 1024, // 512 KB
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

/** Biggest side and area we accept: a small file can still declare a huge picture that freezes phones. */
export const MAX_SIDE = 4096;
export const MAX_PIXELS = 16_000_000;

/** Width and height from the file header (PNG IHDR, JPEG SOF, WebP VP8/VP8L/VP8X), or null if not found. */
export function imageSize(bytes: Uint8Array, mime: string): { w: number; h: number } | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  if (mime === 'image/png') {
    if (b.length < 24) return null;
    return { w: u32be(16), h: u32be(20) };
  }
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: u16be(i + 5), w: u16be(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (mime === 'image/webp') {
    if (b.length < 30) return null;
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === 'VP8L') {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    return null;
  }
  return null;
}

export function checkImage(kind: ImageKind, bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0 || bytes.length > IMAGE_LIMITS[kind]) return { ok: false, error: 'image_size' };
  const mime = sniffImage(bytes);
  if (!mime) return { ok: false, error: 'image_type' };
  const size = imageSize(bytes, mime);
  if (!size || size.w < 1 || size.h < 1) return { ok: false, error: 'image_type' };
  if (size.w > MAX_SIDE || size.h > MAX_SIDE || size.w * size.h > MAX_PIXELS) return { ok: false, error: 'image_size' };
  return { ok: true, mime };
}
