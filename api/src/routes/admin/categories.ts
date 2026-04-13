import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { toSlug, uniqueCategorySlug } from '../../utils/slug';

const router = Router();

// GET /api/admin/categories
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count
       FROM categories c
       ORDER BY c.nav_order, c.name`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/admin/categories
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, parent_id, description, banner_img, meta_title, meta_desc, nav_order = 0, is_active = true } =
      req.body as Record<string, unknown>;

    if (!name || typeof name !== 'string') {
      res.status(422).json({ error: { message: '`name` is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const slug = await uniqueCategorySlug(toSlug(name as string));

    const { rows: [cat] } = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, description, banner_img, meta_title, meta_desc, nav_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, slug, parent_id ?? null, description ?? null, banner_img ?? null,
       meta_title ?? null, meta_desc ?? null, nav_order, is_active]
    );
    res.status(201).json({ data: cat });
  } catch (err) { next(err); }
});

// PUT /api/admin/categories/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [existing] } = await pool.query('SELECT id FROM categories WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: { message: 'Category not found', code: 'NOT_FOUND' } });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const ALLOWED = ['name', 'slug', 'parent_id', 'description', 'banner_img', 'meta_title', 'meta_desc', 'nav_order', 'is_active'] as const;
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (body.name && !body.slug) {
      body.slug = await uniqueCategorySlug(toSlug(body.name as string), id);
    }

    for (const field of ALLOWED) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${i}`);
        params.push(body[field]); i++;
      }
    }
    if (!setClauses.length) {
      res.status(400).json({ error: { message: 'No fields to update', code: 'NO_FIELDS' } });
      return;
    }
    params.push(id);
    const { rows: [cat] } = await pool.query(
      `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    res.json({ data: cat });
  } catch (err) { next(err); }
});

// DELETE /api/admin/categories/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [{ count }] } = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM product_categories WHERE category_id = $1',
      [id]
    );
    const productCount = parseInt(count, 10);
    if (productCount > 0) {
      res.status(409).json({
        error: {
          message: `Cannot delete: ${productCount} product(s) are assigned to this category`,
          code: 'CATEGORY_HAS_PRODUCTS',
        },
      });
      return;
    }
    const { rows: [cat] } = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING id, name, slug',
      [id]
    );
    if (!cat) {
      res.status(404).json({ error: { message: 'Category not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: cat });
  } catch (err) { next(err); }
});

export default router;
