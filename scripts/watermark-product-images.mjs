#!/usr/bin/env node
//
// watermark-product-images.mjs
//
// Batch-process AI-generated product images (currently from Google Gemini):
//
//   1. Inpaint the Gemini sparkle watermark out of the image using a small
//      bilinear-gradient fill. Four corner colors are sampled from the
//      image's outer edge (guaranteed to be backdrop for our compositions),
//      then bilinear-interpolated across the patch — no texture copy, no
//      seam.
//
//   2. Overlay a small Krishna's Bliss peacock-feather watermark in the
//      bottom-right corner. The watermark is generated as a luminance-
//      modulated brand-teal silhouette of the existing logo: darker source
//      pixels become more solid, lighter pixels fade out, preserving the
//      eye + frond detail of the original instead of flattening to a blob.
//
// Usage
// -----
//   node scripts/watermark-product-images.mjs
//
//   # or with custom source/dest dirs
//   SRC_DIR=~/Pictures/raw DST_DIR=~/Pictures/processed \
//     node scripts/watermark-product-images.mjs
//
// Sparkle corner
// --------------
// Gemini always places its sparkle in the BOTTOM-RIGHT of the original
// image. If you rotate the image before saving it gets moved with the
// rotation. Per-image overrides go in MAPPING below. Default is 'southeast'.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────────────────

const HOME      = process.env.HOME ?? '';
const SRC_DIR   = process.env.SRC_DIR  || path.join(HOME, 'Downloads/fabric');
const DST_DIR   = process.env.DST_DIR  || path.join(SRC_DIR, 'processed');
const LOGO_PATH = path.resolve(__dirname, '../apps/web/public/logo-krishnas-bliss.png');

// ── Mapping ───────────────────────────────────────────────────────────────────
//
// Per-image overrides: [source filename, dest filename, sparkle corner].
// Anything not listed here is auto-discovered (every *.png in SRC_DIR),
// with the dest name derived from the source and 'southeast' assumed for
// the sparkle.

/** @type {Array<[srcName: string, dstName: string, corner: 'southeast'|'southwest'|'northeast'|'northwest']>} */
const MAPPING = [
  // Example:
  // ['Gemini_Generated_Image_abcd1234.png', 'kameez.jpg', 'southeast'],
];

// ── Watermark settings ────────────────────────────────────────────────────────

const LOGO_SIZE    = 110;       // pixels
const LOGO_OPACITY = 0.65;      // 0-1, how visible the silhouette is
const LOGO_PADDING = 32;        // distance from image's bottom-right corner

// ── Inpaint settings ──────────────────────────────────────────────────────────
// Square covering the Gemini sparkle. Kept small so it fits inside the
// corner backdrop area even on images where the subject extends close to
// the edges (e.g. flat-lay borders that touch the corner).

const PATCH_SIZE  = 60;
const PATCH_INSET = 6;

// ── Brand colors ──────────────────────────────────────────────────────────────

const CREAM = { r: 0xFA, g: 0xF7, b: 0xF2 };
const TEAL  = { r: 0x1A, g: 0x6B, b: 0x6B };
const CREAM_TOLERANCE = 24;

// ─────────────────────────────────────────────────────────────────────────────

function isCreamPixel(r, g, b) {
  return (
    Math.abs(r - CREAM.r) <= CREAM_TOLERANCE &&
    Math.abs(g - CREAM.g) <= CREAM_TOLERANCE &&
    Math.abs(b - CREAM.b) <= CREAM_TOLERANCE
  );
}

/** Patch rectangle (covering the sparkle) for the given corner. */
function patchPosition(corner, w, h, size, inset) {
  switch (corner) {
    case 'southeast': return { left: w - size - inset, top: h - size - inset };
    case 'southwest': return { left: inset,            top: h - size - inset };
    case 'northeast': return { left: w - size - inset, top: inset };
    case 'northwest': return { left: inset,            top: inset };
    default: throw new Error(`Unknown corner: ${corner}`);
  }
}

const clamp = (v, max) => Math.max(0, Math.min(max - 1, v));

/** Average RGB over a small neighborhood around (cx, cy). */
function sampleAvgRGB(srcData, w, h, cx, cy, radius = 3) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const i = (clamp(cy + dy, h) * w + clamp(cx + dx, w)) * 4;
      r += srcData[i]; g += srcData[i + 1]; b += srcData[i + 2]; n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Fill a rectangle in-place with a bilinear gradient between 4 corners. */
function bilinearFill(buf, w, rect, tl, tr, bl, br) {
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

/** Sample four corner colors from positions guaranteed to be backdrop —
 *  the image's outer edge near the sparkle corner. */
function sampleCornersFromEdge(data, w, h, rect, corner, innerEdge = 4) {
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
    default: throw new Error(`Unknown corner: ${corner}`);
  }
}

/** Build the luminance-modulated teal silhouette PNG used as the watermark.
 *  Cream pixels in the source logo become transparent; everything else
 *  becomes teal at an opacity proportional to (1 - luminance). */
async function buildLogoBuffer() {
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

  // Pad with transparent space so 'southeast' gravity = LOGO_PADDING inset.
  return sharp(silhouette)
    .extend({
      bottom: LOGO_PADDING, right: LOGO_PADDING,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function processOne(srcName, dstName, sparkleCorner, logo) {
  const srcPath = path.join(SRC_DIR, srcName);
  const dstPath = path.join(DST_DIR, dstName);

  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const buf = Buffer.from(data);

  const rect = {
    ...patchPosition(sparkleCorner, w, h, PATCH_SIZE, PATCH_INSET),
    width:  PATCH_SIZE,
    height: PATCH_SIZE,
  };

  const { tl, tr, bl, br } = sampleCornersFromEdge(data, w, h, rect, sparkleCorner);
  bilinearFill(buf, w, rect, tl, tr, bl, br);

  const out = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .composite([{ input: logo, gravity: 'southeast' }])
    .jpeg({ quality: 88, mozjpeg: true, progressive: true })
    .toFile(dstPath);

  console.log(`  ${srcName.slice(0, 40).padEnd(40)} -> ${dstName.padEnd(20)} (${out.width}x${out.height}, ${(out.size / 1024).toFixed(0)} KB)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main

if (!fs.existsSync(SRC_DIR)) {
  console.error(`Source directory not found: ${SRC_DIR}`);
  process.exit(1);
}
fs.mkdirSync(DST_DIR, { recursive: true });

console.log(`SRC: ${SRC_DIR}`);
console.log(`DST: ${DST_DIR}\n`);
console.log('Building watermark...');
const logo = await buildLogoBuffer();

// Build the work list: start with MAPPING entries, then auto-discover any
// other PNGs in SRC_DIR with default settings.
const mapped = new Set(MAPPING.map(([src]) => src));
const auto   = fs.readdirSync(SRC_DIR)
  .filter((f) => /\.png$/i.test(f) && !mapped.has(f))
  .map((f) => /** @type {const} */ ([f, f.replace(/\.png$/i, '.jpg'), 'southeast']));

const workList = [...MAPPING, ...auto];

if (workList.length === 0) {
  console.log('No images to process in', SRC_DIR);
  process.exit(0);
}

console.log(`Processing ${workList.length} image${workList.length === 1 ? '' : 's'}...`);
for (const [src, dst, corner] of workList) {
  try {
    await processOne(src, dst, corner, logo);
  } catch (err) {
    console.error(`  FAILED ${src}: ${(err instanceof Error ? err.message : String(err))}`);
  }
}
console.log(`\nDone -> ${DST_DIR}`);
