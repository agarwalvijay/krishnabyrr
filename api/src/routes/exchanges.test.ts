import request from 'supertest';
import { Pool } from 'pg';
import { serialize } from 'cookie';
import { createTestPool } from '../db/client';
import { setCart } from '../services/cart';
import { getRedisClient, closeRedis } from '../redis';
import app from '../app';

let db: Pool;
let customerToken: string;
let customerId: string;
let activeProductId: string;
let testOrderId: string;

const SESSION_ID = 'exchange-test-session-001';
const SESSION_COOKIE = serialize('kb_session', SESSION_ID, { path: '/' });

beforeAll(async () => {
  db = createTestPool();

  // Register a customer
  const reg = await request(app).post('/api/auth/register').send({
    email: 'exchange@test.com', password: 'Password123', name: 'Exchange Tester',
  });
  customerToken = reg.body.data.token;
  customerId    = reg.body.data.customer.id;

  // Activate one product
  const { rows } = await db.query<{ id: string }>(
    `UPDATE products SET status = 'active', stock_qty = 4
     WHERE sku = (SELECT sku FROM products LIMIT 1)
     RETURNING id`,
  );
  activeProductId = rows[0].id;

  // Seed a cart and place an order so we have a real order_id
  const { rows: [p] } = await db.query<{
    id: string; name: string; slug: string; sku: string; mrp: string; sale_price: string | null;
  }>(
    'SELECT id, name, slug, sku, mrp::text, sale_price::text FROM products WHERE id = $1',
    [activeProductId],
  );
  await setCart(SESSION_ID, {
    sessionId: SESSION_ID, customerId,
    items: [{
      id: 'ex-cart-item', productId: p.id, name: p.name, slug: p.slug, sku: p.sku,
      mrp: parseFloat(p.mrp), salePrice: p.sale_price ? parseFloat(p.sale_price) : null,
      primaryImage: null, stockQty: 4, quantity: 1, maxQty: 4,
    }],
    couponCode: null, couponData: null, pincode: null, zone: null,
    updatedAt: new Date().toISOString(),
  });

  const orderRes = await request(app)
    .post('/api/orders')
    .set('Cookie', SESSION_COOKIE)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      shippingAddress: {
        name: 'Exchange Tester', phone: '9876543210',
        line1: '1 Test Lane', city: 'Delhi', state: 'Delhi', pincode: '110001',
      },
    });

  testOrderId = orderRes.body.data.order.id;

  // Set exchange_eligible_until to the future so the order is exchange-eligible
  await db.query(
    `UPDATE orders SET
       exchange_eligible_until = NOW() + INTERVAL '7 days',
       policy_snapshot = '{"exchange_window_days": 7, "exchange_active": true}'
     WHERE id = $1`,
    [testOrderId],
  );
});

afterAll(async () => {
  await db.query(`DELETE FROM exchange_requests WHERE customer_id = $1`, [customerId]);
  await db.query(`DELETE FROM inventory_log WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)`, [customerId]);
  await db.query(`DELETE FROM orders WHERE customer_id = $1`, [customerId]);
  await db.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  await db.query(`UPDATE products SET status = 'draft' WHERE id = $1`, [activeProductId]);
  await db.end();
  await closeRedis();
});

// ── POST /api/exchanges ────────────────────────────────────────────────────────

describe('POST /api/exchanges', () => {
  it('creates an exchange request for an eligible order', async () => {
    const res = await request(app)
      .post('/api/exchanges')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        order_id:       testOrderId,
        items:          [{ product_id: activeProductId, quantity: 1 }],
        reason:         'wrong_size',
        customer_notes: 'Need a larger size',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.exchange_number).toMatch(/^KB-EX-\d{6}$/);
    expect(res.body.data.status).toBe('requested');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/exchanges').send({
      order_id: testOrderId,
      items: [{ product_id: activeProductId, quantity: 1 }],
      reason: 'wrong_size',
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 if order does not belong to the customer', async () => {
    // Register another customer
    const other = await request(app).post('/api/auth/register').send({
      email: 'other.exchange@test.com', password: 'Password123', name: 'Other',
    });

    const res = await request(app)
      .post('/api/exchanges')
      .set('Authorization', `Bearer ${other.body.data.token}`)
      .send({
        order_id: testOrderId,
        items:    [{ product_id: activeProductId, quantity: 1 }],
        reason:   'wrong_size',
      });
    expect(res.status).toBe(403);

    await db.query(`DELETE FROM customers WHERE id = $1`, [other.body.data.customer.id]);
  });

  it('returns 422 when exchange window has expired', async () => {
    // Create a separate order with expired exchange window
    const redis = await getRedisClient();
    const { rows: [p] } = await db.query<{
      id: string; name: string; slug: string; sku: string; mrp: string; sale_price: string | null;
    }>('SELECT id, name, slug, sku, mrp::text, sale_price::text FROM products WHERE id = $1', [activeProductId]);

    const SESSION_ID3 = 'exchange-test-session-003';
    await setCart(SESSION_ID3, {
      sessionId: SESSION_ID3, customerId,
      items: [{
        id: 'ex-cart-item3', productId: p.id, name: p.name, slug: p.slug, sku: p.sku,
        mrp: parseFloat(p.mrp), salePrice: p.sale_price ? parseFloat(p.sale_price) : null,
        primaryImage: null, stockQty: 4, quantity: 1, maxQty: 4,
      }],
      couponCode: null, couponData: null, pincode: null, zone: null,
      updatedAt: new Date().toISOString(),
    });

    const orderRes2 = await request(app)
      .post('/api/orders')
      .set('Cookie', serialize('kb_session', SESSION_ID3, { path: '/' }))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: {
          name: 'Exchange Tester', phone: '9876543210',
          line1: '1 Test Lane', city: 'Delhi', state: 'Delhi', pincode: '110001',
        },
      });

    const expiredOrderId = orderRes2.body.data.order.id;
    await db.query(
      `UPDATE orders SET exchange_eligible_until = NOW() - INTERVAL '1 day',
       policy_snapshot = '{"exchange_window_days": 7, "exchange_active": true}'
       WHERE id = $1`,
      [expiredOrderId],
    );

    const res = await request(app)
      .post('/api/exchanges')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        order_id: expiredOrderId,
        items:    [{ product_id: activeProductId, quantity: 1 }],
        reason:   'wrong_size',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EXCHANGE_WINDOW_EXPIRED');

    await db.query(`DELETE FROM inventory_log WHERE order_id = $1`, [expiredOrderId]);
    await db.query(`DELETE FROM orders WHERE id = $1`, [expiredOrderId]);
  });
});

// ── GET /api/exchanges ────────────────────────────────────────────────────────

describe('GET /api/exchanges', () => {
  it('returns the customer exchange requests', async () => {
    const res = await request(app)
      .get('/api/exchanges')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Should include the exchange created in the POST test
    const numbers = res.body.data.map((r: { exchange_number: string }) => r.exchange_number);
    expect(numbers.some((n: string) => /^KB-EX-\d{6}$/.test(n))).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/exchanges');
    expect(res.status).toBe(401);
  });
});
