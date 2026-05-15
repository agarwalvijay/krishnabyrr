import crypto from 'crypto';
import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockCapture = jest.fn();
const mockRefund = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    payments: {
      capture: mockCapture,
      refund:  mockRefund,
    },
  }));
});

import app from '../app';
import { createTestPool } from '../db/client';
import { closeRedis } from '../redis';

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-do-not-use-in-prod';
const RAZORPAY_SECRET = 'test-razorpay-secret';

let db: Pool;
let adminToken: string;
let productId: string;

function signRazorpay(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', RAZORPAY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function makeOrder(overrides: {
  orderNumber: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  total?: number;
  capturedAmount?: number | null;
  refundedAmount?: number;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  stockQty?: number;
}): Promise<{ id: string; order_number: string }> {
  const total             = overrides.total ?? 1000;
  const stockQty          = overrides.stockQty ?? 5;
  const paymentStatus     = overrides.paymentStatus ?? 'authorized';
  const fulfillmentStatus = overrides.fulfillmentStatus ?? 'unfulfilled';
  const razorpayOrderId   = overrides.razorpayOrderId ?? `order_${overrides.orderNumber}`;
  const razorpayPaymentId = overrides.razorpayPaymentId ?? `pay_${overrides.orderNumber}`;

  await db.query(`UPDATE products SET stock_qty = $1, status = 'active' WHERE id = $2`, [stockQty, productId]);

  const { rows: [order] } = await db.query<{ id: string; order_number: string }>(
    `INSERT INTO orders (
       order_number, line_items, subtotal, discount_amount, shipping_amount,
       gst_amount, total, payment_status, payment_method, fulfillment_status,
       shipping_address, policy_snapshot, razorpay_order_id, razorpay_payment_id,
       captured_amount, refunded_amount
     )
     VALUES (
       $1, $2, $3, 0, 0,
       0, $3, $4, 'razorpay', $5,
       $6, '{}', $7, $8,
       $9, $10
     )
     RETURNING id, order_number`,
    [
      overrides.orderNumber,
      JSON.stringify([{ product_id: productId, quantity: 1, name: 'Test Product' }]),
      total,
      paymentStatus,
      fulfillmentStatus,
      JSON.stringify({ name: 'Test Buyer', phone: '9876543210', pincode: '110001' }),
      razorpayOrderId,
      razorpayPaymentId,
      overrides.capturedAmount ?? null,
      overrides.refundedAmount ?? 0,
    ],
  );

  await db.query(
    `INSERT INTO inventory_log (product_id, change_type, qty_before, qty_change, qty_after, reason, order_id)
     VALUES ($1, 'order_placed', $2, -1, $3, $4, $5)`,
    [productId, stockQty + 1, stockQty, `Order ${overrides.orderNumber}`, order.id],
  );

  return order;
}

async function waitForRefundLedger(orderId: string): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM order_refunds WHERE order_id = $1`,
      [orderId],
    );
    const count = parseInt(rows[0].count, 10);
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return 0;
}

beforeAll(async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = RAZORPAY_SECRET;

  db = createTestPool();

  // Keep this file compatible with the repo's existing integration-test
  // pattern: assume the test DB schema exists, and only make the Razorpay-era
  // columns/tables idempotently available when running this file in isolation.
  await db.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS razorpay_refund_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS phonepe_transaction_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS razorpay_authorized_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS captured_amount NUMERIC(10,2)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS order_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      razorpay_refund_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    INSERT INTO admin_users (email, name, role, password_hash, is_active)
    VALUES ('super@krishnabyrr.com', 'Super Admin', 'super_admin', 'x', true)
    ON CONFLICT (email) DO NOTHING
  `);
  await db.query(`
    INSERT INTO products (name, slug, sku, mrp, sale_price, stock_qty, status)
    VALUES ('Razorpay Test Product', 'razorpay-test-product', 'RZP-TEST-SKU', 1000, NULL, 5, 'active')
    ON CONFLICT (sku) DO UPDATE SET status = 'active', stock_qty = 5
  `);

  const { rows: [admin] } = await db.query(
    `SELECT id FROM admin_users WHERE email = 'super@krishnabyrr.com'`,
  );
  adminToken = jwt.sign(
    { id: admin.id, email: 'super@krishnabyrr.com', role: 'super_admin' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );

  const { rows: [product] } = await db.query<{ id: string }>(
    `SELECT id FROM products WHERE sku = 'RZP-TEST-SKU'`,
  );
  productId = product.id;
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockCapture.mockResolvedValue({ id: 'pay_capture_ok' });
  mockRefund.mockResolvedValue({ id: 'rfnd_test_ok' });

  await db.query(`DELETE FROM order_refunds`);
  await db.query(`DELETE FROM inventory_log`);
  await db.query(`DELETE FROM orders WHERE order_number LIKE 'KB-RZP-%'`);
  await db.query(`UPDATE products SET stock_qty = 5, status = 'active' WHERE id = $1`, [productId]);
});

