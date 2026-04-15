import { Router } from 'express';
import pool from '../db/client';
import { getRedisClient } from '../redis';

const router = Router();
const CACHE_KEY = 'homepage:blocks';
const CACHE_TTL_SECONDS = 300;

// GET /api/homepage/blocks
router.get('/blocks', async (_req, res, next) => {
  try {
    // Try Redis cache first
    let redis: Awaited<ReturnType<typeof getRedisClient>> | null = null;
    try {
      redis = await getRedisClient();
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        res.json({ data: JSON.parse(cached), cached: true });
        return;
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    const { rows } = await pool.query(
      `SELECT id, type, display_order, is_active, payload
       FROM homepage_blocks
       WHERE is_active = TRUE
       ORDER BY display_order`
    );

    // Populate cache
    if (redis) {
      try {
        await redis.set(CACHE_KEY, JSON.stringify(rows), { EX: CACHE_TTL_SECONDS });
      } catch {
        // Cache write failure is non-fatal
      }
    }

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
