import { Pool } from 'pg';
import type { RedisClientType } from 'redis';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CouponValidationParams {
  code:         string;
  customerId:   string | null;
  guestEmail:   string | null;
  cartSubtotal: number;
  cartItems:    Array<{ productId: string; quantity: number }>;
  db:           Pool;
  redis:        RedisClientType;
}

export interface CouponValidationResult {
  valid:           true;
  couponId:        string;
  code:            string;
  type:            string;           // 'percent' | 'flat' | 'free_shipping'
  discount_amount: number;           // 0 for free_shipping
  description:     string;
}

export interface CouponValidationError {
  valid:   false;
  rule:    string;
  message: string;
}

type CouponRow = {
  id:                    string;
  code:                  string;
  type:                  string;
  value:                 string | null;    // numeric from pg
  description:           string | null;
  is_active:             boolean;
  valid_from:            Date | null;
  valid_until:           Date | null;
  max_uses_total:        number | null;
  max_uses_per_customer: number | null;
  current_use_count:     number;
  min_order_value:       string | null;   // numeric from pg
  customer_eligibility:  string | null;   // 'ALL' | 'SPECIFIC'
  customer_ids:          string[] | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style:                 'currency',
    currency:              'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function calcDiscount(type: string, value: number, subtotal: number): number {
  if (type === 'free_shipping') return 0;
  if (type === 'percent')       return Math.round((subtotal * value) / 100);
  if (type === 'flat')          return Math.min(value, subtotal);
  return 0;
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateCoupon(
  params: CouponValidationParams,
): Promise<CouponValidationResult | CouponValidationError> {
  const { code, customerId, guestEmail, cartSubtotal, db, redis } = params;

  // ── Rule 1: NOT_FOUND ──────────────────────────────────────────────────────
  const preCheck = await db.query<CouponRow>(
    `SELECT
       id, code, type, value::text, description,
       is_active, valid_from, valid_until,
       max_uses_total, max_uses_per_customer, current_use_count,
       min_order_value::text,
       customer_eligibility, customer_ids
     FROM coupons
     WHERE LOWER(code) = LOWER($1)`,
    [code],
  );

  if (preCheck.rowCount === 0) {
    return { valid: false, rule: 'NOT_FOUND', message: 'Coupon code not found.' };
  }

  const pre = preCheck.rows[0];

  // ── Rule 2: INACTIVE ───────────────────────────────────────────────────────
  if (!pre.is_active) {
    return { valid: false, rule: 'INACTIVE', message: 'This coupon is no longer active.' };
  }

  // ── Rule 3: NOT_YET_VALID ──────────────────────────────────────────────────
  const now = new Date();
  if (pre.valid_from && now < new Date(pre.valid_from)) {
    return {
      valid:   false,
      rule:    'NOT_YET_VALID',
      message: `This coupon is valid from ${new Date(pre.valid_from).toLocaleDateString('en-IN')}.`,
    };
  }

  // ── Rule 4: EXPIRED ────────────────────────────────────────────────────────
  if (pre.valid_until && now > new Date(pre.valid_until)) {
    return { valid: false, rule: 'EXPIRED', message: 'This coupon has expired.' };
  }

  // ── Rule 5: MAX_USES_REACHED (Redis INCR + SELECT FOR UPDATE) ─────────────
  if (pre.max_uses_total !== null) {
    // Redis INCR acts as a lightweight gate to reduce DB contention
    const redisKey = `coupon-check:${pre.id}`;
    const count    = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, 10);
    }

    // Authoritative check inside a transaction with row-level lock
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ current_use_count: number; max_uses_total: number }>(
        `SELECT current_use_count, max_uses_total
         FROM coupons
         WHERE id = $1
         FOR UPDATE`,
        [pre.id],
      );
      const row = locked.rows[0];
      if (row.max_uses_total !== null && row.current_use_count >= row.max_uses_total) {
        await client.query('ROLLBACK');
        return {
          valid:   false,
          rule:    'MAX_USES_REACHED',
          message: 'This coupon has reached its maximum usage limit.',
        };
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Rule 6: MAX_PER_CUSTOMER_REACHED ──────────────────────────────────────
  if (pre.max_uses_per_customer !== null && (customerId || guestEmail)) {
    const usageCheck = await db.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM coupon_redemptions
       WHERE coupon_id = $1
         AND (
           ($2::uuid IS NOT NULL AND customer_id = $2::uuid)
           OR
           ($3::text IS NOT NULL AND guest_email = $3)
         )`,
      [pre.id, customerId, guestEmail],
    );
    const usedTimes = parseInt(usageCheck.rows[0].cnt, 10);
    if (usedTimes >= pre.max_uses_per_customer) {
      return {
        valid:   false,
        rule:    'MAX_PER_CUSTOMER_REACHED',
        message: `You have already used this coupon ${pre.max_uses_per_customer} time(s).`,
      };
    }
  }

  // ── Rule 7: MIN_ORDER_NOT_MET ──────────────────────────────────────────────
  if (pre.min_order_value !== null) {
    const minAmt = parseFloat(pre.min_order_value);
    if (cartSubtotal < minAmt) {
      return {
        valid:   false,
        rule:    'MIN_ORDER_NOT_MET',
        message: `Minimum order amount of ${formatINR(minAmt)} required for this coupon.`,
      };
    }
  }

  // ── Rule 8: CUSTOMER_NOT_ELIGIBLE ─────────────────────────────────────────
  if (pre.customer_eligibility === 'SPECIFIC') {
    const allowedIds = pre.customer_ids ?? [];
    if (!customerId || !allowedIds.includes(customerId)) {
      return {
        valid:   false,
        rule:    'CUSTOMER_NOT_ELIGIBLE',
        message: 'You are not eligible for this coupon.',
      };
    }
  }

  // ── Rule 9: FIRST_ORDER_ONLY — use customer_eligibility='FIRST_ORDER' ──────
  if (pre.customer_eligibility === 'FIRST_ORDER') {
    if (customerId) {
      const prevOrders = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM orders WHERE customer_id = $1`,
        [customerId],
      );
      if (parseInt(prevOrders.rows[0].cnt, 10) > 0) {
        return {
          valid:   false,
          rule:    'FIRST_ORDER_ONLY_VIOLATED',
          message: 'This coupon is valid for first-time customers only.',
        };
      }
    } else if (guestEmail) {
      const prevOrders = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM orders WHERE guest_email = $1`,
        [guestEmail],
      );
      if (parseInt(prevOrders.rows[0].cnt, 10) > 0) {
        return {
          valid:   false,
          rule:    'FIRST_ORDER_ONLY_VIOLATED',
          message: 'This coupon is valid for first-time customers only.',
        };
      }
    }
  }

  // ── All rules passed — compute discount ───────────────────────────────────
  const value           = pre.value ? parseFloat(pre.value) : 0;
  const discount_amount = calcDiscount(pre.type, value, cartSubtotal);

  return {
    valid:           true,
    couponId:        pre.id,
    code:            pre.code,
    type:            pre.type,
    discount_amount,
    description:     pre.description ?? pre.code,
  };
}
