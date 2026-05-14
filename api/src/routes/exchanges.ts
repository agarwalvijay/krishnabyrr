import { Router } from 'express';
import pool from '../db/client';
import { requireCustomerAuth } from '../middleware/auth';
import { sendOwnerExchangeRequest, sendExchangeReceived } from '../services/whatsapp';
import { pushToCustomer } from '../services/push';

// Human-readable labels for the reason enum stored in DB
const REASON_LABELS: Record<string, string> = {
  wrong_size:                  'Wrong size',
  fabric_defect:               'Fabric defect',
  different_from_description:  'Different from description',
  other:                       'Other',
};

const router = Router();

// ── POST /api/exchanges ───────────────────────────────────────────────────────

router.post('/', requireCustomerAuth, async (req, res, next) => {
  try {
    const {
      order_id,
      items,
      reason,
      customer_notes,
    } = req.body as {
      order_id:       string;
      items:          Array<{ product_id: string; quantity: number }>;
      reason:         string;
      customer_notes?: string;
    };

    if (!order_id || !Array.isArray(items) || items.length === 0 || !reason) {
      res.status(400).json({
        error: { message: 'order_id, items (non-empty), and reason are required', code: 'VALIDATION_ERROR' },
      });
      return;
    }

    const VALID_REASONS = ['wrong_size', 'fabric_defect', 'different_from_description', 'other'];
    if (!VALID_REASONS.includes(reason)) {
      res.status(400).json({
        error: { message: `reason must be one of: ${VALID_REASONS.join(', ')}`, code: 'VALIDATION_ERROR' },
      });
      return;
    }

    // Fetch the order and verify ownership
    const { rows: [order] } = await pool.query<{
      id: string;
      order_number: string;
      customer_id: string | null;
      fulfillment_status: string;
      exchange_eligible_until: Date | null;
      policy_snapshot: { exchange_window_days: number; exchange_active: boolean };
      line_items: Array<{ product_id: string; quantity: number; name: string }>;
    }>(
      `SELECT id, order_number, customer_id, fulfillment_status, exchange_eligible_until,
              policy_snapshot, line_items
       FROM orders WHERE id = $1`,
      [order_id],
    );

    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }

    if (order.customer_id !== req.customer!.id) {
      res.status(403).json({ error: { message: 'Access denied', code: 'FORBIDDEN' } });
      return;
    }

    if (!order.policy_snapshot.exchange_active) {
      res.status(422).json({ error: { message: 'Exchanges are not available for this order', code: 'EXCHANGE_NOT_AVAILABLE' } });
      return;
    }

    if (!order.exchange_eligible_until || new Date() > new Date(order.exchange_eligible_until)) {
      res.status(422).json({ error: { message: 'This order is no longer eligible for exchange', code: 'EXCHANGE_WINDOW_EXPIRED' } });
      return;
    }

    // Validate each requested item is in the original order
    const lineItemMap = new Map(order.line_items.map(li => [li.product_id, li]));
    for (const item of items) {
      const ordered = lineItemMap.get(item.product_id);
      if (!ordered) {
        res.status(422).json({
          error: { message: `Product ${item.product_id} was not in the original order`, code: 'INVALID_ITEM' },
        });
        return;
      }
      if (item.quantity < 1 || item.quantity > ordered.quantity) {
        res.status(422).json({
          error: { message: `Invalid quantity for "${ordered.name}"`, code: 'INVALID_QUANTITY' },
        });
        return;
      }
    }

    // Generate exchange number
    const { rows: [seqRow] } = await pool.query<{ nextval: string }>(`SELECT NEXTVAL('exchange_number_seq')`);
    const exchangeNumber = `KB-EX-${String(seqRow.nextval).padStart(6, '0')}`;

    const { rows: [exchange] } = await pool.query<{ id: string; exchange_number: string; created_at: Date }>(
      `INSERT INTO exchange_requests (
         exchange_number, order_id, customer_id,
         items, reason, customer_notes, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'requested')
       RETURNING id, exchange_number, created_at`,
      [
        exchangeNumber,
        order_id,
        req.customer!.id,
        JSON.stringify(items),
        reason,
        customer_notes?.trim() ?? null,
      ],
    );

    res.status(201).json({
      data: {
        id:              exchange.id,
        exchange_number: exchange.exchange_number,
        status:          'requested',
        created_at:      exchange.created_at,
      },
    });

    // ── Notifications (fire-and-forget, after response) ─────────────────────
    // Build a short item summary: "Maheshwari Silk x1, Banarasi Katan x2"
    const itemSummary = items
      .map(i => {
        const li = lineItemMap.get(i.product_id);
        return li ? `${li.name} x${i.quantity}` : `${i.product_id} x${i.quantity}`;
      })
      .slice(0, 3)
      .join(', ')
      + (items.length > 3 ? ` +${items.length - 3} more` : '');

    const reasonLabel = REASON_LABELS[reason] ?? reason;

    // Owner alert
    sendOwnerExchangeRequest({
      exchangeNumber:  exchange.exchange_number,
      orderNumber:     order.order_number,
      reason:          reasonLabel,
      itemSummary,
      customerName:    req.customer!.name,
      customerContact: req.customer!.phone ?? req.customer!.email ?? '',
    });

    // Customer confirmation — WhatsApp + push (best-effort each)
    if (req.customer!.phone) {
      sendExchangeReceived({
        phone:          req.customer!.phone,
        name:           req.customer!.name,
        exchangeNumber: exchange.exchange_number,
        orderNumber:    order.order_number,
      });
    }
    pushToCustomer(req.customer!.id, {
      title: 'Exchange request received',
      body:  `Your exchange request ${exchange.exchange_number} for order ${order.order_number} is being reviewed.`,
      data:  { url: '/account/orders' },
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ── GET /api/exchanges ────────────────────────────────────────────────────────

router.get('/', requireCustomerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         er.id, er.exchange_number, er.status, er.reason,
         er.customer_notes, er.items, er.created_at, er.updated_at,
         o.order_number, o.total, o.line_items AS order_line_items
       FROM exchange_requests er
       JOIN orders o ON o.id = er.order_id
       WHERE er.customer_id = $1
       ORDER BY er.created_at DESC`,
      [req.customer!.id],
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
