import { Router, Request, Response, NextFunction } from 'express';
import { serialize, parse as parseCookie } from 'cookie';
import pool from '../db/client';
import { getRedisClient } from '../redis';
import {
  generateSessionId,
  emptyCart,
  getCart,
  setCart,
  clearCart,
  setReserve,
  clearReserve,
  clearAllReserves,
  type CartData,
  type CartItem,
} from '../services/cart';
import { validateCoupon } from '../services/coupon-engine';

const router = Router();

// ── Cookie helpers ─────────────────────────────────────────────────────────────

const COOKIE_NAME  = 'kb_session';
const COOKIE_OPTS  = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path:     '/',
  maxAge:   30 * 24 * 60 * 60, // 30 days in seconds
  secure:   process.env.NODE_ENV === 'production',
};

function getSessionId(req: Request, res: Response): string {
  const cookies = parseCookie(req.headers.cookie ?? '');
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];

  const newId = generateSessionId();
  res.setHeader('Set-Cookie', serialize(COOKIE_NAME, newId, COOKIE_OPTS));
  return newId;
}

// ── Cart totals ────────────────────────────────────────────────────────────────

function calcTotals(cart: CartData, settings: Record<string, string>) {
  const subtotal = cart.items.reduce(
    (sum, item) => sum + (item.salePrice ?? item.mrp) * item.quantity,
    0,
  );

  const discountAmount = cart.couponData
    ? cart.couponData.type === 'free_shipping'
      ? 0
      : cart.couponData.discount_amount
    : 0;

  const freeShipping = cart.couponData?.type === 'free_shipping';

  let shipping = 0;
  if (!freeShipping) {
    if (cart.zone === 'A') {
      const rate      = parseFloat(settings.zone_a_rate     ?? '80');
      const freeAbove = parseFloat(settings.zone_a_free_above ?? '999');
      shipping = subtotal - discountAmount >= freeAbove ? 0 : rate;
    } else if (cart.zone === 'B') {
      const rate      = parseFloat(settings.zone_b_rate     ?? '120');
      const freeAbove = parseFloat(settings.zone_b_free_above ?? '1499');
      shipping = subtotal - discountAmount >= freeAbove ? 0 : rate;
    }
  }

  const gst   = Math.round((subtotal - discountAmount) * 0.05);
  const total = subtotal - discountAmount + shipping + gst;

  return { subtotal, discountAmount, shipping, gst, total };
}

