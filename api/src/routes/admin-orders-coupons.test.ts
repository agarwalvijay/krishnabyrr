/**
 * Tests for:
 *   GET  /api/admin/orders
 *   GET  /api/admin/orders/:id
 *   PATCH /api/admin/orders/:id
 *   GET  /api/admin/coupons
 *   POST /api/admin/coupons
 *   PUT  /api/admin/coupons/:id
 *   DELETE /api/admin/coupons/:id
 *   GET  /api/homepage/blocks  (public, with Redis cache)
 *   GET  /api/admin/homepage/blocks
 *   POST /api/admin/homepage/blocks
 *   PUT  /api/admin/homepage/blocks/:id
 *   DELETE /api/admin/homepage/blocks/:id
 *   GET  /api/admin/tag-groups
 *   POST /api/admin/tag-groups
 *   GET  /api/admin/settings
 *   PUT  /api/admin/settings
 *   GET  /api/tags  (new enriched shape)
 */

import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { dropAndRecreateSchema, runMigrations } from '../db/migrate';
import { runSeed } from '../db/seed';
import { closeRedis } from '../redis';

const testPool = new Pool({
  host: 'localhost',
  port: 5432,
  user: process.env.DB_USER ?? 'vijayagarwal',
  password: process.env.DB_PASSWORD ?? undefined,
  database: 'krishnabyrr_test',
});

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-do-not-use-in-prod';

let adminToken: string;
let customerId: string;
let orderId: string;
let orderNumber: string;
let couponId: string;
let blockId: string;

beforeAll(async () => {
  await dropAndRecreateSchema(testPool);
  await runMigrations(testPool);
  await runSeed(testPool);

  const { rows: [admin] } = await testPool.query(
    `SELECT id FROM admin_users WHERE email = 'super@krishnabyrr.com'`
  );
  adminToken = jwt.sign(
    { id: admin.id, email: 'super@krishnabyrr.com', role: 'super_admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Create a customer + order for order tests
  const { rows: [customer] } = await testPool.query(
    `INSERT INTO customers (email, name, password_hash)
     VALUES ('order-test@example.com', 'Order Test', 'x')
     RETURNING id`
  );
  customerId = customer.id;

  const { rows: [order] } = await testPool.query(
    `INSERT INTO orders (
       customer_id, order_number, line_items, subtotal, discount_amount,
       shipping_amount, gst_amount, total, payment_status,
       fulfillment_status, shipping_address, policy_snapshot
     )
     VALUES ($1, 'KB-TEST-001', '[]', 5000, 0, 80, 250, 5330, 'paid',
             'unfulfilled', '{"name": "Test User"}', '{}')
     RETURNING id, order_number`,
    [customerId]
  );
  orderId     = order.id;
  orderNumber = order.order_number;
}, 60_000);

afterAll(async () => {
  await testPool.query(`DELETE FROM orders WHERE order_number = 'KB-TEST-001'`);
  await testPool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  await testPool.end();
  await closeRedis();
});

// ── Admin auth guard ──────────────────────────────────────────────────────────

describe('Admin auth guard', () => {
  it('returns 401 without token on /api/admin/orders', async () => {
    const res = await request(app).get('/api/admin/orders');
    expect(res.status).toBe(401);
  });

  it('returns 401 without token on /api/admin/coupons', async () => {
    const res = await request(app).get('/api/admin/coupons');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/admin/orders ─────────────────────────────────────────────────────

describe('GET /api/admin/orders', () => {
  it('returns paginated orders', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 25 });
  });

  it('filters by payment_status=paid', async () => {
    const res = await request(app)
      .get('/api/admin/orders?payment_status=paid')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const order of res.body.data) {
      expect(order.payment_status).toBe('paid');
    }
  });

  it('filters by order_number search', async () => {
    const res = await request(app)
      .get('/api/admin/orders?q=KB-TEST')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].order_number).toBe('KB-TEST-001');
  });
});

// ── GET /api/admin/orders/:id ─────────────────────────────────────────────────

describe('GET /api/admin/orders/:id', () => {
  it('returns order detail by ID', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.order_number).toBe('KB-TEST-001');
    expect(Array.isArray(res.body.data.exchanges)).toBe(true);
  });

  it('returns order detail by order_number', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${orderNumber}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(orderId);
  });

  it('returns 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/admin/orders/KB-NONEXISTENT-999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/admin/orders/:id ───────────────────────────────────────────────

describe('PATCH /api/admin/orders/:id', () => {
  it('updates fulfillment_status to fulfilled', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fulfillment_status: 'fulfilled', courier_name: 'Test Courier' });
    expect(res.status).toBe(200);
    expect(res.body.data.fulfillment_status).toBe('fulfilled');
    expect(res.body.data.courier_name).toBe('Test Courier');
  });

  it('rejects invalid payment_status', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_status: 'INVALID_STATUS' });
    expect(res.status).toBe(422);
  });
});

// ── GET /api/admin/coupons ────────────────────────────────────────────────────

