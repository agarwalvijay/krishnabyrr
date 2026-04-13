import request from 'supertest';
import { Pool } from 'pg';
import { serialize } from 'cookie';
import { createTestPool } from '../db/client';
import { getRedisClient, closeRedis } from '../redis';
import { setCart } from '../services/cart';
import app from '../app';

let db: Pool;
let activeProductId: string;

const SESSION_ID = 'test-order-session-001';
const SESSION_COOKIE = serialize('kb_session', SESSION_ID, { path: '/' });

const VALID_ADDRESS = {
  name:    'Test Buyer',
  phone:   '9876543210',
  line1:   '12 Main Street',
  city:    'Mumbai',
  state:   'Maharashtra',
  pincode: '400001',
  country: 'India',
};

beforeAll(async () => {
  db = createTestPool();

  // Activate one product for order tests
  const { rows } = await db.query<{ id: string }>(
    `UPDATE products SET status = 'active', stock_qty = 4
     WHERE sku = (SELECT sku FROM products ORDER BY created_at LIMIT 1)
     RETURNING id`,
  );
  activeProductId = rows[0].id;
});

afterAll(async () => {
  // Restore product to draft
  if (activeProductId) {
    await db.query(`UPDATE products SET status = 'draft' WHERE id = $1`, [activeProductId]);
  }
  await db.query(`DELETE FROM inventory_log WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'KB-%')`);
  await db.query(`DELETE FROM coupon_redemptions WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'KB-%')`);
  await db.query(`DELETE FROM orders WHERE order_number LIKE 'KB-%'`);
  await db.end();
  await closeRedis();
});

beforeEach(async () => {
  await db.query(`DELETE FROM coupon_redemptions`);
  await db.query(`DELETE FROM coupons WHERE code LIKE 'ORDERTEST%'`);
  await db.query(
    `UPDATE products SET stock_qty = 4 WHERE id = $1`,
    [activeProductId],
  );

  // Seed a test cart in Redis
  const redis = await getRedisClient();
  const { rows: [p] } = await db.query<{
    id: string; name: string; slug: string; sku: string; mrp: string; sale_price: string | null;
  }>(
    `SELECT id, name, slug, sku, mrp::text, sale_price::text FROM products WHERE id = $1`,
    [activeProductId],
  );

  await setCart(SESSION_ID, {
    sessionId:  SESSION_ID,
    customerId: null,
    items: [{
      id:           'cart-item-001',
      productId:    p.id,
      name:         p.name,
      slug:         p.slug,
      sku:          p.sku,
      mrp:          parseFloat(p.mrp),
      salePrice:    p.sale_price ? parseFloat(p.sale_price) : null,
      primaryImage: null,
      stockQty:     4,
      quantity:     1,
      maxQty:       4,
    }],
    couponCode:  null,
    couponData:  null,
    pincode:     null,
    zone:        null,
    updatedAt:   new Date().toISOString(),
  });
});

// ── POST /api/orders — validation ─────────────────────────────────────────────