// ── GET /api/cart ──────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = getSessionId(req, res);
    let   cart      = await getCart(sessionId);

    if (!cart) {
      cart = emptyCart(sessionId);
      await setCart(sessionId, cart);
    }

    // Refresh maxQty for each item from live DB stock
    if (cart.items.length > 0) {
      const ids = cart.items.map(i => i.productId);
      const rows = await pool.query<{ id: string; stock_qty: number }>(
        `SELECT id, stock_qty FROM products WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      const stockMap = new Map(rows.rows.map(r => [r.id, r.stock_qty]));
      for (const item of cart.items) {
        item.maxQty = stockMap.get(item.productId) ?? 0;
      }
      await setCart(sessionId, cart);
    }

    // Load settings for totals
    const settingsRows = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN (
         'zone_a_rate','zone_a_free_above','zone_b_rate','zone_b_free_above'
       )`,
    );
    const settings: Record<string, string> = {};
    for (const r of settingsRows.rows) settings[r.key] = r.value;

    const totals = calcTotals(cart, settings);

    res.json({ data: { cart, totals } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cart/items ───────────────────────────────────────────────────────

router.post('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, quantity = 1 } = req.body as { productId: string; quantity?: number };

    if (!productId) {
      return res.status(400).json({ error: { message: 'productId is required', code: 'VALIDATION_ERROR' } });
    }

    const qty = Math.max(1, Math.floor(Number(quantity)));

    // Fetch product from DB
    const result = await pool.query<{
      id: string; name: string; slug: string; sku: string;
      mrp: string; sale_price: string | null; stock_qty: number;
      gcs_path: string | null;
    }>(
      `SELECT p.id, p.name, p.slug, p.sku, p.mrp, p.sale_price, p.stock_qty,
              pi.gcs_path
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
       WHERE p.id = $1 AND p.status = 'active'`,
      [productId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: { message: 'Product not found', code: 'NOT_FOUND' } });
    }

    const p = result.rows[0];

    if (p.stock_qty <= 0) {
      return res.status(409).json({ error: { message: 'Product is out of stock', code: 'OUT_OF_STOCK' } });
    }

    const allowedQty = Math.min(qty, p.stock_qty);

    const sessionId = getSessionId(req, res);
    let   cart      = await getCart(sessionId) ?? emptyCart(sessionId);

    // Check if item already exists in cart
    const existing = cart.items.find(i => i.productId === productId);

    if (existing) {
      const newQty = Math.min(existing.quantity + allowedQty, p.stock_qty);
      existing.quantity = newQty;
      existing.maxQty   = p.stock_qty;
      await setReserve(productId, sessionId, newQty);
    } else {
      const item: CartItem = {
        id:           generateSessionId(),
        productId:    p.id,
        name:         p.name,
        slug:         p.slug,
        sku:          p.sku,
        mrp:          parseFloat(p.mrp),
        salePrice:    p.sale_price ? parseFloat(p.sale_price) : null,
        primaryImage: p.gcs_path,
        stockQty:     p.stock_qty,
        quantity:     allowedQty,
        maxQty:       p.stock_qty,
      };
      cart.items.push(item);
      await setReserve(productId, sessionId, allowedQty);
    }

    await setCart(sessionId, cart);
    res.status(201).json({ data: { cart } });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/cart/items/:itemId ────────────────────────────────────────────────

router.put('/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemId }  = req.params;
    const { quantity } = req.body as { quantity: number };

    if (quantity == null || isNaN(Number(quantity))) {
      return res.status(400).json({ error: { message: 'quantity is required', code: 'VALIDATION_ERROR' } });
    }

    const sessionId = getSessionId(req, res);
    const cart      = await getCart(sessionId);

    if (!cart) {
      return res.status(404).json({ error: { message: 'Cart not found', code: 'NOT_FOUND' } });
    }

    const item = cart.items.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({ error: { message: 'Item not found in cart', code: 'NOT_FOUND' } });
    }

    const newQty = Math.floor(Number(quantity));

    if (newQty <= 0) {
      // Remove item
      cart.items = cart.items.filter(i => i.id !== itemId);
      await clearReserve(item.productId, sessionId);
    } else {
      // Clamp to live stock
      const stockResult = await pool.query<{ stock_qty: number }>(
        `SELECT stock_qty FROM products WHERE id = $1`,
        [item.productId],
      );
      const liveStock = stockResult.rows[0]?.stock_qty ?? 0;
      item.quantity   = Math.min(newQty, liveStock);
      item.maxQty     = liveStock;
      await setReserve(item.productId, sessionId, item.quantity);
    }

    await setCart(sessionId, cart);
    res.json({ data: { cart } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/cart/items/:itemId ─────────────────────────────────────────────

router.delete('/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemId } = req.params;
    const sessionId  = getSessionId(req, res);
    const cart       = await getCart(sessionId);

    if (!cart) {
      return res.status(404).json({ error: { message: 'Cart not found', code: 'NOT_FOUND' } });
    }

    const item = cart.items.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({ error: { message: 'Item not found in cart', code: 'NOT_FOUND' } });
    }

    cart.items = cart.items.filter(i => i.id !== itemId);
    await clearReserve(item.productId, sessionId);
    await setCart(sessionId, cart);

    res.json({ data: { cart } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/cart ───────────────────────────────────────────────────────────

router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = getSessionId(req, res);
    const cart      = await getCart(sessionId);

    if (cart) {
      await clearAllReserves(sessionId, cart.items);
    }
    await clearCart(sessionId);

    res.json({ data: { cart: emptyCart(sessionId) } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cart/pincode ─────────────────────────────────────────────────────

router.post('/pincode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pincode } = req.body as { pincode: string };

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        error: { message: 'Please enter a valid 6-digit pincode', code: 'VALIDATION_ERROR' },
      });
    }

    const sessionId = getSessionId(req, res);
    let   cart      = await getCart(sessionId) ?? emptyCart(sessionId);

    // Determine zone (Delhi NCR prefixes)
    const DELHI_NCR_PREFIXES = [
      '110','111','112','122','123','124',
      '201','202','203','204','205','206','207','208',
    ];
    const prefix = pincode.slice(0, 3);
    const zone: 'A' | 'B' = DELHI_NCR_PREFIXES.includes(prefix) ? 'A' : 'B';

    cart.pincode = pincode;
    cart.zone    = zone;
    await setCart(sessionId, cart);

    res.json({ data: { pincode, zone } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cart/coupon ──────────────────────────────────────────────────────

router.post('/coupon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, guestEmail } = req.body as { code: string; guestEmail?: string };

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: { message: 'code is required', code: 'VALIDATION_ERROR' } });
    }

    const sessionId = getSessionId(req, res);
    const cart      = await getCart(sessionId) ?? emptyCart(sessionId);

    const redis = await getRedisClient();

    // Derive customerId from session if authenticated (for now: null — auth is Session 6)
    const customerId: string | null = cart.customerId ?? null;

    const cartItems = cart.items.map(i => ({
      productId: i.productId,
      quantity:  i.quantity,
    }));

    const subtotal = cart.items.reduce(
      (sum, item) => sum + (item.salePrice ?? item.mrp) * item.quantity,
      0,
    );

    const result = await validateCoupon({
      code:         code.trim().toUpperCase(),
      customerId,
      guestEmail:   guestEmail ?? null,
      cartSubtotal: subtotal,
      cartItems,
      db:           pool,
      redis:        redis as any,
    });

    if (!result.valid) {
      return res.status(422).json({ error: { message: result.message, code: result.rule } });
    }

    cart.couponCode = result.code;
    cart.couponData = {
      code:            result.code,
      type:            result.type,
      discount_amount: result.discount_amount,
      description:     result.description,
    };

    await setCart(sessionId, cart);
    res.json({ data: { coupon: cart.couponData } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/cart/coupon ────────────────────────────────────────────────────

router.delete('/coupon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = getSessionId(req, res);
    const cart      = await getCart(sessionId);

    if (!cart) {
      return res.status(404).json({ error: { message: 'Cart not found', code: 'NOT_FOUND' } });
    }

    cart.couponCode = null;
    cart.couponData = null;
    await setCart(sessionId, cart);

    res.json({ data: { cart } });
  } catch (err) {
    next(err);
  }
});

export default router;
