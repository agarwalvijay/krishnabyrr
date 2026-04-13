# Session 3 Checkpoint — Customer Storefront: Product Display

## Status: COMPLETE

All tasks from the Session 3 spec are done.
TypeScript compiles clean on both `api/` and `apps/web/` (`tsc --noEmit` exits 0 for both).

---

## What Was Built

### Pending from Session 2 — Related Products (DONE)

**`api/src/db/migrations/006_related_products.sql`**
- `related_products(product_id, related_id, type, display_order, PRIMARY KEY)`
- `type` constrained to `'similar' | 'look'`, self-reference prevented by CHECK
- Migration ran successfully on `krishnabyrr_dev`

**`api/src/routes/admin/products.ts`** — three new endpoints added:
- `GET  /api/admin/products/:id/related` → returns `{ data: { similar[], look[] } }`
- `POST /api/admin/products/:id/related` → body `{ related_id, type }`, auto-assigns display_order
- `DELETE /api/admin/products/:id/related/:relatedId`

**`api/src/routes/products.ts`** — updated `GET /api/products/:slug`:
- Queries `related_products` table for `related_similar` (up to 4) and `related_look` (up to 3)
- Falls back to fabric-tag-based matching if `related_similar` is empty
- Added `second_image` subquery to `GET /api/products` list endpoint

**`api/src/app.ts`** — added static file serving:
- `app.use('/uploads', express.static('/tmp/kb_uploads'))`
- Allows Next.js `<Image>` to display locally uploaded product images via `http://localhost:3001/uploads/filename.jpg`

---

### TASK 0 — Next.js Setup

**`apps/web/package.json`** — removed `@krishnabyrr/shared`, added `axios@^1.7.2`, `clsx@^2.1.1`

**`apps/web/next.config.js`**
- `images.remotePatterns`: allows `localhost:3001/uploads/**` and all HTTPS
- `rewrites`: `/api/*` → `http://localhost:3001/api/*` (for client-side axios)

**`apps/web/tailwind.config.js`**
- All 11 `kb-*` colors
- `fontFamily.display: ['var(--font-cormorant)', 'Georgia', 'serif']`
- `fontFamily.sans: ['var(--font-inter)', 'system-ui', 'sans-serif']`
- `aspectRatio['3/4']`

**`apps/web/postcss.config.js`** — tailwindcss + autoprefixer

**`apps/web/app/globals.css`**
- `:root` CSS custom properties for all `--kb-*` tokens
- Product card hover effects: `.product-card-image`, `.primary-img`, `.secondary-img`, `.quick-view-btn`
- Mobile filter drawer styles: `.filter-drawer-backdrop`, `.filter-drawer`
- CSS scroll snap for PDP mobile gallery: `.image-scroll-snap`
- Badge utilities: `.badge-new`, `.badge-sale`, `.badge-stock-low`, `.badge-sold-out`
- Price utilities: `.price-sale`, `.price-mrp`

**`apps/web/app/layout.tsx`**
- Google Fonts via `next/font/google`: Cormorant Garamond (400, 600, italic) + Inter (400, 500)
- Font CSS variables: `--font-cormorant`, `--font-inter` on `<html>`
- Imports Header + Footer, wraps `{children}` in `<main>`

**`apps/web/lib/api.ts`**
- `ProductImage`, `TagItem`, `CategoryItem`, `ProductListItem`, `ProductDetail`, `PublicSettings`, `ApiMeta` types
- `imageUrl(gcsPath)` — converts local `/tmp/kb_uploads/` path to `http://localhost:3001/uploads/filename`
- `formatINR(n)` — `toLocaleString('en-IN')` with ₹ prefix
- `discountPct(mrp, salePrice)` — rounded percentage
- `getStockStatus(qty)` → `'in_stock' | 'low_stock' | 'out_of_stock'`
- `serverFetch<T>()` — Next.js `fetch()` with ISR revalidate or `cache: 'no-store'`
- `serverFetchList<T>()` — same but returns `{ data, meta }` with graceful 404 fallback
- `apiClient` — axios instance with `baseURL: '/api'`

