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

// Default corner patch (used only when sparkle detection fails). Small — we
// don't want to erase real content when we don't know where the sparkle is.
const PATCH_SIZE  = 60;
const PATCH_INSET = 6;

// Sparkle detection — two-tier.
//
// Gemini's sparkle is a soft anti-aliased 4-point star whose peak brightness
// barely clears the linen backdrop's highlights (often ~230 vs backdrop ~225),
// so absolute-brightness detection is too noisy. We instead check two known
// candidate locations using LOCAL contrast: does the brightest pixel in the
// candidate's small ROI stand out from that ROI's mean? If yes, sparkle there.
//
// Observed candidate positions across all Gemini outputs we've seen:
//
//   A (corner-tight): ~50px in from the right edge, ~100px up from the bottom
//   B (offset):      ~130px in from the right edge, ~100px up from the bottom
//
const SPARKLE_CANDIDATES_PX: Array<{ dxRight: number; dyBottom: number }> = [
  { dxRight: 50,  dyBottom: 100 },
  { dxRight: 130, dyBottom: 100 },
];
const SPARKLE_ROI_HALF        = 30;    // 60x60 patch around each candidate
const SPARKLE_CONTRAST_MIN    = 18;    // brightest pixel must beat ROI mean by this much
const SPARKLE_BRIGHT_NEIGHBOURS = 4;   // # of near-peak pixels within 10px to confirm star shape
const SPARKLE_INPAINT_PAD     = 24;    // half-size of patch we inpaint around the sparkle

// Fallback (wider) detection — used when neither candidate hits.
const SPARKLE_BRIGHT       = 245;
const SPARKLE_MIN_PX       = 8;
const SPARKLE_MAX_PX       = 600;

const CREAM = { r: 0xFA, g: 0xF7, b: 0xF2 };
const TEAL  = { r: 0x1A, g: 0x6B, b: 0x6B };
const CREAM_TOLERANCE = 24;

// Logo is shipped alongside the API (copied into dist/assets at build time
// via api/package.json's postbuild step), so the same relative path resolves
// in dev (src/) and prod (dist/).
const LOGO_PATH = path.resolve(__dirname, '../assets/logo-krishnas-bliss.png');

let cachedSilhouette: Buffer | null = null;  // LOGO_SIZE x LOGO_SIZE, for explicit placement
let cachedCornerLogo: Buffer | null = null;  // padded variant for `gravity: 'southeast'`

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

async function buildSilhouette(): Promise<Buffer> {
  if (cachedSilhouette) return cachedSilhouette;

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
  cachedSilhouette = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(LOGO_SIZE, LOGO_SIZE)
    .png()
    .toBuffer();
  return cachedSilhouette;
}

async function buildCornerLogo(): Promise<Buffer> {
  if (cachedCornerLogo) return cachedCornerLogo;
  const silhouette = await buildSilhouette();
  cachedCornerLogo = await sharp(silhouette)
    .extend({
      bottom: LOGO_PADDING, right: LOGO_PADDING,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return cachedCornerLogo;
}

/**
 * Local-contrast probe of one candidate ROI. Returns the location of the
 * brightest pixel + its contrast over the ROI mean, plus how many other
 * near-peak pixels surround it (the sparkle's arms). Caller decides whether
 * to accept the hit.
 */
function probeCandidate(
  data: Buffer,
  w: number,
  h: number,
  cx: number,
  cy: number,
  half: number,
): { x: number; y: number; contrast: number; neighbours: number } | null {
  const x0 = Math.max(0, cx - half);
  const y0 = Math.max(0, cy - half);
  const x1 = Math.min(w - 1, cx + half);
  const y1 = Math.min(h - 1, cy + half);
  if (x1 <= x0 || y1 <= y0) return null;

  let sum = 0, count = 0, maxLum = -1, mx = cx, my = cy;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      const lum = data[i] + data[i + 1] + data[i + 2];
      sum += lum;
      count++;
      if (lum > maxLum) { maxLum = lum; mx = x; my = y; }
    }
  }
  const mean = sum / count;
  const contrast = (maxLum - mean) / 3;  // back to per-channel scale
  if (contrast < SPARKLE_CONTRAST_MIN) return null;

  // Count how many pixels within 10px of the peak are within 80% of the
  // peak's brightness above the local mean — that's the sparkle's arms.
  const armThreshold = maxLum - (maxLum - mean) * 0.2;
  let neighbours = 0;
  const nr = 10;
  for (let y = Math.max(y0, my - nr); y <= Math.min(y1, my + nr); y++) {
    for (let x = Math.max(x0, mx - nr); x <= Math.min(x1, mx + nr); x++) {
      const i = (y * w + x) * 4;
      const lum = data[i] + data[i + 1] + data[i + 2];
      if (lum >= armThreshold) neighbours++;
    }
  }
  if (neighbours < SPARKLE_BRIGHT_NEIGHBOURS) return null;

  return { x: mx, y: my, contrast, neighbours };
}

