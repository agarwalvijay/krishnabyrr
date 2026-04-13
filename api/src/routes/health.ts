import { Router } from 'express';
import pool from '../db/client';
import { getRedisClient } from '../redis';

const router = Router();

router.get('/', async (_req, res) => {
  let dbOk = false;
  let redisOk = false;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    const redis = await getRedisClient();
    const pong = await redis.ping();
    redisOk = pong === 'PONG';
  } catch {
    redisOk = false;
  }

  const status = dbOk && redisOk ? 'ok' : 'degraded';
  const httpStatus = status === 'ok' ? 200 : 503;

  res.status(httpStatus).json({ status, db: dbOk, redis: redisOk });
});

export default router;
