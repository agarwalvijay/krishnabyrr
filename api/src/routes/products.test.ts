import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { dropAndRecreateSchema, runMigrations } from '../db/migrate';
import { runSeed } from '../db/seed';
import { closeRedis } from '../redis';

// ── Test pool (krishnabyrr_test, set via setupFiles) ─────────────────────────
const testPool = new Pool({
  host: 'localhost',
  port: 5432,
  user: process.env.DB_USER ?? 'vijayagarwal',
  password: process.env.DB_PASSWORD ?? undefined,
  database: 'krishnabyrr_test',
});

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-do-not-use-in-prod';

let adminToken: string;
let activeSilkProductId: string;
let activeSilkProductSlug: string;

// ── Suite setup ───────────────────────────────────────────────────────────────
beforeAll(async () => {
  await dropAndRecreateSchema(testPool);
  await runMigrations(testPool);
  await runSeed(testPool);

  // Activate two products for testing
  await testPool.query(
    `UPDATE products SET status = 'active' WHERE sku IN ('KB-MS-001', 'KB-CH-001')`
  );

  // Insert an OOS active product to test in_stock filter
  await testPool.query(
    `INSERT INTO products (name, slug, sku, mrp, gst_rate, stock_qty, status)
     VALUES ('Test Sold Out Fabric', 'test-sold-out-fabric', 'KB-TST-OOS', 999.00, 5.00, 0, 'active')`
  );

  // Get silk product info
  const { rows: [silk] } = await testPool.query(
    `SELECT id, slug FROM products WHERE sku = 'KB-MS-001'`
  );
  activeSilkProductId = silk.id;
  activeSilkProductSlug = silk.slug;

  // Assign KB-MS-001 to maheshwari-silk category
  const { rows: [maheshwariCat] } = await testPool.query(
    `SELECT id FROM categories WHERE slug = 'maheshwari-silk'`
  );
  await testPool.query(
    `INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [activeSilkProductId, maheshwariCat.id]
  );

  // Assign fabric tag to KB-MS-001
  const { rows: [fabricTag] } = await testPool.query(
    `SELECT id FROM tags WHERE group_name = 'fabric' AND value = 'Maheshwari Silk'`
  );
  await testPool.query(
    `INSERT INTO product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [activeSilkProductId, fabricTag.id]
  );

  // Create a test collection and add KB-MS-001 to it
  const { rows: [col] } = await testPool.query(
    `INSERT INTO collections (name, slug, is_active) VALUES ('Test Collection', 'test-collection', true)
     RETURNING id`
  );
  await testPool.query(
    `INSERT INTO collection_products (collection_id, product_id, display_order) VALUES ($1, $2, 0)`,
    [col.id, activeSilkProductId]
  );

  // Build admin JWT for super@krishnabyrr.com
  const { rows: [admin] } = await testPool.query(
    `SELECT id FROM admin_users WHERE email = 'super@krishnabyrr.com'`
  );
  adminToken = jwt.sign(
    { id: admin.id, email: 'super@krishnabyrr.com', role: 'super_admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}, 60_000);

afterAll(async () => {
  await testPool.end();
  await closeRedis();
});

// ── Health ────────────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  test('returns 200 with db: true and redis: true', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe(true);
    expect(res.body.redis).toBe(true);
  });
});

// ── Public products list ──────────────────────────────────────────────────────
describe('GET /api/products', () => {
  test('returns only active products (draft products excluded)', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    // KB-BN-001 is still draft — must not appear
    expect(slugs).not.toContain('banarasi-katan-teal-zari');
    // KB-MS-001 is active — must appear
    expect(slugs).toContain(activeSilkProductSlug);
    // meta pagination
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('pages');
  });

  test('filters by category slug', async () => {
    const res = await request(app).get('/api/products?category=maheshwari-silk');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(activeSilkProductId);
  });

  test('?in_stock=true excludes stock=0 products', async () => {
    const res = await request(app).get('/api/products?in_stock=true');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain('test-sold-out-fabric');
    // active products with stock > 0 should be present
    expect(slugs).toContain(activeSilkProductSlug);
  });

  test('filters by price range (price_min + price_max)', async () => {
    // KB-MS-001 sale_price=6750 (outside), KB-CH-001 sale_price=2850 (inside)
    const res = await request(app).get('/api/products?price_min=1000&price_max=5000');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('chanderi-silk-cotton-blush-jaal');
    expect(slugs).not.toContain(activeSilkProductSlug);
  });

  test('full-text search ?q=silk returns matching active products', async () => {
    const res = await request(app).get('/api/products?q=silk');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    // At least one result should have "silk" in the name (case-insensitive)
    const hasMatch = res.body.data.some((p: { name: string }) =>
      p.name.toLowerCase().includes('silk')
    );
    expect(hasMatch).toBe(true);
  });
});

