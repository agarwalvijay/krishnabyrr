import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// ── GET /api/admin/customers ──────────────────────────────────────────────────

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
         c.phone_verified, c.is_suspended,
         c.customer_labels,
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

// ── GET /api/admin/customers/export — CSV download ────────────────────────────
// Must be defined before /:id to avoid matching 'export' as an id.

router.get('/export', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id, c.name, c.email, c.phone,
        c.total_orders, c.lifetime_value::text,
        c.phone_verified, c.is_suspended,
        array_to_string(c.customer_labels, '|') AS labels,
        c.created_at
      FROM customers c
      ORDER BY c.created_at DESC
    `);

    const header = ['ID','Name','Email','Phone','Orders','Lifetime Value','Phone Verified','Suspended','Labels','Joined'];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      header.join(','),
      ...rows.map(r => [
        r.id, r.name, r.email, r.phone,
        r.total_orders, r.lifetime_value,
        r.phone_verified ? 'Yes' : 'No',
        r.is_suspended ? 'Yes' : 'No',
        r.labels,
        new Date(r.created_at).toISOString().slice(0, 10),
      ].map(escape).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n')); // BOM for Excel
  } catch (err) { next(err); }
});

// ── GET /api/admin/customers/:id ──────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [customer] } = await pool.query(
      `SELECT
         c.*,
         a.line1, a.line2, a.city, a.state, a.pincode
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
      `SELECT id, order_number, created_at, total, payment_status, fulfillment_status
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    res.json({ data: { ...customer, orders } });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/customers/:id — edit profile + notes + labels ─────────────

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, admin_notes } = req.body as Record<string, string | undefined>;

    const setClauses = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (name !== undefined)        { setClauses.push(`name = $${i}`);        params.push(name.trim() || null); i++; }
    if (admin_notes !== undefined) { setClauses.push(`admin_notes = $${i}`); params.push(admin_notes || null); i++; }

    if (email !== undefined) {
      const normalEmail = email.trim().toLowerCase() || null;
      // Uniqueness check (exclude self)
      if (normalEmail) {
        const { rowCount } = await pool.query(
          'SELECT id FROM customers WHERE email = $1 AND id != $2', [normalEmail, id]
        );
        if (rowCount && rowCount > 0) {
          res.status(409).json({ error: { message: 'Email already in use', code: 'EMAIL_TAKEN' } });
          return;
        }
      }
      setClauses.push(`email = $${i}`); params.push(normalEmail); i++;
    }

    if (phone !== undefined) {
      const normalPhone = phone.replace(/\D/g, '').slice(-10) || null;
      if (normalPhone) {
        const { rowCount } = await pool.query(
          'SELECT id FROM customers WHERE phone = $1 AND id != $2', [normalPhone, id]
        );
        if (rowCount && rowCount > 0) {
          res.status(409).json({ error: { message: 'Phone already in use', code: 'PHONE_TAKEN' } });
          return;
        }
      }
      setClauses.push(`phone = $${i}`);          params.push(normalPhone); i++;
      // If phone changed, reset verification
      setClauses.push(`phone_verified = false`);
    }

    params.push(id);
    const { rows: [updated] } = await pool.query(
      `UPDATE customers SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );

    if (!updated) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/customers/:id/suspend ────────────────────────────────────

router.patch('/:id/suspend', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { suspended } = req.body as { suspended: boolean };

    const { rows: [updated] } = await pool.query(
      `UPDATE customers SET is_suspended = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_suspended`,
      [!!suspended, id]
    );
    if (!updated) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/customers/:id/verify-phone ───────────────────────────────

router.patch('/:id/verify-phone', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [updated] } = await pool.query(
      `UPDATE customers SET phone_verified = true, updated_at = NOW() WHERE id = $1 RETURNING id, phone_verified`,
      [id]
    );
    if (!updated) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── POST /api/admin/customers/:id/labels ─────────────────────────────────────

router.post('/:id/labels', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label } = req.body as { label?: string };
    if (!label?.trim()) {
      res.status(400).json({ error: { message: 'label is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE customers
       SET customer_labels = array_append(
         CASE WHEN $2 = ANY(customer_labels) THEN customer_labels
              ELSE customer_labels END, $2
       ), updated_at = NOW()
       WHERE id = $1 RETURNING customer_labels`,
      [id, label.trim()]
    );
    if (!updated) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/customers/:id/labels/:label ─────────────────────────────

router.delete('/:id/labels/:label', requireAuth, async (req, res, next) => {
  try {
    const { id, label } = req.params;
    const { rows: [updated] } = await pool.query(
      `UPDATE customers
       SET customer_labels = array_remove(customer_labels, $2), updated_at = NOW()
       WHERE id = $1 RETURNING customer_labels`,
      [id, decodeURIComponent(label)]
    );
    if (!updated) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── GET /api/admin/customers/:id/linkable-orders ─────────────────────────────
// Returns unlinked guest orders that match this customer's email or phone.

router.get('/:id/linkable-orders', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [customer] } = await pool.query<{ email: string | null; phone: string | null }>(
      'SELECT email, phone FROM customers WHERE id = $1', [id]
    );
    if (!customer) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }

    const conditions: string[] = ['customer_id IS NULL'];
    const params: unknown[] = [];
    let i = 1;

    if (customer.email) {
      conditions.push(`LOWER(guest_email) = $${i}`);
      params.push(customer.email.toLowerCase()); i++;
    }
    if (customer.phone) {
      conditions.push(`guest_phone = $${i}`);
      params.push(customer.phone); i++;
    }

    if (params.length === 0) {
      res.json({ data: [] });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, order_number, created_at, total, guest_email, payment_status
       FROM orders
       WHERE customer_id IS NULL AND (${conditions.slice(1).join(' OR ')})
       ORDER BY created_at DESC LIMIT 20`,
      params
    );

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── POST /api/admin/customers/:id/link-order ──────────────────────────────────

router.post('/:id/link-order', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderId } = req.body as { orderId?: string };
    if (!orderId) {
      res.status(400).json({ error: { message: 'orderId is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE orders SET customer_id = $1, updated_at = NOW()
       WHERE id = $2 AND customer_id IS NULL
       RETURNING id, order_number`,
      [id, orderId]
    );
    if (!updated) {
      res.status(404).json({ error: { message: 'Order not found or already linked', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/customers/:id ──────────────────────────────────────────
// Unlinks all orders (sets customer_id = NULL) then deletes the customer.
// Addresses, wishlists, device tokens are cascade-deleted automatically.

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Unlink orders so they become guest orders — preserves order history
      await client.query(
        `UPDATE orders SET customer_id = NULL, updated_at = NOW() WHERE customer_id = $1`, [id]
      );
      const { rows: [deleted] } = await client.query(
        `DELETE FROM customers WHERE id = $1 RETURNING id, name, email`, [id]
      );
      if (!deleted) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
        return;
      }
      await client.query('COMMIT');
      res.json({ data: { deleted: true, ...deleted } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

export default router;
