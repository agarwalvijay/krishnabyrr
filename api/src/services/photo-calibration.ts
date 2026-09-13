/**
 * Photo calibration — colour/exposure correction derived from a grey-card frame.
 *
 * Workflow: the admin shoots a neutral 18% grey card as the first frame of a
 * photo session and uploads it once. We measure how far that card landed from
 * neutral mid-grey, store the correction, and apply it to every product image
 * uploaded afterwards. The most recent calibration stays active indefinitely,
 * so a session that reuses yesterday's lighting needs no new card — it is
 * re-shot only when the setup changes.
 *
 * Why this works: an 18% grey card is neutral by construction (R=G=B), so any
 * tint it picks up is the light's tint, not the card's. Measured across two
 * separate sessions on the same setup the gains agreed to within 0.2%, which is
 * what makes carrying a calibration forward safe.
 *
 * Target: 18% grey sits at ~118/255 in sRGB.
 */

import sharp from 'sharp';
import pool from '../db/client';

/** sRGB value that a correctly exposed 18% grey card should land on. */
const TARGET_GREY = 118;

// Guard rails. A grey card shot in sane light needs small corrections; anything
// beyond this means the wrong image was uploaded or the card was in shadow, and
// silently applying it to a whole batch would be worse than refusing.
const MAX_GAIN       = 1.40;
const MIN_GAIN       = 0.70;
const MAX_STOPS      = 1.5;
const MIN_SAMPLE_PCT = 15;   // a card filling the centre gives ~90%; products score far lower
// A real grey card is uniform, so its neutral pixels cluster tightly in
// luminance. Measured: card IQR 10.7, product photos 26-57. This is what
// actually distinguishes "grey card" from "any photo with neutral pixels".
const MAX_LUM_IQR    = 22;

export interface Calibration {
  id?:             string;
  gain_r:          number;
  gain_g:          number;
  gain_b:          number;
  exposure_stops:  number;
  measured_r?:     number;
  measured_g?:     number;
  measured_b?:     number;
  sample_pct?:     number;
  created_at?:     string;
  note?:           string | null;
}

export class CalibrationError extends Error {}

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Measures a grey-card frame and derives the correction.
 *
 * Sampling: crop to the central 60% (the card is expected to dominate the
 * frame), downsample, then keep only near-neutral pixels in a sane luminance
 * band. That naturally rejects the card's black rim, its white crosshair, and
 * any backdrop creeping in at the edges. The median — not the mean — is taken
 * so a few surviving outliers can't drag the result.
 */
