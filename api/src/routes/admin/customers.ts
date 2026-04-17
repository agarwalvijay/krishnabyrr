import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// GET /api/admin/customers
// ?q=<search>  ?page=1&limit=25
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { q, page = '1', limit = '25' } = req.query as Record<string, string>;
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (q) {
      conditions.push(`(c.email ILIKE $${i} OR c.name ILIKE $${i} OR c.phone ILIKE $${i})`);
      params.push(`%${q}%`); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM customers c ${where}`, params
    );

    const { rows } = await pool.query(
      `SELECT
         c.id, c.name, c.email, c.phone,
         c.total_orders, c.lifetime_value,
         c.email_verified,
         c.marketing_email, c.marketing_whatsapp,
         c.created_at
       FROM customers c
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      data: rows,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/customers/:id — customer detail + their orders
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [customer] } = await pool.query(
      `SELECT
         c.*,
         a.line1, a.line2, a.city, a.state, a.pincode, a.country
       FROM customers c
       LEFT JOIN addresses a ON a.id = c.default_address_id
       WHERE c.id = $1`,
      [id]
    );
    if (!customer) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }

    const { rows: orders } = await pool.query(
      `SELECT
         id, order_number, created_at, total,
         payment_status, fulfillment_status
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [id]
    );

    res.json({ data: { ...customer, orders } });
  } catch (err) { next(err); }
});

export default router;
