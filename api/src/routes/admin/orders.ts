import { Router } from 'express';
import Razorpay from 'razorpay';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { pushToCustomer } from '../../services/push';
import { streamInvoicePdf } from '../../services/invoice-pdf';
import {
  sendOrderShipped,
  sendOrderCancelled,
  sendRefundInitiated,
  sendExchangeApproved,
  sendExchangeRejected,
  sendExchangeCompleted,
  sendExchangeReceived,
} from '../../services/whatsapp';

function getRazorpay(): Razorpay | null {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

const router = Router();

// ── GET /api/admin/orders/export — CSV download ───────────────────────────────
// Must be before /:id to avoid matching 'export' as an id.

router.get('/export', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.order_number, o.created_at,
        COALESCE(c.name,  o.shipping_address->>'name')  AS customer_name,
        COALESCE(c.email, o.guest_email)                AS customer_email,
        COALESCE(c.phone, o.shipping_address->>'phone') AS customer_phone,
        o.shipping_address->>'city'    AS city,
        o.shipping_address->>'pincode' AS pincode,
        o.subtotal, o.discount_amount, o.shipping_amount, o.gst_amount, o.total,
        o.coupon_code,
        o.payment_status, o.payment_method,
        o.fulfillment_status,
        o.courier_name, o.tracking_number,
        o.fulfilled_at
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
    `);

    const header = [
      'Order #','Date','Customer Name','Email','Phone','City','Pincode',
      'Subtotal','Discount','Shipping','GST','Total','Coupon',
      'Payment Status','Payment Method','Fulfillment Status',
      'Courier','Tracking','Fulfilled At',
    ];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      header.join(','),
      ...rows.map(r => [
        r.order_number,
        new Date(r.created_at).toISOString().slice(0, 10),
        r.customer_name, r.customer_email, r.customer_phone,
        r.city, r.pincode,
        r.subtotal, r.discount_amount, r.shipping_amount, r.gst_amount, r.total,
        r.coupon_code,
        r.payment_status, r.payment_method, r.fulfillment_status,
        r.courier_name, r.tracking_number,
        r.fulfilled_at ? new Date(r.fulfilled_at).toISOString().slice(0, 10) : '',
      ].map(escape).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (err) { next(err); }
});

// ── Exchange requests ─────────────────────────────────────────────────────────
//
// IMPORTANT: these routes MUST come before the /:id routes below.
// Express matches by registration order; otherwise GET /exchanges would be
// caught by GET /:id (treating "exchanges" as an order number → 404).

// GET /api/admin/orders/exchanges  — list, optionally filtered by status
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

// GET /api/admin/orders/exchanges/:id — full detail for the admin slide-over
router.get('/exchanges/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [row] } = await pool.query(
      `SELECT
         er.id, er.exchange_number, er.status, er.reason,
         er.items, er.customer_notes, er.admin_notes,
         er.created_at, er.updated_at,
         o.order_number, o.id AS order_id,
         o.line_items AS order_line_items,
         o.shipping_address,
         COALESCE(c.name,  (o.shipping_address->>'name'))  AS customer_name,
         COALESCE(c.email, o.guest_email)                  AS customer_email,
         COALESCE(c.phone, (o.shipping_address->>'phone')) AS customer_phone
       FROM exchange_requests er
       JOIN orders o ON o.id = er.order_id
       LEFT JOIN customers c ON c.id = er.customer_id
       WHERE er.id = $1`,
      [id]
    );
    if (!row) {
      res.status(404).json({ error: { message: 'Exchange not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: row });
  } catch (err) { next(err); }
});

// POST /api/admin/orders/:id/exchanges — admin initiates exchange on customer's behalf
// Used when a guest (or any customer) requests an exchange via WhatsApp/phone
// and the admin creates the record so the standard exchange flow can take over.
// No exchange-window enforcement here — admin can override on a case-by-case basis.
router.post('/:id/exchanges', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items, reason, customer_notes, admin_notes } = req.body as {
      items?:          Array<{ product_id: string; quantity: number }>;
      reason?:         string;
      customer_notes?: string;
      admin_notes?:    string;
    };

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (!Array.isArray(items) || items.length === 0 || !reason) {
      res.status(400).json({
        error: { message: 'items (non-empty) and reason are required', code: 'VALIDATION_ERROR' },
      });
      return;
    }

    const VALID_REASONS = ['fabric_defect', 'different_from_description', 'other'];
    if (!VALID_REASONS.includes(reason)) {
      res.status(400).json({
        error: { message: `reason must be one of: ${VALID_REASONS.join(', ')}`, code: 'VALIDATION_ERROR' },
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the order so the serial number generation is race-safe vs another
      // exchange-create for the same order. Same pattern as the customer route.
      const { rows: [order] } = await client.query<{
        id: string;
        order_number: string;
        customer_id: string | null;
        guest_phone: string | null;
        fulfilled_at: Date | null;
        line_items: Array<{ product_id: string; quantity: number; name: string }>;
        shipping_address: { name?: string; phone?: string };
      }>(
        `SELECT id, order_number, customer_id, guest_phone, fulfilled_at,
                line_items, shipping_address
         FROM orders
         WHERE ${isUUID ? 'id = $1' : 'order_number = $1'}
         FOR UPDATE`,
        [id]
      );

      if (!order) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
        return;
      }
      if (!order.fulfilled_at) {
        await client.query('ROLLBACK');
        res.status(422).json({
          error: {
            message: 'Order has not shipped yet — there is nothing to exchange. Mark it fulfilled first if needed.',
            code: 'NOT_FULFILLED',
          },
        });
        return;
      }

      // Validate each requested item is in the original order with enough quantity
      const lineItemMap = new Map(order.line_items.map(li => [li.product_id, li]));
      for (const item of items) {
        const ordered = lineItemMap.get(item.product_id);
        if (!ordered) {
          await client.query('ROLLBACK');
          res.status(422).json({
            error: { message: `Product ${item.product_id} was not in the original order`, code: 'INVALID_ITEM' },
          });
          return;
        }
        if (item.quantity < 1 || item.quantity > ordered.quantity) {
          await client.query('ROLLBACK');
          res.status(422).json({
            error: { message: `Invalid quantity for "${ordered.name}"`, code: 'INVALID_QUANTITY' },
          });
          return;
        }
      }

      // Per-order serial: <order>-EX-<NNN>
      const { rows: [{ count }] } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM exchange_requests WHERE order_id = $1`,
        [order.id],
      );
      const serial = parseInt(count, 10) + 1;
      const exchangeNumber = `${order.order_number}-EX-${String(serial).padStart(3, '0')}`;

      const { rows: [exchange] } = await client.query<{
        id: string; exchange_number: string; status: string; created_at: Date;
      }>(
        `INSERT INTO exchange_requests (
           exchange_number, order_id, customer_id,
           items, reason, customer_notes, admin_notes, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested')
         RETURNING id, exchange_number, status, created_at`,
        [
          exchangeNumber,
          order.id,
          order.customer_id,
          JSON.stringify(items),
          reason,
          customer_notes?.trim() ?? null,
          admin_notes?.trim() ?? null,
        ],
      );

      await client.query('COMMIT');

      res.status(201).json({ data: exchange });

      // ── Notifications (fire-and-forget) ────────────────────────────────────
      // Notify the customer via WhatsApp using their phone from the order
      // (customer profile if logged-in, else guest_phone or shipping_address).
      const customerPhone =
        (order.customer_id ? (await pool.query<{ phone: string | null }>(
          `SELECT phone FROM customers WHERE id = $1`, [order.customer_id],
        )).rows[0]?.phone : null)
        ?? order.guest_phone
        ?? order.shipping_address.phone
        ?? null;

      const customerName =
        order.shipping_address.name
        ?? (order.customer_id ? 'there' : 'there');

      if (customerPhone) {
        sendExchangeReceived({
          phone:          customerPhone,
          name:           customerName,
          exchangeNumber: exchange.exchange_number,
        });
      }

      if (order.customer_id) {
        pushToCustomer(order.customer_id, {
          title: 'Exchange request received',
          body:  `Your exchange request ${exchange.exchange_number} for order ${order.order_number} is being reviewed.`,
          data:  { url: '/account/orders' },
        }).catch(() => {});
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
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

    // ── Customer notifications on status change ─────────────────────────────
    if (status === 'approved' || status === 'rejected' || status === 'completed') {
      const { rows: [cust] } = await pool.query<{ phone: string | null; name: string }>(
        `SELECT c.phone, c.name
           FROM customers c
           JOIN exchange_requests er ON er.customer_id = c.id
          WHERE er.id = $1`,
        [er.id],
      );

      if (cust?.phone) {
        const notesStr = typeof admin_notes === 'string' ? admin_notes : undefined;
        if (status === 'approved') {
          sendExchangeApproved({
            phone:          cust.phone,
            name:           cust.name,
            exchangeNumber: er.exchange_number,
          });
        } else if (status === 'rejected') {
          sendExchangeRejected({
            phone:          cust.phone,
            name:           cust.name,
            exchangeNumber: er.exchange_number,
            adminNotes:     notesStr,
          });
        } else if (status === 'completed') {
          sendExchangeCompleted({
            phone:          cust.phone,
            name:           cust.name,
            exchangeNumber: er.exchange_number,
          });
        }
      }

      const titleMap: Record<string, string> = {
        approved:  'Exchange Approved',
        rejected:  'Exchange Update',
        completed: 'Exchange Complete',
      };
      const bodyMap: Record<string, string> = {
        approved:  `Your exchange ${er.exchange_number} has been approved — we'll be in touch to arrange pickup.`,
        rejected:  `We couldn't process exchange ${er.exchange_number}. Tap to see details.`,
        completed: `Exchange ${er.exchange_number} is complete. The replacement has shipped.`,
      };
      pushToCustomer(er.customer_id, {
        title: titleMap[status as string],
        body:  bodyMap[status as string],
        data:  { url: '/account/orders' },
      }).catch(() => {});
    }
  } catch (err) { next(err); }
});

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
      // Accept anything an admin might be looking at in a payment gateway
      // dashboard: KB order number, Razorpay payment/order id, PhonePe
      // transaction/payment id, customer email, or customer phone (paste
      // with or without +91 — we match against the stored value's suffix).
      const trimmed     = q.trim();
      const digitsOnly  = trimmed.replace(/\D/g, '');
      const phoneSuffix = digitsOnly.length >= 6 ? digitsOnly.slice(-10) : null;

      const clauses: string[] = [
        `o.order_number ILIKE $${i}`,
        `o.guest_email  ILIKE $${i}`,
        `c.email        ILIKE $${i}`,
        `o.razorpay_payment_id    ILIKE $${i}`,
        `o.razorpay_order_id      ILIKE $${i}`,
        `o.phonepe_transaction_id ILIKE $${i}`,
        `o.phonepe_payment_id     ILIKE $${i}`,
      ];
      params.push(`%${trimmed}%`); i++;

      if (phoneSuffix) {
        clauses.push(`o.guest_phone                 LIKE $${i}`);
        clauses.push(`c.phone                       LIKE $${i}`);
        clauses.push(`(o.shipping_address->>'phone') LIKE $${i}`);
        params.push(`%${phoneSuffix}`); i++;
      }

      conditions.push(`(${clauses.join(' OR ')})`);
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
        o.payment_status, o.payment_method, o.fulfillment_status,
        o.subtotal, o.discount_amount, o.shipping_amount, o.gst_amount, o.total,
        o.coupon_code, o.courier_name, o.tracking_number, o.tracking_url,
        o.fulfilled_at, o.exchange_eligible_until,
        o.razorpay_payment_id, o.razorpay_order_id,
        o.phonepe_transaction_id, o.phonepe_payment_id,
        COALESCE(c.email, o.guest_email) AS customer_email,
        COALESCE(c.name, (o.shipping_address->>'name')) AS customer_name,
        wa.status   AS whatsapp_status,
        wa.updated_at AS whatsapp_status_at
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT status, updated_at
        FROM whatsapp_notifications wn
        WHERE wn.phone = COALESCE(o.shipping_address->>'phone', c.phone)
          AND wn.metadata->>'order_number' = o.order_number
        ORDER BY wn.created_at DESC
        LIMIT 1
      ) wa ON true
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
         c.phone AS customer_phone,
         wa.status     AS whatsapp_status,
         wa.updated_at AS whatsapp_status_at,
         wa.template_name AS whatsapp_last_template,
         wa.error_msg  AS whatsapp_error_msg
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN LATERAL (
         SELECT status, updated_at, template_name, error_msg
         FROM whatsapp_notifications wn
         WHERE wn.phone = COALESCE(o.shipping_address->>'phone', c.phone)
           AND wn.metadata->>'order_number' = o.order_number
         ORDER BY wn.created_at DESC
         LIMIT 1
       ) wa ON true
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

    // Individual refund transactions
    const { rows: refunds } = await pool.query(
      `SELECT id, amount, razorpay_refund_id, notes, created_at
       FROM order_refunds WHERE order_id = $1 ORDER BY created_at ASC`,
      [order.id]
    );

    res.json({ data: { ...order, exchanges, refunds } });
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

    const VALID_PAYMENT   = ['pending_confirmation', 'authorized', 'paid', 'failed', 'refunded'] as const;
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
      // When flipping the order to 'paid' manually (not via the /capture endpoint),
      // initialise captured_amount to the order total if it's NULL. Otherwise the
      // refund ceiling falls back to `total` later, allowing over-refund on orders
      // that were only partially captured externally.
      if (payment_status === 'paid') {
        setClauses.push(`captured_amount = COALESCE(captured_amount, total)`);
      }
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

    // Push + WhatsApp when order is marked fulfilled/shipped
    if (fulfillment_status === 'fulfilled') {
      const tracking    = order.tracking_number ?? order.courier_name ?? '';
      const courier     = order.courier_name ?? 'courier';
      const trackingTxt = tracking || 'will be shared shortly';

      // Fetch customer phone for WhatsApp
      const { rows: [cust] } = await pool.query<{ phone: string | null; name: string | null }>(
        `SELECT c.phone, c.name FROM customers c
         JOIN orders o ON o.customer_id = c.id
         WHERE o.id = $1`,
        [order.id],
      );
      const shipPhone = cust?.phone ?? (order.shipping_address as { phone?: string })?.phone;
      const shipName  = cust?.name  ?? (order.shipping_address as { name?: string })?.name ?? '';

      if (shipPhone) {
        sendOrderShipped({
          phone:       shipPhone,
          name:        shipName,
          orderNumber: order.order_number,
          courier,
          tracking:    trackingTxt,
        });
      }

      if (order.customer_id) {
        pushToCustomer(order.customer_id, {
          title: 'Your Order Has Shipped!',
          body:  tracking
            ? `Order #${order.order_number} is on its way — tracking: ${tracking}`
            : `Order #${order.order_number} has been dispatched. Delivery in 2–7 business days.`,
          data: { url: `/account/orders` },
        }).catch(() => {});
      }
    }
  } catch (err) { next(err); }
});

