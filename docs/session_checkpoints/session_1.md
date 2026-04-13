# Session 1 Checkpoint — Product Catalog API

**Date:** 2026-04-12
**Status:** COMPLETE — 56/56 tests passing (37 from Session 0 + 19 new)

---

## Files Created

### Root
| File | Purpose |
|------|---------|
| `.env.example` | Environment variable template |

### `api/src/`
| File | Purpose |
|------|---------|
| `index.ts` | Server entry point — connects DB + Redis, starts Express on port 3001 |
| `app.ts` | Express app — CORS, JSON body parser, mounts all routers, global error handler |
| `redis.ts` | Singleton Redis client via `getRedisClient()` / `closeRedis()` |
| `test/setup.ts` | Jest `setupFiles` — sets `DB_NAME=krishnabyrr_test`, `JWT_SECRET=test-secret` |

### `api/src/middleware/`
| File | Purpose |
|------|---------|
| `error.ts` | Global error handler — returns `{ error: { message, code } }` |
| `auth.ts` | `requireAuth` middleware — Bearer JWT + `admin_users` DB check, attaches `req.user` |

### `api/src/utils/`
| File | Purpose |
|------|---------|
| `slug.ts` | `toSlug()`, `uniqueProductSlug()`, `uniqueCategorySlug()`, `uniqueCollectionSlug()`, `autoSku()` |

### `api/src/routes/` (public)
| File | Endpoints |
|------|-----------|
| `health.ts` | `GET /api/health` — real DB + Redis ping |
| `products.ts` | `GET /api/products` (filtered/paginated), `GET /api/products/:slug` (full detail + related) |
| `products.ts` (exports) | `categoriesRouter`, `collectionsRouter`, `tagsRouter`, `searchRouter` |
| `settings.ts` | `GET /api/settings/public` — 9 public-safe keys only |

### `api/src/routes/admin/`
| File | Endpoints |
|------|-----------|
| `products.ts` | Full CRUD + image upload/delete/reorder + stock-adjust with inventory_log |
| `categories.ts` | Full CRUD — prevents delete when products assigned (409) |
| `tags.ts` | Full CRUD — prevents duplicate group_name + value (409) |
| `collections.ts` | Full CRUD + add/remove/reorder products |
| `index.ts` | Admin sub-router — mounts above at `/api/admin/{products,categories,tags,collections}` |

### `api/src/routes/`
| File | Purpose |
|------|---------|
| `products.test.ts` | 19 integration tests using supertest against krishnabyrr_test DB |

### `packages/shared/validators/index.ts` (modified)
- Made `slug` and `sku` optional in `ProductSchema` — both are auto-generated server-side if not provided

---

## Test Results

```
Test Suites: 2 passed, 2 total
Tests:       56 passed, 56 total  (37 Session 0 + 19 Session 1)
Time:        3.5s
```

### Session 1 test breakdown (19 tests)
| Suite | Tests |
|-------|-------|
| GET /api/health | 1 — 200, db: true, redis: true |
| GET /api/products | 5 — active-only, category filter, in_stock filter, price range, full-text search |
| GET /api/products/:slug | 2 — full detail, 404 for missing slug |
| GET /api/categories | 1 — nested tree with children |
| GET /api/collections/:slug | 1 — collection with products |
| Admin auth | 2 — no token → 401, invalid token → 401 |
| Admin product CRUD | 4 — create (slug auto-gen), 422 on missing MRP, partial update, soft-delete |
| Stock adjustment | 2 — success with inventory_log, negative stock → 400 |
| GET /api/settings/public | 1 — no cost_price or admin config leaked |

---

## curl Commands — Three Key Endpoints

```bash
# 1. List active products with category filter and pagination
curl -s "http://localhost:3001/api/products?category=silks&sort=price_asc&page=1&limit=12" | jq '.data[].name'

# 2. Full product detail
curl -s "http://localhost:3001/api/products/maheshwari-silk-ivory-bel-buti" | jq '{name: .data.name, tags: .data.tags, images: .data.images}'

# 3. Admin: create a product (requires JWT — get one after implementing /api/admin/auth/login)
# Until login endpoint exists, generate token manually:
# node -e "const j = require('jsonwebtoken'); console.log(j.sign({id:'<admin-id>',email:'super@krishnabyrr.com',role:'super_admin'}, 'change-me-in-production', {expiresIn:'8h'}))"
curl -s -X POST http://localhost:3001/api/admin/products \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Kanjivaram Pure Silk Saree Fabric","mrp":22000,"sale_price":19800,"gst_rate":12,"stock_qty":2}' | jq '.'
```

