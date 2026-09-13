import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { toSlug, uniqueProductSlug, autoSku } from '../../utils/slug';
import { processGeminiImage, buildStampLogo } from '../../utils/gemini-cleanup';
import { getActiveCalibration } from '../../services/photo-calibration';
import { ProductSchema } from '@krishnabyrr/shared';

const router = Router();

// ── File upload setup ─────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Two output variants, sized from what the storefront actually renders:
//   FULL — product gallery is aspect-[3/4] at 50vw, so a 1440px-wide desktop
//          viewport at DPR2 needs 1440 device px. Also covers mobile's
//          100vw x DPR3 (~1170).
//   TILE — grid cards are 25vw desktop / 50vw mobile, worst case ~585 device
//          px on a DPR3 phone.
// Serving one gallery-sized file to a 20-tile grid cost ~8MB; split, it is ~1MB.
const FULL_W               = 1440;
const FULL_H               = 1920;
const TILE_W               = 600;
const TILE_H               = 800;
// q80 measured on this catalogue's fabric: ~+1.3dB over q75 for ~25% more
// bytes, which is the last step that is clearly visible on woven texture.
const WEBP_QUALITY         = 80;
const STAMP_FRACTION       = 0.10;   // of the variant's own longest edge
const STAMP_PAD_FRACTION   = 0.025;

/** Tile path for a full-size image path: <uuid>.webp -> <uuid>-tile.webp */
export function tilePathFor(fullPath: string): string {
  return fullPath.replace(/\.webp$/, '-tile.webp');
}