**`apps/web/lib/constants.ts`**
- `DELHI_NCR_PINCODE_PREFIXES` — array of 3-digit prefixes
- `isDelNcrPincode(pincode)` — validates 6-digit string, checks prefix
- `getShippingZone(pincode)` → `'A' | 'B'`

---

### TASK 1 — Shared UI Components

**`apps/web/components/ui/PriceBadge.tsx`**
- Props: `mrp`, `sale_price?`, `size?: 'sm' | 'md' | 'lg'`
- Renders `₹[sale] ~~₹[mrp]~~ -N%` or just `₹[mrp]`

**`apps/web/components/ui/StockBadge.tsx`**
- Returns `null` for in_stock (≥4)
- Amber "Only N left!" pill for low_stock (1–3)
- Red "Sold Out" for out_of_stock (0)

**`apps/web/components/ui/Breadcrumb.tsx`**
- Props: `items [{ label, href? }]`
- Auto-prepends "Home /" separator chain

**`apps/web/components/ui/ProductCard.tsx`** (client component)
- Aspect ratio 3:4 image with Next.js `<Image fill>`
- Badge (NEW / SALE -N%) top-left
- Wishlist heart toggle (localStorage) top-right
- Sold Out overlay (semi-transparent + text) when stock_qty = 0
- "Only N left!" amber pill bottom-left when stock 1–3
- Secondary image crossfade on hover (CSS opacity 0→1, 400ms)
- Image scale(1.03) on hover (CSS transform 300ms)
- Quick View button slides up from image bottom on hover (desktop only via `@media hover:hover` in globals.css)
- `QuickViewModal` — bottom-sheet on mobile, centered 600px on desktop. Shows image, price, stock, short_desc, "View Full Details" link, Add to Cart stub (alert)

---

### TASK 2 — /shop Page

**`apps/web/app/shop/page.tsx`** (server component, `revalidate: 3600`)
- Reads `searchParams` for all filter params
- Fetches `/api/products?[filters]` with `cache: 'no-store'` (user-specific)
- Fetches `/api/categories` and `/api/tags` with 1-hour ISR
- Passes all data to `<ShopClient>`

**`apps/web/app/shop/ShopClient.tsx`** (client component)
- Desktop: 240px filter sidebar (sticky) + product grid
- Mobile: "Filters" button with active count badge, full-screen drawer from left (300ms slide)
- Filter groups (each collapsible): Search, Category, Fabric, Weave/Craft, Occasion, Color (swatch circles), Price Range (min/max inputs), In Stock Only toggle
- Active filter chips above grid with × remove buttons + "Clear all"
- Sort dropdown: Newest / Price Low–High / Price High–Low / Best Selling / Discount %
- All filter changes: `useRouter().push()` → triggers server component re-render
- "Load More" button: appends next page via `apiClient.get('/products?...')` without URL change
- Empty state: different messages for "no products" vs "no matches with filters"
- URL state resets products when URL changes (detects via `prevFilters !== lastFilters`)

---

### TASK 3 — /shop/[slug] Category Page

**`apps/web/app/shop/[slug]/page.tsx`** (server component, `revalidate: 3600`)
- `generateStaticParams`: fetches all active categories + children, returns `[{ slug }]`
- `generateMetadata`: sets title `[Category Name] — KrishnaByrr`
- Full-width header: teal background (or banner image with dark overlay), category name + description in white
- Breadcrumb: `Home > [Category Name]`
- Reuses `<ShopClient>` with `lockedCategory` prop — category filter hidden from sidebar

---

### TASK 4 — /product/[slug] PDP

**`apps/web/app/product/[slug]/page.tsx`** (server component, `revalidate: 3600`)
- `generateStaticParams`: all active products
- `generateMetadata`: title `[Name] | [Fabric] | KrishnaByrr`, OG image from primary_image

**`apps/web/app/product/[slug]/ProductGallery.tsx`** (client component)
- Large main image (aspect-square)
- Desktop: thumbnail strip (up to 5), gold border on selected
- Mobile: prev/next arrow buttons + dot indicators
- Touch swipe: touchstart/touchend with 50px threshold
- Video thumbnail → `VideoModal` (YouTube embed via iframe or `<video>` for other URLs)
- Share row: WhatsApp share + Copy Link (with "Copied!" feedback)

