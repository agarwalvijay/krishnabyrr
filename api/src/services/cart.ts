import { randomUUID } from 'crypto';
import { getRedisClient } from '../redis';

// ── Constants ─────────────────────────────────────────────────────────────────

const CART_TTL    = 30 * 24 * 60 * 60; // 30 days (seconds)
const RESERVE_TTL = 15 * 60;            // 15 minutes (seconds)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  id:           string;
  productId:    string;
  name:         string;
  slug:         string;
  sku:          string;
  mrp:          number;
  salePrice:    number | null;
  primaryImage: string | null;
  stockQty:     number;   // snapshot at add time
  quantity:     number;
  maxQty:       number;   // live stock (refreshed on GET)
  // GST rate snapshot at add time. Optional for backward compat with carts in
  // Redis from before this field existed — calcTotals falls back to 5%.
  gstRate?:     number;
}

export interface CouponSnapshot {
  code:            string;
  type:            string;
  discount_amount: number;
  description?:   string;
}

export interface CartData {
  sessionId:   string;
  customerId:  string | null;
  items:       CartItem[];
  couponCode:  string | null;
  couponData:  CouponSnapshot | null;
  pincode:     string | null;
  zone:        'A' | 'B' | null;
  updatedAt:   string;
}

// ── Redis key helpers ─────────────────────────────────────────────────────────
//
// Cart "owner key" namespaces:
//   session:<uuid>   — guest cart, tied to kb_session cookie
//   customer:<uuid>  — logged-in cart, tied to customer UUID (survives across devices)
//
// Stock reserves stay session-keyed regardless — they're short-lived (15 min)
// guards during checkout flow and don't need cross-device semantics.

function cartKey(ownerKey: string)                        { return `cart:${ownerKey}`; }
function reserveKey(productId: string, sessionId: string) { return `cart-reserve:${productId}:${sessionId}`; }

export function sessionOwnerKey(sessionId: string):  string { return `session:${sessionId}`; }
export function customerOwnerKey(customerId: string): string { return `customer:${customerId}`; }

// ── Cart CRUD ─────────────────────────────────────────────────────────────────

export function generateSessionId(): string {
  return randomUUID();
}

export function emptyCart(sessionId: string, customerId: string | null = null): CartData {
  return {
    sessionId,
    customerId,
    items:       [],
    couponCode:  null,
    couponData:  null,
    pincode:     null,
    zone:        null,
    updatedAt:   new Date().toISOString(),
  };
}

export async function getCart(ownerKey: string): Promise<CartData | null> {
  const redis = await getRedisClient();
  const raw   = await redis.get(cartKey(ownerKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CartData;
  } catch {
    return null;
  }
}

export async function setCart(ownerKey: string, cart: CartData): Promise<void> {
  cart.updatedAt = new Date().toISOString();
  const redis    = await getRedisClient();
  await redis.setEx(cartKey(ownerKey), CART_TTL, JSON.stringify(cart));
}

export async function clearCart(ownerKey: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(cartKey(ownerKey));
}

/**
 * When a customer logs in, claim any pending session cart and merge it into
 * the customer cart. Three cases:
 *   1. Only session cart exists → rename it to the customer cart
 *   2. Only customer cart exists → return it as-is, no change
 *   3. Both exist → merge items (additive, capped at live stock on next GET)
 * The session cart is always deleted at the end so subsequent guest activity
 * starts fresh.
 */
export async function claimSessionCartForCustomer(
  sessionId:  string,
  customerId: string,
): Promise<CartData> {
  const sessionKey  = sessionOwnerKey(sessionId);
  const customerKey = customerOwnerKey(customerId);

  const sessionCart  = await getCart(sessionKey);
  const customerCart = await getCart(customerKey);

  if (!sessionCart && !customerCart) {
    const empty = emptyCart(sessionId, customerId);
    await setCart(customerKey, empty);
    return empty;
  }

  if (sessionCart && !customerCart) {
    // Promote session cart to customer cart
    sessionCart.customerId = customerId;
    await setCart(customerKey, sessionCart);
    await clearCart(sessionKey);
    return sessionCart;
  }

  if (!sessionCart && customerCart) {
    customerCart.sessionId = sessionId; // refresh to current device's session
    customerCart.customerId = customerId;
    await setCart(customerKey, customerCart);
    return customerCart;
  }

  // Both exist — merge session items into customer cart (additive, dedupe by productId)
  const merged = customerCart!;
  merged.customerId = customerId;
  merged.sessionId  = sessionId;

  for (const incoming of sessionCart!.items) {
    const existing = merged.items.find(i => i.productId === incoming.productId);
    if (existing) {
      // Cap at maxQty if known; otherwise just sum (next GET refreshes from live stock)
      const summed = existing.quantity + incoming.quantity;
      existing.quantity = existing.maxQty
        ? Math.min(summed, existing.maxQty)
        : summed;
    } else {
      merged.items.push(incoming);
    }
  }

  // Carry over pincode/zone if customer cart had none
  if (!merged.pincode && sessionCart!.pincode) {
    merged.pincode = sessionCart!.pincode;
    merged.zone    = sessionCart!.zone;
  }
  // Coupon: keep customer's existing coupon if any, else inherit session's
  if (!merged.couponData && sessionCart!.couponData) {
    merged.couponCode = sessionCart!.couponCode;
    merged.couponData = sessionCart!.couponData;
  }

  await setCart(customerKey, merged);
  await clearCart(sessionKey);
  return merged;
}

// ── Stock reserve helpers ─────────────────────────────────────────────────────

export async function setReserve(
  productId: string,
  sessionId: string,
  qty: number,
): Promise<void> {
  const redis = await getRedisClient();
  await redis.setEx(reserveKey(productId, sessionId), RESERVE_TTL, String(qty));
}

export async function clearReserve(
  productId: string,
  sessionId: string,
): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(reserveKey(productId, sessionId));
}

export async function clearAllReserves(
  sessionId: string,
  items: CartItem[],
): Promise<void> {
  if (items.length === 0) return;
  const redis = await getRedisClient();
  const keys  = items.map(i => reserveKey(i.productId, sessionId));
  await redis.del(keys);
}
