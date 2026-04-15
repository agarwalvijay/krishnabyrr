import { Router } from 'express';
import pool from '../db/client';

const router = Router();

// ── Shared sub-query fragments ────────────────────────────────────────────────

/** Returns the primary image as a JSON object, or NULL */
const PRIMARY_IMAGE_SUB = `(
  SELECT row_to_json(pi)
  FROM (
    SELECT id, gcs_path, alt_text
    FROM product_images
    WHERE product_id = p.id AND is_primary = true
    LIMIT 1
  ) pi
) AS primary_image`;

/** Returns the second (non-primary) image for hover crossfade, or NULL */
const SECOND_IMAGE_SUB = `(
  SELECT row_to_json(si)
  FROM (
    SELECT id, gcs_path, alt_text
    FROM product_images
    WHERE product_id = p.id AND is_primary = false
    ORDER BY display_order
    LIMIT 1
  ) si
) AS second_image`;

/** Returns all tags as a JSON array */
const TAGS_SUB = `COALESCE(
  (SELECT json_agg(json_build_object(
      'id', t.id,
      'group_name', t.group_name,
      'value', t.value,
      'hex_color', t.hex_color
    ))
   FROM product_tags pt2
   JOIN tags t ON t.id = pt2.tag_id
   WHERE pt2.product_id = p.id
  ), '[]'::json
) AS tags`;

const SORT_MAP: Record<string, string> = {
  newest: 'p.created_at DESC',
  price_asc: 'COALESCE(p.sale_price, p.mrp) ASC',
  price_desc: 'COALESCE(p.sale_price, p.mrp) DESC',
  discount_pct: `(CASE WHEN p.sale_price IS NOT NULL AND p.mrp > 0
                       THEN (p.mrp - p.sale_price) / p.mrp * 100
                       ELSE 0 END) DESC`,
  best_selling: 'p.created_at DESC', // placeholder until order analytics exist
};