// ── POST /api/admin/orders/:id/cancel ────────────────────────────────────────
// Cancels the order, restores inventory, and issues a Razorpay refund if paid.
//
// Atomic: if the Razorpay refund call fails, the entire transaction rolls back
// — the order stays in its original state, inventory is not restored, and the
// admin gets a clear error. This prevents the half-cancelled state where the
// fulfillment is cancelled but the customer's money is still with us.
//
// Body options:
//   { force_no_refund: true }  — Skip the Razorpay refund call entirely.
//     Use when you've refunded manually from the Razorpay dashboard (or the
//     payment was test-mode / off-platform) and you just want the order
//     marked cancelled in the admin. The order's payment_status is left
//     unchanged in that case; you can then mark it refunded separately.
router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force_no_refund } = req.body as { force_no_refund?: boolean };
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { rows: [order] } = await pool.query(
      `SELECT * FROM orders WHERE ${isUUID ? 'id = $1' : 'order_number = $1'}`,
      [id]
    );
    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }
    if (order.fulfillment_status === 'cancelled') {
      res.status(409).json({ error: { message: 'Order is already cancelled', code: 'ALREADY_CANCELLED' } });
      return;
    }
    if (order.fulfillment_status === 'fulfilled') {
      res.status(409).json({ error: { message: 'Cannot cancel an order that has already been fulfilled/shipped', code: 'ALREADY_FULFILLED' } });
      return;
    }

    // ── Razorpay refund — done BEFORE the transaction starts ─────────────────
    // If this fails and we haven't started the DB transaction yet, no rollback
    // is needed. If it succeeds, we commit; if the post-refund DB writes fail,
    // the refund stays at Razorpay (rare; admin can reconcile).
    let razorpayRefundId: string | null = null;
    let refundedAmount   = 0;
    let refundWarning: string | null = null;

    const needsRzpRefund =
      !force_no_refund
      && order.payment_status === 'paid'
      && order.razorpay_payment_id
      && !order.phonepe_transaction_id;

    if (needsRzpRefund) {
      const rzp = getRazorpay();
      if (!rzp) {
        res.status(503).json({
          error: { message: 'Razorpay is not configured — cannot issue refund automatically. Refund manually and retry with force_no_refund=true.', code: 'RAZORPAY_NOT_CONFIGURED' },
        });
        return;
      }
      const refundableCeiling   = parseFloat(order.captured_amount ?? order.total);
      const remainingRefundable = refundableCeiling - parseFloat(order.refunded_amount ?? 0);
      if (remainingRefundable > 0) {
        const amountPaise = Math.round(remainingRefundable * 100);
        // Log the exact request so future failures are easier to diagnose.
        console.log(`[cancel ${order.order_number}] refund request: payment=${order.razorpay_payment_id} amount=${amountPaise}p captured=${refundableCeiling} already_refunded=${parseFloat(order.refunded_amount ?? 0)}`);
        try {
          const refundResp = await rzp.payments.refund(order.razorpay_payment_id, {
            amount: amountPaise,
            speed: 'normal',
            notes: { reason: 'Order cancelled', order_number: order.order_number },
          } as Parameters<typeof rzp.payments.refund>[1]);
          razorpayRefundId = (refundResp as { id: string }).id;
          refundedAmount   = remainingRefundable;
        } catch (rzpErr: unknown) {
          console.error(`[cancel ${order.order_number}] Razorpay refund failed:`, rzpErr);
          const e    = rzpErr as { error?: { description?: string; reason?: string; code?: string } };
          const desc = e?.error?.description ?? 'Unknown error';
          const code = e?.error?.code ?? 'UNKNOWN';
          // Atomic: refund failed → DO NOT mark the order cancelled. Tell the
          // admin what happened and suggest next steps.
          res.status(422).json({
            error: {
              message:
                `Refund failed at Razorpay (${code}: ${desc}). Order NOT cancelled. ` +
                `Options: (1) retry, (2) refund manually from Razorpay dashboard then re-run cancel with force_no_refund=true, ` +
                `(3) try Issue Refund button which retries the same call.`,
              code:    'REFUND_FAILED',
              details: { razorpay_code: code, razorpay_description: desc },
            },
          });
          return;
        }
      }
    }

    // ── DB transaction: restore inventory + update order ─────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency check — if any 'order_cancelled' log already exists for this
      // order, stock has already been restored. Skip the restore but still proceed
      // with status updates.
      const { rows: priorRestores } = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM inventory_log
           WHERE order_id = $1 AND change_type = 'order_cancelled'
         ) AS exists`,
        [order.id]
      );
      const alreadyRestored = priorRestores[0]?.exists === true;

      const lineItems = order.line_items as Array<{ product_id: string; quantity: number; name: string }>;

      if (!alreadyRestored) {
        // Restore stock for each line item
        for (const item of lineItems) {
          const { rows: [prod] } = await client.query<{ stock_qty: number }>(
            'SELECT stock_qty FROM products WHERE id = $1 FOR UPDATE',
            [item.product_id]
          );
          if (prod) {
            const qtyAfter = prod.stock_qty + item.quantity;
            await client.query(
              'UPDATE products SET stock_qty = $1, updated_at = NOW() WHERE id = $2',
              [qtyAfter, item.product_id]
            );
            await client.query(
              `INSERT INTO inventory_log
                 (product_id, change_type, qty_before, qty_change, qty_after, reason, order_id, admin_user_id)
               VALUES ($1, 'order_cancelled', $2, $3, $4, $5, $6, $7)`,
              [item.product_id, prod.stock_qty, item.quantity, qtyAfter,
               `Order ${order.order_number} cancelled`, order.id, req.user?.id ?? null]
            );
          }
        }
      }

      // Build warning messages for non-Razorpay payment paths
      if (force_no_refund && order.payment_status === 'paid') {
        refundWarning = 'Order cancelled without automatic refund (force_no_refund). Confirm the refund was handled manually.';
      } else if (order.payment_status === 'authorized' && order.razorpay_payment_id) {
        // Authorized but never captured — no refund needed.
        // The authorization hold will auto-expire at Razorpay within 5 days.
        refundWarning = null;
      } else if (order.payment_status === 'paid' && order.phonepe_transaction_id && !order.razorpay_payment_id) {
        refundWarning = 'PhonePe refunds must be issued manually from the PhonePe merchant dashboard. Order has been cancelled and inventory restored.';
      }

      // Determine new payment status:
      // - authorized → voided (hold auto-expires at Razorpay, no money moved)
      // - paid + refund issued → refunded
      // - anything else → unchanged
      const newPaymentStatus =
        order.payment_status === 'authorized' ? 'voided'
        : refundedAmount > 0 ? 'refunded'
        : order.payment_status;
      const totalRefunded = parseFloat(order.refunded_amount ?? 0) + refundedAmount;

      const { rows: [updated] } = await client.query(
        `UPDATE orders SET
           fulfillment_status  = 'cancelled',
           payment_status      = $1,
           refunded_amount     = $2,
           razorpay_refund_id  = COALESCE($3, razorpay_refund_id),
           updated_at          = NOW()
         WHERE id = $4
         RETURNING *`,
        [newPaymentStatus, totalRefunded, razorpayRefundId, order.id]
      );

      await client.query('COMMIT');
      res.json({
        data: {
          ...updated,
          refund_issued: refundedAmount > 0,
          razorpay_refund_id: razorpayRefundId,
          refund_warning: refundWarning,
        },
      });

      // WhatsApp notification — use customer phone or shipping address phone
      const cancelPhone = (order.customer_phone as string | null)
        ?? (order.shipping_address as { phone?: string })?.phone;
      const cancelName  = (order.customer_name as string | null)
        ?? (order.shipping_address as { name?: string })?.name ?? '';
      if (cancelPhone) {
        sendOrderCancelled({
          phone:         cancelPhone,
          name:          cancelName,
          orderNumber:   order.order_number,
          refundAmount:  refundedAmount > 0 ? refundedAmount : undefined,
        });
        if (refundedAmount > 0) {
          sendRefundInitiated({
            phone:       cancelPhone,
            name:        cancelName,
            orderNumber: order.order_number,
            amount:      refundedAmount,
          });
        }
      }

      if (order.customer_id) {
        pushToCustomer(order.customer_id, {
          title: 'Order Cancelled',
          body:  refundedAmount > 0
            ? `Order #${order.order_number} has been cancelled. A refund of ₹${refundedAmount.toLocaleString('en-IN')} is on its way.`
            : `Order #${order.order_number} has been cancelled.`,
          data: { url: `/account/orders` },
        }).catch(() => {});
      }

      // Record the individual refund transaction — best-effort, outside the main transaction
      if (refundedAmount > 0 && razorpayRefundId) {
        pool.query(
          `INSERT INTO order_refunds (order_id, amount, razorpay_refund_id, notes) VALUES ($1, $2, $3, $4)`,
          [order.id, refundedAmount, razorpayRefundId, 'Order cancelled']
        ).catch((e) => console.error('[cancel] order_refunds insert failed:', e.message));
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// ── POST /api/admin/orders/:id/capture ───────────────────────────────────────
// Captures an authorized Razorpay payment, marking the order as paid.
// Body: { amount?: number } — omit for full capture; pass a lower value for
// partial capture (Razorpay auto-releases the uncaptured remainder).
router.post('/:id/capture', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount: rawAmount } = req.body as { amount?: number | null };
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { rows: [order] } = await pool.query(
      `SELECT * FROM orders WHERE ${isUUID ? 'id = $1' : 'order_number = $1'}`,
      [id]
    );
    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }
    if (order.payment_status !== 'authorized') {
      res.status(409).json({ error: { message: 'Order is not in authorized status', code: 'NOT_AUTHORIZED' } });
      return;
    }
    if (!order.razorpay_payment_id) {
      res.status(409).json({ error: { message: 'No Razorpay payment ID on this order', code: 'NO_PAYMENT' } });
      return;
    }

    const authorizedTotal = parseFloat(order.total);
    const captureAmount   = (rawAmount != null) ? rawAmount : authorizedTotal;

    if (typeof captureAmount !== 'number' || captureAmount <= 0) {
      res.status(422).json({ error: { message: 'amount must be a positive number', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (captureAmount > authorizedTotal + 0.01) {
      res.status(422).json({
        error: {
          message: `Capture amount ₹${captureAmount} exceeds the authorized amount ₹${authorizedTotal.toFixed(2)}`,
          code: 'EXCEEDS_AUTHORIZED',
        },
      });
      return;
    }

    const rzp = getRazorpay();
    if (!rzp) {
      res.status(503).json({ error: { message: 'Razorpay is not configured on this server', code: 'RAZORPAY_NOT_CONFIGURED' } });
      return;
    }

    try {
      await (rzp.payments as unknown as {
        capture: (id: string, amount: number, currency: string) => Promise<unknown>;
      }).capture(order.razorpay_payment_id, Math.round(captureAmount * 100), 'INR');
    } catch (rzpErr: unknown) {
      const desc = (rzpErr as { error?: { description?: string } })?.error?.description;
      res.status(422).json({
        error: {
          message: desc ?? 'Razorpay capture failed — the authorization may have expired.',
          code: 'RAZORPAY_ERROR',
        },
      });
      return;
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE orders SET
         payment_status  = 'paid',
         captured_amount = $1,
         updated_at      = NOW()
       WHERE id = $2
       RETURNING *`,
      [captureAmount, order.id]
    );

    res.json({ data: updated });

    if (order.customer_id) {
      const isPartial = captureAmount < parseFloat(order.total) - 0.01;
      pushToCustomer(order.customer_id, {
        title: 'Payment Confirmed',
        body:  isPartial
          ? `Your payment of ₹${captureAmount.toLocaleString('en-IN')} for order #${order.order_number} has been confirmed.`
          : `Your order #${order.order_number} payment is confirmed. We're preparing your order!`,
        data: { url: `/order/${order.order_number}/confirmation` },
      }).catch(() => {});
    }
  } catch (err) { next(err); }
});