---

## Route Map (all endpoints)

### Public (no auth)
```
GET  /api/health
GET  /api/products               ?q, category, fabric, weave, occasion, color,
                                  collection, price_min, price_max, in_stock,
                                  sort, page, limit
GET  /api/products/:slug
GET  /api/categories             nested tree
GET  /api/categories/:slug       single category + children + product_count
GET  /api/collections            all active
GET  /api/collections/:slug      collection + active products
GET  /api/tags                   grouped: { fabric, weave, occasion, color }
GET  /api/search?q=              top 10 full-text results
GET  /api/settings/public        9 customer-safe settings
```

### Admin (Bearer JWT required)
```
GET    /api/admin/products              ?status=all|draft|active|archived
POST   /api/admin/products
PUT    /api/admin/products/:id
DELETE /api/admin/products/:id          soft delete → archived
POST   /api/admin/products/:id/images   multipart/form-data, field: image
DELETE /api/admin/products/:id/images/:imageId
PUT    /api/admin/products/:id/images/reorder
POST   /api/admin/products/:id/stock-adjust

GET    /api/admin/categories
POST   /api/admin/categories
PUT    /api/admin/categories/:id
DELETE /api/admin/categories/:id        409 if products assigned

GET    /api/admin/tags
POST   /api/admin/tags
PUT    /api/admin/tags/:id
DELETE /api/admin/tags/:id

GET    /api/admin/collections
POST   /api/admin/collections
PUT    /api/admin/collections/:id
DELETE /api/admin/collections/:id
POST   /api/admin/collections/:id/products
DELETE /api/admin/collections/:id/products/:productId
PUT    /api/admin/collections/:id/products/reorder
```

---

## What Session 2 Must Know Before Starting

### Architecture
- `app.ts` exports the Express app without starting the server — safe to import in tests
- `index.ts` is the entry point: runs `dotenv/config`, verifies connections, then `app.listen(3001)`
- `src/test/setup.ts` is in Jest `setupFiles` — runs before each test file's module loading, so `DB_NAME=krishnabyrr_test` is effective before pool creation
- All routes use `pool` from `src/db/client.ts` — the pool connects to `DB_NAME` from env at module load time

### Auth flow
- `requireAuth` middleware: extracts `Authorization: Bearer <token>`, verifies JWT with `JWT_SECRET`, then queries `admin_users WHERE id = $1 AND is_active = true`
- JWT payload shape: `{ id: string, email: string, role: string }`
- **No login endpoint exists yet** — Session 2 should build `POST /api/admin/auth/login` that bcrypt-checks password, returns signed JWT
- `req.user` is typed via the `declare global namespace Express` block in `middleware/auth.ts`

### Image uploads
- Files are saved to `/tmp/kb_uploads/<uuid>.<ext>` with gcs_path storing the full local path
- The field is named `gcs_path` intentionally — it will point to Google Cloud Storage URIs in production
- Multer is scoped to the image upload route only (not global middleware)

### Stock adjustment
- `POST /api/admin/products/:id/stock-adjust` uses `SELECT ... FOR UPDATE` (row lock) to prevent race conditions
- Always writes to `inventory_log` with `change_type = 'manual_adjustment'`
- Stock cannot go below 0 — returns 400 with `INSUFFICIENT_STOCK`

### Slug/SKU generation
- `uniqueProductSlug(base, excludeId?)` — appends `-2`, `-3` etc. until unique
- `autoSku(name)` — format `KB-[3-char name code]-[timestamp last 4 digits]`
- `ProductSchema.slug` and `ProductSchema.sku` are both optional — server auto-generates if absent

### What's NOT done (Session 2 scope)
- No admin login/JWT issuance endpoint
- No customer auth (register/login/session)
- No order creation or cart logic
- No coupon validation engine
- No storefront pages or admin UI
- No GCS integration (images saved to `/tmp` only)
- No settings admin API (read-write)
