import { Router, Request, Response, NextFunction } from 'express';
import { parse as parseCookie } from 'cookie';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import pool from '../db/client';
import { getRedisClient } from '../redis';
import {
  getCart, clearCart, clearAllReserves,
  sessionOwnerKey, customerOwnerKey,
} from '../services/cart';
import { streamInvoicePdf } from '../services/invoice-pdf';
import { validateCoupon } from '../services/coupon-engine';
import { optionalCustomerAuth, requireCustomerAuth } from '../middleware/auth';
import { notifyNewOrder } from '../services/notifications';
import { pushToCustomer } from '../services/push';
import { sendOrderConfirmed } from '../services/whatsapp';

// Razorpay client — only initialised when env vars are present
function getRazorpay(): Razorpay | null {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// PhonePe payment initiation
async function initiatePhonePe(params: {
  orderNumber: string;
  total:       number;
  phone:       string;
}): Promise<{ merchantTransactionId: string; redirectUrl: string } | null> {
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey    = process.env.PHONEPE_SALT_KEY;
  const saltIndex  = process.env.PHONEPE_SALT_INDEX ?? '1';
  const mode       = process.env.PHONEPE_MODE        ?? 'UAT';
  const appUrl     = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const apiUrl     = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

  if (!merchantId || !saltKey) return null;

  const baseUrl = mode === 'PROD'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

  // Max 38 chars, alphanumeric + underscore only
  const merchantTransactionId = `${params.orderNumber.replace('-', '')}T${Date.now()}`.slice(0, 38);

  const payload = {
    merchantId,
    merchantTransactionId,
    amount:       Math.round(params.total * 100), // paise
    redirectUrl:  `${appUrl}/order/${params.orderNumber}/confirmation`,
    redirectMode: 'REDIRECT',
    callbackUrl:  `${apiUrl}/api/payments/phonepe/callback`,
    mobileNumber: params.phone,
    paymentInstrument: { type: 'PAY_PAGE' },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const endpoint      = '/pg/v1/pay';
  const checksum      = crypto
    .createHash('sha256')
    .update(base64Payload + endpoint + saltKey)
    .digest('hex');

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY':     `${checksum}###${saltIndex}`,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    if (!response.ok) {
      console.error('[phonepe] API error', response.status, await response.text());
      return null;
    }

    const data = await response.json() as {
      success: boolean;
      data?: { instrumentResponse?: { redirectInfo?: { url: string } } };
    };

    const redirectUrl = data.data?.instrumentResponse?.redirectInfo?.url;
    if (!data.success || !redirectUrl) {
      console.error('[phonepe] Initiation failed', JSON.stringify(data));
      return null;
    }

    return { merchantTransactionId, redirectUrl };
  } catch (err) {
    console.error('[phonepe] Network error:', err);
    return null;
  }
}

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
      saveAddress,
    } = req.body as {
      shippingAddress?: Partial<ShippingAddress>;
      billingGstin?:    string;
      couponCode?:      string;
      guestEmail?:      string;
      guestPhone?:      string;
      saveAddress?:     boolean;
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
    // Cart lives under one of two Redis keys depending on auth:
    //   customer:<uuid>  if the request carries a valid JWT
    //   session:<uuid>   if guest
    // Reserves stay session-keyed regardless (short-lived checkout guard).
    const cookies   = parseCookie(req.headers.cookie ?? '');
    const sessionId = cookies['kb_session'];

    if (!sessionId) {
      res.status(400).json({ error: { message: 'Cart is empty', code: 'EMPTY_CART' } });
      return;
    }

    const cartOwnerKey = customerId
      ? customerOwnerKey(customerId)
      : sessionOwnerKey(sessionId);

    const cart = await getCart(cartOwnerKey);
    if (!cart || cart.items.length === 0) {
      res.status(400).json({ error: { message: 'Cart is empty', code: 'EMPTY_CART' } });
      return;
    }

    // ── Load settings ──────────────────────────────────────────────────────────
    const { rows: settingRows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key IN (
         'zone_a_rate','zone_a_free_above','zone_b_rate','zone_b_free_above',
         'exchange_window_days','exchange_active','whatsapp_number','payment_gateway'
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

      // ── Build line_items snapshot ─────────────────────────────────────────────
      // Product prices are stored GST-INCLUSIVE — what the customer pays per
      // unit, all-in. We extract the GST portion at each item's own rate so the
      // invoice and accounting can break it out, but the customer-facing total
      // is unchanged (GST is NOT added on top).
      const round2 = (n: number) => Math.round(n * 100) / 100;

      const lineItems = cart.items.map(item => {
        const p          = stockMap.get(item.productId)!;
        const unitPrice  = p.sale_price ? parseFloat(p.sale_price) : parseFloat(p.mrp);  // inclusive
        const gstRate    = parseFloat(p.gst_rate);
        const lineTotal  = unitPrice * item.quantity;
        const taxable    = lineTotal / (1 + gstRate / 100);
        const gstAmount  = lineTotal - taxable;
        return {
          product_id:     p.id,
          name:           p.name,
          slug:           p.slug,
          sku:            p.sku,
          mrp:            parseFloat(p.mrp),
          sale_price:     p.sale_price ? parseFloat(p.sale_price) : null,
          unit_price:     unitPrice,            // GST-inclusive
          quantity:       item.quantity,
          line_total:     round2(lineTotal),    // GST-inclusive
          taxable_amount: round2(taxable),      // pre-GST portion
          gst_amount:     round2(gstAmount),    // GST portion (extracted)
          gst_rate:       gstRate,
          hsn_code:       p.hsn_code,
        };
      });

      // ── Calculate totals ───────────────────────────────────────────────────────
      // subtotal is GST-INCLUSIVE; gstIncluded is for reporting only.
      const subtotal       = lineItems.reduce((s, i) => s + i.line_total,     0);
      const taxableTotal   = lineItems.reduce((s, i) => s + i.taxable_amount, 0);
      const gstIncluded    = lineItems.reduce((s, i) => s + i.gst_amount,     0);

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

      // GST is already inside subtotal. Discount applies to inclusive amounts.
      // For accounting, split the discount proportionally between taxable & GST.
      const discountGstPortion     = subtotal > 0 ? discountAmount * (gstIncluded   / subtotal) : 0;
      const discountTaxablePortion = discountAmount - discountGstPortion;
      const finalTaxable           = round2(taxableTotal - discountTaxablePortion);
      const finalGst               = round2(gstIncluded  - discountGstPortion);

      // `gst` stored on the order is the GST portion AFTER discount, extracted
      // from the inclusive subtotal. Not added to total.
      const gst   = finalGst;
      const total = round2(subtotal - discountAmount + shipping);
      // `finalTaxable` is unused at order-write time but available for PDF/GSTR computation
      void finalTaxable;

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

      // ── Initiate payment via selected gateway ─────────────────────────────────
      const gateway = settings.payment_gateway ?? 'razorpay';

      let rzpOrder: { id: string } | null = null;
      if (gateway === 'razorpay') {
        const rzp = getRazorpay();
        if (rzp) {
          rzpOrder = await (rzp.orders.create as unknown as (opts: Record<string, unknown>) => Promise<{ id: string }>)({
            amount:          Math.round(total * 100), // paise
            currency:        'INR',
            receipt:         orderNumber,
            notes:           { order_number: orderNumber },
            payment_capture: 0, // manual capture — funds held, not charged until admin captures
          });
        }
      }

      let ppResult: { merchantTransactionId: string; redirectUrl: string } | null = null;
      if (gateway === 'phonepe') {
        ppResult = await initiatePhonePe({
          orderNumber,
          total,
          phone: normalizedAddress.phone,
        });
      }

      // ── Determine payment status / method ─────────────────────────────────────
      const paymentStatus = (rzpOrder || ppResult) ? 'pending' : 'pending_confirmation';
      const paymentMethod = rzpOrder  ? 'razorpay'
                          : ppResult  ? 'phonepe'
                          : 'manual';

      // ── Insert order ───────────────────────────────────────────────────────────
      const { rows: [order] } = await client.query<{ id: string; order_number: string; created_at: Date }>(
        `INSERT INTO orders (
           order_number, customer_id, guest_email, guest_phone,
           line_items, subtotal, discount_amount, coupon_code,
           shipping_amount, gst_amount, total,
           shipping_address, billing_gstin,
           payment_status, payment_method, fulfillment_status,
           exchange_eligible_until, policy_snapshot,
           razorpay_order_id, phonepe_transaction_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11,
           $12, $13,
           $16, $17, 'unfulfilled',
           $14, $15,
           $18, $19
         )
         RETURNING id, order_number, created_at`,
        [
          orderNumber, customerId, guestEmail?.trim() ?? null, guestPhone?.replace(/\D/g, '') ?? null,
          JSON.stringify(lineItems), subtotal, discountAmount, couponResult?.valid ? couponResult.code : null,
          shipping, gst, total,
          JSON.stringify(normalizedAddress), billingGstin?.trim() ?? null,
          exchangeEligibleUntil, JSON.stringify(policySnapshot),
          paymentStatus,
          paymentMethod,
          rzpOrder?.id ?? null,
          ppResult?.merchantTransactionId ?? null,
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

      // ── Optionally save shipping address to customer's address book ────────────
      // Logged with outcome so we can diagnose "address didn't save" reports
      // from pm2 logs without speculation.
      if (saveAddress) {
        if (!customerId) {
          console.warn(`[order ${orderNumber}] saveAddress=true but no customer_id (guest checkout) — skipping`);
        } else {
          const { rows: [{ cnt }] } = await client.query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM addresses WHERE customer_id = $1`,
            [customerId],
          );
          const count = parseInt(cnt, 10);
          if (count >= 5) {
            console.warn(`[order ${orderNumber}] saveAddress=true but customer ${customerId} already has ${count} addresses — skipping`);
          } else {
            await client.query(
              `INSERT INTO addresses (customer_id, name, phone, line1, line2, city, state, pincode, country, is_default)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
              [
                customerId,
                normalizedAddress.name,
                normalizedAddress.phone,
                normalizedAddress.line1,
                normalizedAddress.line2 ?? null,
                normalizedAddress.city,
                normalizedAddress.state,
                normalizedAddress.pincode,
                normalizedAddress.country ?? 'India',
              ],
            );
            console.log(`[order ${orderNumber}] saved address to customer ${customerId} (now ${count + 1}/5)`);
          }
        }
      }

      await client.query('COMMIT');

      // ── Clear cart (best-effort — outside transaction) ─────────────────────────
      // Clear whichever owner key the cart was stored under, plus any reserves
      // tied to this session.
      await clearAllReserves(sessionId, cart.items).catch(() => {});
      await clearCart(cartOwnerKey).catch(() => {});

      // ── Notify owner for manual orders only (gateway orders notify after payment confirm) ─
      if (paymentMethod === 'manual') {
        notifyNewOrder({
          orderNumber,
          total,
          itemCount:       lineItems.reduce((s, i) => s + i.quantity, 0),
          itemNames:       lineItems.map(i => i.name),
          customerName:    normalizedAddress.name,
          customerContact: guestEmail?.trim() ?? normalizedAddress.phone,
          pincode:         normalizedAddress.pincode,
          paymentMethod:   'manual',
        });
      }

      // ── Build response ─────────────────────────────────────────────────────────
      const whatsappLink = buildWhatsAppLink(
        settings.whatsapp_number ?? '',
        orderNumber,
        total,
      );

      const paymentPayload = rzpOrder
        ? {
            method:            'razorpay',
            key_id:            process.env.RAZORPAY_KEY_ID,
            razorpay_order_id: rzpOrder.id,
            amount:            Math.round(total * 100),
            currency:          'INR',
            name:              "Krishna's Bliss",
            description:       `Order ${orderNumber}`,
          }
        : ppResult
        ? {
            method:                  'phonepe',
            redirect_url:            ppResult.redirectUrl,
            merchant_transaction_id: ppResult.merchantTransactionId,
          }
        : {
            method:        'pay_on_confirmation',
            whatsapp_link: whatsappLink,
            instructions:  'Please contact us on WhatsApp to confirm your order and receive the UPI payment link.',
          };

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
            payment_status:   paymentStatus,
            fulfillment_status: 'unfulfilled',
            exchange_eligible_until: exchangeEligibleUntil,
            created_at:       order.created_at,
          },
          payment: paymentPayload,
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

// ── POST /api/orders/:orderNumber/verify-payment ──────────────────────────────
// Verifies Razorpay payment signature and marks the order as paid

router.post('/:orderNumber/verify-payment', optionalCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNumber } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
      razorpay_order_id:   string;
      razorpay_payment_id: string;
      razorpay_signature:  string;
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: { message: 'Missing payment fields', code: 'VALIDATION_ERROR' } });
      return;
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      res.status(503).json({ error: { message: 'Payment verification not configured', code: 'NOT_CONFIGURED' } });
      return;
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      res.status(422).json({ error: { message: 'Payment verification failed', code: 'INVALID_SIGNATURE' } });
      return;
    }

    // Mark order as authorized (funds held, not yet captured)
    const { rows: [updated] } = await pool.query<{
      id: string; order_number: string; total: string;
      line_items: Array<{ name: string; quantity: number }>;
      shipping_address: { name: string; phone: string; pincode: string };
      guest_email: string | null;
    }>(
      `UPDATE orders
         SET payment_status          = 'authorized',
             razorpay_payment_id     = $1,
             razorpay_authorized_at  = NOW(),
             updated_at              = NOW()
       WHERE UPPER(order_number) = UPPER($2)
         AND razorpay_order_id   = $3
       RETURNING id, order_number, total, line_items, shipping_address, guest_email`,
      [razorpay_payment_id, orderNumber, razorpay_order_id],
    );

    if (!updated) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }

    // Notify owner — new order received, awaiting capture decision
    notifyNewOrder({
      orderNumber:     updated.order_number,
      total:           parseFloat(updated.total),
      itemCount:       updated.line_items.reduce((s, i) => s + i.quantity, 0),
      itemNames:       updated.line_items.map(i => i.name),
      customerName:    updated.shipping_address.name,
      customerContact: updated.guest_email ?? updated.shipping_address.phone,
      pincode:         updated.shipping_address.pincode,
      paymentMethod:   'razorpay',
    });

    // WhatsApp order confirmed to customer
    sendOrderConfirmed({
      phone:       updated.shipping_address.phone,
      name:        updated.shipping_address.name,
      orderNumber: updated.order_number,
      total:       parseFloat(updated.total),
    });

    res.json({ data: { order_number: updated.order_number, payment_status: 'authorized' } });

    // Push notification — fire-and-forget, only for logged-in customers
    if (updated.id) {
      const { rows: [orderRow] } = await pool.query<{ customer_id: string | null }>(
        `SELECT customer_id FROM orders WHERE id = $1`, [updated.id]
      );
      if (orderRow?.customer_id) {
        pushToCustomer(orderRow.customer_id, {
          title: 'Order Received!',
          body:  `Your order #${updated.order_number} is confirmed. We'll process it shortly.`,
          data:  { url: `/order/${updated.order_number}/confirmation` },
        }).catch(() => {});
      }
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

// ── GET /api/orders/:orderNumber/invoice ──────────────────────────────────────
// Customer-facing PDF download. Same access rules as the order GET above:
// owning customer (via JWT) or guest providing matching email.

router.get('/:orderNumber/invoice', optionalCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNumber } = req.params;
    const { email } = req.query as { email?: string };

    // Access check using the same pattern as GET /:orderNumber
    const { rows: [accessRow] } = await pool.query<{
      id: string; customer_id: string | null; guest_email: string | null;
    }>(
      `SELECT id, customer_id, guest_email FROM orders WHERE order_number = $1`,
      [orderNumber.toUpperCase()],
    );

    if (!accessRow) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
      return;
    }

    const isOwner = req.customer && accessRow.customer_id === req.customer.id;
    const isGuest = email && accessRow.guest_email
      && accessRow.guest_email.toLowerCase() === email.toLowerCase().trim();

    if (!isOwner && !isGuest) {
      res.status(403).json({ error: { message: 'Access denied', code: 'FORBIDDEN' } });
      return;
    }

    // Generate + stream the PDF
    const ok = await streamInvoicePdf(accessRow.id, res);
    if (!ok) {
      res.status(404).json({ error: { message: 'Order not found', code: 'NOT_FOUND' } });
    }
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
