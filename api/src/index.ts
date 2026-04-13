import 'dotenv/config';
import app from './app';
import pool from './db/client';
import { getRedisClient } from './redis';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start(): Promise<void> {
  // Verify DB connection before accepting traffic
  await pool.query('SELECT 1');
  console.log('[db] PostgreSQL connected');

  // Warm up Redis
  const redis = await getRedisClient();
  await redis.ping();
  console.log('[redis] Redis connected');

  app.listen(PORT, () => {
    console.log(`[api] KrishnaByrr API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
