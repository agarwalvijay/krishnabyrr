import { Router } from 'express';
import Razorpay from 'razorpay';
import PDFDocument from 'pdfkit';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

function getRazorpay(): Razorpay | null {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

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

      // Restore stock for each line item
      const lineItems = order.line_items as Array<{ product_id: string; quantity: number; name: string }>;
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

      // Issue Razorpay refund if the order was paid via Razorpay
      let razorpayRefundId: string | null = null;
      let refundedAmount = 0;
      if (order.payment_status === 'paid' && order.razorpay_payment_id) {
        const rzp = getRazorpay();
        if (rzp) {
          const remainingRefundable = parseFloat(order.total) - parseFloat(order.refunded_amount ?? 0);
          if (remainingRefundable > 0) {
            const refundResp = await rzp.payments.refund(order.razorpay_payment_id, {
              amount: Math.round(remainingRefundable * 100), // paise
              speed: 'normal',
              notes: { reason: 'Order cancelled', order_number: order.order_number },
            } as Parameters<typeof rzp.payments.refund>[1]);
            razorpayRefundId = (refundResp as { id: string }).id;
            refundedAmount = remainingRefundable;
          }
        }
      }

      // Update order status
      const newPaymentStatus = refundedAmount > 0 ? 'refunded' : order.payment_status;
      const totalRefunded    = parseFloat(order.refunded_amount ?? 0) + refundedAmount;

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
        },
      });
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
      res.status(409).json({ error: { message: 'No Razorpay payment on this order', code: 'NO_RAZORPAY_PAYMENT' } });
      return;
    }

    const alreadyRefunded    = parseFloat(order.refunded_amount ?? 0);
    const remainingRefundable = parseFloat(order.total) - alreadyRefunded;

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

    const refundResp = await rzp.payments.refund(order.razorpay_payment_id, {
      amount: Math.round(refundAmount * 100), // paise
      speed: 'normal',
      notes: { order_number: order.order_number },
    } as Parameters<typeof rzp.payments.refund>[1]);
    const razorpayRefundId = (refundResp as { id: string }).id;

    const newRefundedAmount  = alreadyRefunded + refundAmount;
    const isFullyRefunded    = newRefundedAmount >= parseFloat(order.total) - 0.01;
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

    const addr        = order.shipping_address as Record<string, string>;
    const lineItems   = order.line_items as Array<{
      name: string; sku: string; quantity: number; unit_price: number; line_total: number; gst_rate: number;
    }>;
    const orderDate   = new Date(order.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="order-${order.order_number}.pdf"`);
    doc.pipe(res);

    const TEAL   = '#1A6B6B';
    const MUTED  = '#888888';
    const DARK   = '#1C1C1C';
    const LEFT   = 50;
    const RIGHT  = 545;
    const WIDTH  = RIGHT - LEFT;

    // ── Header ─────────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').fillColor(TEAL).text("Krishna's Bliss", LEFT, 50);
    doc.fontSize(9).font('Helvetica').fillColor(MUTED).text('Handcrafted with ♥ in India', LEFT, 76);

    doc.fontSize(20).font('Helvetica-Bold').fillColor(DARK)
      .text('ORDER RECEIPT', RIGHT - 150, 50, { width: 150, align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text(`#${order.order_number}`, RIGHT - 150, 76, { width: 150, align: 'right' });

    // ── Divider ────────────────────────────────────────────────────────────────
    doc.moveTo(LEFT, 100).lineTo(RIGHT, 100).strokeColor('#E5E5E5').lineWidth(1).stroke();

    // ── Two-column: order info + shipping address ──────────────────────────────
    const COL2 = LEFT + WIDTH / 2 + 20;
    let y = 115;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('ORDER DATE', LEFT, y);
    doc.fontSize(10).font('Helvetica').fillColor(DARK).text(orderDate, LEFT, y + 13);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('PAYMENT', LEFT + 130, y);
    doc.fontSize(10).font('Helvetica').fillColor(DARK)
      .text(order.payment_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), LEFT + 130, y + 13);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('SHIP TO', COL2, y);
    doc.fontSize(10).font('Helvetica').fillColor(DARK).text(addr.name, COL2, y + 13);
    doc.fontSize(9).fillColor(MUTED)
      .text(addr.line1 + (addr.line2 ? `, ${addr.line2}` : ''), COL2, y + 27)
      .text(`${addr.city}, ${addr.state} – ${addr.pincode}`, COL2, y + 40)
      .text(`Phone: ${addr.phone}`, COL2, y + 53);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('CUSTOMER', LEFT, y + 30);
    doc.fontSize(10).font('Helvetica').fillColor(DARK)
      .text(order.customer_email ?? order.guest_email ?? '—', LEFT, y + 43);

    // ── Items table ────────────────────────────────────────────────────────────
    y = 210;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(1).stroke();
    y += 10;

    // Table headers
    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
    doc.text('ITEM', LEFT, y);
    doc.text('SKU', LEFT + 230, y, { width: 80 });
    doc.text('QTY', LEFT + 320, y, { width: 40, align: 'right' });
    doc.text('UNIT PRICE', LEFT + 370, y, { width: 70, align: 'right' });
    doc.text('TOTAL', LEFT + 450, y, { width: 95, align: 'right' });

    y += 16;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
    y += 10;

    // Table rows
    for (const item of lineItems) {
      doc.fontSize(10).font('Helvetica').fillColor(DARK).text(item.name, LEFT, y, { width: 220 });
      doc.fontSize(9).fillColor(MUTED).text(item.sku, LEFT + 230, y, { width: 80 });
      doc.fontSize(10).fillColor(DARK).text(String(item.quantity), LEFT + 320, y, { width: 40, align: 'right' });
      doc.text(`₹${item.unit_price.toLocaleString('en-IN')}`, LEFT + 370, y, { width: 70, align: 'right' });
      doc.text(`₹${item.line_total.toLocaleString('en-IN')}`, LEFT + 450, y, { width: 95, align: 'right' });
      y += 20;
    }

    y += 5;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(1).stroke();
    y += 15;

    // ── Totals ─────────────────────────────────────────────────────────────────
    const totalsLeft = RIGHT - 220;
    const fmt = (n: number | string) => `₹${parseFloat(String(n)).toLocaleString('en-IN')}`;

    const totalsRows: [string, string, boolean?][] = [
      ['Subtotal', fmt(order.subtotal)],
    ];
    if (parseFloat(order.discount_amount) > 0) {
      totalsRows.push([`Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`, `−${fmt(order.discount_amount)}`]);
    }
    totalsRows.push(['Shipping', parseFloat(order.shipping_amount) === 0 ? 'Free' : fmt(order.shipping_amount)]);
    totalsRows.push(['GST', fmt(order.gst_amount)]);
    totalsRows.push(['Total', fmt(order.total), true]);

    for (const [label, value, bold] of totalsRows) {
      if (bold) {
        y += 5;
        doc.moveTo(totalsLeft, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
        y += 8;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(label, totalsLeft, y, { width: 105 });
        doc.fontSize(12).font('Helvetica-Bold').fillColor(TEAL).text(value, totalsLeft + 115, y, { width: 105, align: 'right' });
      } else {
        doc.fontSize(10).font('Helvetica').fillColor(MUTED).text(label, totalsLeft, y, { width: 105 });
        doc.fontSize(10).fillColor(DARK).text(value, totalsLeft + 115, y, { width: 105, align: 'right' });
      }
      y += 20;
    }

    // ── GST GSTIN note ─────────────────────────────────────────────────────────
    if (order.billing_gstin) {
      y += 10;
      doc.fontSize(9).font('Helvetica').fillColor(MUTED)
        .text(`Billing GSTIN: ${order.billing_gstin}`, LEFT, y);
      y += 15;
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
