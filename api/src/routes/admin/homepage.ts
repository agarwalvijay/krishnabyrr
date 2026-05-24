import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { getRedisClient } from '../../redis';

const router = Router();
const CACHE_KEY = 'homepage:blocks';

// ── File upload setup ─────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB raw; sharp compresses on write
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

async function bustCache(): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(CACHE_KEY);
  } catch {
    // Cache bust failure is non-fatal
  }
}

// GET /api/admin/homepage/blocks — enriched with source_collection for product_section blocks
router.get('/blocks', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, display_order, is_active, payload, created_at, updated_at
       FROM homepage_blocks ORDER BY display_order`
    );

    // Collect source IDs (new schema) and slugs (legacy) for enrichment
    const sourceIds: string[] = [];
    const legacySlugs: string[] = [];
    for (const r of rows) {
      if (r.type !== 'product_section') continue;
      if (r.payload?.source_id) sourceIds.push(r.payload.source_id as string);
      else if (r.payload?.collection_slug) legacySlugs.push(r.payload.collection_slug as string);
    }

    const byId: Record<string, unknown> = {};
    const bySlug: Record<string, unknown> = {};

    if (sourceIds.length > 0) {
      const { rows: cols } = await pool.query(
        `SELECT id, name, slug,
           (SELECT COUNT(*) FROM collection_products cp WHERE cp.collection_id = id)::int AS product_count
         FROM collections WHERE id = ANY($1::uuid[])`,
        [sourceIds]
      );
      for (const col of cols) byId[col.id as string] = col;
    }

    if (legacySlugs.length > 0) {
      const { rows: cols } = await pool.query(
        `SELECT id, name, slug,
           (SELECT COUNT(*) FROM collection_products cp WHERE cp.collection_id = id)::int AS product_count
         FROM collections WHERE slug = ANY($1::text[])`,
        [legacySlugs]
      );
      for (const col of cols) bySlug[col.slug as string] = col;
    }

    const enriched = rows.map((r) => {
      if (r.type !== 'product_section') return { ...r, source_collection: null };
      const col = r.payload?.source_id
        ? byId[r.payload.source_id as string]
        : r.payload?.collection_slug
          ? bySlug[r.payload.collection_slug as string]
          : null;
      return { ...r, source_collection: col ?? null };
    });

    res.json({ data: enriched });
  } catch (err) { next(err); }
});

// POST /api/admin/homepage/blocks
router.post('/blocks', requireAuth, async (req, res, next) => {
  try {
    const { type, display_order = 0, is_active = true, payload = {} } = req.body as Record<string, unknown>;

    if (!type || !['banner', 'product_section'].includes(type as string)) {
      res.status(422).json({
        error: { message: "type must be 'banner' or 'product_section'", code: 'VALIDATION_ERROR' },
      });
      return;
    }

    const { rows: [block] } = await pool.query(
      `INSERT INTO homepage_blocks (type, display_order, is_active, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [type, Number(display_order), Boolean(is_active), JSON.stringify(payload)]
    );

    await bustCache();
    res.status(201).json({ data: block });
  } catch (err) { next(err); }
});

// POST /api/admin/homepage/blocks/:id/image
// ?field=image_desktop (default) | image_mobile
router.post('/blocks/:id/image', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const field = req.query.field === 'image_mobile' ? 'image_mobile' : 'image_desktop';
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: { message: 'No image file provided', code: 'NO_FILE' } });
      return;
    }

    const { rows: [block] } = await pool.query(
      'SELECT id, payload FROM homepage_blocks WHERE id = $1',
      [id]
    );
    if (!block) {
      res.status(404).json({ error: { message: 'Block not found', code: 'NOT_FOUND' } });
      return;
    }

    // Banners are wide — cap at 1920px wide, WebP at quality 85.
    const outputFilename = `${randomUUID()}.webp`;
    const outputPath = path.join(UPLOAD_DIR, outputFilename);
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 85, effort: 5 })
      .toFile(outputPath);

    const gcsPath = outputPath;
    const newPayload = { ...(block.payload as Record<string, unknown> ?? {}), [field]: gcsPath };

    const { rows: [updated] } = await pool.query(
      'UPDATE homepage_blocks SET payload = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(newPayload), id]
    );

    await bustCache();
    res.json({ data: updated, path: gcsPath });
  } catch (err) { next(err); }
});

// DELETE /api/admin/homepage/blocks/:id/image
// ?field=image_desktop (default) | image_mobile
router.delete('/blocks/:id/image', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const field = req.query.field === 'image_mobile' ? 'image_mobile' : 'image_desktop';

    const { rows: [block] } = await pool.query(
      'SELECT id, payload FROM homepage_blocks WHERE id = $1',
      [id]
    );
    if (!block) {
      res.status(404).json({ error: { message: 'Block not found', code: 'NOT_FOUND' } });
      return;
    }

    const newPayload = { ...(block.payload as Record<string, unknown> ?? {}), [field]: null };
    const { rows: [updated] } = await pool.query(
      'UPDATE homepage_blocks SET payload = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(newPayload), id]
    );

    await bustCache();
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// PUT /api/admin/homepage/blocks/reorder
// IMPORTANT: declared BEFORE /blocks/:id so Express doesn't swallow 'reorder' as :id
router.put('/blocks/reorder', requireAuth, async (req, res, next) => {
  try {
    const { blocks } = req.body as { blocks?: Array<{ id: string; display_order: number }> };
    if (!Array.isArray(blocks) || blocks.length === 0) {
      res.status(422).json({ error: { message: 'blocks array is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const b of blocks) {
        await client.query(
          'UPDATE homepage_blocks SET display_order = $1, updated_at = NOW() WHERE id = $2',
          [Number(b.display_order), b.id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await bustCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/admin/homepage/blocks/:id
router.put('/blocks/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, display_order, is_active, payload } = req.body as Record<string, unknown>;

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (type !== undefined) {
      if (!['banner', 'product_section'].includes(type as string)) {
        res.status(422).json({ error: { message: "type must be 'banner' or 'product_section'", code: 'VALIDATION_ERROR' } });
        return;
      }
      setClauses.push(`type = $${i}`); params.push(type); i++;
    }
    if (display_order !== undefined) { setClauses.push(`display_order = $${i}`); params.push(Number(display_order)); i++; }
    if (is_active !== undefined)     { setClauses.push(`is_active = $${i}`);     params.push(Boolean(is_active)); i++; }
    if (payload !== undefined)       { setClauses.push(`payload = $${i}`);       params.push(JSON.stringify(payload)); i++; }

    params.push(id);
    const { rows: [block] } = await pool.query(
      `UPDATE homepage_blocks SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!block) {
      res.status(404).json({ error: { message: 'Block not found', code: 'NOT_FOUND' } });
      return;
    }

    await bustCache();
    res.json({ data: block });
  } catch (err) { next(err); }
});

// DELETE /api/admin/homepage/blocks/:id
router.delete('/blocks/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [block] } = await pool.query(
      'DELETE FROM homepage_blocks WHERE id = $1 RETURNING id',
      [id]
    );
    if (!block) {
      res.status(404).json({ error: { message: 'Block not found', code: 'NOT_FOUND' } });
      return;
    }
    await bustCache();
    res.json({ data: block });
  } catch (err) { next(err); }
});

export default router;