/**
 * Try the two known candidate locations first. Returns the better hit.
 */
function detectSparkleAtCandidates(
  data: Buffer,
  w: number,
  h: number,
): { cx: number; cy: number } | null {
  let best: { x: number; y: number; contrast: number } | null = null;
  for (const c of SPARKLE_CANDIDATES_PX) {
    const cx = w - c.dxRight;
    const cy = h - c.dyBottom;
    const hit = probeCandidate(data, w, h, cx, cy, SPARKLE_ROI_HALF);
    if (hit && (!best || hit.contrast > best.contrast)) {
      best = { x: hit.x, y: hit.y, contrast: hit.contrast };
    }
  }
  return best ? { cx: best.x, cy: best.y } : null;
}

/**
 * Scan the bottom half of the image for a tight cluster of near-white pixels —
 * Gemini's sparkle decoration. Returns the bounding box and centroid of the
 * brightest, smallest-compact such cluster, or null if nothing qualifies.
 *
 * Bottom half only because Gemini consistently places the sparkle in the
 * bottom 30–40% of its outputs (either tight in a corner or ~100–150px in).
 * Limiting the search reduces false positives from product highlights and
 * speeds up the scan by ~2x.
 */
function detectSparkle(
  data: Buffer,
  w: number,
  h: number,
): { left: number; top: number; width: number; height: number; cx: number; cy: number } | null {
  const searchTop = Math.floor(h * 0.55);
  const visited = new Uint8Array(w * h);

  let best: { left: number; top: number; right: number; bottom: number; sumX: number; sumY: number; count: number; brightness: number } | null = null;

  const stack: number[] = [];

  for (let y = searchTop; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx0 = y * w + x;
      if (visited[idx0]) continue;
      const i0 = idx0 * 4;
      if (data[i0] < SPARKLE_BRIGHT || data[i0 + 1] < SPARKLE_BRIGHT || data[i0 + 2] < SPARKLE_BRIGHT) continue;

      // BFS-style flood fill using a stack (LIFO is fine — we don't care about order).
      let left = x, top = y, right = x, bottom = y;
      let sumX = 0, sumY = 0, count = 0, brightSum = 0;

      stack.length = 0;
      stack.push(idx0);
      visited[idx0] = 1;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        const ci = cur * 4;

        sumX += cx; sumY += cy; count++;
        brightSum += data[ci] + data[ci + 1] + data[ci + 2];
        if (cx < left)   left   = cx;
        if (cx > right)  right  = cx;
        if (cy < top)    top    = cy;
        if (cy > bottom) bottom = cy;

        if (count > SPARKLE_MAX_PX) break; // too big — bail out, not a sparkle

        // 4-connectivity
        if (cx > 0) {
          const n = cur - 1;
          if (!visited[n]) {
            const ni = n * 4;
            if (data[ni] >= SPARKLE_BRIGHT && data[ni + 1] >= SPARKLE_BRIGHT && data[ni + 2] >= SPARKLE_BRIGHT) {
              visited[n] = 1; stack.push(n);
            }
          }
        }
        if (cx < w - 1) {
          const n = cur + 1;
          if (!visited[n]) {
            const ni = n * 4;
            if (data[ni] >= SPARKLE_BRIGHT && data[ni + 1] >= SPARKLE_BRIGHT && data[ni + 2] >= SPARKLE_BRIGHT) {
              visited[n] = 1; stack.push(n);
            }
          }
        }
        if (cy > searchTop) {
          const n = cur - w;
          if (!visited[n]) {
            const ni = n * 4;
            if (data[ni] >= SPARKLE_BRIGHT && data[ni + 1] >= SPARKLE_BRIGHT && data[ni + 2] >= SPARKLE_BRIGHT) {
              visited[n] = 1; stack.push(n);
            }
          }
        }
        if (cy < h - 1) {
          const n = cur + w;
          if (!visited[n]) {
            const ni = n * 4;
            if (data[ni] >= SPARKLE_BRIGHT && data[ni + 1] >= SPARKLE_BRIGHT && data[ni + 2] >= SPARKLE_BRIGHT) {
              visited[n] = 1; stack.push(n);
            }
          }
        }
      }

      if (count < SPARKLE_MIN_PX || count > SPARKLE_MAX_PX) continue;

      // Sparkle is roughly square-shaped. Reject very elongated clusters
      // (those are typically backdrop highlights along a fabric edge).
      const bbW = right - left + 1;
      const bbH = bottom - top + 1;
      const aspect = Math.max(bbW, bbH) / Math.max(1, Math.min(bbW, bbH));
      if (aspect > 3) continue;

      const avgBright = brightSum / (count * 3);
      if (!best || avgBright > best.brightness) {
        best = { left, top, right, bottom, sumX, sumY, count, brightness: avgBright };
      }
    }
  }

  if (!best) return null;
  return {
    left:   best.left,
    top:    best.top,
    width:  best.right  - best.left + 1,
    height: best.bottom - best.top  + 1,
    cx:     Math.round(best.sumX / best.count),
    cy:     Math.round(best.sumY / best.count),
  };
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

  // 1. Locate the Gemini sparkle. Tries the two known candidate locations
  //    first (cheap, deterministic); falls back to a broad bottom-half scan
  //    only if neither candidate hits. If detected, inpaint a tight patch
  //    around it and put the watermark exactly there — visually replacing
  //    the sparkle. If not found, fall back to a small corner patch + corner
  //    watermark.
  const candidate = detectSparkleAtCandidates(data, w, h);

  let sparkle: { left: number; top: number; width: number; height: number; cx: number; cy: number } | null = null;
  if (candidate) {
    const pad = SPARKLE_INPAINT_PAD;
    sparkle = {
      left:   Math.max(0, candidate.cx - pad),
      top:    Math.max(0, candidate.cy - pad),
      width:  Math.min(w - 1, candidate.cx + pad) - Math.max(0, candidate.cx - pad),
      height: Math.min(h - 1, candidate.cy + pad) - Math.max(0, candidate.cy - pad),
      cx:     candidate.cx,
      cy:     candidate.cy,
    };
  } else {
    sparkle = detectSparkle(data, w, h);
  }

  if (sparkle) {
    const pad = SPARKLE_INPAINT_PAD;
    const rect = {
      left:   Math.max(0, sparkle.left - pad),
      top:    Math.max(0, sparkle.top  - pad),
      width:  Math.min(w - 1, sparkle.left + sparkle.width  + pad) - Math.max(0, sparkle.left - pad),
      height: Math.min(h - 1, sparkle.top  + sparkle.height + pad) - Math.max(0, sparkle.top  - pad),
    };

    // Sample backdrop colours from the image's outer edge closest to the
    // sparkle. For sparkles in the bottom-right quadrant this is the same
    // 'southeast' corner sampling we use in the fallback; left-half sparkles
    // get sampled from the southwest edge instead.
    const sampleCorner: SparkleCorner = sparkle.cx > w / 2 ? 'southeast' : 'southwest';
    const { tl, tr, bl, br } = sampleCornersFromEdge(data, w, h, rect, sampleCorner);
    bilinearFill(buf, w, rect, tl, tr, bl, br);

    // Centre the watermark on the sparkle, clamped to keep it inside the image.
    const silhouette = await buildSilhouette();
    const halfLogo = Math.floor(LOGO_SIZE / 2);
    const logoLeft = Math.max(0, Math.min(w - LOGO_SIZE, sparkle.cx - halfLogo));
    const logoTop  = Math.max(0, Math.min(h - LOGO_SIZE, sparkle.cy - halfLogo));

    return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: silhouette, left: logoLeft, top: logoTop }])
      .png()
      .toBuffer();
  }

  // Fallback: no sparkle detected. Do the conservative corner inpaint and
  // place the watermark at the southeast corner.
  const rect = {
    ...patchPosition(corner, w, h, PATCH_SIZE, PATCH_INSET),
    width:  PATCH_SIZE,
    height: PATCH_SIZE,
  };

  const { tl, tr, bl, br } = sampleCornersFromEdge(data, w, h, rect, corner);
  bilinearFill(buf, w, rect, tl, tr, bl, br);

  const cornerLogo = await buildCornerLogo();
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .composite([{ input: cornerLogo, gravity: 'southeast' }])
    .png()
    .toBuffer();
}