// ── GET /api/products ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    // ?ids=uuid1,uuid2,... shortcut for wishlist/batch fetch
    const idsParam = (req.query as Record<string, string>).ids;
    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
      if (ids.length === 0) {
        res.json({ data: [], meta: { total: 0, page: 1, limit: 100, pages: 0 } });
        return;
      }
      const { rows } = await pool.query(
        `SELECT
           p.id, p.name, p.slug, p.sku, p.short_desc,
           p.mrp, p.sale_price, p.gst_rate,
           p.stock_qty, p.low_stock_threshold, p.oos_behavior,
           p.status, p.created_at,
           ${PRIMARY_IMAGE_SUB},
           ${SECOND_IMAGE_SUB},
           ${TAGS_SUB}
         FROM products p
         WHERE p.id = ANY($1::uuid[])`,
        [ids],
      );
      res.json({ data: rows, meta: { total: rows.length, page: 1, limit: rows.length, pages: 1 } });
      return;
    }

    const query = req.query as Record<string, string>;
    const {
      q,
      category,
      collection,
      price_min,
      price_max,
      in_stock,
      sort = 'newest',
      page = '1',
      limit = '24',
    } = query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const offset = (pageNum - 1) * limitNum;
    const orderBy = SORT_MAP[sort] ?? SORT_MAP.newest;

    const conditions: string[] = ['p.status = $1'];
    const params: unknown[] = ['active'];
    let i = 2;

    if (q) {
      conditions.push(`to_tsvector('english',
        p.name || ' ' || COALESCE(p.short_desc, '') || ' ' || COALESCE(p.description, '')
      ) @@ plainto_tsquery('english', $${i})`);
      params.push(q); i++;
    }

    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM product_categories pc2
        JOIN categories c ON c.id = pc2.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE pc2.product_id = p.id
          AND (c.slug = $${i} OR parent.slug = $${i})
      )`);
      params.push(category); i++;
    }

    // Dynamic tag group filters: any query param whose key is a known tag group name
    const NON_TAG_KEYS = new Set(['q', 'category', 'collection', 'price_min', 'price_max', 'in_stock', 'sort', 'page', 'limit', 'ids']);
    const { rows: tagGroupRows } = await pool.query<{ name: string }>(
      'SELECT name FROM tag_groups WHERE is_filter = TRUE'
    );
    const validGroups = new Set(tagGroupRows.map((r) => r.name));

    for (const [groupName, val] of Object.entries(query)) {
      if (!NON_TAG_KEYS.has(groupName) && validGroups.has(groupName) && val) {
        conditions.push(`EXISTS (
          SELECT 1 FROM product_tags pt3
          JOIN tags t3 ON t3.id = pt3.tag_id
          WHERE pt3.product_id = p.id
            AND t3.group_name = $${i}
            AND t3.value = $${i + 1}
        )`);
        params.push(groupName, val); i += 2;
      }
    }

    if (collection) {
      conditions.push(`EXISTS (
        SELECT 1 FROM collection_products cp2
        JOIN collections col ON col.id = cp2.collection_id
        WHERE cp2.product_id = p.id AND col.slug = $${i}
      )`);
      params.push(collection); i++;
    }

    if (price_min) {
      conditions.push(`COALESCE(p.sale_price, p.mrp) >= $${i}`);
      params.push(parseFloat(price_min)); i++;
    }
    if (price_max) {
      conditions.push(`COALESCE(p.sale_price, p.mrp) <= $${i}`);
      params.push(parseFloat(price_max)); i++;
    }

    if (in_stock === 'true') {
      conditions.push('p.stock_qty > 0');
    }

    const where = conditions.join(' AND ');

    // Count total for pagination
    const countSql = `SELECT COUNT(*) AS total FROM products p WHERE ${where}`;
    const { rows: countRows } = await pool.query<{ total: string }>(countSql, params);
    const total = parseInt(countRows[0].total, 10);

    // Fetch page
    const dataSql = `
      SELECT
        p.id, p.name, p.slug, p.sku, p.short_desc,
        p.mrp, p.sale_price, p.gst_rate,
        p.stock_qty, p.low_stock_threshold, p.oos_behavior,
        p.status, p.created_at,
        ${PRIMARY_IMAGE_SUB},
        ${SECOND_IMAGE_SUB},
        ${TAGS_SUB}
      FROM products p
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const { rows } = await pool.query(dataSql, [...params, limitNum, offset]);

    res.json({
      data: rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products/:slug ───────────────────────────────────────────────────
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const { rows: [product] } = await pool.query(
      `SELECT
         id, name, slug, sku, short_desc, description, care_instr,
         mrp, sale_price, gst_rate, hsn_code,
         track_inventory, stock_qty, low_stock_threshold, oos_behavior,
         video_url, meta_title, meta_desc, status,
         created_at, updated_at
       FROM products
       WHERE slug = $1 AND status = 'active'`,
      [slug]
    );

    if (!product) {
      res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
      return;
    }

    const { id } = product;

    // Images ordered by display_order
    const { rows: images } = await pool.query(
      `SELECT id, gcs_path, alt_text, display_order, is_primary, created_at
       FROM product_images WHERE product_id = $1 ORDER BY display_order`,
      [id]
    );

    // Tags
    const { rows: tagRows } = await pool.query(
      `SELECT t.id, t.group_name, t.value, t.hex_color
       FROM tags t JOIN product_tags pt ON pt.tag_id = t.id
       WHERE pt.product_id = $1`,
      [id]
    );

    // Group tags by group_name
    const tags: Record<string, typeof tagRows> = {};
    for (const t of tagRows) {
      if (!tags[t.group_name]) tags[t.group_name] = [];
      tags[t.group_name].push(t);
    }

    // Categories
    const { rows: categories } = await pool.query(
      `SELECT c.id, c.name, c.slug, c.parent_id
       FROM categories c
       JOIN product_categories pc ON pc.category_id = c.id
       WHERE pc.product_id = $1`,
      [id]
    );

    // Collections
    const { rows: collections } = await pool.query(
      `SELECT col.id, col.name, col.slug, col.tagline
       FROM collections col
       JOIN collection_products cp ON cp.collection_id = col.id
       WHERE cp.product_id = $1 AND col.is_active = true`,
      [id]
    );

    // Related products from curated table
    const RELATED_PRODUCT_FIELDS = `
      p2.id, p2.name, p2.slug, p2.mrp, p2.sale_price, p2.stock_qty,
      (SELECT row_to_json(pi)
       FROM (SELECT id, gcs_path, alt_text
             FROM product_images
             WHERE product_id = p2.id AND is_primary = true LIMIT 1) pi
      ) AS primary_image`;

    const [{ rows: similarRows }, { rows: lookRows }] = await Promise.all([
      pool.query(
        `SELECT ${RELATED_PRODUCT_FIELDS}
         FROM products p2
         JOIN related_products rp ON rp.related_id = p2.id
         WHERE rp.product_id = $1 AND rp.type = 'similar' AND p2.status = 'active'
         ORDER BY rp.display_order LIMIT 4`,
        [id]
      ),
      pool.query(
        `SELECT ${RELATED_PRODUCT_FIELDS}
         FROM products p2
         JOIN related_products rp ON rp.related_id = p2.id
         WHERE rp.product_id = $1 AND rp.type = 'look' AND p2.status = 'active'
         ORDER BY rp.display_order LIMIT 3`,
        [id]
      ),
    ]);

    // Fallback for similar: same fabric tag if table is empty
    let related_similar: unknown[] = similarRows;
    if (related_similar.length === 0) {
      const fabricTag = tagRows.find((t) => t.group_name === 'fabric');
      if (fabricTag) {
        const { rows: fallback } = await pool.query(
          `SELECT ${RELATED_PRODUCT_FIELDS}
           FROM products p2
           JOIN product_tags pt ON pt.product_id = p2.id
           JOIN tags t ON t.id = pt.tag_id
           WHERE t.group_name = 'fabric' AND t.value = $1
             AND p2.id != $2 AND p2.status = 'active'
           LIMIT 4`,
          [fabricTag.value, id]
        );
        related_similar = fallback;
      }
    }

    res.json({
      data: {
        ...product,
        images,
        tags,
        categories,
        collections,
        related_similar,
        related_look: lookRows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/categories ───────────────────────────────────────────────────────
router.get('/categories/tree', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, slug, parent_id, description, banner_img,
              meta_title, meta_desc, nav_order, is_active
       FROM categories
       WHERE is_active = true
       ORDER BY nav_order`
    );

    const parents = rows.filter((r) => !r.parent_id);
    const children = rows.filter((r) => r.parent_id);

    const tree = parents.map((p) => ({
      ...p,
      children: children.filter((c) => c.parent_id === p.id),
    }));

    res.json({ data: tree });
  } catch (err) {
    next(err);
  }
});

export default router;

// ── Stand-alone category / collection / tag / search routers ─────────────────
// These are separate routers mounted directly on /api in app.ts

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, slug, parent_id, description, banner_img,
              meta_title, meta_desc, nav_order, is_active
       FROM categories WHERE is_active = true ORDER BY nav_order`
    );
    const parents = rows.filter((r) => !r.parent_id);
    const children = rows.filter((r) => r.parent_id);
    const tree = parents.map((p) => ({
      ...p,
      children: children.filter((c) => c.parent_id === p.id),
    }));
    res.json({ data: tree });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { rows: [cat] } = await pool.query(
      `SELECT id, name, slug, parent_id, description, banner_img,
              meta_title, meta_desc, nav_order, is_active
       FROM categories WHERE slug = $1 AND is_active = true`,
      [slug]
    );
    if (!cat) {
      res.status(404).json({ error: { message: 'Category not found', code: 'NOT_FOUND' } });
      return;
    }
    const { rows: children } = await pool.query(
      `SELECT id, name, slug, nav_order FROM categories WHERE parent_id = $1 AND is_active = true ORDER BY nav_order`,
      [cat.id]
    );
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) as count FROM product_categories WHERE category_id = $1`,
      [cat.id]
    );
    res.json({ data: { ...cat, children, product_count: parseInt(count, 10) } });
  } catch (err) {
    next(err);
  }
});

export const collectionsRouter = Router();

collectionsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, slug, description, banner_img, tagline, is_homepage, homepage_order
       FROM collections WHERE is_active = true ORDER BY homepage_order, name`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

collectionsRouter.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { rows: [col] } = await pool.query(
      `SELECT id, name, slug, description, banner_img, tagline, is_homepage, homepage_order
       FROM collections WHERE slug = $1 AND is_active = true`,
      [slug]
    );
    if (!col) {
      res.status(404).json({ error: { message: 'Collection not found', code: 'NOT_FOUND' } });
      return;
    }

    const { rows: products } = await pool.query(
      `SELECT
         p.id, p.name, p.slug, p.sku, p.short_desc,
         p.mrp, p.sale_price, p.gst_rate,
         p.stock_qty, p.low_stock_threshold, p.oos_behavior, p.status,
         cp.display_order,
         (SELECT row_to_json(pi)
          FROM (SELECT id, gcs_path, alt_text
                FROM product_images
                WHERE product_id = p.id AND is_primary = true LIMIT 1) pi
         ) AS primary_image
       FROM products p
       JOIN collection_products cp ON cp.product_id = p.id
       WHERE cp.collection_id = $1 AND p.status = 'active'
       ORDER BY cp.display_order`,
      [col.id]
    );

    res.json({ data: { ...col, products } });
  } catch (err) {
    next(err);
  }
});

export const tagsRouter = Router();

tagsRouter.get('/', async (_req, res, next) => {
  try {
    // Fetch groups (ordered) and tags in parallel
    const [groupsResult, tagsResult] = await Promise.all([
      pool.query<{ name: string; label: string; display_order: number; is_filter: boolean; is_nav: boolean }>(
        `SELECT name, label, display_order, is_filter, is_nav
         FROM tag_groups ORDER BY display_order`
      ),
      pool.query<{ id: string; group_name: string; value: string; hex_color: string | null }>(
        `SELECT id, group_name, value, hex_color FROM tags ORDER BY group_name, value`
      ),
    ]);

    // Build enriched shape: { [groupName]: { label, is_filter, is_nav, tags: [] } }
    const grouped: Record<string, { label: string; is_filter: boolean; is_nav: boolean; tags: typeof tagsResult.rows }> = {};

    for (const g of groupsResult.rows) {
      grouped[g.name] = { label: g.label, is_filter: g.is_filter, is_nav: g.is_nav, tags: [] };
    }
    for (const tag of tagsResult.rows) {
      if (!grouped[tag.group_name]) {
        grouped[tag.group_name] = { label: tag.group_name, is_filter: true, is_nav: false, tags: [] };
      }
      grouped[tag.group_name].tags.push(tag);
    }

    res.json({ data: grouped });
  } catch (err) {
    next(err);
  }
});

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      res.json({ data: [] });
      return;
    }

    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.slug, p.mrp, p.sale_price, p.stock_qty,
         (SELECT row_to_json(pi)
          FROM (SELECT id, gcs_path, alt_text
                FROM product_images
                WHERE product_id = p.id AND is_primary = true LIMIT 1) pi
         ) AS primary_image,
         ts_rank(
           to_tsvector('english', p.name || ' ' || COALESCE(p.short_desc, '')),
           plainto_tsquery('english', $1)
         ) AS rank
       FROM products p
       WHERE p.status = 'active'
         AND to_tsvector('english',
               p.name || ' ' || COALESCE(p.short_desc, '') || ' ' || COALESCE(p.description, '')
             ) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT 10`,
      [q]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});