describe('POST /api/orders — validation', () => {
  it('returns 400 if shippingAddress is missing', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({ guestEmail: 'guest@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 if guestEmail is missing for guest checkout', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({ shippingAddress: VALID_ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 if pincode is not 6 digits', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({
        shippingAddress: { ...VALID_ADDRESS, pincode: '12345' },
        guestEmail: 'guest@test.com',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when cart is empty (no session cookie)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ shippingAddress: VALID_ADDRESS, guestEmail: 'guest@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_CART');
  });
});

// ── POST /api/orders — guest happy path ───────────────────────────────────────

describe('POST /api/orders — guest happy path', () => {
  it('creates an order and returns order + payment info', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({
        shippingAddress: VALID_ADDRESS,
        guestEmail:      'buyer@test.com',
      });

    expect(res.status).toBe(201);
    const { order, payment } = res.body.data;

    expect(order.order_number).toMatch(/^KB-\d{6}$/);
    expect(order.payment_status).toBe('pending_confirmation');
    expect(order.fulfillment_status).toBe('unfulfilled');
    expect(Array.isArray(order.line_items)).toBe(true);
    expect(order.line_items).toHaveLength(1);
    expect(order.subtotal).toBeGreaterThan(0);
    expect(order.total).toBeGreaterThan(0);
    expect(payment.method).toBe('pay_on_confirmation');
  });

  it('decrements product stock after order', async () => {
    await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({ shippingAddress: VALID_ADDRESS, guestEmail: 'stock@test.com' });

    const { rows: [p] } = await db.query<{ stock_qty: number }>(
      `SELECT stock_qty FROM products WHERE id = $1`,
      [activeProductId],
    );
    expect(p.stock_qty).toBe(3); // was 4, ordered 1
  });

  it('writes an inventory_log row', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({ shippingAddress: VALID_ADDRESS, guestEmail: 'invlog@test.com' });

    const orderId = orderRes.body.data.order.id;
    const { rows } = await db.query(
      `SELECT * FROM inventory_log WHERE order_id = $1`,
      [orderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].change_type).toBe('order_placed');
    expect(rows[0].qty_change).toBe(-1);
  });

  it('generates sequential KB- order numbers', async () => {
    const redis = await getRedisClient();

    // Create a second cart session
    const SESSION_ID2 = 'test-order-session-002';
    const { rows: [p] } = await db.query<{
      id: string; name: string; slug: string; sku: string; mrp: string; sale_price: string | null;
    }>(
      `SELECT id, name, slug, sku, mrp::text, sale_price::text FROM products WHERE id = $1`,
      [activeProductId],
    );
    await setCart(SESSION_ID2, {
      sessionId: SESSION_ID2, customerId: null,
      items: [{
        id: 'cart-item-002', productId: p.id, name: p.name, slug: p.slug, sku: p.sku,
        mrp: parseFloat(p.mrp), salePrice: p.sale_price ? parseFloat(p.sale_price) : null,
        primaryImage: null, stockQty: 4, quantity: 1, maxQty: 4,
      }],
      couponCode: null, couponData: null, pincode: null, zone: null,
      updatedAt: new Date().toISOString(),
    });

    const r1 = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({ shippingAddress: VALID_ADDRESS, guestEmail: 'seq1@test.com' });

    const r2 = await request(app)
      .post('/api/orders')
      .set('Cookie', serialize('kb_session', SESSION_ID2, { path: '/' }))
      .send({ shippingAddress: VALID_ADDRESS, guestEmail: 'seq2@test.com' });

    const n1 = parseInt(r1.body.data.order.order_number.slice(3), 10);
    const n2 = parseInt(r2.body.data.order.order_number.slice(3), 10);
    expect(n2).toBe(n1 + 1);
  });
});

// ── POST /api/orders — coupon application ─────────────────────────────────────

