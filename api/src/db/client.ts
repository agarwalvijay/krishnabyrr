import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

function createPool(dbName?: string): Pool {
  if (DATABASE_URL) {
    return new Pool({ connectionString: DATABASE_URL });
  }
  return new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'vijayagarwal',
    password: process.env.DB_PASSWORD ?? undefined,
    database: dbName ?? process.env.DB_NAME ?? 'krishnabyrr_dev',
  });
}

export const pool = createPool();

export function createTestPool(): Pool {
  return createPool('krishnabyrr_test');
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export default pool;