**`apps/web/app/product/[slug]/ProductActions.tsx`** (client component)
- Tracks recently viewed in `localStorage['kb_recently_viewed']` on mount
- Wishlist toggle: `localStorage['kb_wishlist']` array of IDs
- Add to Cart: shows inline toast "Cart coming soon! WhatsApp us to order" with link
- Sold Out: disabled grey button
- WhatsApp enquiry link: `wa.me/91[number]?text=...`

**`apps/web/app/product/[slug]/PincodeChecker.tsx`** (client component)
- 6-digit pincode input + Check button
- Client-side only (no API call): `isDelNcrPincode()` determines zone
- Zone A → "✓ Estimated delivery in 2–3 business days"
- Zone B → "✓ Estimated delivery in 5–7 business days"
- Shows shipping rate or "Free Shipping" based on `zone_a_free_above` threshold

**`apps/web/app/product/[slug]/RecentlyViewed.tsx`** (client component)
- Reads `localStorage['kb_recently_viewed']`, filters out current product
- Renders 2×4 grid. Hidden if < 2 items.

PDP layout:
- `lg:grid lg:grid-cols-2 lg:gap-12` — stacks on mobile
- Left column: `lg:sticky lg:top-24` — gallery stays in view while scrolling right column
- Right: name (Cormorant, H1), price + tax note, feature bullets, stock indicator, ProductActions, PincodeChecker, accordion sections (Description, Care, Shipping & Exchange)
- Below: You May Also Like (4 cards, horizontal scroll on mobile), Complete The Look (3 cards), RecentlyViewed

---

### TASK 5 — Navigation

**`apps/web/components/layout/Header.tsx`** (client component)
- 64px sticky header, white, 1px border-bottom
- Logo: `KrishnaByrr` display font, `--kb-teal`
- Desktop: Shop, About links (center); Search, Cart (badge 0), Account icons (right)
- Mobile: logo + cart + hamburger. Hamburger opens dropdown with Shop/About/Account links

**`apps/web/components/layout/Footer.tsx`**
- `--kb-charcoal` background, white text
- Copyright + "Handcrafted with ♥ in India"
- Nav links: Shop · About · Contact · Exchange Policy

---

### TASK 6 — Homepage

**`apps/web/app/page.tsx`** (server component, `revalidate: 3600`)
- Hero: 400px tall, `--kb-teal` background, decorative circles
  - "KrishnaByrr" display font, large + white
  - "Handcrafted Indian Ethnic Wear" sub-heading
  - "Shop Now →" button → `/shop`
- New Arrivals section: 8 products from `GET /api/products?sort=newest&limit=8`
  - `grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`
- Value props row: 3 icons (Handwoven / Ships Across India / Easy Exchange)

---

## All Files Created / Modified

```
api/src/db/migrations/
  006_related_products.sql           [NEW]

api/src/
  app.ts                             [MODIFIED] — added /uploads static serving
  routes/products.ts                 [MODIFIED] — second_image, related_similar/look
  routes/admin/products.ts           [MODIFIED] — 3 related product endpoints

apps/web/
  package.json                       [MODIFIED] — removed shared dep, added axios + clsx
  next.config.js                     [NEW]
  tailwind.config.js                 [NEW]
  postcss.config.js                  [NEW]
  app/
    globals.css                      [NEW]
    layout.tsx                       [NEW]
    page.tsx                         [NEW]
    shop/
      page.tsx                       [NEW]
      ShopClient.tsx                 [NEW]
      [slug]/
        page.tsx                     [NEW]
    product/
      [slug]/
        page.tsx                     [NEW]
        ProductGallery.tsx           [NEW]
        ProductActions.tsx           [NEW]
        PincodeChecker.tsx           [NEW]
        RecentlyViewed.tsx           [NEW]
  components/
    ui/
      ProductCard.tsx                [NEW]
      PriceBadge.tsx                 [NEW]
      StockBadge.tsx                 [NEW]
      Breadcrumb.tsx                 [NEW]
    layout/
      Header.tsx                     [NEW]
      Footer.tsx                     [NEW]
  lib/
    api.ts                           [NEW]
    constants.ts                     [NEW]
```

