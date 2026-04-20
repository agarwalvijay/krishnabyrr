import { Router } from 'express';
import pool from '../db/client';

const router = Router();

// GET /api/app-links — public, wide-open CORS (read-only, no sensitive data)
// Returns the configured Play Store and App Store URLs for the mobile app.
router.get('/', async (_req, res, next) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5-min cache

    const { rows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [['android_url', 'ios_url']]
    );

    const data: Record<string, string | null> = { android_url: null, ios_url: null };
    for (const row of rows) {
      data[row.key] = row.value as string | null;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