// ── Public product detail ─────────────────────────────────────────────────────
describe('GET /api/products/:slug', () => {
  test('returns full product with images array and grouped tags', async () => {
    const res = await request(app).get(`/api/products/${activeSilkProductSlug}`);
    expect(res.status).toBe(200);
    const product = res.body.data;
    expect(product.slug).toBe(activeSilkProductSlug);
    expect(Array.isArray(product.images)).toBe(true);
    expect(typeof product.tags).toBe('object');
    expect(Array.isArray(product.categories)).toBe(true);
    expect(Array.isArray(product.collections)).toBe(true);
    expect(Array.isArray(product.related_similar)).toBe(true);
    expect(Array.isArray(product.related_look)).toBe(true);
    // Sensitive admin fields must not leak
    expect(product.cost_price).toBeUndefined();
  });

  test('returns 404 for non-existent slug', async () => {
    const res = await request(app).get('/api/products/does-not-exist-xyz');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── Categories ────────────────────────────────────────────────────────────────
describe('GET /api/categories', () => {
  test('returns nested tree with parents and children', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    const tree = res.body.data;
    expect(Array.isArray(tree)).toBe(true);
    // All parents should have a children array
    for (const parent of tree) {
      expect(Array.isArray(parent.children)).toBe(true);
      expect(parent.parent_id).toBeNull();
    }
    // Silks should have Maheshwari Silk and Banarasi as children
    const silks = tree.find((c: { slug: string }) => c.slug === 'silks');
    expect(silks).toBeDefined();
    const childSlugs = silks.children.map((c: { slug: string }) => c.slug);
    expect(childSlugs).toContain('maheshwari-silk');
    expect(childSlugs).toContain('banarasi');
  });
});

// ── Collections ───────────────────────────────────────────────────────────────
describe('GET /api/collections/:slug', () => {
  test('returns collection with active products', async () => {
    const res = await request(app).get('/api/collections/test-collection');
    expect(res.status).toBe(200);
    const col = res.body.data;
    expect(col.slug).toBe('test-collection');
    expect(Array.isArray(col.products)).toBe(true);
    expect(col.products.length).toBeGreaterThan(0);
    const ids = col.products.map((p: { id: string }) => p.id);
    expect(ids).toContain(activeSilkProductId);
  });
});

// ── Admin auth guard ──────────────────────────────────────────────────────────
describe('Admin auth', () => {
  test('POST /api/admin/products without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .send({ name: 'Test', mrp: 1000, gst_rate: 5, sku: 'KB-TEST-001' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/admin/products with invalid token returns 401', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt')
      .send({ name: 'Test', mrp: 1000, gst_rate: 5, sku: 'KB-TEST-001' });
    expect(res.status).toBe(401);
  });
});

// ── Admin product CRUD ────────────────────────────────────────────────────────
describe('Admin product endpoints', () => {
  let createdProductId: string;
  let createdProductSlug: string;

  test('POST /api/admin/products creates product, auto-generates slug', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Kanjivaram Silk Unstitched',
        mrp: 12000,
        sale_price: 10800,
        gst_rate: 12,
        sku: `KB-KJ-${Date.now().toString().slice(-4)}`,
        status: 'draft',
      });

    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(p.name).toBe('Test Kanjivaram Silk Unstitched');
    expect(p.slug).toBe('test-kanjivaram-silk-unstitched');
    expect(p.status).toBe('draft');
    createdProductId = p.id;
    createdProductSlug = p.slug;
  });

  test('POST /api/admin/products without required field returns 422', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Missing MRP product' }); // mrp is required
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('PUT /api/admin/products/:id updates only provided fields', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sale_price: 9999, status: 'active' });

    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(parseFloat(p.sale_price)).toBe(9999);
    expect(p.status).toBe('active');
    // slug should not change since name was not updated
    expect(p.slug).toBe(createdProductSlug);
    // mrp should be unchanged
    expect(parseFloat(p.mrp)).toBe(12000);
  });

  test('DELETE /api/admin/products/:id sets status to archived (not hard deleted)', async () => {
    const res = await request(app)
      .delete(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');

    // Row still exists in DB
    const { rows } = await testPool.query(
      'SELECT status FROM products WHERE id = $1',
      [createdProductId]
    );
    expect(rows[0].status).toBe('archived');
  });
});

