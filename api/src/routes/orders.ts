import { Router, Request, Response, NextFunction } from 'express';
import { parse as parseCookie } from 'cookie';
import pool from '../db/client';
import { getRedisClient } from '../redis';
import { getCart, clearCart, clearAllReserves } from '../services/cart';
import { validateCoupon } from '../services/coupon-engine';
import { optionalCustomerAuth, requireCustomerAuth } from '../middleware/auth';

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShippingAddress {
  name:     string;
  phone:    string;
  line1:    string;
  line2?:   string;
  city:     string;
  state:    string;
  pincode:  string;
  country?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DELHI_NCR_PREFIXES = [
  '110','111','112','122','123','124',
  '201','202','203','204','205','206','207','208',
];

function pincodeZone(pincode: string): 'A' | 'B' {
  return DELHI_NCR_PREFIXES.includes(pincode.slice(0, 3)) ? 'A' : 'B';
}

function validateAddress(addr: Partial<ShippingAddress>): string | null {
  for (const field of ['name', 'phone', 'line1', 'city', 'state', 'pincode'] as const) {
    if (!addr[field]?.trim()) return `shippingAddress.${field} is required`;
  }
  if (!/^\d{6}$/.test(addr.pincode!.trim())) return 'shippingAddress.pincode must be 6 digits';
  if (!/^\d{10}$/.test(addr.phone!.replace(/\D/g, ''))) return 'shippingAddress.phone must be 10 digits';
  return null;
}

function buildWhatsAppLink(
  whatsappNumber: string,
  orderNumber: string,
  total: number,
): string | null {
  const num = whatsappNumber.replace(/\D/g, '');
  if (!num) return null;
  const text = encodeURIComponent(
    `Hi KrishnaByrr! I placed order ${orderNumber} for ₹${total.toLocaleString('en-IN')}. Please confirm and share the payment link.`,
  );
  return `https://wa.me/${num}?text=${text}`;
}

// ── POST /api/orders ──────────────────────────────────────────────────────────

router.post('/', optionalCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      shippingAddress,
      billingGstin,
      couponCode,
      guestEmail,
      guestPhone,
    } = req.body as {
      shippingAddress?: Partial<ShippingAddress>;
      billingGstin?:    string;
      couponCode?:      string;
      guestEmail?:      string;
      guestPhone?:      string;
    };

    // ── Validate address ───────────────────────────────────────────────────────
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      res.status(400).json({ error: { message: 'shippingAddress is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    const addrError = validateAddress(shippingAddress);
    if (addrError) {
      res.status(400).json({ error: { message: addrError, code: 'VALIDATION_ERROR' } });
      return;
    }

    const customerId = req.customer?.id ?? null;

    // Guest orders require guestEmail
    if (!customerId && (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()))) {
      res.status(400).json({ error: { message: 'guestEmail is required for guest checkout', code: 'VALIDATION_ERROR' } });
      return;
    }

    // ── Load cart ──────────────────────────────────────────────────────────────
    const cookies   = parseCookie(req.headers.cookie ?? '');
    const sessionId = cookies['kb_session'];

    if (!sessionId) {
      res.status(400).json({ error: { message: 'Cart is empty', code: 'EMPTY_CART' } });
      return;
    }

    const cart = await getCart(sessionId);
    if (!cart || cart.items.length === 0) {
      res.status(400).json({ error: { message: 'Cart is empty', code: 'EMPTY_CART' } });
      return;
    }

    // ── Load settings ──────────────────────────────────────────────────────────
    const { rows: settingRows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key IN (
         'zone_a_rate','zone_a_free_above','zone_b_rate','zone_b_free_above',
         'exchange_window_days','exchange_active','whatsapp_number'
       )`,
    );
    const settings: Record<string, string> = {};
    for (const r of settingRows) settings[r.key] = String(r.value);

    const redis = await getRedisClient();

    // ── Validate coupon (before locking stock) ─────────────────────────────────
    const cartItems = cart.items.map(i => ({ productId: i.productId, quantity: i.quantity }));
    let couponResult: Awaited<ReturnType<typeof validateCoupon>> | null = null;

    if (couponCode?.trim()) {
      const subtotalForCoupon = cart.items.reduce(
        (s, i) => s + (i.salePrice ?? i.mrp) * i.quantity, 0,
      );
      couponResult = await validateCoupon({
        code:         couponCode.trim().toUpperCase(),
        customerId,
        guestEmail:   guestEmail?.trim() ?? null,
        cartSubtotal: subtotalForCoupon,
        cartItems,
        db:           pool,
        redis:        redis as any,
      });

      if (!couponResult.valid) {
        res.status(422).json({ error: { message: couponResult.message, code: couponResult.rule } });
        return;
      }
    }

    // ── Lock stock and build line_items ────────────────────────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const productIds = cart.items.map(i => i.productId);
      const { rows: stockRows } = await client.query<{
        id: string; name: string; slug: string; sku: string;
        mrp: string; sale_price: string | null; stock_qty: number;
        gst_rate: string; hsn_code: string | null;
      }>(
        `SELECT id, name, slug, sku, mrp::text, sale_price::text, stock_qty, gst_rate::text, hsn_code
         FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [productIds],
      );

      const stockMap = new Map(stockRows.map(r => [r.id, r]));

      // Check all items have sufficient stock
      for (const item of cart.items) {
        const product = stockMap.get(item.productId);
        if (!product) {
          await client.query('ROLLBACK');
          res.status(422).json({
            error: { message: `Product "${item.name}" is no longer available`, code: 'PRODUCT_UNAVAILABLE' },
          });
          return;
        }
        if (product.stock_qty < item.quantity) {
          await client.query('ROLLBACK');
          res.status(422).json({
            error: {
              message: `Only ${product.stock_qty} unit(s) of "${item.name}" available`,
              code: 'INSUFFICIENT_STOCK',
            },
          });
          return;
        }
      }

      // Build line_items snapshot
      const lineItems = cart.items.map(item => {
        const p = stockMap.get(item.productId)!;
        const unitPrice = p.sale_price ? parseFloat(p.sale_price) : parseFloat(p.mrp);
        return {
          product_id:  p.id,
          name:        p.name,
          slug:        p.slug,
          sku:         p.sku,
          mrp:         parseFloat(p.mrp),
          sale_price:  p.sale_price ? parseFloat(p.sale_price) : null,
          unit_price:  unitPrice,
          quantity:    item.quantity,
          line_total:  unitPrice * item.quantity,
          gst_rate:    parseFloat(p.gst_rate),
          hsn_code:    p.hsn_code,
        };
      });

      // ── Calculate totals ───────────────────────────────────────────────────────
      const subtotal = lineItems.reduce((s, i) => s + i.line_total, 0);

      const discountAmount = (couponResult?.valid && couponResult.type !== 'free_shipping')
        ? couponResult.discount_amount
        : 0;
      const freeShipping = couponResult?.valid && couponResult.type === 'free_shipping';

      const zone = pincodeZone(shippingAddress.pincode!.trim());
      let shipping = 0;
      if (!freeShipping) {
        if (zone === 'A') {
          const rate      = parseFloat(settings.zone_a_rate      ?? '80');
          const freeAbove = parseFloat(settings.zone_a_free_above ?? '999');
          shipping = subtotal - discountAmount >= freeAbove ? 0 : rate;
        } else {
          const rate      = parseFloat(settings.zone_b_rate      ?? '120');
          const freeAbove = parseFloat(settings.zone_b_free_above ?? '1499');
          shipping = subtotal - discountAmount >= freeAbove ? 0 : rate;
        }
      }

      const gst   = Math.round((subtotal - discountAmount) * 0.05);
      const total = subtotal - discountAmount + shipping + gst;

      // ── Order number ───────────────────────────────────────────────────────────
      const { rows: [seqRow] } = await client.query<{ nextval: string }>(
        `SELECT NEXTVAL('order_number_seq')`,
      );
      const orderNumber = `KB-${String(seqRow.nextval).padStart(6, '0')}`;

      // ── Policy snapshot ────────────────────────────────────────────────────────
      const exchangeWindowDays = parseInt(settings.exchange_window_days ?? '7', 10);
      const exchangeActive     = settings.exchange_active === 'true';
      const policySnapshot = { exchange_window_days: exchangeWindowDays, exchange_active: exchangeActive };

      const exchangeEligibleUntil = exchangeActive
        ? new Date(Date.now() + exchangeWindowDays * 24 * 60 * 60 * 1000)
        : null;

      // ── Normalise address ──────────────────────────────────────────────────────
      const normalizedAddress: ShippingAddress = {
        name:    shippingAddress.name!.trim(),
        phone:   shippingAddress.phone!.replace(/\D/g, ''),
        line1:   shippingAddress.line1!.trim(),
        line2:   shippingAddress.line2?.trim(),
        city:    shippingAddress.city!.trim(),
        state:   shippingAddress.state!.trim(),
        pincode: shippingAddress.pincode!.trim(),
        country: shippingAddress.country?.trim() ?? 'India',
      };

      // ── Insert order ───────────────────────────────────────────────────────────
      const { rows: [order] } = await client.query<{ id: string; order_number: string; created_at: Date }>(
        `INSERT INTO orders (
           order_number, customer_id, guest_email, guest_phone,
           line_items, subtotal, discount_amount, coupon_code,
           shipping_amount, gst_amount, total,
           shipping_address, billing_gstin,
           payment_status, fulfillment_status,
           exchange_eligible_until, policy_snapshot
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11,
           $12, $13,
           'pending_confirmation', 'unfulfilled',
           $14, $15
         )
         RETURNING id, order_number, created_at`,
        [
          orderNumber, customerId, guestEmail?.trim() ?? null, guestPhone?.replace(/\D/g, '') ?? null,
          JSON.stringify(lineItems), subtotal, discountAmount, couponResult?.valid ? couponResult.code : null,
          shipping, gst, total,
          JSON.stringify(normalizedAddress), billingGstin?.trim() ?? null,
          exchangeEligibleUntil, JSON.stringify(policySnapshot),
        ],
      );

      // ── Decrement stock + inventory log ────────────────────────────────────────
      for (const item of cart.items) {
        const product = stockMap.get(item.productId)!;
        const qtyBefore = product.stock_qty;
        const qtyAfter  = qtyBefore - item.quantity;

        await client.query(
          `UPDATE products SET stock_qty = $1, updated_at = NOW() WHERE id = $2`,
          [qtyAfter, product.id],
        );
        await client.query(
          `INSERT INTO inventory_log (product_id, change_type, qty_before, qty_change, qty_after, reason, order_id)
           VALUES ($1, 'order_placed', $2, $3, $4, $5, $6)`,
          [product.id, qtyBefore, -item.quantity, qtyAfter, `Order ${orderNumber}`, order.id],
        );
      }

      // ── Update coupon use count + redemption record ────────────────────────────
      if (couponResult?.valid) {
        await client.query(
          `UPDATE coupons SET current_use_count = current_use_count + 1, updated_at = NOW()
           WHERE LOWER(code) = LOWER($1)`,
          [couponResult.code],
        );
        await client.query(
          `INSERT INTO coupon_redemptions (coupon_id, customer_id, guest_email, order_id, discount_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [couponResult.couponId, customerId, guestEmail?.trim() ?? null, order.id, discountAmount],
        );
      }

      // ── Update customer lifetime stats ─────────────────────────────────────────
      if (customerId) {
        await client.query(
          `UPDATE customers
           SET total_orders   = total_orders + 1,
               lifetime_value = lifetime_value + $1,
               updated_at     = NOW()
           WHERE id = $2`,
          [total, customerId],
        );
      }

      await client.query('COMMIT');

      // ── Clear cart (best-effort — outside transaction) ─────────────────────────
      await clearAllReserves(sessionId, cart.items).catch(() => {});
      await clearCart(sessionId).catch(() => {});

      // ── Build response ─────────────────────────────────────────────────────────
      const whatsappLink = buildWhatsAppLink(
        settings.whatsapp_number ?? '',
        orderNumber,
        total,
      );

      res.status(201).json({
        data: {
          order: {
            id:               order.id,
            order_number:     order.order_number,
            line_items:       lineItems,
            subtotal,
            discount_amount:  discountAmount,
            coupon_code:      couponResult?.valid ? couponResult.code : null,
            shipping_amount:  shipping,
            gst_amount:       gst,
            total,
            shipping_address: normalizedAddress,
            payment_status:   'pending_confirmation',
            fulfillment_status: 'unfulfilled',
            exchange_eligible_until: exchangeEligibleUntil,
            created_at:       order.created_at,
          },
          payment: {
            method:         'pay_on_confirmation',
            whatsapp_link:  whatsappLink,
            instructions:   'Please contact us on WhatsApp to confirm your order and receive the UPI payment link.',
          },
        },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders/:orderNumber ──────────────────────────────────────────────
// Accessible by the owning customer or by the guest via their email (query param)

router.get('/:orderNumber', optionalCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNumber } = req.params;
    const { email } = req.query as { email?: string };

    const { rows: [order] } = await pool.query(
      `SELECT
         id, order_number, customer_id, guest_email, line_items,
         subtotal, discount_amount, coupon_code, shipping_amount, gst_amount, total,
         shipping_address, billing_gstin,
         payment_status, fulfillment_status,
         courier_name, tracking_number, tracking_url, fulfilled_at,
         exchange_eligible_until, policy_snapshot,
         created_at, updated_at
       FROM orders WHERE order_number = $1`,
      [orderNumber.toUpperCase()],
    );

    if (!order) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }

    // Access control: order must belong to authenticated customer OR guest email must match
    const isOwner = req.customer && order.customer_id === req.customer.id;
    const isGuest = email && order.guest_email && order.guest_email.toLowerCase() === email.toLowerCase().trim();

    if (!isOwner && !isGuest) {
      res.status(403).json({ error: { message: 'Access denied', code: 'FORBIDDEN' } });
      return;
    }

    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders (customer's order history) ────────────────────────────────

router.get('/', requireCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id, order_number, subtotal, discount_amount, shipping_amount, gst_amount, total,
         payment_status, fulfillment_status, created_at
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [req.customer!.id],
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
