import { Router } from 'express';
import pool from '../db/client';

const router = Router();

// Public-safe setting keys — never expose cost prices or internal config
const PUBLIC_KEYS = [
  'store_name',
  'whatsapp_number',
  'support_email',
  'exchange_window_days',
  'exchange_active',
  'zone_a_rate',
  'zone_a_free_above',
  'zone_b_rate',
  'zone_b_free_above',
  'new_badge_days',
  'ga_tag',
] as const;

router.get('/public', async (_req, res, next) => {
  try {
    const { rows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [PUBLIC_KEYS]
    );

    const data: Record<string, unknown> = {};
    for (const row of rows) {
      data[row.key] = row.value;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