afterAll(async () => {
  await db.query(`DELETE FROM order_refunds`);
  await db.query(`DELETE FROM inventory_log`);
  await db.query(`DELETE FROM orders WHERE order_number LIKE 'KB-RZP-%'`);
  await db.query(`UPDATE products SET status = 'draft' WHERE id = $1`, [productId]);
  await db.end();
  await closeRedis();
});

describe('Razorpay admin payment flows', () => {
  it('captures an authorized Razorpay payment and records captured_amount', async () => {
    const order = await makeOrder({ orderNumber: 'KB-RZP-CAPTURE', total: 1250 });

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/capture`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 900 });

    expect(res.status).toBe(200);
    expect(mockCapture).toHaveBeenCalledWith('pay_KB-RZP-CAPTURE', 90000, 'INR');
    expect(res.body.data.payment_status).toBe('paid');
    expect(parseFloat(res.body.data.captured_amount)).toBe(900);

    const { rows: [saved] } = await db.query<{ payment_status: string; captured_amount: string }>(
      `SELECT payment_status, captured_amount::text FROM orders WHERE id = $1`,
      [order.id],
    );
    expect(saved.payment_status).toBe('paid');
    expect(parseFloat(saved.captured_amount)).toBe(900);
  });

  it('voids an authorized payment, cancels the order, and restores inventory', async () => {
    const order = await makeOrder({ orderNumber: 'KB-RZP-VOID', stockQty: 4 });

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.payment_status).toBe('voided');
    expect(res.body.data.fulfillment_status).toBe('cancelled');

    const { rows: [product] } = await db.query<{ stock_qty: number }>(
      `SELECT stock_qty FROM products WHERE id = $1`,
      [productId],
    );
    expect(product.stock_qty).toBe(5);

    const { rows: logs } = await db.query(
      `SELECT change_type, qty_change FROM inventory_log WHERE order_id = $1 ORDER BY created_at`,
      [order.id],
    );
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ change_type: 'order_cancelled', qty_change: 1 }),
      ]),
    );
  });

  it('cancels a paid Razorpay order, issues a full refund, restores inventory, and records refund history', async () => {
    const order = await makeOrder({
      orderNumber: 'KB-RZP-CANCEL',
      paymentStatus: 'paid',
      total: 1500,
      capturedAmount: 1500,
      stockQty: 4,
    });
    mockRefund.mockResolvedValueOnce({ id: 'rfnd_cancel_full' });

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(mockRefund).toHaveBeenCalledWith(
      'pay_KB-RZP-CANCEL',
      expect.objectContaining({ amount: 150000, speed: 'normal' }),
    );
    expect(res.body.data.payment_status).toBe('refunded');
    expect(res.body.data.fulfillment_status).toBe('cancelled');
    expect(parseFloat(res.body.data.refunded_amount)).toBe(1500);

    const ledgerCount = await waitForRefundLedger(order.id);
    expect(ledgerCount).toBe(1);

    const { rows: [product] } = await db.query<{ stock_qty: number }>(
      `SELECT stock_qty FROM products WHERE id = $1`,
      [productId],
    );
    expect(product.stock_qty).toBe(5);
  });

  it('issues a partial refund while keeping payment_status paid and recording the refund ledger', async () => {
    const order = await makeOrder({
      orderNumber: 'KB-RZP-PARTIAL',
      paymentStatus: 'paid',
      total: 1200,
      capturedAmount: 1200,
    });
    mockRefund.mockResolvedValueOnce({ id: 'rfnd_partial_300' });

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 300 });

    expect(res.status).toBe(200);
    expect(mockRefund).toHaveBeenCalledWith(
      'pay_KB-RZP-PARTIAL',
      expect.objectContaining({ amount: 30000, speed: 'normal' }),
    );
    expect(res.body.data.payment_status).toBe('paid');
    expect(parseFloat(res.body.data.refunded_amount)).toBe(300);

    const { rows: [refund] } = await db.query<{ amount: string; razorpay_refund_id: string }>(
      `SELECT amount::text, razorpay_refund_id FROM order_refunds WHERE order_id = $1`,
      [order.id],
    );
    expect(parseFloat(refund.amount)).toBe(300);
    expect(refund.razorpay_refund_id).toBe('rfnd_partial_300');
  });
});

describe('Razorpay verification safety', () => {
  it('is idempotent for the same pending order/payment verification', async () => {
    const order = await makeOrder({
      orderNumber: 'KB-RZP-VERIFY',
      paymentStatus: 'pending',
      razorpayOrderId: 'order_verify_safe',
      razorpayPaymentId: null,
    });
    const body = {
      razorpay_order_id:   'order_verify_safe',
      razorpay_payment_id: 'pay_verify_safe',
      razorpay_signature:  signRazorpay('order_verify_safe', 'pay_verify_safe'),
    };

    const first = await request(app).post(`/api/orders/${order.order_number}/verify-payment`).send(body);
    const second = await request(app).post(`/api/orders/${order.order_number}/verify-payment`).send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.payment_status).toBe('authorized');
  });

  it('does not reopen a terminal paid/refunded/cancelled order on stale verify-payment retry', async () => {
    const order = await makeOrder({
      orderNumber: 'KB-RZP-STALE',
      paymentStatus: 'refunded',
      fulfillmentStatus: 'cancelled',
      razorpayOrderId: 'order_stale_retry',
      razorpayPaymentId: 'pay_stale_retry',
      capturedAmount: 1000,
      refundedAmount: 1000,
    });

    const res = await request(app)
      .post(`/api/orders/${order.order_number}/verify-payment`)
      .send({
        razorpay_order_id:   'order_stale_retry',
        razorpay_payment_id: 'pay_stale_retry',
        razorpay_signature:  signRazorpay('order_stale_retry', 'pay_stale_retry'),
      });

    expect(res.status).toBe(409);

    const { rows: [saved] } = await db.query<{ payment_status: string; fulfillment_status: string }>(
      `SELECT payment_status, fulfillment_status FROM orders WHERE id = $1`,
      [order.id],
    );
    expect(saved.payment_status).toBe('refunded');
    expect(saved.fulfillment_status).toBe('cancelled');
  });
});

describe('Razorpay external-success/local-failure tripwires', () => {
  it('leaves a recoverable local record when Razorpay capture succeeds but the DB update fails', async () => {
    const order = await makeOrder({ orderNumber: 'KB-RZP-CAP-FAIL' });
    mockCapture.mockResolvedValueOnce({ id: 'pay_capture_succeeded' });

    await db.query(
      `ALTER TABLE orders
       ADD CONSTRAINT fail_razorpay_capture_update
       CHECK (id <> '${order.id}'::uuid OR payment_status <> 'paid')`,
    );

    try {
      const res = await request(app)
        .post(`/api/admin/orders/${order.id}/capture`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(mockCapture).toHaveBeenCalled();

      const { rows: attempts } = await db.query(
        `SELECT * FROM order_payment_operations WHERE order_id = $1 AND operation_type = 'capture'`,
        [order.id],
      );
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        status: 'needs_reconciliation',
        razorpay_payment_id: 'pay_KB-RZP-CAP-FAIL',
      });
    } finally {
      await db.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS fail_razorpay_capture_update`);
    }
  });

  it('leaves a recoverable local record when Razorpay refund succeeds but the DB transaction fails', async () => {
    const order = await makeOrder({
      orderNumber: 'KB-RZP-REFUND-DBFAIL',
      paymentStatus: 'paid',
      capturedAmount: 1000,
    });
    mockRefund.mockResolvedValueOnce({ id: 'rfnd_succeeded_db_failed' });

    await db.query(
      `ALTER TABLE order_refunds
       ADD CONSTRAINT fail_order_refund_insert
       CHECK (order_id <> '${order.id}'::uuid)`,
    );

    try {
      const res = await request(app)
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 250 });

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(mockRefund).toHaveBeenCalled();

      const { rows: attempts } = await db.query(
        `SELECT * FROM order_payment_operations WHERE order_id = $1 AND operation_type = 'refund'`,
        [order.id],
      );
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        status: 'needs_reconciliation',
        razorpay_refund_id: 'rfnd_succeeded_db_failed',
      });
    } finally {
      await db.query(`ALTER TABLE order_refunds DROP CONSTRAINT IF EXISTS fail_order_refund_insert`);
    }
  });
});
