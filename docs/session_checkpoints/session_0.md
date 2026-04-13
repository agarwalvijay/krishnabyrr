# Session 0 Checkpoint — Scaffold & Database Schema

**Date:** 2026-04-12
**Status:** COMPLETE — 37/37 tests passing

---

## Files Created

### Root
| File | Purpose |
|------|---------|
| `package.json` | npm workspaces root — declares 4 workspaces |
| `tsconfig.base.json` | Shared TS config extended by all packages |
| `.gitignore` | Standard Next.js / Node ignores |

### `api/`
| File | Purpose |
|------|---------|
| `package.json` | API dependencies: pg, bcrypt, express, redis, jest, ts-jest |
| `tsconfig.json` | CommonJS target, extends base |
| `src/db/client.ts` | pg Pool factory; exports `pool` (dev) and `createTestPool()` |
| `src/db/migrate.ts` | Migration runner: reads SQL files from `migrations/` in order; exports `runMigrations()` and `dropAndRecreateSchema()` |
| `src/db/seed.ts` | Seeds admin users, categories, tags, products, coupons, settings |
| `src/db/migrations.test.ts` | Jest suite — 37 tests verifying schema, seed data, Redis |

### `api/src/db/migrations/`
| File | Tables |
|------|--------|
| `001_core_products.sql` | `products`, `product_images`, `categories`, `product_categories`, `tags`, `product_tags`, `collections`, `collection_products` |
| `002_customers.sql` | `customers`, `addresses`, `wishlist_items` |
| `003_orders.sql` | `orders`, `exchange_requests`, `inventory_log` |
| `004_coupons.sql` | `coupons`, `coupon_redemptions` |
| `005_admin_content.sql` | `admin_users`, `settings`, `pages`, `newsletter_subscribers`, `testimonials` |

### `packages/shared/`
| File | Purpose |
|------|---------|
| `package.json` | Shared package, zod dependency |
| `tsconfig.json` | CommonJS, extends base |
| `index.ts` | Re-exports everything |
| `types/index.ts` | TypeScript interfaces for all domain entities |
| `validators/index.ts` | Zod schemas: `AddressSchema`, `CreateOrderSchema`, `CouponSchema`, `ProductSchema` |
| `constants/shipping.ts` | Zone constants, Delhi NCR pincode prefixes |
| `constants/gst.ts` | GST rate constants (5%, 12%), default HSN |
| `constants/states.ts` | All 36 Indian states/UTs as const array |

### `apps/web/`
| File | Purpose |
|------|---------|
| `package.json` | Next.js 14, React 18, Tailwind |
| `tsconfig.json` | Next.js-compatible TS config |

### `apps/admin/`
| File | Purpose |
|------|---------|
| `package.json` | React 18, Vite, react-router-dom |
| `tsconfig.json` | Vite-compatible TS config |

---

## Test Results

```
Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total
Time:        2.779s
```

### Test breakdown
- **21 tests** — all 21 tables exist in public schema
- **4 tests** — row counts: 3 admin users, 3 products, 2 coupons, 9 settings
- **11 tests** — seed data integrity (roles, product status/MRP/stock, coupon config, settings values, category tree, tag count, migration log)
- **1 test** — Redis PING returns PONG

---

## Verification Commands

```bash
# Run tests
cd /Users/vijayagarwal/vijay/vijay/krishnabyrr/api
npx jest --runInBand --forceExit

# Check tables in dev DB
psql -U vijayagarwal krishnabyrr_dev -c "\dt"

# Count tables in dev DB (expect 21 + schema_migrations = 22)
psql -U vijayagarwal krishnabyrr_dev -c "
  SELECT count(*) FROM information_schema.tables
  WHERE table_schema = 'public';"

# Check seeded admin users
psql -U vijayagarwal krishnabyrr_dev -c "
  SELECT email, role, is_active FROM admin_users ORDER BY email;"

# Check products
psql -U vijayagarwal krishnabyrr_dev -c "
  SELECT name, mrp, stock_qty, status FROM products ORDER BY mrp;"

# Check coupons
psql -U vijayagarwal krishnabyrr_dev -c "
  SELECT code, type, value, valid_until, customer_eligibility FROM coupons;"

# Check settings
psql -U vijayagarwal krishnabyrr_dev -c "
  SELECT key, value FROM settings ORDER BY key;"

# Re-run migrations (safe — idempotent)
npm -w api run db:migrate

# Re-run seed (safe — ON CONFLICT DO NOTHING)
npm -w api run db:seed

# Redis check
redis-cli ping  # expects PONG
```

---

## Architecture Decisions Session 1 Must Know

### Database
- **`customers.default_address_id`** FK is `DEFERRABLE INITIALLY DEFERRED` — necessary to break the circular reference between `customers` and `addresses` during inserts. Always set `default_address_id` in a deferred transaction.
- **`schema_migrations` table** is in the `public` schema of each database and tracks applied migrations by filename. The runner is idempotent — re-running skips already-applied files.
- **`dropAndRecreateSchema(pool)`** drops the entire `public` schema and recreates it. Used in tests only. Never call on dev/prod.
- All UUIDs use `gen_random_uuid()` — requires pgcrypto extension, which is bundled in PG14 core via `uuid-ossp` alternative. `gen_random_uuid()` is built-in PG14, no extension needed.

### Business Rules Encoded in Schema
- `products.stock_qty` max is enforced at application level (1–4 units), not in the DB. The schema has no CHECK constraint on this to allow admin overrides.
- `orders.policy_snapshot` (JSONB) must be populated at order creation time — it captures the active shipping rates and exchange window so they're immutable to future settings changes.
- `coupon_redemptions` is the source of truth for "has this customer used this coupon" — not `coupons.current_use_count` (which is a denormalised counter for quick validation).
- `testimonials.star_rating` has a `CHECK (star_rating BETWEEN 1 AND 5)` constraint.

### Seed Data
- Admin password: `KBAdmin2026!` (bcrypt, 12 rounds)
- All 3 products are in `draft` status — they must be explicitly published
- `WELCOME20`: 20% off, `NEW_ONLY` customer eligibility, `max_uses_per_customer = 1`, no expiry
- `FREESHIP`: free shipping, expires 30 days from seed date (2026-05-12), `max_uses_per_customer = 1`

### Workspace / Module Setup
- `@krishnabyrr/shared` is referenced with `"*"` in web/admin `package.json` — npm workspaces resolves this locally. No build step needed for local dev (ts-node resolves source directly).
- `api` uses CommonJS (`"module": "CommonJS"` in tsconfig) — this is intentional for `ts-node` / Jest compatibility. Do not switch to ESM without updating Jest config.

### What Is NOT Done (Session 1 scope)
- No Express server entry point (`api/src/index.ts`)
- No API routes, middleware, or services
- No Next.js app files or Tailwind config
- No admin SPA files
- No `.env` files — all config uses `process.env` with localhost defaults
- No CI/CD config
- No GCS image upload integration
