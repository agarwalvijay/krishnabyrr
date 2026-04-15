import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// GET /api/admin/tag-groups
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         tg.name,
         tg.label,
         tg.display_order,
         tg.is_filter,
         tg.is_nav,
         COUNT(DISTINCT t.id)::int AS tag_count
       FROM tag_groups tg
       LEFT JOIN tags t ON t.group_name = tg.name
       GROUP BY tg.name, tg.label, tg.display_order, tg.is_filter
       ORDER BY tg.display_order`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/admin/tag-groups
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, label, display_order = 0, is_filter = true, is_nav = false } = req.body as Record<string, unknown>;

    if (!name || typeof name !== 'string' || !/^[a-z0-9_]+$/.test(name as string)) {
      res.status(422).json({
        error: { message: 'name must be a lowercase alphanumeric/underscore string', code: 'VALIDATION_ERROR' },
      });
      return;
    }
    if (!label || typeof label !== 'string' || !(label as string).trim()) {
      res.status(422).json({ error: { message: 'label is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [group] } = await pool.query(
      `INSERT INTO tag_groups (name, label, display_order, is_filter, is_nav)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [(name as string).toLowerCase(), (label as string).trim(), Number(display_order), Boolean(is_filter), Boolean(is_nav)]
    );
    res.status(201).json({ data: group });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Tag group name already exists', code: 'DUPLICATE' } });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/tag-groups/:name  (name is PK)
router.put('/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { label, display_order, is_filter, is_nav } = req.body as Record<string, unknown>;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (label !== undefined) { setClauses.push(`label = $${i}`); params.push((label as string).trim()); i++; }
    if (display_order !== undefined) { setClauses.push(`display_order = $${i}`); params.push(Number(display_order)); i++; }
    if (is_filter !== undefined) { setClauses.push(`is_filter = $${i}`); params.push(Boolean(is_filter)); i++; }
    if (is_nav !== undefined) { setClauses.push(`is_nav = $${i}`); params.push(Boolean(is_nav)); i++; }

    if (!setClauses.length) {
      res.status(400).json({ error: { message: 'No fields to update', code: 'NO_FIELDS' } });
      return;
    }

    params.push(name);
    const { rows: [group] } = await pool.query(
      `UPDATE tag_groups SET ${setClauses.join(', ')} WHERE name = $${i} RETURNING *`,
      params
    );
    if (!group) {
      res.status(404).json({ error: { message: 'Tag group not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: group });
  } catch (err) { next(err); }
});

// PUT /api/admin/tag-groups/reorder  — set display_order for multiple groups atomically
// Body: { groups: [{ name, display_order }] }
router.put('/reorder', requireAuth, async (req, res, next) => {
  try {
    const { groups } = req.body as { groups?: Array<{ name: string; display_order: number }> };
    if (!Array.isArray(groups) || groups.length === 0) {
      res.status(422).json({ error: { message: 'groups array is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const g of groups) {
        await client.query(
          'UPDATE tag_groups SET display_order = $1 WHERE name = $2',
          [Number(g.display_order), g.name]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/admin/tag-groups/:name
// Fails (FK RESTRICT) if any tags still reference this group
router.delete('/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { rows: [group] } = await pool.query(
      'DELETE FROM tag_groups WHERE name = $1 RETURNING name',
      [name]
    );
    if (!group) {
      res.status(404).json({ error: { message: 'Tag group not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: group });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23503') {
      res.status(409).json({
        error: { message: 'Cannot delete group — tags still reference it', code: 'FK_CONSTRAINT' },
      });
      return;
    }
    next(err);
  }
});

export default router;
