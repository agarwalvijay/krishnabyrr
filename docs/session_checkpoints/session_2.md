# Session 2 Checkpoint — Admin Portal UI

## Status: COMPLETE

All 9 tasks from the Session 2 spec are done. TypeScript compiles cleanly (`tsc --noEmit` exits 0).

---

## What Was Built

### Task 1 — Login API endpoint
- `POST /api/admin/auth/login` — bcrypt compare with timing-attack protection (DUMMY_HASH)
- Returns `{ token, user: { id, email, name, role } }`
- `GET /api/admin/auth/me` — validates Bearer token, returns user
- `POST /api/admin/auth/logout` — stateless 200

### Task 2 — Vite + React SPA setup
- `apps/admin/package.json` — deps: react, react-dom, react-router-dom, @tanstack/react-query v5, react-hook-form, @hookform/resolvers, zod, axios, react-hot-toast, react-dropzone
- `apps/admin/vite.config.ts` — `@vitejs/plugin-react`, proxy `/api` → `http://localhost:3001`
- `apps/admin/tailwind.config.js` — all 11 kb-* custom colors
- `apps/admin/postcss.config.js`
- `apps/admin/index.html`
- Dev server runs on **port 5173** (not 3001 — conflict with API)

### Task 3 — Design tokens + global CSS
- `apps/admin/src/index.css` — `@tailwind base/components/utilities`
- `:root` block with all `--kb-*` CSS custom properties:
  - `--kb-teal: #1A6B6B`, `--kb-blue: #2D5F8A`, `--kb-gold: #C9952A`
  - `--kb-emerald: #2D7A4F`, `--kb-iridescent: #4A9B8E`, `--kb-cream: #FAF7F2`
  - `--kb-charcoal: #2C2C2C`, `--kb-muted: #8A8A8A`, `--kb-error: #C0392B`
  - `--kb-success: #27AE60`, `--kb-amber: #E67E22`
- Utility classes: `.btn-primary`, `.btn-secondary`, `.badge`, `.card`, `.slide-over`
- Input styles: `input`, `select`, `textarea` global styles with focus ring kb-teal
- Stock badge classes: `.stock-high` (green), `.stock-low` (amber), `.stock-zero` (red)

### Task 4 — Auth context + Login page
- `apps/admin/src/contexts/AuthContext.tsx`
  - On mount: validates token via `GET /api/admin/auth/me`
  - `login(email, password)` → posts, stores token in `localStorage` key `kb_admin_token`, navigates to `/products`
  - `logout()` → clears token, navigates to `/login`
- `apps/admin/src/pages/Login/index.tsx`
  - Centered 400px card, peacock SVG logo, teal accent bar at top
  - react-hook-form + Zod validation, spinner during submit

### Task 5 — Layout shell
- `apps/admin/src/components/Layout/AdminLayout.tsx`
  - 240px white sidebar with right border, inline SVG icons for 8 nav items
  - Active nav: left border 3px `--kb-teal` + teal-50 background
  - Role badge (ROLE_LABELS map), user footer with sign out
  - Top header: title + optional `action` slot
  - Scrollable main content area

### Task 6 — Product list
- `apps/admin/src/pages/Products/ProductList.tsx`
  - Filters: debounced search (400ms via `useDebounce`), status dropdown, stock filter dropdown, Clear Filters link
  - Bulk actions bar: activate/deactivate/archive (shown when ≥1 row selected)
  - Table: checkbox, 48×48 thumbnail, name+SKU, first_category, PriceCell (sale_price + MRP struck through + % off badge), StockCell (color-coded badge), StatusBadge, Edit/Stock buttons
  - Empty states: no products vs no matches
  - Pagination: page number buttons
  - StockAdjustModal triggered inline from table

### Task 7 — Product form (7 tabs)
- `apps/admin/src/pages/Products/ProductForm.tsx`
  - react-hook-form with `zodResolver`, `shouldUnregister: false`
  - All 7 tabs CSS-hidden (not unmounted) — preserves field values
  - **Tab 1 — Details**: name, sku (auto-gen hint), short_desc (char counter/150), description (textarea), care_instr
  - **Tab 2 — Media**: react-dropzone for images (5MB, immediate upload to `POST /:id/images`); ImageGrid with HTML5 drag-to-reorder + delete with confirm + primary badge; warning banner if product is new (no ID yet); video_url
  - **Tab 3 — Pricing**: mrp, sale_price (live % discount), cost_price (muted "internal"), gst_rate dropdown (5%/12%), hsn_code, live price preview card
  - **Tab 4 — Inventory**: stock_qty, low_stock_threshold, oos_behavior radio (allow/block/pre-order)
  - **Tab 5 — Categorization**: MultiCheckList for categories (indented tree), tags grouped by group_name (fabric/weave/occasion/color — color shows hex swatches), collections
  - **Tab 6 — SEO**: meta_title (counter/60), meta_desc (counter/160), slug (warning on edit mode, live preview URL)
  - **Tab 7 — Related**: placeholder banner ("requires DB migration for relationship table")
  - Sticky footer: Back + Save; top-right header: status toggle
  - On save: POST/PUT product, then 3 more PUT requests to sync categories/tags/collections

### Task 8 — Stock adjust modal
- `apps/admin/src/components/StockAdjustModal.tsx`
  - Backdrop + centered modal
  - Current stock shown with color-coding
  - Integer adjustment input, live preview "New stock will be: N"
  - Blocks submit if new stock < 0
  - Reason dropdown: New Stock Received / Damaged / Manual Correction / Exchange Return
  - Calls `POST /api/admin/products/:id/stock-adjust`
  - Invalidates `admin-products` and `admin-product/:id` queries on success

### Task 9 — Categories + Collections pages

