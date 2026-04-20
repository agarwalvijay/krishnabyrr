import { Router } from 'express';
import pool from '../db/client';
import { requireCustomerAuth } from '../middleware/auth';

const router = Router();

// ────────────────────────────────────────────────────────────────
// WISHLIST
// ────────────────────────────────────────────────────────────────

// GET /api/account/wishlist
router.get('/wishlist', requireCustomerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         wi.product_id,
         p.id, p.name, p.slug, p.sku, p.mrp::float, p.sale_price::float,
         p.stock_qty, p.status, p.gst_rate::float,
         (SELECT row_to_json(pi)
          FROM (SELECT id, gcs_path, alt_text FROM product_images
                WHERE product_id = p.id AND is_primary = true LIMIT 1) pi
         ) AS primary_image,
         (SELECT row_to_json(si)
          FROM (SELECT id, gcs_path, alt_text FROM product_images
                WHERE product_id = p.id AND is_primary = false
                ORDER BY display_order LIMIT 1) si
         ) AS second_image,
         COALESCE(
           (SELECT json_agg(json_build_object('id', t.id, 'group_name', t.group_name, 'value', t.value, 'hex_color', t.hex_color))
            FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
            WHERE pt.product_id = p.id), '[]'::json
         ) AS tags
       FROM wishlist_items wi
       JOIN products p ON p.id = wi.product_id
       WHERE wi.customer_id = $1
       ORDER BY wi.created_at DESC`,
      [req.customer!.id],
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/account/wishlist
router.post('/wishlist', requireCustomerAuth, async (req, res, next) => {
  try {
    const { product_id } = req.body as { product_id?: string };

    if (!product_id) {
      res.status(400).json({ error: { message: 'product_id is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    // Verify product exists
    const { rows: [product] } = await pool.query<{ id: string }>(
      'SELECT id FROM products WHERE id = $1',
      [product_id],
    );
    if (!product) {
      res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
      return;
    }

    await pool.query(
      `INSERT INTO wishlist_items (customer_id, product_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.customer!.id, product_id],
    );

    res.status(201).json({ data: { product_id } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/account/wishlist/:productId
router.delete('/wishlist/:productId', requireCustomerAuth, async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM wishlist_items WHERE customer_id = $1 AND product_id = $2',
      [req.customer!.id, req.params.productId],
    );
    res.json({ data: { removed: true } });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// ADDRESSES
// ────────────────────────────────────────────────────────────────

const MAX_ADDRESSES = 5;

// GET /api/account/addresses
router.get('/addresses', requireCustomerAuth, async (req, res, next) => {
  try {
    const { rows: [customer] } = await pool.query<{ default_address_id: string | null }>(
      'SELECT default_address_id FROM customers WHERE id = $1',
      [req.customer!.id],
    );

    const { rows } = await pool.query(
      `SELECT id, name, phone, line1, line2, city, state, pincode, country, is_default
       FROM addresses WHERE customer_id = $1 ORDER BY is_default DESC, id`,
      [req.customer!.id],
    );

    res.json({ data: rows, meta: { default_address_id: customer?.default_address_id ?? null } });
  } catch (err) {
    next(err);
  }
});

// POST /api/account/addresses
router.post('/addresses', requireCustomerAuth, async (req, res, next) => {
  try {
    const { name, phone, line1, line2, city, state, pincode, country = 'India' } = req.body as {
      name: string; phone: string; line1: string; line2?: string;
      city: string; state: string; pincode: string; country?: string;
    };

    // Validation
    for (const [field, val] of [['name', name], ['phone', phone], ['line1', line1], ['city', city], ['state', state], ['pincode', pincode]] as [string, string][]) {
      if (!val?.trim()) {
        res.status(400).json({ error: { message: `${field} is required`, code: 'VALIDATION_ERROR' } });
        return;
      }
    }
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: { message: 'pincode must be 6 digits', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
      res.status(400).json({ error: { message: 'phone must be 10 digits', code: 'VALIDATION_ERROR' } });
      return;
    }

    // Enforce max addresses
    const { rows: [countRow] } = await pool.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM addresses WHERE customer_id = $1',
      [req.customer!.id],
    );
    if (countRow.n >= MAX_ADDRESSES) {
      res.status(422).json({ error: { message: `Maximum ${MAX_ADDRESSES} addresses allowed`, code: 'ADDRESS_LIMIT_REACHED' } });
      return;
    }

    const { rows: [addr] } = await pool.query(
      `INSERT INTO addresses (customer_id, name, phone, line1, line2, city, state, pincode, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, phone, line1, line2, city, state, pincode, country, is_default`,
      [req.customer!.id, name.trim(), phone.replace(/\D/g, ''), line1.trim(), line2?.trim() ?? null, city.trim(), state.trim(), pincode.trim(), country.trim()],
    );

    res.status(201).json({ data: addr });
  } catch (err) {
    next(err);
  }
});

// PUT /api/account/addresses/:id
router.put('/addresses/:id', requireCustomerAuth, async (req, res, next) => {
  try {
    const { name, phone, line1, line2, city, state, pincode, country = 'India' } = req.body as {
      name: string; phone: string; line1: string; line2?: string;
      city: string; state: string; pincode: string; country?: string;
    };

    // Verify ownership
    const { rows: [existing] } = await pool.query<{ id: string }>(
      'SELECT id FROM addresses WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.customer!.id],
    );
    if (!existing) {
      res.status(404).json({ error: { message: 'Address not found', code: 'NOT_FOUND' } });
      return;
    }

    const { rows: [addr] } = await pool.query(
      `UPDATE addresses SET name=$1, phone=$2, line1=$3, line2=$4, city=$5, state=$6, pincode=$7, country=$8
       WHERE id=$9
       RETURNING id, name, phone, line1, line2, city, state, pincode, country, is_default`,
      [name?.trim(), phone?.replace(/\D/g, ''), line1?.trim(), line2?.trim() ?? null, city?.trim(), state?.trim(), pincode?.trim(), country?.trim(), req.params.id],
    );

    res.json({ data: addr });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/account/addresses/:id
router.delete('/addresses/:id', requireCustomerAuth, async (req, res, next) => {
  try {
    const { rows: [existing] } = await pool.query<{ id: string }>(
      'SELECT id FROM addresses WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.customer!.id],
    );
    if (!existing) {
      res.status(404).json({ error: { message: 'Address not found', code: 'NOT_FOUND' } });
      return;
    }

    await pool.query('DELETE FROM addresses WHERE id = $1', [req.params.id]);
    res.json({ data: { removed: true } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/account/addresses/:id/default
router.put('/addresses/:id/default', requireCustomerAuth, async (req, res, next) => {
  try {
    const { rows: [existing] } = await pool.query<{ id: string }>(
      'SELECT id FROM addresses WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.customer!.id],
    );
    if (!existing) {
      res.status(404).json({ error: { message: 'Address not found', code: 'NOT_FOUND' } });
      return;
    }

    // Clear existing default, set new one
    await pool.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [req.customer!.id]);
    await pool.query('UPDATE addresses SET is_default = true WHERE id = $1', [req.params.id]);
    await pool.query(
      'UPDATE customers SET default_address_id = $1, updated_at = NOW() WHERE id = $2',
      [req.params.id, req.customer!.id],
    );

    res.json({ data: { default_address_id: req.params.id } });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// PROFILE
// ────────────────────────────────────────────────────────────────

// PUT /api/account/profile
router.put('/profile', requireCustomerAuth, async (req, res, next) => {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string };

    if (!name?.trim()) {
      res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const cleanPhone = phone?.replace(/\D/g, '') ?? null;
    if (cleanPhone && !/^[6-9]\d{9}$/.test(cleanPhone)) {
      res.status(400).json({ error: { message: 'Enter a valid 10-digit Indian mobile number', code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [customer] } = await pool.query<{ id: string; email: string; name: string; phone: string | null }>(
      `UPDATE customers SET name = $1, phone = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, name, phone`,
      [name.trim(), cleanPhone, req.customer!.id],
    );

    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/account/device-token ───────────────────────────────────────────
// Register (or refresh) an FCM device token for push notifications.
// Called by the mobile app after login.
router.post('/device-token', requireCustomerAuth, async (req, res, next) => {
  try {
    const { fcm_token, platform } = req.body as { fcm_token?: string; platform?: string };

    if (!fcm_token || typeof fcm_token !== 'string') {
      res.status(422).json({ error: { message: 'fcm_token is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const validPlatforms = ['android', 'ios'];
    const plat = validPlatforms.includes(platform ?? '') ? platform : 'android';

    // Upsert — update updated_at if token already exists for this customer
    await pool.query(
      `INSERT INTO device_tokens (customer_id, fcm_token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, fcm_token)
       DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()`,
      [req.customer!.id, fcm_token, plat],
    );

    res.json({ data: { registered: true } });
  } catch (err) { next(err); }
});

// ── DELETE /api/account/device-token ─────────────────────────────────────────
// Unregister a device token on logout.
router.delete('/device-token', requireCustomerAuth, async (req, res, next) => {
  try {
    const { fcm_token } = req.body as { fcm_token?: string };

    if (!fcm_token) {
      res.status(422).json({ error: { message: 'fcm_token is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    await pool.query(
      `DELETE FROM device_tokens WHERE customer_id = $1 AND fcm_token = $2`,
      [req.customer!.id, fcm_token],
    );

    res.json({ data: { unregistered: true } });
  } catch (err) { next(err); }
});

export default router;
