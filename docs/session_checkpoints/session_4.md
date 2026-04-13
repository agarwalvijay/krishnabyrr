# Session 4 Checkpoint — Cart & Coupon Engine

## Status: COMPLETE

All Session 4 tasks are done.
TypeScript compiles clean on both `api/` and `apps/web/` (`tsc --noEmit` exits 0 for both).
22/22 coupon engine unit tests pass.

---

## What Was Built

### TASK 1 — Cart Data Model (Redis)

**`api/src/services/cart.ts`** [NEW]
- Interfaces: `CartItem`, `CouponSnapshot`, `CartData`
- Redis keys: `cart:{sessionId}` (30-day TTL), `cart-reserve:{productId}:{sessionId}` (15-min TTL)
- Functions: `generateSessionId()`, `emptyCart()`, `getCart()`, `setCart()`, `clearCart()`
- Stock reserve helpers: `setReserve()`, `clearReserve()`, `clearAllReserves()`

---

### TASK 2 — Cart API Endpoints

**`api/src/routes/cart.ts`** [NEW]

All endpoints use the `kb_session` httpOnly cookie (created on first request):
- `GET  /api/cart` — Returns `{ data: { cart, totals } }`. Refreshes live `maxQty` from DB. Calculates subtotal → discount → shipping (zone-based) → GST (5%) → total.
- `POST /api/cart/items` — Body: `{ productId, quantity }`. Validates product active + stock. Merges if item exists.
- `PUT  /api/cart/items/:itemId` — Body: `{ quantity }`. Quantity=0 removes item. Clamps to live stock.
- `DELETE /api/cart/items/:itemId` — Removes item, clears reserve key.
- `DELETE /api/cart` — Clears all reserves and the cart key.
- `POST /api/cart/pincode` — Body: `{ pincode }`. Sets `zone: 'A' | 'B'` based on Delhi NCR prefix list.
- `POST /api/cart/coupon` — Validates via coupon engine, stores snapshot on cart.
- `DELETE /api/cart/coupon` — Removes coupon from cart.

**`api/src/app.ts`** [MODIFIED]
- Added `import cartRouter from './routes/cart'`
- Mounted at `app.use('/api/cart', cartRouter)`

Cookie: `kb_session`, httpOnly, sameSite=lax, 30-day maxAge, secure in production.

---

### TASK 3 — Coupon Engine

**`api/src/services/coupon-engine.ts`** [NEW]

9 ordered validation rules against the actual `coupons` table schema:
1. `NOT_FOUND` — code doesn't exist
2. `INACTIVE` — `is_active = false`
3. `NOT_YET_VALID` — `valid_from` is in the future
4. `EXPIRED` — `valid_until` is in the past
5. `MAX_USES_REACHED` — `current_use_count >= max_uses_total`. Uses Redis INCR (`coupon-check:{id}`, 10s TTL) as lightweight gate + SELECT FOR UPDATE in a transaction for authoritative check.
6. `MAX_PER_CUSTOMER_REACHED` — queries `coupon_redemptions` table by `coupon_id` + `customer_id` or `guest_email`
7. `MIN_ORDER_NOT_MET` — `cartSubtotal < min_order_value`
8. `CUSTOMER_NOT_ELIGIBLE` — `customer_eligibility = 'SPECIFIC'` and customerId not in `customer_ids[]`
9. `FIRST_ORDER_ONLY_VIOLATED` — `customer_eligibility = 'FIRST_ORDER'` and customer has prior orders

Discount calculation:
- `percent`: `round(subtotal * value / 100)`
- `flat`: `min(value, subtotal)` (clamped, no negative totals)
- `free_shipping`: `discount_amount = 0` (shipping waived at order creation)

`formatINR` uses `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.

---

### TASK 4 — Coupon Engine Tests

**`api/src/services/coupon-engine.test.ts`** [NEW]
- 22 tests, all passing
- Covers: every validation rule (happy + failure), race condition (5 concurrent calls all fail at limit), clamp behavior, case-insensitive lookup, free_shipping zero discount, percent/flat/free_shipping types

---

### TASK 5 — Cart Frontend

**`apps/web/components/cart/CartContext.tsx`** [NEW]
- React context + provider
- State: `cart`, `totals`, `loading`, `open`
- Actions: `openCart`, `closeCart`, `refreshCart`, `addItem`, `updateItem`, `removeItem`, `applyCoupon`, `removeCoupon`, `clearCart`
- Fetches `GET /api/cart` on mount (deduped with `useRef`)

**`apps/web/components/cart/CartDrawer.tsx`** [NEW]
- Slide-in from right: 420px on desktop, full-width on mobile
- Backdrop (closes on click) + z-50 drawer panel
- Items list with `CartItemRow` sub-component: image, name, SKU, price, qty controls (−/+), Remove button, low stock warning
- Coupon input: text field + Apply button → shows error or applied coupon chip with Remove
- Order summary: subtotal, discount (green), shipping (with free shipping note), GST (5%), total
- Footer: "Proceed to Checkout" → `/checkout`, small policy note
- Body scroll locked while drawer is open

**`apps/web/components/cart/AddToCartButton.tsx`** [NEW]
- 4 visual states: `idle` / `loading` / `success` / `error`
- `loading`: teal/70 with spinner SVG + "Adding…"
- `success`: green + "Added!" → auto-resets to idle after 2.5s, opens cart drawer
- `error`: red + "Try again" → auto-resets after 2.5s
- `soldOut` (stockQty ≤ 0): disabled grey "Sold Out" button (no state machine)
- Props: `productId`, `stockQty`, `quantity?=1`, `className?`, `fullWidth?=true`, `label?='Add to Cart'`

---

### TASK 6 — Wire AddToCartButton into Storefront

**`apps/web/lib/api.ts`** [MODIFIED]
- Added `CartItem`, `CouponSnapshot`, `CartData`, `CartTotals` interfaces
- Added `withCredentials: true` to axios instance (required for httpOnly cookie forwarding)

**`apps/web/app/layout.tsx`** [MODIFIED]
- Wrapped `<Header>`, `<main>`, `<Footer>` in `<CartProvider>`

**`apps/web/components/layout/Header.tsx`** [MODIFIED]
- Imports `useCart()` — shows live item count badge on cart icon
- Cart icon is now a `<button onClick={openCart}>` (not a link)
- Badge: hidden when count=0, shows count up to "99+" capped
- Renders `<CartDrawer />` after the `<header>` element (z-50)

**`apps/web/app/product/[slug]/ProductActions.tsx`** [MODIFIED]
- Removed: `addToCart` stub + toast
- Added: `<AddToCartButton productId={product.id} stockQty={product.stock_qty} />`

**`apps/web/components/ui/ProductCard.tsx`** [MODIFIED]
- Added: `import AddToCartButton`
- Replaced: `alert()` stub button in QuickViewModal with `<AddToCartButton>`

---

## All Files Created / Modified

```
api/src/
  services/
    cart.ts                    [NEW]
    coupon-engine.ts           [NEW]
    coupon-engine.test.ts      [NEW]
  routes/
    cart.ts                    [NEW]
  app.ts                       [MODIFIED] — mounted /api/cart

