import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { invalidateRateLimitCache } from '../../services/otp';

const RATE_LIMIT_KEYS = new Set(['otp_rate_limit_max', 'otp_rate_limit_window_minutes']);

const router = Router();

// GET /api/admin/settings — all settings as { key: value } map
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query<{ key: string; value: unknown; updated_at: string }>(
      `SELECT key, value, updated_at FROM settings ORDER BY key`
    );
    const data: Record<string, unknown> = {};
    for (const row of rows) {
      data[row.key] = row.value;
    }
    res.json({ data });
  } catch (err) { next(err); }
});

// PUT /api/admin/settings — upsert one or more key/value pairs
// Body: { key: value, key2: value2, ... }
// OR:   { key: "exchange_window_days", value: 14 }
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;

    // Support both formats: { "exchange_window_days": 7 } or { key, value }
    let updates: Record<string, unknown>;
    if ('key' in body && 'value' in body && Object.keys(body).length === 2) {
      updates = { [body.key as string]: body.value };
    } else {
      updates = body;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: { message: 'No settings provided', code: 'NO_FIELDS' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(updates)) {
        await client.query(
          `INSERT INTO settings (key, value)
           VALUES ($1, $2::jsonb)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Invalidate any in-process caches whose keys changed
    const keys = Object.keys(updates);
    if (keys.some((k) => RATE_LIMIT_KEYS.has(k))) {
      invalidateRateLimitCache();
    }

    // Return updated settings
    const { rows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [keys]
    );
    const data: Record<string, unknown> = {};
    for (const row of rows) {
      data[row.key] = row.value;
    }

    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