describe('POST /api/orders — coupon application', () => {
  beforeEach(async () => {
    await db.query(
      `INSERT INTO coupons (code, type, value, is_active, min_order_value)
       VALUES ('ORDERTEST100', 'flat', 100, true, 0)`,
    );
  });

  it('applies a flat coupon and reflects discount in order totals', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({
        shippingAddress: VALID_ADDRESS,
        guestEmail:      'coupon@test.com',
        couponCode:      'ORDERTEST100',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.order.discount_amount).toBe(100);
    expect(res.body.data.order.coupon_code).toBe('ORDERTEST100');
  });

  it('increments coupon current_use_count after order', async () => {
    await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({
        shippingAddress: VALID_ADDRESS,
        guestEmail:      'coupon2@test.com',
        couponCode:      'ORDERTEST100',
      });

    const { rows: [c] } = await db.query<{ current_use_count: number }>(
      `SELECT current_use_count FROM coupons WHERE code = 'ORDERTEST100'`,
    );
    expect(c.current_use_count).toBe(1);
  });

  it('inserts a coupon_redemptions row after order', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({
        shippingAddress: VALID_ADDRESS,
        guestEmail:      'coupon3@test.com',
        couponCode:      'ORDERTEST100',
      });

    const orderId = orderRes.body.data.order.id;
    const { rows } = await db.query(
      `SELECT * FROM coupon_redemptions WHERE order_id = $1`,
      [orderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].discount_amount).toBe('100.00');
  });

  it('returns 422 for an invalid coupon code', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({
        shippingAddress: VALID_ADDRESS,
        guestEmail:      'bad@test.com',
        couponCode:      'NOSUCHCOUPON',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── POST /api/orders — authenticated customer ─────────────────────────────────

describe('POST /api/orders — authenticated customer', () => {
  let customerToken: string;
  let customerId: string;

  beforeEach(async () => {
    // Clean up previous customer + their orders (respecting FK order)
    const prev = await db.query<{ id: string }>(
      `SELECT id FROM customers WHERE email = 'orderauth@authtest.com'`,
    );
    if (prev.rows[0]) {
      const cid = prev.rows[0].id;
      await db.query(`DELETE FROM inventory_log WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)`, [cid]);
      await db.query(`DELETE FROM coupon_redemptions WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)`, [cid]);
      await db.query(`DELETE FROM orders WHERE customer_id = $1`, [cid]);
      await db.query(`DELETE FROM customers WHERE id = $1`, [cid]);
    }
    const reg = await request(app).post('/api/auth/register').send({
      email: 'orderauth@authtest.com', password: 'Password123', name: 'Order Auth',
    });
    customerToken = reg.body.data.token;
    customerId    = reg.body.data.customer.id;
  });

  afterEach(async () => {
    await db.query(`DELETE FROM inventory_log WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)`, [customerId]);
    await db.query(`DELETE FROM coupon_redemptions WHERE order_id IN (SELECT id FROM orders WHERE customer_id = $1)`, [customerId]);
    await db.query(`DELETE FROM orders WHERE customer_id = $1`, [customerId]);
    await db.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  });

  it('creates order and updates customer lifetime_value + total_orders', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: VALID_ADDRESS });

    expect(orderRes.status).toBe(201);

    const { rows: [c] } = await db.query<{ total_orders: number; lifetime_value: string }>(
      `SELECT total_orders, lifetime_value::text FROM customers WHERE id = $1`,
      [customerId],
    );
    expect(c.total_orders).toBe(1);
    expect(parseFloat(c.lifetime_value)).toBeGreaterThan(0);
  });
});

// ── GET /api/orders/:orderNumber ──────────────────────────────────────────────

describe('GET /api/orders/:orderNumber', () => {
  let createdOrderNumber: string;
  const guestEmail = 'fetch@test.com';

  beforeEach(async () => {
    const redis = await getRedisClient();
    const { rows: [p] } = await db.query<{
      id: string; name: string; slug: string; sku: string; mrp: string; sale_price: string | null;
    }>(
      `SELECT id, name, slug, sku, mrp::text, sale_price::text FROM products WHERE id = $1`,
      [activeProductId],
    );
    await setCart(SESSION_ID, {
      sessionId: SESSION_ID, customerId: null,
      items: [{
        id: 'fetch-cart-item', productId: p.id, name: p.name, slug: p.slug, sku: p.sku,
        mrp: parseFloat(p.mrp), salePrice: p.sale_price ? parseFloat(p.sale_price) : null,
        primaryImage: null, stockQty: 4, quantity: 1, maxQty: 4,
      }],
      couponCode: null, couponData: null, pincode: null, zone: null,
      updatedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', SESSION_COOKIE)
      .send({ shippingAddress: VALID_ADDRESS, guestEmail });

    createdOrderNumber = res.body.data.order.order_number;
  });

  it('returns the order for the guest with matching email', async () => {
    const res = await request(app)
      .get(`/api/orders/${createdOrderNumber}`)
      .query({ email: guestEmail });
    expect(res.status).toBe(200);
    expect(res.body.data.order_number).toBe(createdOrderNumber);
  });

  it('returns 403 if email does not match', async () => {
    const res = await request(app)
      .get(`/api/orders/${createdOrderNumber}`)
      .query({ email: 'wrong@test.com' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown order number', async () => {
    const res = await request(app)
      .get('/api/orders/KB-999999')
      .query({ email: guestEmail });
    expect(res.status).toBe(404);
  });
});
