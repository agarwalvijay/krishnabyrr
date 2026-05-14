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

function cartKey(sessionId: string)                             { return `cart:${sessionId}`; }
function reserveKey(productId: string, sessionId: string)      { return `cart-reserve:${productId}:${sessionId}`; }

// ── Cart CRUD ─────────────────────────────────────────────────────────────────

export function generateSessionId(): string {
  return randomUUID();
}

export function emptyCart(sessionId: string): CartData {
  return {
    sessionId,
    customerId:  null,
    items:       [],
    couponCode:  null,
    couponData:  null,
    pincode:     null,
    zone:        null,
    updatedAt:   new Date().toISOString(),
  };
}

export async function getCart(sessionId: string): Promise<CartData | null> {
  const redis = await getRedisClient();
  const raw   = await redis.get(cartKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CartData;
  } catch {
    return null;
  }
}

export async function setCart(sessionId: string, cart: CartData): Promise<void> {
  cart.updatedAt = new Date().toISOString();
  const redis    = await getRedisClient();
  await redis.setEx(cartKey(sessionId), CART_TTL, JSON.stringify(cart));
}

export async function clearCart(sessionId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(cartKey(sessionId));
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
