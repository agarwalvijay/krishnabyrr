// Cleanup for AI-generated product images (currently Google Gemini).
//
// Two-step process applied to a raw image buffer:
//
//   1. Inpaint the Gemini sparkle watermark out of the image using a small
//      bilinear-gradient fill. Four corner colors are sampled from the
//      image's outer edge (assumed backdrop for our compositions), then
//      bilinear-interpolated across the patch.
//
//   2. Overlay a small Krishna's Bliss peacock-feather watermark in the
//      bottom-right corner. Cream pixels in the source logo become
//      transparent; everything else becomes brand-teal at an opacity
//      proportional to (1 - luminance), preserving the eye + frond detail.
//
// Mirrors the standalone batch tool at scripts/watermark-product-images.mjs.

import sharp from 'sharp';
import path from 'node:path';

export type SparkleCorner = 'southeast' | 'southwest' | 'northeast' | 'northwest';

const LOGO_SIZE    = 110;
const LOGO_OPACITY = 0.65;
const LOGO_PADDING = 32;

const PATCH_SIZE  = 60;
const PATCH_INSET = 6;

const CREAM = { r: 0xFA, g: 0xF7, b: 0xF2 };
const TEAL  = { r: 0x1A, g: 0x6B, b: 0x6B };
const CREAM_TOLERANCE = 24;

// Logo is shipped alongside the API (copied into dist/assets at build time
// via api/package.json's postbuild step), so the same relative path resolves
// in dev (src/) and prod (dist/).
const LOGO_PATH = path.resolve(__dirname, '../assets/logo-krishnas-bliss.png');

let cachedLogoBuffer: Buffer | null = null;

function isCreamPixel(r: number, g: number, b: number): boolean {
  return (
    Math.abs(r - CREAM.r) <= CREAM_TOLERANCE &&
    Math.abs(g - CREAM.g) <= CREAM_TOLERANCE &&
    Math.abs(b - CREAM.b) <= CREAM_TOLERANCE
  );
}

function patchPosition(corner: SparkleCorner, w: number, h: number, size: number, inset: number) {
  switch (corner) {
    case 'southeast': return { left: w - size - inset, top: h - size - inset };
    case 'southwest': return { left: inset,            top: h - size - inset };
    case 'northeast': return { left: w - size - inset, top: inset };
    case 'northwest': return { left: inset,            top: inset };
  }
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));

function sampleAvgRGB(srcData: Buffer, w: number, h: number, cx: number, cy: number, radius = 3): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const i = (clamp(cy + dy, h) * w + clamp(cx + dx, w)) * 4;
      r += srcData[i]; g += srcData[i + 1]; b += srcData[i + 2]; n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function bilinearFill(
  buf: Buffer,
  w: number,
  rect: { left: number; top: number; width: number; height: number },
  tl: [number, number, number],
  tr: [number, number, number],
  bl: [number, number, number],
  br: [number, number, number],
): void {
  for (let dy = 0; dy < rect.height; dy++) {
    const fy = rect.height > 1 ? dy / (rect.height - 1) : 0;
    for (let dx = 0; dx < rect.width; dx++) {
      const fx = rect.width > 1 ? dx / (rect.width - 1) : 0;
      const wTL = (1 - fx) * (1 - fy);
      const wTR = fx       * (1 - fy);
      const wBL = (1 - fx) * fy;
      const wBR = fx       * fy;
      const r = Math.round(wTL * tl[0] + wTR * tr[0] + wBL * bl[0] + wBR * br[0]);
      const g = Math.round(wTL * tl[1] + wTR * tr[1] + wBL * bl[1] + wBR * br[1]);
      const b = Math.round(wTL * tl[2] + wTR * tr[2] + wBL * bl[2] + wBR * br[2]);
      const i = ((rect.top + dy) * w + (rect.left + dx)) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
}

function sampleCornersFromEdge(
  data: Buffer,
  w: number,
  h: number,
  rect: { left: number; top: number; width: number; height: number },
  corner: SparkleCorner,
  innerEdge = 4,
) {
  switch (corner) {
    case 'southeast':
      return {
        tl: sampleAvgRGB(data, w, h, w - innerEdge, rect.top),
        tr: sampleAvgRGB(data, w, h, w - innerEdge, rect.top + rect.height),
        bl: sampleAvgRGB(data, w, h, rect.left,     h - innerEdge),
        br: sampleAvgRGB(data, w, h, rect.left + rect.width, h - innerEdge),
      };
    case 'southwest':
      return {
        tl: sampleAvgRGB(data, w, h, innerEdge,     rect.top),
        bl: sampleAvgRGB(data, w, h, innerEdge,     rect.top + rect.height),
        tr: sampleAvgRGB(data, w, h, rect.left + rect.width, h - innerEdge),
        br: sampleAvgRGB(data, w, h, rect.left,     h - innerEdge),
      };
    case 'northeast':
      return {
        tr: sampleAvgRGB(data, w, h, w - innerEdge, rect.top),
        br: sampleAvgRGB(data, w, h, w - innerEdge, rect.top + rect.height),
        tl: sampleAvgRGB(data, w, h, rect.left,     innerEdge),
        bl: sampleAvgRGB(data, w, h, rect.left + rect.width, innerEdge),
      };
    case 'northwest':
      return {
        tl: sampleAvgRGB(data, w, h, innerEdge,     rect.top),
        bl: sampleAvgRGB(data, w, h, innerEdge,     rect.top + rect.height),
        tr: sampleAvgRGB(data, w, h, rect.left + rect.width, innerEdge),
        br: sampleAvgRGB(data, w, h, rect.left,     innerEdge),
      };
  }
}

async function buildLogoBuffer(): Promise<Buffer> {
  if (cachedLogoBuffer) return cachedLogoBuffer;

  const { data, info } = await sharp(LOGO_PATH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (isCreamPixel(r, g, b)) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
    } else {
      const lum      = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const darkness = 1 - lum;
      out[i]     = TEAL.r;
      out[i + 1] = TEAL.g;
      out[i + 2] = TEAL.b;
      out[i + 3] = Math.round(255 * darkness * LOGO_OPACITY);
    }
  }
  const silhouette = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(LOGO_SIZE, LOGO_SIZE)
    .png()
    .toBuffer();

  cachedLogoBuffer = await sharp(silhouette)
    .extend({
      bottom: LOGO_PADDING, right: LOGO_PADDING,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return cachedLogoBuffer;
}

/**
 * Apply Gemini sparkle removal + KB watermark to an image buffer.
 * Input: any sharp-readable format. Output: PNG buffer (lossless intermediate
 * so the caller can chain further sharp pipelines like resize/webp).
 */
export async function processGeminiImage(
  input: Buffer,
  options: { corner?: SparkleCorner } = {},
): Promise<Buffer> {
  const corner = options.corner ?? 'southeast';
  const logo = await buildLogoBuffer();

  // Honour EXIF orientation up-front so corner positions line up with the
  // visible image. We hand the result through .raw() so the rest of the
  // pipeline can run on the pixel buffer.
  const { data, info } = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const buf = Buffer.from(data);

  const rect = {
    ...patchPosition(corner, w, h, PATCH_SIZE, PATCH_INSET),
    width:  PATCH_SIZE,
    height: PATCH_SIZE,
  };

  const { tl, tr, bl, br } = sampleCornersFromEdge(data, w, h, rect, corner);
  bilinearFill(buf, w, rect, tl, tr, bl, br);

  return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .composite([{ input: logo, gravity: 'southeast' }])
    .png()
    .toBuffer();
}
