import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// GET /api/admin/badges
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         b.id, b.name, b.hex_color, b.text_color,
         b.is_active, b.is_filter, b.is_nav, b.display_order,
         b.created_at, b.updated_at,
         COUNT(DISTINCT pb.product_id)::int AS product_count
       FROM badges b
       LEFT JOIN product_badges pb ON pb.badge_id = b.id
       GROUP BY b.id
       ORDER BY b.display_order, b.name`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/admin/badges
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      name, hex_color = '#1A6B6B', text_color = '#FFFFFF',
      is_active = true, is_filter = false, is_nav = false, display_order = 0,
    } = req.body as Record<string, unknown>;

    if (!name || typeof name !== 'string' || !(name as string).trim()) {
      res.status(422).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (hex_color && !/^#[0-9A-Fa-f]{6}$/.test(hex_color as string)) {
      res.status(422).json({ error: { message: 'hex_color must be #RRGGBB', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (text_color && !/^#[0-9A-Fa-f]{6}$/.test(text_color as string)) {
      res.status(422).json({ error: { message: 'text_color must be #RRGGBB', code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [badge] } = await pool.query(
      `INSERT INTO badges (name, hex_color, text_color, is_active, is_filter, is_nav, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        (name as string).trim(),
        hex_color, text_color,
        Boolean(is_active), Boolean(is_filter), Boolean(is_nav),
        Number(display_order),
      ]
    );
    res.status(201).json({ data: badge });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Badge name already exists', code: 'DUPLICATE' } });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/badges/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, hex_color, text_color, is_active, is_filter, is_nav, display_order } =
      req.body as Record<string, unknown>;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (name !== undefined) { setClauses.push(`name = $${i}`); params.push((name as string).trim()); i++; }
    if (hex_color !== undefined) { setClauses.push(`hex_color = $${i}`); params.push(hex_color); i++; }
    if (text_color !== undefined) { setClauses.push(`text_color = $${i}`); params.push(text_color); i++; }
    if (is_active !== undefined) { setClauses.push(`is_active = $${i}`); params.push(Boolean(is_active)); i++; }
    if (is_filter !== undefined) { setClauses.push(`is_filter = $${i}`); params.push(Boolean(is_filter)); i++; }
    if (is_nav !== undefined) { setClauses.push(`is_nav = $${i}`); params.push(Boolean(is_nav)); i++; }
    if (display_order !== undefined) { setClauses.push(`display_order = $${i}`); params.push(Number(display_order)); i++; }

    if (!setClauses.length) {
      res.status(400).json({ error: { message: 'No fields to update', code: 'NO_FIELDS' } });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const { rows: [badge] } = await pool.query(
      `UPDATE badges SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!badge) {
      res.status(404).json({ error: { message: 'Badge not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: badge });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Badge name already exists', code: 'DUPLICATE' } });
      return;
    }
    next(err);
  }
});

// DELETE /api/admin/badges/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [badge] } = await pool.query(
      'DELETE FROM badges WHERE id = $1 RETURNING id, name',
      [id]
    );
    if (!badge) {
      res.status(404).json({ error: { message: 'Badge not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: badge });
  } catch (err) { next(err); }
});

export default router;
