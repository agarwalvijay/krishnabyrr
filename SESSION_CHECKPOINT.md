# KrishnaByrr — Session Checkpoint

**Date:** 2026-04-13  
**Status:** All tests passing (86 unit + 38 migration = 124 total)  
**TypeScript:** Clean (`apps/web` — no errors; `api` compiles via ts-jest)

---

## What Was Built (Sessions 1–7 + Bug-Fix Pass)

### Monorepo Layout

```
krishnabyrr/
├── api/              Express + PostgreSQL + Redis backend
├── apps/
│   ├── web/          Next.js 14 App Router storefront
│   └── admin/        Vite + React admin dashboard
└── packages/shared/  (reserved)
```

---

## API (`api/`)

### Database — 7 migrations, 22 tables

| Migration | Tables Created |
|---|---|
| 001_initial | products, product_images, categories, product_categories, tags, product_tags |
| 002_collections | collections, collection_products |
| 003_customers | customers, addresses, wishlist_items |
| 004_orders | orders, exchange_requests, inventory_log, coupons, coupon_redemptions |
| 005_admin_content | admin_users, settings, pages, newsletter_subscribers, testimonials |
| 006_related_products | related_products |
| 007_order_sequence | order_number_seq, exchange_number_seq |

### Routes

| Mount | File | Key Endpoints |
|---|---|---|
| `/api/products` | `routes/products.ts` | `GET /` (filters: category, q, price, in_stock, ids), `GET /:slug`, `GET /tags` |
| `/api/categories` | (inside products.ts) | `GET /` — nested tree |
| `/api/collections` | (inside products.ts) | `GET /`, `GET /:slug` |
| `/api/settings/public` | (inside products.ts) | `GET /` — whitelisted keys |
| `/api/auth` | `routes/auth.ts` | register, login, me, link-order, change-password |
| `/api/orders` | `routes/orders.ts` | `POST /`, `GET /:orderNumber` |
| `/api/exchanges` | `routes/exchanges.ts` | `POST /`, `GET /` |
| `/api/account/wishlist` | `routes/account.ts` | `GET /`, `POST /`, `DELETE /:productId` |
| `/api/account/addresses` | `routes/account.ts` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `PUT /:id/default` |
| `/api/account/profile` | `routes/account.ts` | `PUT /` |
| `/api/pages` | `routes/pages.ts` | `GET /:slug` |
| `/api/admin/products` | `routes/admin/products.ts` | Full CRUD + stock-adjust + image upload/reorder |
| `/api/admin/categories` | `routes/admin/categories.ts` | Full CRUD |
| `/api/admin/collections` | `routes/admin/collections.ts` | Full CRUD |
| `/api/admin/tags` | `routes/admin/tags.ts` | Full CRUD + `product_count` in list |
| `/api/admin/orders` | `routes/admin/orders.ts` | List + fulfill + tracking |

### Auth

- **Admin JWT**: No `sub` claim; checked against `admin_users` table
- **Customer JWT**: `sub: 'customer'`; checked against `customers` table
- Middleware: `requireAuth` (admin), `requireCustomerAuth` / `optionalCustomerAuth` (customer)
- Customer token stored in `localStorage('kb_customer_token')`

### Order Flow

1. Cart in Redis (`kb_session` cookie, httpOnly)
2. `POST /api/cart/pincode` → calculates shipping zone + rate
3. `POST /api/orders` → SELECT FOR UPDATE on stock, order_number_seq, coupon validation
4. Exchange eligibility set on fulfillment via `exchange_eligible_until`

---

## Storefront (`apps/web/`)

### Pages