// ── POST /api/admin/orders/:id/void ──────────────────────────────────────────
// Voids an authorized payment — cancels the order and lets the auth expire.
// No money was ever captured, so no refund is needed.
router.post('/:id/void', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { rows: [order] } = await pool.query(
      `SELECT * FROM orders WHERE ${isUUID ? 'id = $1' : 'order_number = $1'}`,
      [id]
    );
    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }
    if (order.payment_status !== 'authorized') {
      res.status(409).json({ error: { message: 'Order is not in authorized status', code: 'NOT_AUTHORIZED' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency — skip stock restore if a prior cancel/void already did it.
      const { rows: priorRestores } = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM inventory_log
           WHERE order_id = $1 AND change_type = 'order_cancelled'
         ) AS exists`,
        [order.id]
      );
      const alreadyRestored = priorRestores[0]?.exists === true;

      const lineItems = order.line_items as Array<{ product_id: string; quantity: number; name: string }>;

      if (!alreadyRestored) {
        for (const item of lineItems) {
          const { rows: [prod] } = await client.query<{ stock_qty: number }>(
            'SELECT stock_qty FROM products WHERE id = $1 FOR UPDATE',
            [item.product_id]
          );
          if (prod) {
            const qtyAfter = prod.stock_qty + item.quantity;
            await client.query(
              'UPDATE products SET stock_qty = $1, updated_at = NOW() WHERE id = $2',
              [qtyAfter, item.product_id]
            );
            await client.query(
              `INSERT INTO inventory_log
                 (product_id, change_type, qty_before, qty_change, qty_after, reason, order_id, admin_user_id)
               VALUES ($1, 'order_cancelled', $2, $3, $4, $5, $6, $7)`,
              [item.product_id, prod.stock_qty, item.quantity, qtyAfter,
               `Order ${order.order_number} voided (auth not captured)`, order.id, req.user?.id ?? null]
            );
          }
        }
      }

      const { rows: [updated] } = await client.query(
        `UPDATE orders SET
           fulfillment_status = 'cancelled',
           payment_status     = 'voided',
           updated_at         = NOW()
         WHERE id = $1
         RETURNING *`,
        [order.id]
      );

      await client.query('COMMIT');
      res.json({ data: updated });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// ── POST /api/admin/orders/:id/refund ────────────────────────────────────────
// Issues a full or partial Razorpay refund without cancelling the order.
// Body: { amount?: number }  — omit or pass null for full remaining refund
router.post('/:id/refund', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount: rawAmount } = req.body as { amount?: number | null };
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Lock the order row for the duration of the refund. Two admins clicking
    // Refund simultaneously won't both read refunded_amount=0 and over-refund.
    // The Razorpay HTTP call sits inside the lock — admin volume is low so the
    // ~2s hold is acceptable.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [order] } = await client.query(
        `SELECT * FROM orders WHERE ${isUUID ? 'id = $1' : 'order_number = $1'} FOR UPDATE`,
        [id]
      );
      if (!order) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
        return;
      }
      if (order.payment_status !== 'paid') {
        await client.query('ROLLBACK');
        res.status(409).json({ error: { message: 'Order is not in paid status', code: 'NOT_PAID' } });
        return;
      }
      if (!order.razorpay_payment_id) {
        await client.query('ROLLBACK');
        const isPhonePe = !!order.phonepe_transaction_id;
        res.status(409).json({
          error: {
            message: isPhonePe
              ? 'PhonePe refunds must be issued manually from the PhonePe merchant dashboard'
              : 'No payment recorded on this order',
            code: isPhonePe ? 'PHONEPE_MANUAL_REFUND' : 'NO_PAYMENT',
          },
        });
        return;
      }

      const alreadyRefunded     = parseFloat(order.refunded_amount ?? 0);
      const refundableCeiling   = parseFloat(order.captured_amount ?? order.total);
      const remainingRefundable = refundableCeiling - alreadyRefunded;

      if (remainingRefundable <= 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: { message: 'Order has already been fully refunded', code: 'FULLY_REFUNDED' } });
        return;
      }

      const refundAmount = rawAmount != null ? rawAmount : remainingRefundable;

      if (typeof refundAmount !== 'number' || refundAmount <= 0) {
        await client.query('ROLLBACK');
        res.status(422).json({ error: { message: 'amount must be a positive number', code: 'VALIDATION_ERROR' } });
        return;
      }
      if (refundAmount > remainingRefundable + 0.01) { // +0.01 for float tolerance
        await client.query('ROLLBACK');
        res.status(422).json({
          error: {
            message: `Refund amount ₹${refundAmount} exceeds remaining refundable amount ₹${remainingRefundable.toFixed(2)}`,
            code: 'EXCEEDS_REFUNDABLE',
          },
        });
        return;
      }

      const rzp = getRazorpay();
      if (!rzp) {
        await client.query('ROLLBACK');
        res.status(503).json({ error: { message: 'Razorpay is not configured on this server', code: 'RAZORPAY_NOT_CONFIGURED' } });
        return;
      }

      let refundResp: { id: string };
      try {
        refundResp = await rzp.payments.refund(order.razorpay_payment_id, {
          amount: Math.round(refundAmount * 100), // paise
          speed: 'normal',
          notes: { order_number: order.order_number },
        } as Parameters<typeof rzp.payments.refund>[1]) as { id: string };
      } catch (rzpErr: unknown) {
        await client.query('ROLLBACK');
        const desc = (rzpErr as { error?: { description?: string } })?.error?.description;
        res.status(422).json({
          error: {
            message: desc ?? 'Razorpay refund was rejected — please try a different amount or refund from the Razorpay dashboard.',
            code: 'RAZORPAY_ERROR',
          },
        });
        return;
      }
      const razorpayRefundId = refundResp.id;

      const newRefundedAmount  = alreadyRefunded + refundAmount;
      const isFullyRefunded    = newRefundedAmount >= refundableCeiling - 0.01;
      const newPaymentStatus   = isFullyRefunded ? 'refunded' : 'paid';

      const { rows: [updated] } = await client.query(
        `UPDATE orders SET
           refunded_amount    = $1,
           razorpay_refund_id = $2,
           payment_status     = $3,
           updated_at         = NOW()
         WHERE id = $4
         RETURNING *`,
        [newRefundedAmount, razorpayRefundId, newPaymentStatus, order.id]
      );

      // Record the individual refund transaction inside the same transaction so
      // it either commits with the order update or rolls back together.
      await client.query(
        `INSERT INTO order_refunds (order_id, amount, razorpay_refund_id) VALUES ($1, $2, $3)`,
        [order.id, refundAmount, razorpayRefundId]
      );

      await client.query('COMMIT');
      res.json({ data: { ...updated, razorpay_refund_id: razorpayRefundId } });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// ── GET /api/admin/orders/:id/pdf ─────────────────────────────────────────────
router.get('/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const ok = await streamInvoicePdf(id, res);
    if (!ok) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }
  } catch (err) { next(err); }
});


export default router;
