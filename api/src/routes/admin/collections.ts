import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { toSlug, uniqueCollectionSlug } from '../../utils/slug';

const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

// GET /api/admin/collections
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM collection_products cp WHERE cp.collection_id = c.id) AS product_count
       FROM collections c
       ORDER BY c.homepage_order, c.name`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/admin/collections
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, description, banner_img, banner_height = 'md', tagline, is_homepage = false, homepage_order = 0, is_active = true } =
      req.body as Record<string, unknown>;

    if (!name || typeof name !== 'string') {
      res.status(422).json({ error: { message: '`name` is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    const slug = await uniqueCollectionSlug(toSlug(name as string));

    const { rows: [col] } = await pool.query(
      `INSERT INTO collections (name, slug, description, banner_img, banner_height, tagline, is_homepage, homepage_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, slug, description ?? null, banner_img ?? null, banner_height, tagline ?? null,
       is_homepage, homepage_order, is_active]
    );
    res.status(201).json({ data: col });
  } catch (err) { next(err); }
});

// PUT /api/admin/collections/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [existing] } = await pool.query('SELECT id FROM collections WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: { message: 'Collection not found', code: 'NOT_FOUND' } });
      return;
    }

    const body = req.body as Record<string, unknown>;
    if (body.name && !body.slug) {
      body.slug = await uniqueCollectionSlug(toSlug(body.name as string), id);
    }

    const ALLOWED = ['name', 'slug', 'description', 'banner_img', 'banner_height', 'tagline', 'is_homepage', 'homepage_order', 'is_active'] as const;
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;

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
    const { rows: [col] } = await pool.query(
      `UPDATE collections SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    res.json({ data: col });
  } catch (err) { next(err); }
});

// DELETE /api/admin/collections/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [col] } = await pool.query(
      'DELETE FROM collections WHERE id = $1 RETURNING id, name, slug',
      [id]
    );
    if (!col) {
      res.status(404).json({ error: { message: 'Collection not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: col });
  } catch (err) { next(err); }
});

// POST /api/admin/collections/:id/banner
router.post('/:id/banner', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { message: 'No image file provided', code: 'NO_FILE' } });
      return;
    }
    const { rows: [col] } = await pool.query('SELECT id FROM collections WHERE id = $1', [id]);
    if (!col) {
      res.status(404).json({ error: { message: 'Collection not found', code: 'NOT_FOUND' } });
      return;
    }

    const outputFilename = `${randomUUID()}.jpg`;
    const outputPath = path.join(UPLOAD_DIR, outputFilename);
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true, mozjpeg: true })
      .toFile(outputPath);

    const { rows: [updated] } = await pool.query(
      `UPDATE collections SET banner_img = $1 WHERE id = $2 RETURNING *`,
      [outputPath, id]
    );
    res.json({ data: updated, path: outputPath });
  } catch (err) { next(err); }
});

// DELETE /api/admin/collections/:id/banner
router.delete('/:id/banner', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [updated] } = await pool.query(
      `UPDATE collections SET banner_img = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!updated) {
      res.status(404).json({ error: { message: 'Collection not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// POST /api/admin/collections/:id/products
router.post('/:id/products', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { product_id, display_order = 0 } = req.body as Record<string, unknown>;

    if (!product_id) {
      res.status(422).json({ error: { message: '`product_id` required', code: 'VALIDATION_ERROR' } });
      return;
    }
    const { rows: [row] } = await pool.query(
      `INSERT INTO collection_products (collection_id, product_id, display_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (collection_id, product_id) DO UPDATE SET display_order = EXCLUDED.display_order
       RETURNING *`,
      [id, product_id, display_order]
    );
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
});

// DELETE /api/admin/collections/:id/products/:productId
router.delete('/:id/products/:productId', requireAuth, async (req, res, next) => {
  try {
    const { id, productId } = req.params;
    const { rows: [row] } = await pool.query(
      'DELETE FROM collection_products WHERE collection_id = $1 AND product_id = $2 RETURNING *',
      [id, productId]
    );
    if (!row) {
      res.status(404).json({ error: { message: 'Product not in collection', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: row });
  } catch (err) { next(err); }
});

// PUT /api/admin/collections/:id/products/reorder
router.put('/:id/products/reorder', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { products } = req.body as { products: Array<{ id: string; display_order: number }> };

    if (!Array.isArray(products) || !products.length) {
      res.status(400).json({ error: { message: 'products array required', code: 'INVALID_BODY' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id: productId, display_order } of products) {
        await client.query(
          'UPDATE collection_products SET display_order = $1 WHERE collection_id = $2 AND product_id = $3',
          [display_order, id, productId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      `SELECT cp.*, p.name, p.slug FROM collection_products cp
       JOIN products p ON p.id = cp.product_id
       WHERE cp.collection_id = $1 ORDER BY cp.display_order`,
      [id]
    );
    res.json({ data: { products: rows } });
  } catch (err) { next(err); }
});

export default router;
