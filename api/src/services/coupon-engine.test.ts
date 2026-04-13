import { Pool } from 'pg';
import { createTestPool } from '../db/client';
import { getRedisClient, closeRedis } from '../redis';
import { validateCoupon } from './coupon-engine';

// ── Test DB + Redis setup ──────────────────────────────────────────────────────

let db: Pool;

beforeAll(async () => {
  db = createTestPool();
});

afterAll(async () => {
  await db.end();
  await closeRedis();
});

beforeEach(async () => {
  // Clean coupon-related data before each test
  await db.query(`DELETE FROM coupon_redemptions`);
  await db.query(`DELETE FROM coupons`);

  // Clear any redis coupon-check keys
  const redis = await getRedisClient();
  const keys = await redis.keys('coupon-check:*');
  if (keys.length > 0) await redis.del(keys);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function insertCoupon(overrides: {
  code?:                  string;
  type?:                  string;
  value?:                 number;
  is_active?:             boolean;
  valid_from?:            string | null;
  valid_until?:           string | null;
  max_uses_total?:        number | null;
  max_uses_per_customer?: number | null;
  current_use_count?:     number;
  min_order_value?:       number | null;
  customer_eligibility?:  string | null;
  customer_ids?:          string[] | null;
} = {}): Promise<string> {
  const {
    code                  = 'TESTCODE',
    type                  = 'flat',
    value                 = 100,
    is_active             = true,
    valid_from            = null,
    valid_until           = null,
    max_uses_total        = null,
    max_uses_per_customer = null,
    current_use_count     = 0,
    min_order_value       = null,
    customer_eligibility  = 'ALL',
    customer_ids          = null,
  } = overrides;

  const result = await db.query<{ id: string }>(
    `INSERT INTO coupons (
       code, type, value, is_active, valid_from, valid_until,
       max_uses_total, max_uses_per_customer, current_use_count,
       min_order_value, customer_eligibility, customer_ids
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      code, type, value, is_active, valid_from, valid_until,
      max_uses_total, max_uses_per_customer, current_use_count,
      min_order_value, customer_eligibility, customer_ids,
    ],
  );
  return result.rows[0].id;
}

async function baseParams(overrides: Partial<Parameters<typeof validateCoupon>[0]> = {}) {
  const redis = await getRedisClient();
  return {
    code:         'TESTCODE',
    customerId:   null,
    guestEmail:   null,
    cartSubtotal: 1000,
    cartItems:    [],
    db,
    redis:        redis as any,
    ...overrides,
  };
}

// ── Rule 1: NOT_FOUND ──────────────────────────────────────────────────────────

describe('Rule 1 — NOT_FOUND', () => {
  it('returns NOT_FOUND for a non-existent code', async () => {
    const result = await validateCoupon(await baseParams({ code: 'DOESNOTEXIST' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('NOT_FOUND');
  });
});

// ── Rule 2: INACTIVE ───────────────────────────────────────────────────────────

describe('Rule 2 — INACTIVE', () => {
  it('returns INACTIVE when coupon is_active=false', async () => {
    await insertCoupon({ is_active: false });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('INACTIVE');
  });
});

// ── Rule 3: NOT_YET_VALID ──────────────────────────────────────────────────────

describe('Rule 3 — NOT_YET_VALID', () => {
  it('returns NOT_YET_VALID when valid_from is in the future', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await insertCoupon({ valid_from: future });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('NOT_YET_VALID');
  });

  it('passes when valid_from is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    await insertCoupon({ valid_from: past });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(true);
  });
});

// ── Rule 4: EXPIRED ────────────────────────────────────────────────────────────

describe('Rule 4 — EXPIRED', () => {
  it('returns EXPIRED when valid_until is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    await insertCoupon({ valid_until: past });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('EXPIRED');
  });

  it('passes when valid_until is in the future', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await insertCoupon({ valid_until: future });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(true);
  });
});

// ── Rule 5: MAX_USES_REACHED ──────────────────────────────────────────────────

describe('Rule 5 — MAX_USES_REACHED', () => {
  it('returns MAX_USES_REACHED when current_use_count >= max_uses_total', async () => {
    await insertCoupon({ max_uses_total: 5, current_use_count: 5 });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('MAX_USES_REACHED');
  });

  it('passes when current_use_count < max_uses_total', async () => {
    await insertCoupon({ max_uses_total: 10, current_use_count: 5 });
    const result = await validateCoupon(await baseParams());
    expect(result.valid).toBe(true);
  });

  it('race condition: 5 concurrent calls all fail when at limit', async () => {
    // All calls see current_use_count = max_uses_total → all should fail
    await insertCoupon({ code: 'RACETEST', max_uses_total: 1, current_use_count: 1 });
    const redis = await getRedisClient();
    const params = {
      code:         'RACETEST',
      customerId:   null,
      guestEmail:   null,
      cartSubtotal: 500,
      cartItems:    [],
      db,
      redis:        redis as any,
    };

    const results = await Promise.all([
      validateCoupon(params),
      validateCoupon(params),
      validateCoupon(params),
      validateCoupon(params),
      validateCoupon(params),
    ]);

    expect(results.every(r => !r.valid)).toBe(true);
    expect(results.every(r => !r.valid && r.rule === 'MAX_USES_REACHED')).toBe(true);
  });
});

// ── Rule 6: MAX_PER_CUSTOMER_REACHED ──────────────────────────────────────────

describe('Rule 6 — MAX_PER_CUSTOMER_REACHED', () => {
  it('passes when customer has not used the coupon yet', async () => {
    await insertCoupon({ max_uses_per_customer: 1 });
    const result = await validateCoupon(await baseParams({ guestEmail: 'new@test.com' }));
    expect(result.valid).toBe(true);
  });
});

// ── Rule 7: MIN_ORDER_NOT_MET ──────────────────────────────────────────────────

describe('Rule 7 — MIN_ORDER_NOT_MET', () => {
  it('returns MIN_ORDER_NOT_MET when subtotal is below minimum', async () => {
    await insertCoupon({ min_order_value: 2000 });
    const result = await validateCoupon(await baseParams({ cartSubtotal: 999 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('MIN_ORDER_NOT_MET');
  });

  it('passes when subtotal equals minimum', async () => {
    await insertCoupon({ min_order_value: 1000 });
    const result = await validateCoupon(await baseParams({ cartSubtotal: 1000 }));
    expect(result.valid).toBe(true);
  });

  it('passes when subtotal exceeds minimum', async () => {
    await insertCoupon({ min_order_value: 500 });
    const result = await validateCoupon(await baseParams({ cartSubtotal: 1000 }));
    expect(result.valid).toBe(true);
  });
});

// ── Rule 8: CUSTOMER_NOT_ELIGIBLE ─────────────────────────────────────────────

describe('Rule 8 — CUSTOMER_NOT_ELIGIBLE', () => {
  it('returns CUSTOMER_NOT_ELIGIBLE when customer is not in the SPECIFIC allowlist', async () => {
    const allowedId = 'a0000000-0000-0000-0000-000000000001';
    const otherId   = 'b0000000-0000-0000-0000-000000000002';
    await insertCoupon({ customer_eligibility: 'SPECIFIC', customer_ids: [allowedId] });

    const result = await validateCoupon(await baseParams({ customerId: otherId }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.rule).toBe('CUSTOMER_NOT_ELIGIBLE');
  });

  it('passes when customer is in the SPECIFIC allowlist', async () => {
    const allowedId = 'a0000000-0000-0000-0000-000000000001';
    await insertCoupon({ customer_eligibility: 'SPECIFIC', customer_ids: [allowedId] });

    const result = await validateCoupon(await baseParams({ customerId: allowedId }));
    expect(result.valid).toBe(true);
  });

  it('passes for ALL eligibility with no customer', async () => {
    await insertCoupon({ customer_eligibility: 'ALL' });
    const result = await validateCoupon(await baseParams({ customerId: null }));
    expect(result.valid).toBe(true);
  });
});

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('Happy path', () => {
  it('returns valid result for a basic flat coupon', async () => {
    await insertCoupon({ code: 'FLAT100', type: 'flat', value: 100 });
    const result = await validateCoupon(await baseParams({ code: 'FLAT100', cartSubtotal: 500 }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discount_amount).toBe(100);
      expect(result.type).toBe('flat');
    }
  });

  it('returns valid result for a percent coupon', async () => {
    await insertCoupon({ code: 'PCT20', type: 'percent', value: 20 });
    const result = await validateCoupon(await baseParams({ code: 'PCT20', cartSubtotal: 1000 }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discount_amount).toBe(200);
    }
  });

  it('returns valid result for a free_shipping coupon (discount=0)', async () => {
    await insertCoupon({ code: 'FREESHIP', type: 'free_shipping', value: 0 });
    const result = await validateCoupon(await baseParams({ code: 'FREESHIP', cartSubtotal: 300 }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discount_amount).toBe(0);
      expect(result.type).toBe('free_shipping');
    }
  });

  it('clamps flat discount to subtotal (no negative totals)', async () => {
    await insertCoupon({ code: 'BIG', type: 'flat', value: 5000 });
    const result = await validateCoupon(await baseParams({ code: 'BIG', cartSubtotal: 200 }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discount_amount).toBe(200); // clamped to subtotal
    }
  });

  it('is case-insensitive for the code lookup', async () => {
    await insertCoupon({ code: 'SUMMER50' });
    const result = await validateCoupon(await baseParams({ code: 'summer50' }));
    expect(result.valid).toBe(true);
  });

  it('returns the couponId in the result', async () => {
    const id = await insertCoupon({ code: 'IDCHECK', type: 'flat', value: 50 });
    const result = await validateCoupon(await baseParams({ code: 'IDCHECK' }));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.couponId).toBe(id);
    }
  });
});
