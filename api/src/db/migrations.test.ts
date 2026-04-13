import { Pool } from 'pg';
import { createClient } from 'redis';
import { dropAndRecreateSchema, runMigrations } from './migrate';
import { runSeed } from './seed';

const TEST_DB = {
  host: 'localhost',
  port: 5432,
  user: process.env.DB_USER ?? 'vijayagarwal',
  password: process.env.DB_PASSWORD ?? undefined,
  database: 'krishnabyrr_test',
};

const EXPECTED_TABLES = [
  'products',
  'product_images',
  'categories',
  'product_categories',
  'tags',
  'product_tags',
  'collections',
  'collection_products',
  'customers',
  'addresses',
  'wishlist_items',
  'orders',
  'exchange_requests',
  'inventory_log',
  'coupons',
  'coupon_redemptions',
  'admin_users',
  'settings',
  'pages',
  'newsletter_subscribers',
  'testimonials',
  'related_products',
] as const;

let pool: Pool;

beforeAll(async () => {
  pool = new Pool(TEST_DB);
  await dropAndRecreateSchema(pool);
  await runMigrations(pool);
  await runSeed(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
});

// ----------------------------------------------------------------
// Table existence
// ----------------------------------------------------------------
describe('Schema: all tables exist', () => {
  test.each(EXPECTED_TABLES)('table %s exists', async (tableName) => {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `, [tableName]);
    expect(result.rows[0].exists).toBe(true);
  });
});

// ----------------------------------------------------------------
// Row counts from seed
// ----------------------------------------------------------------
describe('Seed data row counts', () => {
  test('admin_users has 3 rows', async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM admin_users');
    expect(rows[0].n).toBe(3);
  });

  test('products has 3 rows', async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
    expect(rows[0].n).toBe(3);
  });

  test('coupons has 2 rows', async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM coupons');
    expect(rows[0].n).toBe(2);
  });

  test('settings has 9 rows', async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM settings');
    expect(rows[0].n).toBe(9);
  });
});

// ----------------------------------------------------------------
// Seed data integrity spot checks
// ----------------------------------------------------------------
describe('Seed data integrity', () => {
  test('admin roles are correct', async () => {
    const { rows } = await pool.query(
      'SELECT email, role FROM admin_users ORDER BY email'
    );
    const map = Object.fromEntries(rows.map((r: { email: string; role: string }) => [r.email, r.role]));
    expect(map['catalog@krishnabyrr.com']).toBe('catalog_manager');
    expect(map['orders@krishnabyrr.com']).toBe('order_manager');
    expect(map['super@krishnabyrr.com']).toBe('super_admin');
  });

  test('all products are in draft status', async () => {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM products WHERE status = 'draft'"
    );
    expect(rows[0].n).toBe(3);
  });

  test('products MRP is within expected range', async () => {
    const { rows } = await pool.query(
      'SELECT MIN(mrp) AS min_mrp, MAX(mrp) AS max_mrp FROM products'
    );
    expect(parseFloat(rows[0].min_mrp)).toBeGreaterThanOrEqual(2500);
    expect(parseFloat(rows[0].max_mrp)).toBeLessThanOrEqual(18000);
  });

  test('products stock_qty is between 1 and 4', async () => {
    const { rows } = await pool.query(
      'SELECT MIN(stock_qty) AS min_s, MAX(stock_qty) AS max_s FROM products'
    );
    expect(rows[0].min_s).toBeGreaterThanOrEqual(1);
    expect(rows[0].max_s).toBeLessThanOrEqual(4);
  });

  test('WELCOME20 coupon is percentage type, new_only eligibility', async () => {
    const { rows } = await pool.query(
      "SELECT type, customer_eligibility, value FROM coupons WHERE code = 'WELCOME20'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('percentage');
    expect(rows[0].customer_eligibility).toBe('NEW_ONLY');
    expect(parseFloat(rows[0].value)).toBe(20);
  });

  test('FREESHIP coupon has a valid_until date ~30 days out', async () => {
    const { rows } = await pool.query(
      "SELECT valid_until FROM coupons WHERE code = 'FREESHIP'"
    );
    expect(rows).toHaveLength(1);
    const validUntil = new Date(rows[0].valid_until);
    const now = new Date();
    const diffDays = (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(28);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  test('exchange_window_days setting is 7', async () => {
    const { rows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'exchange_window_days'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(7);
  });

  test('parent categories seeded correctly', async () => {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM categories WHERE parent_id IS NULL"
    );
    expect(rows[0].n).toBe(4);
  });

  test('child categories seeded correctly', async () => {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM categories WHERE parent_id IS NOT NULL"
    );
    expect(rows[0].n).toBe(6);
  });

  test('8 tags seeded', async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM tags');
    expect(rows[0].n).toBe(8);
  });

  test('schema_migrations table tracks 7 migration files', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM schema_migrations'
    );
    expect(rows[0].n).toBe(7);
  });
});

// ----------------------------------------------------------------
// Redis connectivity
// ----------------------------------------------------------------
describe('Infrastructure: Redis', () => {
  test('Redis responds to PING', async () => {
    const redis = createClient({ url: 'redis://localhost:6379' });
    await redis.connect();
    const pong = await redis.ping();
    await redis.disconnect();
    expect(pong).toBe('PONG');
  }, 10_000);
});
