import 'dotenv/config';
import app from './app';
import pool from './db/client';
import { getRedisClient } from './redis';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const REQUIRED_ENV = ['JWT_SECRET'] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function start(): Promise<void> {
  validateEnv();

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
