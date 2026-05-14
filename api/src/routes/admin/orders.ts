import { Router } from 'express';
import Razorpay from 'razorpay';
import PDFDocument from 'pdfkit';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { pushToCustomer } from '../../services/push';
import { sendOrderShipped, sendOrderCancelled, sendRefundInitiated } from '../../services/whatsapp';

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
        o.payment_status, o.payment_method, o.fulfillment_status,
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
// Cancels the order, restores inventory, and issues a full Razorpay refund if paid.
router.post('/:id/cancel', requireAuth, async (req, res, next) => {
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
    if (order.fulfillment_status === 'cancelled') {
      res.status(409).json({ error: { message: 'Order is already cancelled', code: 'ALREADY_CANCELLED' } });
      return;
    }
    if (order.fulfillment_status === 'fulfilled') {
      res.status(409).json({ error: { message: 'Cannot cancel an order that has already been fulfilled/shipped', code: 'ALREADY_FULFILLED' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency check — if any 'order_cancelled' log already exists for this
      // order, stock has already been restored. Skip the restore but still proceed
      // with refund/status updates (they're independently idempotent).
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

      let razorpayRefundId: string | null = null;
      let refundedAmount = 0;
      let refundWarning: string | null = null;

      if (order.payment_status === 'authorized' && order.razorpay_payment_id) {
        // Payment was authorized but never captured — no refund needed.
        // The authorization hold will auto-expire at Razorpay within 5 days.
        refundWarning = null; // no warning — no money was ever moved
      } else if (order.payment_status === 'paid' && order.phonepe_transaction_id && !order.razorpay_payment_id) {
        // PhonePe orders: we don't have an automated refund API — warn the admin
        refundWarning = 'PhonePe refunds must be issued manually from the PhonePe merchant dashboard. Order has been cancelled and inventory restored.';
      } else if (order.payment_status === 'paid' && order.razorpay_payment_id) {
        // Razorpay captured payment — issue a refund
        const rzp = getRazorpay();
        if (rzp) {
          const refundableCeiling   = parseFloat(order.captured_amount ?? order.total);
          const remainingRefundable = refundableCeiling - parseFloat(order.refunded_amount ?? 0);
          if (remainingRefundable > 0) {
            try {
              const refundResp = await rzp.payments.refund(order.razorpay_payment_id, {
                amount: Math.round(remainingRefundable * 100), // paise
                speed: 'normal',
                notes: { reason: 'Order cancelled', order_number: order.order_number },
              } as Parameters<typeof rzp.payments.refund>[1]);
              razorpayRefundId = (refundResp as { id: string }).id;
              refundedAmount = remainingRefundable;
            } catch (rzpErr: unknown) {
              const desc = (rzpErr as { error?: { description?: string } })?.error?.description;
              refundWarning = desc ?? 'Razorpay refund could not be issued — please refund manually from the Razorpay dashboard.';
              console.error('[cancel] Razorpay refund failed:', rzpErr);
            }
          }
        }
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

    const { rows: [order] } = await pool.query(
      `SELECT * FROM orders WHERE ${isUUID ? 'id = $1' : 'order_number = $1'}`,
      [id]
    );
    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }
    if (order.payment_status !== 'paid') {
      res.status(409).json({ error: { message: 'Order is not in paid status', code: 'NOT_PAID' } });
      return;
    }
    if (!order.razorpay_payment_id) {
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
      res.status(409).json({ error: { message: 'Order has already been fully refunded', code: 'FULLY_REFUNDED' } });
      return;
    }

    const refundAmount = rawAmount != null ? rawAmount : remainingRefundable;

    if (typeof refundAmount !== 'number' || refundAmount <= 0) {
      res.status(422).json({ error: { message: 'amount must be a positive number', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (refundAmount > remainingRefundable + 0.01) { // +0.01 for float tolerance
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

    const { rows: [updated] } = await pool.query(
      `UPDATE orders SET
         refunded_amount    = $1,
         razorpay_refund_id = $2,
         payment_status     = $3,
         updated_at         = NOW()
       WHERE id = $4
       RETURNING *`,
      [newRefundedAmount, razorpayRefundId, newPaymentStatus, order.id]
    );

    res.json({ data: { ...updated, razorpay_refund_id: razorpayRefundId } });

    // Record the individual refund transaction — best-effort, does not affect response
    pool.query(
      `INSERT INTO order_refunds (order_id, amount, razorpay_refund_id) VALUES ($1, $2, $3)`,
      [order.id, refundAmount, razorpayRefundId]
    ).catch((e) => console.error('[refund] order_refunds insert failed:', e.message));
  } catch (err) { next(err); }
});

// ── GET /api/admin/orders/:id/pdf ─────────────────────────────────────────────
router.get('/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { rows: [order] } = await pool.query(
      `SELECT o.*,
              COALESCE(c.email, o.guest_email) AS customer_email,
              COALESCE(c.name, (o.shipping_address->>'name')) AS customer_name_db,
              c.phone AS customer_phone_db
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE ${isUUID ? 'o.id = $1' : 'o.order_number = $1'}`,
      [id]
    );
    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }

    const addr      = order.shipping_address as Record<string, string>;
    const lineItems = order.line_items as Array<{
      name: string; sku: string; hsn_code: string | null;
      quantity: number;
      unit_price: number;            // GST-inclusive
      line_total: number;            // GST-inclusive
      taxable_amount?: number;       // pre-GST (added after the inclusive-pricing change)
      gst_amount?: number;           // GST portion (added after the inclusive-pricing change)
      gst_rate: number;
    }>;
    const orderDate = new Date(order.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── Load merchant info from settings (GSTIN, state, address) ───────────────
    const { rows: settingRows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings
       WHERE key IN ('store_name','merchant_state','merchant_gstin','merchant_address','support_email')`
    );
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = typeof r.value === 'string' ? r.value : String(r.value ?? '');
    }
    const merchantName    = settings.store_name       ?? "Krishna's Bliss";
    const merchantState   = settings.merchant_state   ?? '';
    const merchantGstin   = settings.merchant_gstin   ?? '';
    const merchantAddress = settings.merchant_address ?? '';
    const supportEmail    = settings.support_email    ?? '';

    // Intra-state vs inter-state determines CGST+SGST vs IGST split
    const buyerState  = (addr.state ?? '').trim();
    const isIntraState = !!merchantState
      && buyerState.toLowerCase() === merchantState.toLowerCase();

    // ── Per-line tax breakdown (handle legacy orders without taxable_amount) ───
    // For old orders written before inclusive-pricing change, line items lack
    // taxable_amount / gst_amount. Derive them defensively.
    function lineTax(item: typeof lineItems[number]) {
      const total = item.line_total;
      if (item.taxable_amount != null && item.gst_amount != null) {
        return { taxable: item.taxable_amount, gst: item.gst_amount };
      }
      const rate    = item.gst_rate || 0;
      const taxable = total / (1 + rate / 100);
      return { taxable, gst: total - taxable };
    }

    // Aggregate per GST rate so the tax summary can show one row per rate.
    const taxByRate = new Map<number, { taxable: number; gst: number }>();
    for (const item of lineItems) {
      const { taxable, gst } = lineTax(item);
      const bucket = taxByRate.get(item.gst_rate) ?? { taxable: 0, gst: 0 };
      bucket.taxable += taxable;
      bucket.gst     += gst;
      taxByRate.set(item.gst_rate, bucket);
    }

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
    doc.pipe(res);

    const TEAL   = '#1A6B6B';
    const MUTED  = '#888888';
    const DARK   = '#1C1C1C';
    const LEFT   = 50;
    const RIGHT  = 545;
    const WIDTH  = RIGHT - LEFT;
    const fmt    = (n: number | string) =>
      `${parseFloat(String(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ── Header ─────────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').fillColor(TEAL).text(merchantName, LEFT, 50);
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text('Handcrafted with ♥ in India', LEFT, 76);

    doc.fontSize(20).font('Helvetica-Bold').fillColor(DARK)
      .text('TAX INVOICE', RIGHT - 200, 50, { width: 200, align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text(`# ${order.order_number}`, RIGHT - 200, 76, { width: 200, align: 'right' })
      .text(orderDate,                   RIGHT - 200, 90, { width: 200, align: 'right' });

    // ── Divider ────────────────────────────────────────────────────────────────
    doc.moveTo(LEFT, 110).lineTo(RIGHT, 110).strokeColor('#E5E5E5').lineWidth(1).stroke();

    // ── Seller (left) and Buyer (right) blocks ─────────────────────────────────
    const COL2 = LEFT + WIDTH / 2 + 10;
    let y = 122;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('SELLER', LEFT, y);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(merchantName, LEFT, y + 13);
    doc.fontSize(9).font('Helvetica').fillColor(MUTED);
    let sy = y + 27;
    if (merchantAddress) { doc.text(merchantAddress, LEFT, sy, { width: WIDTH / 2 - 10 }); sy += 26; }
    if (merchantGstin)   { doc.text(`GSTIN: ${merchantGstin}`, LEFT, sy); sy += 13; }
    if (merchantState)   { doc.text(`State: ${merchantState}`, LEFT, sy); sy += 13; }
    if (supportEmail)    { doc.text(supportEmail, LEFT, sy); sy += 13; }

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('BILL / SHIP TO', COL2, y);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(addr.name, COL2, y + 13);
    doc.fontSize(9).font('Helvetica').fillColor(MUTED);
    let by = y + 27;
    doc.text(addr.line1 + (addr.line2 ? `, ${addr.line2}` : ''), COL2, by, { width: WIDTH / 2 - 10 });
    by += 13;
    doc.text(`${addr.city}, ${addr.state} – ${addr.pincode}`, COL2, by); by += 13;
    doc.text(`Phone: ${addr.phone}`, COL2, by); by += 13;
    if (order.billing_gstin) { doc.text(`GSTIN: ${order.billing_gstin}`, COL2, by); by += 13; }
    doc.text(`Place of Supply: ${buyerState || '—'}`, COL2, by);

    y = Math.max(sy, by + 13) + 12;

    // ── Items table ────────────────────────────────────────────────────────────
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(1).stroke();
    y += 10;

    // Column geometry — fits A4 width
    const COL_ITEM   = LEFT;          // wide
    const COL_HSN    = LEFT + 220;
    const COL_QTY    = LEFT + 270;
    const COL_PRICE  = LEFT + 310;    // inclusive unit price
    const COL_TAX    = LEFT + 380;    // taxable amount
    const COL_GST    = LEFT + 440;    // GST amount
    const COL_TOTAL  = LEFT + 495;    // line total (inclusive)
    const COL_WIDTHS = { item: 200, hsn: 45, qty: 30, price: 60, tax: 50, gst: 50, total: 50 };

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
    doc.text('ITEM',     COL_ITEM,  y, { width: COL_WIDTHS.item });
    doc.text('HSN',      COL_HSN,   y, { width: COL_WIDTHS.hsn,   align: 'right' });
    doc.text('QTY',      COL_QTY,   y, { width: COL_WIDTHS.qty,   align: 'right' });
    doc.text('PRICE',    COL_PRICE, y, { width: COL_WIDTHS.price, align: 'right' });
    doc.text('TAXABLE',  COL_TAX,   y, { width: COL_WIDTHS.tax,   align: 'right' });
    doc.text('GST',      COL_GST,   y, { width: COL_WIDTHS.gst,   align: 'right' });
    doc.text('TOTAL',    COL_TOTAL, y, { width: COL_WIDTHS.total, align: 'right' });
    y += 14;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
    y += 8;

    for (const item of lineItems) {
      const { taxable, gst } = lineTax(item);
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
         .text(item.name, COL_ITEM, y, { width: COL_WIDTHS.item });
      doc.fontSize(8).fillColor(MUTED)
         .text(item.sku, COL_ITEM, y + 11, { width: COL_WIDTHS.item });

      doc.fontSize(9).fillColor(DARK)
         .text(item.hsn_code ?? '—', COL_HSN,  y, { width: COL_WIDTHS.hsn,   align: 'right' })
         .text(String(item.quantity), COL_QTY,  y, { width: COL_WIDTHS.qty,   align: 'right' })
         .text(fmt(item.unit_price),  COL_PRICE,y, { width: COL_WIDTHS.price, align: 'right' })
         .text(fmt(taxable),          COL_TAX,  y, { width: COL_WIDTHS.tax,   align: 'right' })
         .text(`${fmt(gst)}`,         COL_GST,  y, { width: COL_WIDTHS.gst,   align: 'right' })
         .text(fmt(item.line_total),  COL_TOTAL,y, { width: COL_WIDTHS.total, align: 'right' });

      y += 24;
    }

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(1).stroke();
    y += 12;

    // ── Tax summary (CGST+SGST or IGST per rate) ──────────────────────────────
    const totalsLeft   = RIGHT - 240;
    const taxableSubtotal = Array.from(taxByRate.values()).reduce((s, b) => s + b.taxable, 0);
    const gstSubtotal     = Array.from(taxByRate.values()).reduce((s, b) => s + b.gst,     0);

    const sumRows: Array<[string, string, boolean?]> = [];
    sumRows.push(['Taxable value', `₹${fmt(taxableSubtotal)}`]);

    // Sort rates ascending for stable display
    const rates = Array.from(taxByRate.keys()).sort((a, b) => a - b);
    for (const rate of rates) {
      const { gst } = taxByRate.get(rate)!;
      if (isIntraState) {
        const half = gst / 2;
        sumRows.push([`CGST @ ${rate / 2}%`, `₹${fmt(half)}`]);
        sumRows.push([`SGST @ ${rate / 2}%`, `₹${fmt(half)}`]);
      } else {
        sumRows.push([`IGST @ ${rate}%`, `₹${fmt(gst)}`]);
      }
    }

    if (parseFloat(order.discount_amount) > 0) {
      sumRows.push([
        `Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`,
        `−₹${fmt(order.discount_amount)}`,
      ]);
    }
    sumRows.push([
      'Shipping',
      parseFloat(order.shipping_amount) === 0 ? 'Free' : `₹${fmt(order.shipping_amount)}`,
    ]);
    sumRows.push(['Total', `₹${fmt(order.total)}`, true]);

    for (const [label, value, bold] of sumRows) {
      if (bold) {
        y += 4;
        doc.moveTo(totalsLeft, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
        y += 8;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(label, totalsLeft, y, { width: 120 });
        doc.fontSize(12).font('Helvetica-Bold').fillColor(TEAL).text(value, totalsLeft + 130, y, { width: 110, align: 'right' });
      } else {
        doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(label, totalsLeft, y, { width: 120 });
        doc.fontSize(9).fillColor(DARK).text(value, totalsLeft + 130, y, { width: 110, align: 'right' });
      }
      y += 16;
    }

    // ── Tax-supply note ───────────────────────────────────────────────────────
    y += 12;
    const supplyNote = isIntraState
      ? `Intra-state supply (seller and buyer both in ${merchantState}). CGST + SGST applied.`
      : merchantState
      ? `Inter-state supply (seller in ${merchantState}, buyer in ${buyerState || '—'}). IGST applied.`
      : 'Place of supply: see Bill/Ship To. Set merchant_state in Settings to enable CGST/SGST/IGST split.';
    doc.fontSize(8).font('Helvetica').fillColor(MUTED).text(supplyNote, LEFT, y, { width: WIDTH });
    y += 16;

    if (!merchantGstin) {
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#B26' + '500')
        .text('Note: merchant GSTIN not configured in Settings — this document is a bill of supply, not a tax invoice for input-credit purposes.',
          LEFT, y, { width: WIDTH });
      y += 16;
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    const pageBottom = doc.page.height - 60;
    doc.moveTo(LEFT, pageBottom - 10).lineTo(RIGHT, pageBottom - 10).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text("Thank you for shopping with Krishna's Bliss!", LEFT, pageBottom, { align: 'center', width: WIDTH });

    doc.end();
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
