import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

const VALID_TYPES        = ['flat', 'percent', 'free_shipping'] as const;
const VALID_ELIGIBILITY  = ['ALL', 'SPECIFIC', 'FIRST_ORDER'] as const;
const VALID_APPLIES_TO   = ['ALL', 'CATEGORY', 'COLLECTION'] as const;

// GET /api/admin/coupons
// ?is_active=true|false  ?q=<code search>  ?page=1&limit=25
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      is_active,
      q,
      page  = '1',
      limit = '25',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (is_active !== undefined) {
      conditions.push(`c.is_active = $${i}`); params.push(is_active === 'true'); i++;
    }
    if (q) {
      conditions.push(`c.code ILIKE $${i}`); params.push(`%${q}%`); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM coupons c ${where}`,
      params
    );

    const { rows } = await pool.query(
      `SELECT
         c.*,
         COUNT(cr.id)::int AS redemption_count
       FROM coupons c
       LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id
       ${where}
       GROUP BY c.id
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

// GET /api/admin/coupons/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [coupon] } = await pool.query(
      `SELECT c.*, COUNT(cr.id)::int AS redemption_count
       FROM coupons c
       LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id
       WHERE c.id = $1 OR UPPER(c.code) = UPPER($1)
       GROUP BY c.id`,
      [id]
    );
    if (!coupon) {
      res.status(404).json({ error: { message: 'Coupon not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: coupon });
  } catch (err) { next(err); }
});

// POST /api/admin/coupons
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const {
      code,
      description,
      type,
      value,
      valid_from,
      valid_until,
      max_uses_total,
      max_uses_per_customer,
      min_order_value,
      max_discount_cap,
      applies_to         = 'ALL',
      category_ids,
      collection_ids,
      customer_eligibility = 'ALL',
      customer_ids,
      is_public          = true,
      auto_apply         = false,
      is_active          = true,
    } = body;

    if (!code || typeof code !== 'string' || !(code as string).trim()) {
      res.status(422).json({ error: { message: 'code is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      res.status(422).json({ error: { message: `type must be one of: ${VALID_TYPES.join(', ')}`, code: 'VALIDATION_ERROR' } });
      return;
    }
    if (!VALID_ELIGIBILITY.includes(customer_eligibility as typeof VALID_ELIGIBILITY[number])) {
      res.status(422).json({ error: { message: `customer_eligibility must be one of: ${VALID_ELIGIBILITY.join(', ')}`, code: 'VALIDATION_ERROR' } });
      return;
    }
    if (!VALID_APPLIES_TO.includes(applies_to as typeof VALID_APPLIES_TO[number])) {
      res.status(422).json({ error: { message: `applies_to must be one of: ${VALID_APPLIES_TO.join(', ')}`, code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [coupon] } = await pool.query(
      `INSERT INTO coupons (
         code, description, type, value,
         valid_from, valid_until,
         max_uses_total, max_uses_per_customer,
         min_order_value, max_discount_cap,
         applies_to, category_ids, collection_ids,
         customer_eligibility, customer_ids,
         is_public, auto_apply, is_active
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        (code as string).trim().toUpperCase(),
        description ?? null,
        type,
        value ?? null,
        valid_from ?? null,
        valid_until ?? null,
        max_uses_total ?? null,
        max_uses_per_customer ?? 1,
        min_order_value ?? null,
        max_discount_cap ?? null,
        applies_to,
        category_ids ?? null,
        collection_ids ?? null,
        customer_eligibility,
        customer_ids ?? null,
        Boolean(is_public),
        Boolean(auto_apply),
        Boolean(is_active),
      ]
    );

    res.status(201).json({ data: coupon });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Coupon code already exists', code: 'DUPLICATE_CODE' } });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/coupons/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const setClauses = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    const fields: Array<[string, unknown, ((v: unknown) => unknown)?]> = [
      ['code',                 body.code,                 (v) => (v as string).trim().toUpperCase()],
      ['description',          body.description,          undefined],
      ['type',                 body.type,                 undefined],
      ['value',                body.value,                undefined],
      ['valid_from',           body.valid_from,           undefined],
      ['valid_until',          body.valid_until,          undefined],
      ['max_uses_total',       body.max_uses_total,       undefined],
      ['max_uses_per_customer',body.max_uses_per_customer,undefined],
      ['min_order_value',      body.min_order_value,      undefined],
      ['max_discount_cap',     body.max_discount_cap,     undefined],
      ['applies_to',           body.applies_to,           undefined],
      ['category_ids',         body.category_ids,         undefined],
      ['collection_ids',       body.collection_ids,       undefined],
      ['customer_eligibility', body.customer_eligibility, undefined],
      ['customer_ids',         body.customer_ids,         undefined],
      ['is_public',            body.is_public,            Boolean],
      ['auto_apply',           body.auto_apply,           Boolean],
      ['is_active',            body.is_active,            Boolean],
    ];

    for (const [col, val, transform] of fields) {
      if (val !== undefined) {
        setClauses.push(`${col} = $${i}`);
        params.push(transform ? transform(val) : val);
        i++;
      }
    }

    if (setClauses.length === 1) {
      res.status(400).json({ error: { message: 'No fields to update', code: 'NO_FIELDS' } });
      return;
    }

    params.push(id);
    const { rows: [coupon] } = await pool.query(
      `UPDATE coupons SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!coupon) {
      res.status(404).json({ error: { message: 'Coupon not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: coupon });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Coupon code already exists', code: 'DUPLICATE_CODE' } });
      return;
    }
    next(err);
  }
});

// DELETE /api/admin/coupons/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [coupon] } = await pool.query(
      'DELETE FROM coupons WHERE id = $1 RETURNING id, code',
      [id]
    );
    if (!coupon) {
      res.status(404).json({ error: { message: 'Coupon not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: coupon });
  } catch (err) { next(err); }
});

export default router;
