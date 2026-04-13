import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { toSlug, uniqueProductSlug, autoSku } from '../../utils/slug';
import { ProductSchema } from '@krishnabyrr/shared';

const router = Router();

// ── File upload setup ─────────────────────────────────────────────────────────
const UPLOAD_DIR = '/tmp/kb_uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ── GET /api/admin/products ───────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      status = 'all',
      q,
      category,
      page = '1',
      limit = '24',
      sort = 'newest',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const offset = (pageNum - 1) * limitNum;

    const sortMap: Record<string, string> = {
      newest: 'p.created_at DESC',
      price_asc: 'p.mrp ASC',
      price_desc: 'p.mrp DESC',
    };
    const orderBy = sortMap[sort] ?? sortMap.newest;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (status !== 'all') {
      conditions.push(`p.status = $${i}`);
      params.push(status); i++;
    }

    if (q) {
      conditions.push(`to_tsvector('english', p.name || ' ' || COALESCE(p.short_desc, ''))
        @@ plainto_tsquery('english', $${i})`);
      params.push(q); i++;
    }

    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM product_categories pc2
        JOIN categories c ON c.id = pc2.category_id
        WHERE pc2.product_id = p.id AND c.slug = $${i}
      )`);
      params.push(category); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      params
    );

    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.slug, p.sku, p.short_desc,
         p.mrp, p.sale_price, p.cost_price, p.gst_rate, p.hsn_code,
         p.track_inventory, p.stock_qty, p.low_stock_threshold, p.oos_behavior,
         p.video_url, p.meta_title, p.meta_desc, p.status,
         p.created_at, p.updated_at,
         (SELECT row_to_json(pi)
          FROM (SELECT id, gcs_path, alt_text FROM product_images
                WHERE product_id = p.id AND is_primary = true LIMIT 1) pi
         ) AS primary_image
       FROM products p
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      data: rows,
      meta: {
        total: parseInt(total, 10),
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(parseInt(total, 10) / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/products ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      });
      return;
    }

    const data = parsed.data;

    // Auto-generate slug if not provided, or validate uniqueness
    const baseSlug = data.slug ?? toSlug(data.name);
    const slug = await uniqueProductSlug(baseSlug);

    // Auto-generate SKU if not provided
    const sku = data.sku ?? autoSku(data.name);

    const { rows: [product] } = await pool.query(
      `INSERT INTO products (
         name, slug, sku, short_desc, description, care_instr,
         mrp, sale_price, cost_price, gst_rate, hsn_code,
         stock_qty, low_stock_threshold, oos_behavior,
         meta_title, meta_desc, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17
       ) RETURNING *`,
      [
        data.name, slug, sku, data.short_desc ?? null, null, null,
        data.mrp, data.sale_price ?? null, data.cost_price ?? null,
        data.gst_rate, null,
        data.stock_qty, 2, 'show_sold_out',
        null, null, data.status,
      ]
    );

    res.status(201).json({ data: product });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'SKU already exists', code: 'DUPLICATE_SKU' } });
      return;
    }
    next(err);
  }
});

// ── PUT /api/admin/products/:id ───────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check exists
    const { rows: [existing] } = await pool.query(
      'SELECT id, name, slug FROM products WHERE id = $1',
      [id]
    );
    if (!existing) {
      res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
      return;
    }

    const body = req.body as Record<string, unknown>;

    // If name changes and slug is not explicitly provided, regenerate slug
    if (body.name && !body.slug) {
      const baseSlug = toSlug(body.name as string);
      body.slug = await uniqueProductSlug(baseSlug, id);
    } else if (body.slug) {
      body.slug = await uniqueProductSlug(toSlug(body.slug as string), id);
    }

    const ALLOWED = [
      'name', 'slug', 'short_desc', 'description', 'care_instr',
      'mrp', 'sale_price', 'cost_price', 'gst_rate', 'hsn_code',
      'track_inventory', 'stock_qty', 'low_stock_threshold', 'oos_behavior',
      'video_url', 'meta_title', 'meta_desc', 'status',
    ] as const;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    for (const field of ALLOWED) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${i}`);
        params.push(body[field]); i++;
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: { message: 'No valid fields to update', code: 'NO_FIELDS' } });
      return;
    }

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const { rows: [updated] } = await pool.query(
      `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/admin/products/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [product] } = await pool.query(
      `UPDATE products SET status = 'archived', updated_at = NOW()
       WHERE id = $1 RETURNING id, name, status`,
      [id]
    );
    if (!product) {
      res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/products/:id/images ───────────────────────────────────────
router.post('/:id/images', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { message: 'No image file provided', code: 'NO_FILE' } });
      return;
    }

    const { rows: [product] } = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [id]
    );
    if (!product) {
      res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
      return;
    }

    // Is this the first image?
    const { rows: [{ count }] } = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM product_images WHERE product_id = $1',
      [id]
    );
    const isPrimary = parseInt(count, 10) === 0;

    // Display order = current max + 1
    const { rows: [{ max_order }] } = await pool.query<{ max_order: string | null }>(
      'SELECT MAX(display_order) AS max_order FROM product_images WHERE product_id = $1',
      [id]
    );
    const displayOrder = max_order ? parseInt(max_order, 10) + 1 : 0;

    const gcsPath = `${UPLOAD_DIR}/${file.filename}`;
    const altText = req.body.alt_text ?? null;

    const { rows: [image] } = await pool.query(
      `INSERT INTO product_images (product_id, gcs_path, alt_text, display_order, is_primary)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, gcsPath, altText, displayOrder, isPrimary]
    );

    // Return full image list
    const { rows: images } = await pool.query(
      'SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order',
      [id]
    );

    res.status(201).json({ data: { image, images } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/admin/products/:id/images/:imageId ────────────────────────────
router.delete('/:id/images/:imageId', requireAuth, async (req, res, next) => {
  try {
    const { id, imageId } = req.params;

    const { rows: [img] } = await pool.query(
      'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING *',
      [imageId, id]
    );
    if (!img) {
      res.status(404).json({ error: { message: 'Image not found', code: 'NOT_FOUND' } });
      return;
    }

    // If deleted image was primary, promote the next one
    if (img.is_primary) {
      await pool.query(
        `UPDATE product_images SET is_primary = true
         WHERE id = (
           SELECT id FROM product_images
           WHERE product_id = $1
           ORDER BY display_order LIMIT 1
         )`,
        [id]
      );
    }

    // Try to delete the file from disk (best-effort)
    try { fs.unlinkSync(img.gcs_path); } catch { /* ignore */ }

    const { rows: images } = await pool.query(
      'SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order',
      [id]
    );
    res.json({ data: { images } });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/products/:id/images/reorder ────────────────────────────────
router.put('/:id/images/reorder', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { images } = req.body as { images: Array<{ id: string; display_order: number }> };

    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: { message: 'images array required', code: 'INVALID_BODY' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id: imgId, display_order } of images) {
        await client.query(
          'UPDATE product_images SET display_order = $1 WHERE id = $2 AND product_id = $3',
          [display_order, imgId, id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { rows: updatedImages } = await pool.query(
      'SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order',
      [id]
    );
    res.json({ data: { images: updatedImages } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/products/:id/stock-adjust ─────────────────────────────────
router.post('/:id/stock-adjust', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { change, reason } = req.body as { change: number; reason: string };

    if (typeof change !== 'number' || !Number.isInteger(change)) {
      res.status(400).json({ error: { message: '`change` must be an integer', code: 'INVALID_CHANGE' } });
      return;
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ error: { message: '`reason` is required', code: 'INVALID_REASON' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [product] } = await client.query(
        'SELECT id, stock_qty FROM products WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!product) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
        return;
      }

      const qtyBefore = product.stock_qty as number;
      const qtyAfter = qtyBefore + change;

      if (qtyAfter < 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: {
            message: `Stock would go negative (current: ${qtyBefore}, change: ${change})`,
            code: 'INSUFFICIENT_STOCK',
          },
        });
        return;
      }

      await client.query(
        'UPDATE products SET stock_qty = $1, updated_at = NOW() WHERE id = $2',
        [qtyAfter, id]
      );

      await client.query(
        `INSERT INTO inventory_log
           (product_id, change_type, qty_before, qty_change, qty_after, reason, admin_user_id)
         VALUES ($1, 'manual_adjustment', $2, $3, $4, $5, $6)`,
        [id, qtyBefore, change, qtyAfter, reason.trim(), req.user?.id ?? null]
      );

      await client.query('COMMIT');

      res.json({ data: { stock_qty: qtyAfter, qty_before: qtyBefore, qty_change: change } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/products/:id ──────────────────────────────────────────────
// Must come AFTER all /:id/* sub-routes so params don't shadow them
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: [product] } = await pool.query(
      `SELECT id, name, slug, sku, short_desc, description, care_instr,
              mrp, sale_price, cost_price, gst_rate, hsn_code,
              track_inventory, stock_qty, low_stock_threshold, oos_behavior,
              video_url, meta_title, meta_desc, status,
              created_at, updated_at
       FROM products WHERE id = $1`,
      [id]
    );
    if (!product) {
      res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
      return;
    }

    const [{ rows: images }, { rows: tagRows }, { rows: categories }, { rows: collections }] =
      await Promise.all([
        pool.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order', [id]),
        pool.query(
          `SELECT t.id, t.group_name, t.value, t.hex_color
           FROM tags t JOIN product_tags pt ON pt.tag_id = t.id
           WHERE pt.product_id = $1`, [id]
        ),
        pool.query(
          `SELECT c.id, c.name, c.slug, c.parent_id
           FROM categories c JOIN product_categories pc ON pc.category_id = c.id
           WHERE pc.product_id = $1`, [id]
        ),
        pool.query(
          `SELECT col.id, col.name, col.slug
           FROM collections col JOIN collection_products cp ON cp.collection_id = col.id
           WHERE cp.product_id = $1`, [id]
        ),
      ]);

    res.json({ data: { ...product, images, tags: tagRows, categories, collections } });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/products/:id/categories ────────────────────────────────────
router.put('/:id/categories', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category_ids } = req.body as { category_ids: string[] };
    if (!Array.isArray(category_ids)) {
      res.status(400).json({ error: { message: 'category_ids array required', code: 'INVALID_BODY' } });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM product_categories WHERE product_id = $1', [id]);
      for (const catId of category_ids) {
        await client.query(
          'INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, catId]
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    res.json({ data: { category_ids } });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/products/:id/tags ─────────────────────────────────────────
router.put('/:id/tags', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tag_ids } = req.body as { tag_ids: string[] };
    if (!Array.isArray(tag_ids)) {
      res.status(400).json({ error: { message: 'tag_ids array required', code: 'INVALID_BODY' } });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM product_tags WHERE product_id = $1', [id]);
      for (const tagId of tag_ids) {
        await client.query(
          'INSERT INTO product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, tagId]
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    res.json({ data: { tag_ids } });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/products/:id/collections ───────────────────────────────────
router.put('/:id/collections', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { collection_ids } = req.body as { collection_ids: string[] };
    if (!Array.isArray(collection_ids)) {
      res.status(400).json({ error: { message: 'collection_ids array required', code: 'INVALID_BODY' } });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM collection_products WHERE product_id = $1', [id]);
      for (const [i, colId] of collection_ids.entries()) {
        await client.query(
          'INSERT INTO collection_products (collection_id, product_id, display_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [colId, id, i]
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    res.json({ data: { collection_ids } });
  } catch (err) { next(err); }
});

// ── GET /api/admin/products/:id/related ──────────────────────────────────────
router.get('/:id/related', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const FIELDS = `
      p.id, p.name, p.slug, p.mrp, p.sale_price, p.stock_qty,
      rp.type, rp.display_order,
      (SELECT row_to_json(pi)
       FROM (SELECT id, gcs_path, alt_text FROM product_images
             WHERE product_id = p.id AND is_primary = true LIMIT 1) pi
      ) AS primary_image`;
    const { rows } = await pool.query(
      `SELECT ${FIELDS}
       FROM products p
       JOIN related_products rp ON rp.related_id = p.id
       WHERE rp.product_id = $1 AND p.status = 'active'
       ORDER BY rp.type, rp.display_order`,
      [id]
    );
    const similar = rows.filter((r) => r.type === 'similar');
    const look    = rows.filter((r) => r.type === 'look');
    res.json({ data: { similar, look } });
  } catch (err) { next(err); }
});

// ── POST /api/admin/products/:id/related ─────────────────────────────────────
router.post('/:id/related', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { related_id, type = 'similar' } = req.body as { related_id: string; type?: string };
    if (!related_id) {
      res.status(400).json({ error: { message: 'related_id required', code: 'INVALID_BODY' } });
      return;
    }
    if (!['similar', 'look'].includes(type)) {
      res.status(400).json({ error: { message: 'type must be similar or look', code: 'INVALID_TYPE' } });
      return;
    }
    const { rows: [{ max_order }] } = await pool.query<{ max_order: string | null }>(
      `SELECT MAX(display_order) AS max_order FROM related_products WHERE product_id = $1 AND type = $2`,
      [id, type]
    );
    const display_order = max_order ? parseInt(max_order, 10) + 1 : 0;
    await pool.query(
      `INSERT INTO related_products (product_id, related_id, type, display_order)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [id, related_id, type, display_order]
    );
    res.status(201).json({ data: { product_id: id, related_id, type, display_order } });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/products/:id/related/:relatedId ─────────────────────────
router.delete('/:id/related/:relatedId', requireAuth, async (req, res, next) => {
  try {
    const { id, relatedId } = req.params;
    const { rows: [deleted] } = await pool.query(
      `DELETE FROM related_products WHERE product_id = $1 AND related_id = $2 RETURNING *`,
      [id, relatedId]
    );
    if (!deleted) {
      res.status(404).json({ error: { message: 'Relationship not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json({ data: deleted });
  } catch (err) { next(err); }
});

export default router;