#### `apps/admin/src/pages/Categories/index.tsx`
- Fetches flat list from `GET /api/admin/categories`, builds tree client-side
- Table renders tree with depth-based indentation (24px per level, chevron icon for children)
- Columns: Name (indented), Slug (monospace badge), Products count, Active toggle, Edit button
- Active toggle: optimistic PUT with toast; tracks `toggling` state per row
- Slide-over panel for create/edit:
  - Fields: name*, slug (auto-gen note), parent category dropdown, description, sort_order, active toggle
  - Slug preview: `/category/[slug]`
  - Delete zone: disabled with count message if products assigned; confirmation dialog otherwise
  - `isDirty` guard on Save button for edit mode

#### `apps/admin/src/pages/Collections/index.tsx`
- Fetches flat list from `GET /api/admin/collections`
- Table columns: Name, Slug, Products count, Active toggle, Homepage toggle (gold), Edit button
- Homepage toggle uses gold color (`bg-kb-gold`) to distinguish from Active toggle
- "Reorder Homepage" button (only shown when ≥1 homepage collection exists)
  - Expands drag-to-reorder panel above table
  - `HomepageReorderList`: HTML5 drag API, saves `homepage_order` (1-based index) for each collection on drop
- Slide-over panel for create/edit:
  - Fields: name*, slug (auto-gen note), description, active toggle, homepage toggle, homepage_order (shown conditionally when show_on_homepage is checked)
  - Product count note (read-only; manage from Product form)
  - Delete zone with confirmation dialog

---

## Files Created / Modified This Session

```
apps/admin/
  index.html
  vite.config.ts
  tailwind.config.js
  postcss.config.js
  package.json                           (port fixed to 5173)
  src/
    index.css
    main.tsx
    App.tsx
    lib/
      api.ts
      format.ts
      hooks.ts
    contexts/
      AuthContext.tsx
    components/
      Layout/AdminLayout.tsx
      StockAdjustModal.tsx
    pages/
      Login/index.tsx
      Products/
        ProductList.tsx
        ProductForm.tsx
      Categories/index.tsx
      Collections/index.tsx
```

---

## Key Decisions / Constraints

- **Port**: Admin dev server on 5173, API on 3001. Vite proxy: `/api` → `http://localhost:3001`.
- **No `@krishnabyrr/shared` in admin**: Removed that dep to avoid workspace resolution issues in Vite. Types are defined locally in each page/component.
- **Tab isolation**: All 7 tabs in ProductForm are rendered but CSS-hidden (`hidden`), not conditionally mounted. Combined with `shouldUnregister: false`, this means all field values persist across tab switches and all fields are validated on submit.
- **Image upload requires existing product ID**: New products must be saved first (Tab 1) before images can be uploaded (Tab 2). A warning banner is shown on Tab 2 when `isNew === true`.
- **Related Products (Tab 7)**: Placeholder. Requires a new DB migration for a `related_products` table — deferred to Session 3.
- **Category tree**: Built client-side from flat API response using parent_id. No backend tree endpoint needed.
- **Homepage reorder**: Saves `homepage_order` as 1-based index immediately on drag-drop (no "Apply" button needed).
- **Bulk actions**: Three actions — activate (set status='active'), deactivate (set status='draft'), archive (set status='archived'). Batch via sequential PUTs, invalidates query on completion.

---

## Verify Commands

```bash
# Install deps (already done)
npm install -w apps/admin

# TypeScript check (passes clean)
cd apps/admin && npx tsc --noEmit

# Start dev servers
# Terminal 1:
cd api && npm run dev           # port 3001

# Terminal 2:
cd apps/admin && npm run dev    # port 5173 → open http://localhost:5173

# Login credentials (from seed):
# admin@krishnabyrr.com / KBAdmin2026!
# ops@krishnabyrr.com / KBAdmin2026!
# content@krishnabyrr.com / KBAdmin2026!
```

---

## What Session 3 Must Know

1. **Related Products tab** needs a `related_products` table: `product_id UUID, related_id UUID, PRIMARY KEY (product_id, related_id)`. Migration goes in `api/src/db/migrations/006_related_products.sql`. The ProductForm Tab 7 component is a placeholder waiting for this.

2. **Admin routes not yet built**:
   - `GET /api/admin/categories` (list) — used by Categories page and ProductForm Tab 5
   - `GET /api/admin/collections` (list) — used by Collections page and ProductForm Tab 5
   - These are in `api/src/routes/admin/categories.ts` and `collections.ts` already from Session 1.

3. **Orders page** (`apps/admin/src/pages/Orders/`) — not yet built. Needs list + detail view + status change + exchange request management.

4. **Coupons page** (`apps/admin/src/pages/Coupons/`) — not yet built. Needs list + create/edit form.

5. **Customers page** (`apps/admin/src/pages/Customers/`) — not yet built. Read-only list + detail.

6. **Settings page** (`apps/admin/src/pages/Settings/`) — not yet built. Key-value settings editor.

7. **Dashboard page** (`apps/admin/src/pages/Dashboard/`) — not yet built. Summary stats (revenue, orders, low-stock alerts).

8. **The `ComingSoon` component** in `App.tsx` is used as a placeholder for all pages not yet built — Orders, Coupons, Customers, Settings, Dashboard.

9. **Stock color rule**: green (`stock-high`) = qty ≥ 4, amber (`stock-low`) = qty 1–3, red (`stock-zero`) = qty 0. Defined in `src/lib/format.ts` as `stockColorClass()` and `stockLabel()`.

10. **Indian number formatting**: Always use `formatINR(n)` from `src/lib/format.ts` — calls `toLocaleString('en-IN')` with ₹ prefix. Never use raw `.toFixed()` for prices.
