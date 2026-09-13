/**
 * Admin photo-calibration endpoints.
 *
 * The admin shoots a grey card as the first frame of a photo session and
 * uploads it here once. We measure it, store the correction, and every product
 * image uploaded afterwards is corrected with it. The most recent calibration
 * stays active indefinitely — a session shot under the same lighting reuses it,
 * and a new card is only needed when the setup changes.
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import pool from '../../db/client';
import {
  measureGreyCard,
  saveCalibration,
  getActiveCalibration,
  listCalibrations,
  CalibrationError,
} from '../../services/photo-calibration';

const router = Router();
const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
});

// GET /api/admin/photo-calibration — active calibration + recent history
router.get('/', async (_req, res, next) => {
  try {
    const [active, history] = await Promise.all([getActiveCalibration(), listCalibrations(10)]);
    res.json({ data: { active, history } });
  } catch (err) { next(err); }
});

// POST /api/admin/photo-calibration — upload a grey-card frame to re-calibrate
router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { message: 'No image file provided', code: 'NO_FILE' } });
      return;
    }

    let calibration;
    try {
      calibration = await measureGreyCard(file.buffer);
    } catch (err) {
      if (err instanceof CalibrationError) {
        // The admin's mistake, not a server fault — tell them what to fix.
        res.status(422).json({ error: { message: err.message, code: 'CALIBRATION_FAILED' } });
        return;
      }
      throw err;
    }

    // Keep a small copy of the reference frame so a suspect calibration can be
    // re-examined later. No need for full resolution.
    const refName = `calibration-${randomUUID()}.webp`;
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOAD_DIR, refName));

    const note  = typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim() : null;
    const saved = await saveCalibration(calibration, path.join(UPLOAD_DIR, refName), note);

    // Surface the measurement warning alongside the stored row.
    res.status(201).json({ data: { ...saved, warning: calibration.warning } });
  } catch (err) { next(err); }
});

// DELETE /api/admin/photo-calibration — turn calibration off entirely.
//
// Uploads then store images uncorrected. Needed because the newest row always
// wins, so a bad calibration could otherwise only be displaced by finding
// another card photo — and an older card carries white balance from whatever
// lighting it was shot under, which may no longer be the setup in use.
router.delete('/', async (_req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM photo_calibrations');
    console.log(`[calibration] cleared ${rowCount} calibration(s); uploads are now uncorrected`);
    res.json({ data: { cleared: rowCount } });
  } catch (err) { next(err); }
});

export default router;
