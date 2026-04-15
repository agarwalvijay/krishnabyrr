import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// ── List orders ───────────────────────────────────────────────────────────────

// GET /api/admin/orders
// ?payment_status=paid|pending_confirmation|failed
// ?fulfillment_status=unfulfilled|fulfilled|partially_fulfilled
// ?q=<order_number|email search>
// ?page=1&limit=25
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      payment_status,
      fulfillment_status,
      q,
      page = '1',
      limit = '25',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (payment_status) {
      conditions.push(`o.payment_status = $${i}`); params.push(payment_status); i++;
    }
    if (fulfillment_status) {
      conditions.push(`o.fulfillment_status = $${i}`); params.push(fulfillment_status); i++;
    }
    if (q) {
      conditions.push(`(
        o.order_number ILIKE $${i}
        OR o.guest_email ILIKE $${i}
        OR c.email ILIKE $${i}
      )`);
      params.push(`%${q}%`); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ${where}
    `;
    const { rows: [{ total }] } = await pool.query<{ total: number }>(countSql, params);

    const dataSql = `
      SELECT
        o.id, o.order_number, o.created_at,
        o.payment_status, o.fulfillment_status,
        o.subtotal, o.discount_amount, o.shipping_amount, o.gst_amount, o.total,
        o.coupon_code, o.courier_name, o.tracking_number, o.tracking_url,
        o.fulfilled_at, o.exchange_eligible_until,
        COALESCE(c.email, o.guest_email) AS customer_email,
        COALESCE(c.name, (o.shipping_address->>'name')) AS customer_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const { rows } = await pool.query(dataSql, [...params, limitNum, offset]);

    res.json({
      data: rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/orders/:id
// Accepts both UUID (id) and order_number string
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Detect UUID format to avoid cast errors
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { rows: [order] } = await pool.query(
      `SELECT
         o.*,
         COALESCE(c.email, o.guest_email) AS customer_email,
         c.name AS customer_name_db,
         c.phone AS customer_phone
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE ${isUUID ? 'o.id = $1' : 'o.order_number = $1'}`,
      [id]
    );

    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }

    // Exchange requests for this order
    const { rows: exchanges } = await pool.query(
      `SELECT id, exchange_number, status, items, reason, customer_notes, admin_notes, created_at
       FROM exchange_requests WHERE order_id = $1 ORDER BY created_at DESC`,
      [order.id]
    );

    res.json({ data: { ...order, exchanges } });
  } catch (err) { next(err); }
});

// PATCH /api/admin/orders/:id — update fulfillment/payment status, tracking info, admin notes
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      payment_status,
      fulfillment_status,
      courier_name,
      tracking_number,
      tracking_url,
      admin_notes,
    } = req.body as Record<string, unknown>;

    const VALID_PAYMENT   = ['pending_confirmation', 'paid', 'failed', 'refunded'] as const;
    const VALID_FULFIL    = ['unfulfilled', 'partially_fulfilled', 'fulfilled', 'cancelled'] as const;

    const setClauses = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (payment_status !== undefined) {
      if (!VALID_PAYMENT.includes(payment_status as typeof VALID_PAYMENT[number])) {
        res.status(422).json({ error: { message: 'Invalid payment_status', code: 'VALIDATION_ERROR' } });
        return;
      }
      setClauses.push(`payment_status = $${i}`); params.push(payment_status); i++;
    }
    if (fulfillment_status !== undefined) {
      if (!VALID_FULFIL.includes(fulfillment_status as typeof VALID_FULFIL[number])) {
        res.status(422).json({ error: { message: 'Invalid fulfillment_status', code: 'VALIDATION_ERROR' } });
        return;
      }
      setClauses.push(`fulfillment_status = $${i}`); params.push(fulfillment_status); i++;
      // Set fulfilled_at when marking as fulfilled
      if (fulfillment_status === 'fulfilled') {
        setClauses.push(`fulfilled_at = COALESCE(fulfilled_at, NOW())`);
      }
    }
    if (courier_name !== undefined)    { setClauses.push(`courier_name = $${i}`);    params.push(courier_name); i++; }
    if (tracking_number !== undefined) { setClauses.push(`tracking_number = $${i}`); params.push(tracking_number); i++; }
    if (tracking_url !== undefined)    { setClauses.push(`tracking_url = $${i}`);    params.push(tracking_url); i++; }
    if (admin_notes !== undefined)     { setClauses.push(`admin_notes = $${i}`);     params.push(admin_notes); i++; }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    params.push(id);
    const { rows: [order] } = await pool.query(
      `UPDATE orders SET ${setClauses.join(', ')}
       WHERE ${isUUID ? `id = $${i}` : `order_number = $${i}`}
       RETURNING *`,
      params
    );

    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: order });
  } catch (err) { next(err); }
});

// ── Exchange requests ─────────────────────────────────────────────────────────

// GET /api/admin/orders/exchanges  — list all exchange requests with filters
// ?status=requested|approved|rejected|completed
router.get('/exchanges', requireAuth, async (req, res, next) => {
  try {
    const {
      status,
      page = '1',
      limit = '25',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (status) {
      conditions.push(`er.status = $${i}`); params.push(status); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM exchange_requests er ${where}`,
      params
    );

    const { rows } = await pool.query(
      `SELECT
         er.id, er.exchange_number, er.status, er.reason,
         er.customer_notes, er.admin_notes, er.created_at, er.updated_at,
         o.order_number, o.id AS order_id,
         COALESCE(c.email, o.guest_email) AS customer_email
       FROM exchange_requests er
       JOIN orders o ON o.id = er.order_id
       LEFT JOIN customers c ON c.id = er.customer_id
       ${where}
       ORDER BY er.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      data: rows,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// PATCH /api/admin/orders/exchanges/:id — update exchange status + admin notes
router.patch('/exchanges/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body as Record<string, unknown>;

    const VALID_STATUS = ['requested', 'approved', 'rejected', 'completed'] as const;

    const setClauses = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (status !== undefined) {
      if (!VALID_STATUS.includes(status as typeof VALID_STATUS[number])) {
        res.status(422).json({ error: { message: 'Invalid exchange status', code: 'VALIDATION_ERROR' } });
        return;
      }
      setClauses.push(`status = $${i}`); params.push(status); i++;
    }
    if (admin_notes !== undefined) { setClauses.push(`admin_notes = $${i}`); params.push(admin_notes); i++; }

    params.push(id);
    const { rows: [er] } = await pool.query(
      `UPDATE exchange_requests SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!er) {
      res.status(404).json({ error: { message: 'Exchange request not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: er });
  } catch (err) { next(err); }
});

export default router;