export async function measureGreyCard(buffer: Buffer): Promise<Calibration> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new CalibrationError('Could not read image dimensions');

  const cropW = Math.round(meta.width  * 0.6);
  const cropH = Math.round(meta.height * 0.6);
  const { data, info } = await sharp(buffer)
    .rotate()
    .extract({
      left: Math.round((meta.width  - cropW) / 2),
      top:  Math.round((meta.height - cropH) / 2),
      width: cropW, height: cropH,
    })
    .resize({ width: 240, height: 240, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rs: number[] = [], gs: number[] = [], bs: number[] = [], lums: number[] = [];
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // Near-neutral, and neither crushed nor blown.
    if (max - min > 22) continue;
    const lum = (r + g + b) / 3;
    if (lum < 30 || lum > 225) continue;
    rs.push(r); gs.push(g); bs.push(b); lums.push(lum);
  }

  const samplePct = (rs.length / total) * 100;
  if (samplePct < MIN_SAMPLE_PCT) {
    throw new CalibrationError(
      `Could not find a grey card in this image (only ${samplePct.toFixed(1)}% of the centre read as neutral). ` +
      `Make sure the card fills most of the frame and is evenly lit.`
    );
  }

  // Uniformity check — rejects product photos that happen to contain neutral
  // pixels (a white backdrop, a grey fold) but are not a card.
  const sortedLum = [...lums].sort((a, b) => a - b);
  const quant = (p: number) => sortedLum[Math.floor(sortedLum.length * p)];
  const lumIqr = quant(0.75) - quant(0.25);
  if (lumIqr > MAX_LUM_IQR) {
    throw new CalibrationError(
      `This does not look like a grey card — the neutral areas vary too much in brightness ` +
      `(spread ${lumIqr.toFixed(0)}, expected under ${MAX_LUM_IQR}). Upload the grey-card frame, not a product photo.`
    );
  }

  const median = (a: number[]) => {
    a.sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const mr = median(rs), mg = median(gs), mb = median(bs);
  const avg = (mr + mg + mb) / 3;

  // Luma-preserving white balance: scale each channel toward the common mean.
  const gain_r = avg / mr, gain_g = avg / mg, gain_b = avg / mb;

  // Exposure, computed in linear light where "stops" actually mean something.
  const stops = Math.log2(srgbToLinear(TARGET_GREY) / srgbToLinear(avg));

  for (const [name, g] of [['R', gain_r], ['G', gain_g], ['B', gain_b]] as const) {
    if (g < MIN_GAIN || g > MAX_GAIN) {
      throw new CalibrationError(
        `Measured ${name} gain of ${g.toFixed(2)} is outside the sane range ` +
        `(${MIN_GAIN}–${MAX_GAIN}). The card was probably in shadow or lit by mixed light.`
      );
    }
  }
  if (Math.abs(stops) > MAX_STOPS) {
    throw new CalibrationError(
      `Measured exposure error of ${stops.toFixed(2)} stops exceeds the ±${MAX_STOPS} limit. ` +
      `The card frame looks badly over- or under-exposed.`
    );
  }

  return {
    gain_r, gain_g, gain_b,
    exposure_stops: stops,
    measured_r: mr, measured_g: mg, measured_b: mb,
    sample_pct: samplePct,
  };
}

/** Persists a calibration. The newest row is the active one. */
export async function saveCalibration(c: Calibration, referencePath: string | null, note: string | null): Promise<Calibration> {
  const { rows: [row] } = await pool.query(
    `INSERT INTO photo_calibrations
       (gain_r, gain_g, gain_b, exposure_stops, measured_r, measured_g, measured_b, sample_pct, reference_path, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [c.gain_r, c.gain_g, c.gain_b, c.exposure_stops,
     c.measured_r ?? null, c.measured_g ?? null, c.measured_b ?? null, c.sample_pct ?? null,
     referencePath, note],
  );
  return rowToCalibration(row);
}

/** The active calibration — most recent row, or null if never calibrated. */
export async function getActiveCalibration(): Promise<Calibration | null> {
  const { rows: [row] } = await pool.query(
    `SELECT * FROM photo_calibrations ORDER BY created_at DESC LIMIT 1`
  );
  return row ? rowToCalibration(row) : null;
}

export async function listCalibrations(limit = 20): Promise<Calibration[]> {
  const { rows } = await pool.query(
    `SELECT * FROM photo_calibrations ORDER BY created_at DESC LIMIT $1`, [limit]
  );
  return rows.map(rowToCalibration);
}

function rowToCalibration(row: Record<string, unknown>): Calibration {
  return {
    id:             row.id as string,
    gain_r:         Number(row.gain_r),
    gain_g:         Number(row.gain_g),
    gain_b:         Number(row.gain_b),
    exposure_stops: Number(row.exposure_stops),
    measured_r:     row.measured_r != null ? Number(row.measured_r) : undefined,
    measured_g:     row.measured_g != null ? Number(row.measured_g) : undefined,
    measured_b:     row.measured_b != null ? Number(row.measured_b) : undefined,
    sample_pct:     row.sample_pct != null ? Number(row.sample_pct) : undefined,
    created_at:     row.created_at as string,
    note:           (row.note as string) ?? null,
  };
}

/**
 * Applies a calibration to a raw image buffer.
 *
 * The exposure multiplier is converted from stops (linear) into an sRGB-space
 * multiplier, because sharp's linear() operates on the encoded values. Combined
 * with the per-channel gains this is a single pass.
 */
export async function applyCalibration(buffer: Buffer, c: Calibration): Promise<Buffer> {
  const exposureMultiplier = Math.pow(Math.pow(2, c.exposure_stops), 1 / 2.2);
  return sharp(buffer)
    .linear(
      [c.gain_r * exposureMultiplier, c.gain_g * exposureMultiplier, c.gain_b * exposureMultiplier],
      [0, 0, 0],
    )
    .toBuffer();
}