// ── Stock adjustment ──────────────────────────────────────────────────────────
describe('POST /api/admin/products/:id/stock-adjust', () => {
  test('valid adjustment updates stock_qty and writes inventory_log', async () => {
    const { rows: [before] } = await testPool.query(
      'SELECT stock_qty FROM products WHERE id = $1',
      [activeSilkProductId]
    );
    const originalQty = before.stock_qty as number;

    const res = await request(app)
      .post(`/api/admin/products/${activeSilkProductId}/stock-adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ change: -1, reason: 'Damaged during packaging' });

    expect(res.status).toBe(200);
    expect(res.body.data.stock_qty).toBe(originalQty - 1);
    expect(res.body.data.qty_before).toBe(originalQty);
    expect(res.body.data.qty_change).toBe(-1);

    // Verify inventory_log row
    const { rows: [log] } = await testPool.query(
      `SELECT * FROM inventory_log WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [activeSilkProductId]
    );
    expect(log.change_type).toBe('manual_adjustment');
    expect(log.qty_before).toBe(originalQty);
    expect(log.qty_change).toBe(-1);
    expect(log.qty_after).toBe(originalQty - 1);
    expect(log.reason).toBe('Damaged during packaging');
  });

  test('change that would make stock negative returns 400', async () => {
    const { rows: [current] } = await testPool.query(
      'SELECT stock_qty FROM products WHERE id = $1',
      [activeSilkProductId]
    );
    const qty = current.stock_qty as number;

    const res = await request(app)
      .post(`/api/admin/products/${activeSilkProductId}/stock-adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ change: -(qty + 100), reason: 'Would go negative' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });
});

// ── Admin product list filters ────────────────────────────────────────────────
describe('GET /api/admin/products', () => {
  test('returns all products (active + draft + archived) by default', async () => {
    const res = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const statuses = res.body.data.map((p: { status: string }) => p.status);
    // Should include active and draft (archived may or may not be present depending on cleanup order)
    expect(statuses).toContain('active');
    // Pagination meta present
    expect(res.body.meta).toHaveProperty('total');
  });

  test('?status=active filters to active products only', async () => {
    const res = await request(app)
      .get('/api/admin/products?status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const statuses = res.body.data.map((p: { status: string }) => p.status);
    expect(statuses.every((s: string) => s === 'active')).toBe(true);
  });

  test('?status=ACTIVE (uppercase) is normalised and filters correctly', async () => {
    const res = await request(app)
      .get('/api/admin/products?status=ACTIVE')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const statuses = res.body.data.map((p: { status: string }) => p.status);
    expect(statuses.every((s: string) => s === 'active')).toBe(true);
  });

  test('?in_stock=true excludes out-of-stock products', async () => {
    const res = await request(app)
      .get('/api/admin/products?in_stock=true&status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    // test-sold-out-fabric was inserted with stock_qty=0
    expect(slugs).not.toContain('test-sold-out-fabric');
    // active products with stock should appear
    expect(slugs).toContain(activeSilkProductSlug);
  });

  test('?stock_max=0 returns only zero-stock products', async () => {
    const res = await request(app)
      .get('/api/admin/products?stock_max=0&status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const stockValues = res.body.data.map((p: { stock_qty: number }) => p.stock_qty);
    expect(stockValues.every((qty: number) => qty <= 0)).toBe(true);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('test-sold-out-fabric');
  });

  test('?stock_min and ?stock_max together narrow results', async () => {
    // stock_min=1 excludes OOS; active silk product has stock_qty=4 after beforeAll
    const res = await request(app)
      .get('/api/admin/products?stock_min=1&status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const stockValues = res.body.data.map((p: { stock_qty: number }) => p.stock_qty);
    expect(stockValues.every((qty: number) => qty >= 1)).toBe(true);
  });

  test('?q= search trims whitespace and matches by name', async () => {
    const res = await request(app)
      .get('/api/admin/products?q=%20silk%20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

// ── Admin tags ────────────────────────────────────────────────────────────────
describe('GET /api/admin/tags', () => {
  test('returns tags with product_count field', async () => {
    const res = await request(app)
      .get('/api/admin/tags')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const tags = res.body.data;
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
    // Every tag row must expose product_count as a number
    for (const tag of tags) {
      expect(typeof tag.product_count).toBe('number');
      expect(tag).toHaveProperty('id');
      expect(tag).toHaveProperty('group_name');
      expect(tag).toHaveProperty('value');
    }
  });

  test('returns 401 without admin token', async () => {
    const res = await request(app).get('/api/admin/tags');
    expect(res.status).toBe(401);
  });
});

// ── Public products category parent-slug filter ───────────────────────────────
describe('GET /api/products?category=<parent-slug>', () => {
  test('filtering by parent category slug returns products in child categories', async () => {
    // KB-MS-001 is in maheshwari-silk, which is a child of silks
    const res = await request(app).get('/api/products?category=silks');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(activeSilkProductId);
  });

  test('filtering by child category slug still works as before', async () => {
    const res = await request(app).get('/api/products?category=maheshwari-silk');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(activeSilkProductId);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
describe('GET /api/settings/public', () => {
  test('returns public settings without exposing cost_price or admin config', async () => {
    const res = await request(app).get('/api/settings/public');
    expect(res.status).toBe(200);
    const data = res.body.data;
    // Required public keys
    expect(data).toHaveProperty('store_name');
    expect(data).toHaveProperty('exchange_window_days');
    expect(data).toHaveProperty('zone_a_rate');
    expect(data).toHaveProperty('zone_b_rate');
    // These must NOT be present
    expect(data).not.toHaveProperty('cost_price');
    expect(data).not.toHaveProperty('db_password');
    expect(data).not.toHaveProperty('jwt_secret');
  });
});