describe('GET /api/admin/coupons', () => {
  it('returns paginated coupons including seed data', async () => {
    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2); // WELCOME20 + FREESHIP from seed
  });

  it('filters by is_active=true', async () => {
    const res = await request(app)
      .get('/api/admin/coupons?is_active=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const c of res.body.data) {
      expect(c.is_active).toBe(true);
    }
  });
});

// ── POST /api/admin/coupons ───────────────────────────────────────────────────

describe('POST /api/admin/coupons', () => {
  it('creates a new flat coupon', async () => {
    const res = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'TESTFLAT', type: 'flat', value: 200, max_uses_per_customer: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TESTFLAT');
    expect(res.body.data.type).toBe('flat');
    couponId = res.body.data.id;
  });

  it('rejects duplicate code', async () => {
    const res = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'TESTFLAT', type: 'flat', value: 100 });
    expect(res.status).toBe(409);
  });

  it('rejects invalid type', async () => {
    const res = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'BADTYPE', type: 'invalid', value: 100 });
    expect(res.status).toBe(422);
  });
});

// ── PUT /api/admin/coupons/:id ────────────────────────────────────────────────

describe('PUT /api/admin/coupons/:id', () => {
  it('updates coupon is_active to false', async () => {
    const res = await request(app)
      .put(`/api/admin/coupons/${couponId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
  });
});

// ── DELETE /api/admin/coupons/:id ─────────────────────────────────────────────

describe('DELETE /api/admin/coupons/:id', () => {
  it('deletes the coupon', async () => {
    const res = await request(app)
      .delete(`/api/admin/coupons/${couponId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('TESTFLAT');
  });

  it('returns 404 for already-deleted coupon', async () => {
    const res = await request(app)
      .delete(`/api/admin/coupons/${couponId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/homepage/blocks (public) ─────────────────────────────────────────

describe('GET /api/homepage/blocks', () => {
  it('returns active blocks from DB (starter banner)', async () => {
    const res = await request(app).get('/api/homepage/blocks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Seed inserts one banner block
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].type).toBe('banner');
  });
});

// ── Admin homepage CRUD ───────────────────────────────────────────────────────

describe('Admin homepage blocks CRUD', () => {
  it('GET /api/admin/homepage/blocks returns all blocks including inactive', async () => {
    const res = await request(app)
      .get('/api/admin/homepage/blocks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST creates a product_section block', async () => {
    const res = await request(app)
      .post('/api/admin/homepage/blocks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'product_section',
        display_order: 2,
        is_active: true,
        payload: { heading: 'Featured Silks', collection_slug: 'silks', limit: 4 },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('product_section');
    expect(res.body.data.payload.heading).toBe('Featured Silks');
    blockId = res.body.data.id;
  });

  it('PUT updates block payload', async () => {
    const res = await request(app)
      .put(`/api/admin/homepage/blocks/${blockId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payload: { heading: 'Updated Silks', collection_slug: 'silks', limit: 8 } });
    expect(res.status).toBe(200);
    expect(res.body.data.payload.heading).toBe('Updated Silks');
  });

  it('DELETE removes the block', async () => {
    const res = await request(app)
      .delete(`/api/admin/homepage/blocks/${blockId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(blockId);
  });

  it('rejects invalid block type', async () => {
    const res = await request(app)
      .post('/api/admin/homepage/blocks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'invalid_type', payload: {} });
    expect(res.status).toBe(422);
  });
});

// ── GET /api/admin/tag-groups ─────────────────────────────────────────────────

describe('GET /api/admin/tag-groups', () => {
  it('returns 4 tag groups from seed migrations', async () => {
    const res = await request(app)
      .get('/api/admin/tag-groups')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
    const names = res.body.data.map((g: { name: string }) => g.name);
    expect(names).toContain('fabric');
    expect(names).toContain('color');
  });

  it('includes tag_count for each group', async () => {
    const res = await request(app)
      .get('/api/admin/tag-groups')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const fabricGroup = res.body.data.find((g: { name: string }) => g.name === 'fabric');
    expect(fabricGroup.tag_count).toBeGreaterThanOrEqual(1);
  });
});

// ── GET /api/admin/settings ───────────────────────────────────────────────────

describe('Admin settings', () => {
  it('GET returns all settings as key-value map', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('exchange_window_days');
    expect(res.body.data).toHaveProperty('store_name');
  });

  it('PUT upserts a setting', async () => {
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exchange_window_days: 14 });
    expect(res.status).toBe(200);
    expect(res.body.data.exchange_window_days).toBe(14);
  });

  it('PUT reverts to original value', async () => {
    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exchange_window_days: 7 });
  });
});

// ── GET /api/tags (enriched shape) ────────────────────────────────────────────

describe('GET /api/tags — enriched shape', () => {
  it('returns groups with label, is_filter, and tags array', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('fabric');
    const fabric = res.body.data.fabric;
    expect(fabric).toHaveProperty('label');
    expect(fabric).toHaveProperty('is_filter');
    expect(Array.isArray(fabric.tags)).toBe(true);
    expect(fabric.tags.length).toBeGreaterThanOrEqual(1);
  });

  it('fabric label is "Fabric"', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.body.data.fabric.label).toBe('Fabric');
  });
});