apps/web/
  lib/api.ts                   [MODIFIED] — CartItem/CartData/CartTotals types + withCredentials
  app/layout.tsx               [MODIFIED] — CartProvider wrapper
  components/
    cart/
      CartContext.tsx           [NEW]
      CartDrawer.tsx            [NEW]
      AddToCartButton.tsx       [NEW]
    layout/
      Header.tsx               [MODIFIED] — live badge + openCart + CartDrawer
    ui/
      ProductCard.tsx          [MODIFIED] — AddToCartButton in QuickViewModal
  app/product/[slug]/
    ProductActions.tsx         [MODIFIED] — AddToCartButton replaces stub
```

---

## Schema Notes (actual DB vs spec)

The `coupons` table has these column names (different from spec):
- `current_use_count` (spec called it `current_uses`)
- `min_order_value` (spec called it `min_order_amount`)
- No `first_order_only` boolean — instead `customer_eligibility VARCHAR(30)` with values `'ALL'`, `'SPECIFIC'`, `'FIRST_ORDER'`
- Per-customer usage tracked in `coupon_redemptions` table (not `orders`)

---

## Three Manual Verification Steps

1. **Add to cart from PDP**
   ```
   cd api && npm run dev         # terminal 1
   cd apps/web && npm run dev    # terminal 2

   # First: activate products
   psql krishnabyrr_dev -c "UPDATE products SET status='active';"

   # Open: http://localhost:3002/product/maheshwari-silk-ivory-bel-buti
   # Click "Add to Cart" → button shows spinner → "Added!" → cart drawer slides in from right
   # Drawer shows item, qty controls, subtotal, GST
   # Click − to decrease qty → + to increase
   # Click Remove → item disappears, empty state shows
   ```

2. **Apply coupon in cart drawer**
   ```
   # Insert a test coupon:
   psql krishnabyrr_dev -c "INSERT INTO coupons (code, type, value, is_active) VALUES ('SAVE100', 'flat', 100, true);"

   # Add any product to cart → open drawer
   # Type SAVE100 in coupon field → Apply
   # Discount line appears in summary: "Discount (SAVE100) −₹100"
   # Try invalid code → error message shown inline
   # Click Remove on applied coupon → coupon removed
   ```

3. **Cart badge and Quick View**
   ```
   # Open: http://localhost:3002/shop
   # Hover a product card → "Quick View" button appears
   # Click Quick View → modal opens
   # Click "Add to Cart" in modal → spinner → "Added!" → cart drawer opens
   # Header cart icon now shows badge with item count
   # Refresh page → badge persists (cookie survives reload)
   ```

---

## What Session 5 Must Know

1. **No checkout page yet** — "Proceed to Checkout" button links to `/checkout` which doesn't exist. Session 5 builds the checkout + order creation flow.

2. **`current_use_count` is NOT auto-incremented by the cart** — The coupon engine only validates. The order creation flow (Session 5) must `UPDATE coupons SET current_use_count = current_use_count + 1` and `INSERT INTO coupon_redemptions` atomically with the order creation.

3. **Cart `customerId` is always null** — Auth (Session 6) will set `cart.customerId`. Until then, `MAX_PER_CUSTOMER_REACHED` and `FIRST_ORDER_ONLY_VIOLATED` only work for guests who provide an email.

4. **Shipping zone set via `POST /api/cart/pincode`** — The frontend `PincodeChecker` component is currently client-side only (no API call). The cart endpoint exists and is ready; Session 5 or the checkout flow should wire the pincode input to `POST /api/cart/pincode` so shipping is calculated in the order total.

5. **Stock reserve keys expire in 15 minutes** — The `cart-reserve:{productId}:{sessionId}` keys are informational only in Phase 1 (no hard inventory hold). Session 5 should reference these during order creation to detect stock changes between add-to-cart and checkout.

6. **Admin `Related Products` tab** — ProductForm Tab 7 is still a placeholder (noted in Session 3). The endpoints exist; wire up the UI when convenient.