| Route | File | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Hero banner (Next/Image), featured collections, new arrivals |
| `/shop` | `app/shop/page.tsx` | Filter sidebar, product grid, pagination |
| `/product/[slug]` | `app/product/[slug]/page.tsx` | PDP with images, add-to-cart |
| `/checkout` | `app/checkout/page.tsx` | react-hook-form + Zod, live cart summary, shipping calc |
| `/order/[orderNumber]/confirmation` | `app/order/[orderNumber]/confirmation/page.tsx` | Order confirmed, guest→account prompt |
| `/account/login` | `app/account/login/page.tsx` | Email + password |
| `/account/register` | `app/account/register/page.tsx` | + links guest order on `?order=&email=` params |
| `/account` | `app/account/page.tsx` | Dashboard: orders, wishlist, profile cards |
| `/account/orders` | `app/account/orders/page.tsx` | Desktop table + mobile cards |
| `/account/orders/[orderNumber]` | `app/account/orders/[orderNumber]/page.tsx` | Detail: items, totals, tracking, exchange |
| `/account/orders/[orderNumber]/exchange` | `…/exchange/page.tsx` | Exchange request form |
| `/account/wishlist` | `app/account/wishlist/page.tsx` | Merge localStorage + DB wishlist |
| `/account/addresses` | `app/account/addresses/page.tsx` | CRUD, set default, max 5 |
| `/account/profile` | `app/account/profile/page.tsx` | Edit name/phone, change password, sign out |
| `/pages/exchanges` | `app/pages/exchanges/page.tsx` | Server component, fetches from `/api/pages/exchanges` |

### Key Components

| Component | Purpose |
|---|---|
| `contexts/AuthContext.tsx` | `CustomerAuthProvider`, `useCustomerAuth()`, `useCustomer()`, `useIsLoggedIn()` |
| `components/account/AccountLayout.tsx` | Auth guard + desktop sidebar + mobile tab strip |
| `components/cart/CartContext.tsx` | Cart state, `addItem`, `openCart` |
| `components/cart/AddToCartButton.tsx` | Requires `productId` + `stockQty` props |
| `components/cart/CartDrawer.tsx` | Slide-over cart |
| `components/layout/Header.tsx` | Logo (Next/Image `/krishnabyrr_logo.svg`), auth-aware account icon |
| `components/ui/ProductCard.tsx` | Wishlist toggle, product grid card |

### `lib/api.ts` Highlights

- `apiClient` — axios instance with `/api` base, auth interceptor (reads `localStorage`)
- `serverFetchList` / `serverFetch` — for server components, uses `API_ORIGIN` env var
- `imageUrl(gcsPath)` — handles `http://`, `/uploads/`, `uploads/` prefixes correctly
- `formatINR(n)` — `en-IN` locale currency formatting

### Environment Variables

```env
# apps/web
NEXT_PUBLIC_API_ORIGIN=http://localhost:3001   # for client-side imageUrl
API_ORIGIN=http://localhost:3001               # for server components (SSR)
```

---

## Admin Dashboard (`apps/admin/`)

### Pages

| Route | Component |
|---|---|
| `/products` | `ProductList.tsx` — filter by status/stock/search, image thumbnail via `imageUrl()` |
| `/products/new`, `/products/:id/edit` | `ProductForm.tsx` — full product form, image drag-drop upload |
| `/categories` | `CategoriesPage` |
| `/tags` | `TagsPage` — grouped by fabric/weave/occasion/color, product_count badge, slide-over CRUD |
| `/collections` | `CollectionsPage` — `is_homepage` toggle, drag-to-reorder |
| `/orders`, `/coupons`, `/settings` | Coming soon stubs |

### `lib/api.ts` Highlights

- `imageUrl(gcsPath)` — same logic as web: handles all path formats
- `VITE_API_ORIGIN` env var support

---

## Bug Fixes Applied (Codex pass)

### API

| Fix | File | Detail |
|---|---|---|
| Test isolation | `api/package.json` | `npm test` excludes migrations test (runs it via `npm run test:migrations`). `products.test.ts` `afterAll` no longer drops schema. |
| Admin product filters | `routes/admin/products.ts` | Added `?in_stock=true`, `?stock_min`, `?stock_max`; status filter normalised to lowercase; `?q` trimmed before tsquery |
| Image reorder primary sync | `routes/admin/products.ts` | After `PUT /:id/images/reorder`, resets `is_primary` to the image with lowest `display_order` |
| Category parent-slug filter | `routes/products.ts` | Public `?category=` filter now matches products in child categories when a parent slug is used |
| Tags with product_count | `routes/admin/tags.ts` | `GET /admin/tags` now returns `product_count` via LEFT JOIN on `product_tags` |

### Storefront