// Use memory storage so we can run sharp before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  // Keep in step with MAX_UPLOAD_MB in apps/admin ProductForm.tsx — a smaller
  // limit here means files clear the browser check then fail at the API.
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB raw; compressed output is far smaller
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
      collection,
      in_stock,
      stock_min,
      stock_max,
      page = '1',
      limit = '24',
      sort = 'newest',
      ...tagFilters
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const offset = (pageNum - 1) * limitNum;

    const sortMap: Record<string, string> = {
      newest:       'p.created_at DESC',
      oldest:       'p.created_at ASC',
      name_asc:     'p.name ASC',
      name_desc:    'p.name DESC',
      mrp_asc:      'p.mrp ASC',
      mrp_desc:     'p.mrp DESC',
      stock_qty_asc:  'p.stock_qty ASC',
      stock_qty_desc: 'p.stock_qty DESC',
      status_asc:   'p.status ASC',
      status_desc:  'p.status DESC',
      // legacy aliases
      price_asc:    'p.mrp ASC',
      price_desc:   'p.mrp DESC',
    };
    const orderBy = sortMap[sort] ?? sortMap.newest;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    const normalizedStatus = status.toLowerCase().trim();
    if (normalizedStatus !== 'all' && ['active', 'draft', 'archived'].includes(normalizedStatus)) {
      conditions.push(`p.status = $${i}`);
      params.push(normalizedStatus); i++;
    }

    if (q?.trim()) {
      conditions.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i})`);
      params.push(`%${q.trim()}%`); i++;
    }

    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM product_categories pc2
        JOIN categories c ON c.id = pc2.category_id
        WHERE pc2.product_id = p.id AND c.slug = $${i}
      )`);
      params.push(category); i++;
    }

    if (collection) {
      conditions.push(`EXISTS (
        SELECT 1 FROM collection_products cp2
        JOIN collections col ON col.id = cp2.collection_id
        WHERE cp2.product_id = p.id AND col.slug = $${i}
      )`);
      params.push(collection); i++;
    }

    // Tag group filters: any key not in known params is treated as a tag group name
    const KNOWN_PARAMS = new Set(['status','q','category','collection','in_stock','stock_min','stock_max','page','limit','sort']);
    for (const [key, val] of Object.entries(tagFilters)) {
      if (!KNOWN_PARAMS.has(key) && val) {
        conditions.push(`EXISTS (
          SELECT 1 FROM product_tags pt2
          JOIN tags t ON t.id = pt2.tag_id
          WHERE pt2.product_id = p.id AND t.group_name = $${i} AND t.value = $${i + 1}
        )`);
        params.push(key, val); i += 2;
      }
    }

    if (in_stock === 'true') {
      conditions.push(`p.stock_qty > 0`);
    }

    const minStock = stock_min ? parseInt(stock_min, 10) : null;
    if (minStock != null && Number.isFinite(minStock)) {
      conditions.push(`p.stock_qty >= $${i}`);
      params.push(minStock); i++;
    }

    const maxStock = stock_max ? parseInt(stock_max, 10) : null;
    if (maxStock != null && Number.isFinite(maxStock)) {
      conditions.push(`p.stock_qty <= $${i}`);
      params.push(maxStock); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      params
    );

    // Per product, pick the deepest assigned category name (most specific —
    // e.g., 'Banarasi' beats 'Silks' beats 'Fabrics'). Empty when the product
    // has no category assigned. Uses a recursive depth CTE so it scales with
    // arbitrary tree depth.
    const { rows } = await pool.query(
      `WITH RECURSIVE cat_depth AS (
         SELECT id, name, parent_id, 0 AS depth FROM categories WHERE parent_id IS NULL
         UNION ALL
         SELECT c.id, c.name, c.parent_id, cd.depth + 1
           FROM categories c JOIN cat_depth cd ON c.parent_id = cd.id
       )
       SELECT
         p.id, p.name, p.slug, p.sku, p.short_desc,
         p.mrp, p.sale_price, p.cost_price, p.gst_rate, p.hsn_code,
         p.track_inventory, p.stock_qty, p.low_stock_threshold, p.oos_behavior,
         p.video_url, p.meta_title, p.meta_desc, p.status,
         p.created_at, p.updated_at,
         (SELECT row_to_json(pi)
          FROM (SELECT id, gcs_path, alt_text FROM product_images
                WHERE product_id = p.id AND is_primary = true LIMIT 1) pi
         ) AS primary_image,
         (SELECT cd.name
            FROM cat_depth cd
            JOIN product_categories pc ON pc.category_id = cd.id
           WHERE pc.product_id = p.id
           ORDER BY cd.depth DESC, cd.name
           LIMIT 1
         ) AS first_category
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
//
// Two modes, controlled by query params:
//   default:        soft-delete (status -> 'archived'). Any logged-in admin.
//   ?hard=true:     HARD delete — wipes the row, every cascaded relation
//                   (product_images, _categories, _tags, _badges, etc.),
//                   AND the actual image files on disk. super_admin only.
//   ?hard=true&force=true:
//                   same as hard, but ALSO removes order_items rows that
//                   reference this product (no cascade on that table by
//                   design — protects real order history). Use only for
//                   test data cleanup; destroys auditable order lines.
//
// On FK conflict (orders reference this product), returns 409
// PRODUCT_HAS_ORDERS so the UI can offer the force option.
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const hard  = req.query.hard  === 'true';
    const force = req.query.force === 'true';

    if (hard && req.user?.role !== 'super_admin') {
      res.status(403).json({
        error: { message: 'Hard delete requires super_admin role', code: 'FORBIDDEN' },
      });
      return;
    }

    if (!hard) {
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
      return;
    }

    // Hard delete path
    const { rows: images } = await pool.query<{ gcs_path: string }>(
      'SELECT gcs_path FROM product_images WHERE product_id = $1',
      [id]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (force) {
        await client.query('DELETE FROM order_items WHERE product_id = $1', [id]);
      }
      const { rows: [product] } = await client.query<{ id: string; name: string }>(
        'DELETE FROM products WHERE id = $1 RETURNING id, name',
        [id]
      );
      if (!product) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
        return;
      }
      await client.query('COMMIT');

      // Best-effort filesystem cleanup. If a file is already gone or the
      // path is malformed, log and continue — the DB state is authoritative.
      let filesDeleted = 0;
      for (const img of images) {
        try { fs.unlinkSync(img.gcs_path); filesDeleted++; } catch { /* ignore */ }
        try { fs.unlinkSync(tilePathFor(img.gcs_path)); } catch { /* ignore */ }
      }

      res.json({ data: { ...product, files_deleted: filesDeleted } });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const errCode = (err as { code?: string }).code;
      if (errCode === '23503') {
        res.status(409).json({
          error: {
            message: 'Product is referenced by orders. Re-run with ?force=true to also remove the order line items (only safe for test data — destroys order history).',
            code: 'PRODUCT_HAS_ORDERS',
          },
        });
        return;
      }
      throw err;
    } finally {
      client.release();
    }
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

    // Three independent steps.
    //
    //   process_gemini   — AI-generated source: inpaint the sparkle. Needs raw
    //                      pixel access, so it keeps its own pass.
    //   calibration      — real photography: white balance + exposure from the
    //                      active grey card.
    //   brand_stamp      — orthogonal to both; defaults on.
    //
    // The photo path runs as ONE sharp pipeline: a single decode and a single
    // encode. Chaining separate toBuffer() steps re-encoded the JPEG at default
    // quality before any real work (a 5.7MB original came out at 1.7MB) and the
    // stamp step produced a 19MB PNG intermediate — costly on a 1GB box.
    const processGemini   = req.body.process_gemini === 'true' || req.body.process_gemini === true;
    const skipCalibration = req.body.skip_calibration === 'true' || req.body.skip_calibration === true;
    // Default on: absent means stamp it, only an explicit 'false' turns it off.
    const brandStamp      = !(req.body.brand_stamp === 'false' || req.body.brand_stamp === false);

    const outputFilename = `${randomUUID()}.webp`;
    const outputPath = path.join(UPLOAD_DIR, outputFilename);
    const tileOutputPath = tilePathFor(outputPath);

    // Header-only read; does not decode pixels.
    const meta = await sharp(file.buffer).metadata();
    // EXIF orientations 5-8 rotate by 90 degrees, so the post-rotate frame has
    // width and height swapped relative to the stored pixels.
    const upright = (meta.orientation ?? 1) >= 5;
    const srcW = (upright ? meta.height : meta.width) ?? 0;
    const srcH = (upright ? meta.width  : meta.height) ?? 0;

    /** Dimensions after fit:'inside' into a box, mirroring the resize below. */
    function fitInside(boxW: number, boxH: number) {
      const scale = Math.min(1, boxW / (srcW || 1), boxH / (srcH || 1));
      return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
    }

    /**
     * Renders one variant. sharp composites AFTER resize regardless of call
     * order, so the stamp is sized against this variant's own final frame —
     * the mark stays proportionally identical across tile and full.
     */
    async function writeVariant(base: sharp.Sharp, boxW: number, boxH: number, dest: string) {
      const { w, h } = fitInside(boxW, boxH);
      let p = base.clone().resize({ width: boxW, height: boxH, fit: 'inside', withoutEnlargement: true });
      if (brandStamp && w > 0 && h > 0) {
        const size = Math.max(24, Math.round(Math.max(w, h) * STAMP_FRACTION));
        const pad  = Math.round(Math.max(w, h) * STAMP_PAD_FRACTION);
        p = p.composite([{
          input: await buildStampLogo(size),
          left:  Math.max(0, w - size - pad),
          top:   Math.max(0, h - size - pad),
        }]);
      }
      await p.webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(dest);
    }

    if (processGemini) {
      console.log(`[images] Gemini sparkle cleanup for product ${id} (stamp=${brandStamp})`);
      // Does its own EXIF rotate and returns lossless PNG.
      const cleaned = await processGeminiImage(file.buffer, { stamp: brandStamp });
      // The stamp is already burned in by that path, so skip it here.
      await sharp(cleaned).resize({ width: FULL_W, height: FULL_H, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(outputPath);
      await sharp(cleaned).resize({ width: TILE_W, height: TILE_H, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(tileOutputPath);
    } else {
      const base = sharp(file.buffer).rotate();

      if (!skipCalibration) {
        const calibration = await getActiveCalibration();
        if (calibration) {
          console.log(
            `[images] applying calibration ${calibration.id} to product ${id} ` +
            `(gains ${calibration.gain_r.toFixed(3)}/${calibration.gain_g.toFixed(3)}/${calibration.gain_b.toFixed(3)}, ` +
            `${calibration.exposure_stops.toFixed(2)} stops)`
          );
          const exposure = Math.pow(Math.pow(2, calibration.exposure_stops), 1 / 2.2);
          base.linear(
            [calibration.gain_r * exposure, calibration.gain_g * exposure, calibration.gain_b * exposure],
            [0, 0, 0],
          );
        }
      }

      // Sequential, not parallel — this box has ~430MB of RAM headroom and two
      // concurrent 12MP decodes is not worth the seconds saved.
      await writeVariant(base, FULL_W, FULL_H, outputPath);
      await writeVariant(base, TILE_W, TILE_H, tileOutputPath);
    }

    const gcsPath = outputPath;
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
    try { fs.unlinkSync(tilePathFor(img.gcs_path)); } catch { /* ignore */ }

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

      // Keep exactly one primary image: whichever is first in display order.
      await client.query(
        'UPDATE product_images SET is_primary = false WHERE product_id = $1',
        [id]
      );
      await client.query(
        `UPDATE product_images
         SET is_primary = true
         WHERE id = (
           SELECT id
           FROM product_images
           WHERE product_id = $1
           ORDER BY display_order ASC, created_at ASC
           LIMIT 1
         )`,
        [id]
      );
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

    const [{ rows: images }, { rows: tagRows }, { rows: categories }, { rows: collections }, { rows: badgeRows }] =
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
        pool.query(
          `SELECT b.id, b.name, b.hex_color, b.text_color
           FROM badges b JOIN product_badges pb ON pb.badge_id = b.id
           WHERE pb.product_id = $1 AND b.is_active = true
           ORDER BY b.display_order`, [id]
        ),
      ]);

    res.json({ data: { ...product, images, tags: tagRows, categories, collections, badges: badgeRows } });
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

// ── PUT /api/admin/products/:id/badges ───────────────────────────────────────
router.put('/:id/badges', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { badge_ids } = req.body as { badge_ids: string[] };
    if (!Array.isArray(badge_ids)) {
      res.status(400).json({ error: { message: 'badge_ids array required', code: 'INVALID_BODY' } });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM product_badges WHERE product_id = $1', [id]);
      for (const badgeId of badge_ids) {
        await client.query(
          'INSERT INTO product_badges (product_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, badgeId]
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    res.json({ data: { badge_ids } });
  } catch (err) { next(err); }
});

export default router;