---

## Deviations from Spec

1. **`images.remotePatterns` instead of `images.domains`** — `domains` is deprecated in Next.js 14. `remotePatterns` is the correct API. Functionally equivalent.

2. **Product Card `isNew` logic** — spec says "show NEW when no discount". Implemented as: show SALE badge when `hasSale`, show NEW otherwise. This matches the spec intent for the badge.

3. **`free_shipping_threshold` key** — spec mentioned this key but the actual DB/settings has `zone_a_free_above` and `zone_b_free_above`. Used the actual key names.

4. **Load More does not update URL** — spec says "URL state: all filters reflected in URL search params" but doesn't explicitly say pagination must be in URL for Load More. Implemented as: filters/sort in URL, Load More is client-side append. This gives better UX while keeping filter shareability.

5. **Related products on PDP** — If `related_similar` is empty AND there's no same-fabric fallback (no tags), the section is hidden (not an error state).

---

## Three Manual Verification Steps

1. **PDP + Pincode check (catches: settings, types, imageUrl, PincodeChecker)**
   ```
   # Start both servers
   cd api && npm run dev         # terminal 1
   cd apps/web && npm run dev    # terminal 2
   
   # Open: http://localhost:3000/product/maheshwari-silk-ivory-bel-buti
   # Check: page loads, breadcrumb shows, price renders with ₹
   # Enter 110001 → should show "Zone A: 2–3 business days"
   # Enter 400001 → should show "Zone B: 5–7 business days"
   # Enter 12345 → should show "Please enter a valid 6-digit pincode"
   ```

2. **Shop page filters (catches: URL state, ShopClient, API proxy)**
   ```
   # Open: http://localhost:3000/shop
   # Select a fabric filter → URL updates, products reload
   # Click "Clear All Filters" → URL clears, all products show
   # Resize to 375px width → filter drawer button appears
   # Click "Filters" → drawer slides in from left
   ```

3. **Mobile layout (catches: overflow, grid, sticky gallery)**
   ```
   # DevTools → 375px × 812px (iPhone SE)
   # http://localhost:3000 → hero full-width, 2-col product grid, no overflow
   # http://localhost:3000/product/maheshwari-silk-ivory-bel-buti
   #   → gallery full-width, swipe between images works, 
   #   → info stacks below gallery (not beside)
   #   → no horizontal overflow
   ```

---

## What Session 4 Must Know

1. **Cart not yet built** — ProductCard, ProductActions, and the Add to Cart button all show a toast stub: "Cart coming soon! WhatsApp us to order." The actual cart (`orders` flow) is Session 4's primary work.

2. **No seed active products** — All seeded products have `status='draft'`. To test the storefront with real data, run:
   ```sql
   UPDATE products SET status='active';
   ```
   or activate them via the admin portal at `http://localhost:5173`.

3. **`imageUrl()` function** — always call this before passing a `gcs_path` string to `next/image`. It converts `/tmp/kb_uploads/file.jpg` → `http://localhost:3001/uploads/file.jpg`. In production, `gcs_path` will be a full HTTPS URL and this function will return it unchanged.

4. **Related Products Tab 7 in ProductForm** — The admin ProductForm Tab 7 is still a placeholder. The `related_products` table now exists (migration 006) and the admin endpoints are live. Session 4 or 5 should wire up the admin UI for this tab.

5. **Wishlist and Recently Viewed are localStorage-only** — Session 7 will wire wishlist to the API (`wishlist_items` table exists from migration 002). The localStorage key is `kb_wishlist` (array of product IDs) and `kb_recently_viewed` (array of `{ id, name, slug, primary_image, mrp, sale_price }`).

6. **PublicSettings values from seed** — the seeded settings are:
   - `zone_a_rate: 80`, `zone_a_free_above: 999`
   - `zone_b_rate: 120`, `zone_b_free_above: 1499`
   - `exchange_window_days: 7`
   - `whatsapp_number: ""` (empty — update via admin Settings page when built)

7. **The `@/` path alias** — `tsconfig.json` has `"paths": { "@/*": ["./*"] }` so all imports use `@/components/...`, `@/lib/...`, etc.