| Fix | File | Detail |
|---|---|---|
| `imageUrl` path handling | `apps/web/lib/api.ts` | Handles `/uploads/`, `uploads/`, and `http://` prefixes; reads `NEXT_PUBLIC_API_ORIGIN` |
| Homepage collections section | `apps/web/app/page.tsx` | Parallel fetch: new arrivals + `is_homepage` collections; hero uses Next/Image |
| Logo as SVG image | `apps/web/components/layout/Header.tsx` | Replaced text with `<Image src="/krishnabyrr_logo.svg" />` |

### Admin

| Fix | File | Detail |
|---|---|---|
| `imageUrl` helper | `apps/admin/src/lib/api.ts` | Mirrors web `imageUrl`; reads `VITE_API_ORIGIN` |
| Product thumbnail | `ProductList.tsx` | Uses `imageUrl()` instead of raw `gcs_path`; shows error state banner on load failure |
| Product form images | `ProductForm.tsx` | Uses `imageUrl()`; shows placeholder SVG for failed loads |
| Tag label resolution | `ProductForm.tsx` | `MultiCheckList` now falls back to `.value` then `.slug` when `labelKey` item is undefined |
| Collections `is_homepage` | `Collections/index.tsx` | Renamed `show_on_homepage` → `is_homepage` throughout to match DB column |
| Tags admin page | `pages/Tags/index.tsx` | New page: grouped table, slide-over create/edit/delete, hex color preview |

---

## Test Suite

```
npm test                  # 5 suites, 86 tests (routes: auth, exchanges, orders, products, coupon-engine)
npm run test:migrations   # 1 suite, 38 tests (schema, seed, redis)
Total                     # 124 tests, all passing
```

### Coverage by Route

| Suite | Tests | Covers |
|---|---|---|
| `migrations.test.ts` | 38 | All 22 tables exist, seed counts, integrity checks, Redis ping |
| `auth.test.ts` | 13 | register (happy + 5 validation), login (happy + 4 error), me (token valid/invalid) |
| `exchanges.test.ts` | 6 | Create exchange, auth guards, wrong owner, expired window, GET list |
| `orders.test.ts` | 16 | Order creation, stock decrement, inventory log, sequential order numbers, coupon, auth customer, GET order |
| `products.test.ts` | 30 | Health, product list filters (category child+parent slug, price, in_stock, search), detail, categories, collections, admin CRUD, admin filters (status, in_stock, stock_min/max, search), admin tags (product_count, auth guard), stock adjustment, settings |
| `coupon-engine.test.ts` | 13 | Flat + percentage, max_uses race-condition, eligibility (new/existing), expired, min_order |

---

## Verification Commands

```bash
# Run main test suite
cd krishnabyrr/api && npm test

# Run migrations test (separate — drops schema)
npm run test:migrations

# TypeScript check
cd apps/web && npx tsc --noEmit

# Start API (port 3001)
cd api && npm run dev

# Start storefront (port 3000 or 3002)
cd apps/web && npm run dev

# Start admin (port 5173)
cd apps/admin && npm run dev
```

---

## Environment Setup Requirements

```env
# api/.env
DB_HOST=localhost
DB_PORT=5432
DB_USER=<pg_user>
DB_NAME=krishnabyrr
DB_TEST_NAME=krishnabyrr_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=<strong_secret>
GCS_BUCKET=<bucket>           # optional; falls back to local /uploads/
CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:5173

# apps/web/.env.local
NEXT_PUBLIC_API_ORIGIN=http://localhost:3001
API_ORIGIN=http://localhost:3001

# apps/admin/.env
VITE_API_ORIGIN=http://localhost:3001
```

---

## Open Items / Next Session

1. **Admin orders page** — fulfillment UI (mark shipped, enter courier + tracking)
2. **Admin coupons page** — create/toggle active, view redemption counts
3. **Admin settings page** — edit exchange_window_days, shipping zones, store info
4. **WhatsApp order notification** — POST to Meta Cloud API on order creation
5. **Production image upload** — GCS signed URL flow (currently saves to local `/uploads/`)
6. **`/pages/exchanges` static page logo** — needs `/public/krishnabyrr_logo.svg` file added
7. **Hero banners** — `/public/banners/hero_1.svg` etc. need to be added to public/
8. **E2E tests** — Playwright for checkout golden path
9. **Deployment** — Dockerfile for api, Vercel config for web, Netlify/Vercel for admin
