import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

const VALID_GROUPS = ['fabric', 'weave', 'occasion', 'color'] as const;
type TagGroup = typeof VALID_GROUPS[number];

// GET /api/admin/tags
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tags ORDER BY group_name, value'
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/admin/tags
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { group_name, value, hex_color } = req.body as Record<string, unknown>;

    if (!group_name || !VALID_GROUPS.includes(group_name as TagGroup)) {
      res.status(422).json({
        error: { message: `group_name must be one of: ${VALID_GROUPS.join(', ')}`, code: 'VALIDATION_ERROR' },
      });
      return;
    }
    if (!value || typeof value !== 'string' || !value.trim()) {
      res.status(422).json({ error: { message: '`value` is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [tag] } = await pool.query(
      `INSERT INTO tags (group_name, value, hex_color)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [group_name, (value as string).trim(), hex_color ?? null]
    );
    res.status(201).json({ data: tag });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Tag with this group_name + value already exists', code: 'DUPLICATE_TAG' } });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/tags/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { group_name, value, hex_color } = req.body as Record<string, unknown>;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (group_name !== undefined) {
      if (!VALID_GROUPS.includes(group_name as TagGroup)) {
        res.status(422).json({ error: { message: 'Invalid group_name', code: 'VALIDATION_ERROR' } });
        return;
      }
      setClauses.push(`group_name = $${i}`); params.push(group_name); i++;
    }
    if (value !== undefined) { setClauses.push(`value = $${i}`); params.push(value); i++; }
    if (hex_color !== undefined) { setClauses.push(`hex_color = $${i}`); params.push(hex_color); i++; }

    if (!setClauses.length) {
      res.status(400).json({ error: { message: 'No fields to update', code: 'NO_FIELDS' } });
      return;
    }
    params.push(id);
    const { rows: [tag] } = await pool.query(
      `UPDATE tags SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!tag) {
      res.status(404).json({ error: { message: 'Tag not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: tag });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'Duplicate group_name + value', code: 'DUPLICATE_TAG' } });
      return;
    }
    next(err);
  }
});

// DELETE /api/admin/tags/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [tag] } = await pool.query(
      'DELETE FROM tags WHERE id = $1 RETURNING id, group_name, value',
      [id]
    );
    if (!tag) {
      res.status(404).json({ error: { message: 'Tag not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: tag });
  } catch (err) { next(err); }
});

export default router;
