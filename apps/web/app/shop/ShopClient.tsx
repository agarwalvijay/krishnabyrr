'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductCard from '@/components/ui/ProductCard';
import { apiClient, imageUrl, BANNER_HEIGHT_PX, type BannerHeight, type ProductListItem, type CategoryItem, type TagItem, type BadgeItem, type ApiMeta } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TagGroupData {
  label: string;
  is_filter: boolean;
  tags: TagItem[];
}

interface Filters {
  q?: string;
  category?: string;
  collection?: string;
  price_min?: string;
  price_max?: string;
  in_stock?: string;
  sort?: string;
  [key: string]: string | undefined; // tag group name → selected value
}

interface Props {
  initialProducts: ProductListItem[];
  initialMeta: ApiMeta;
  categories: CategoryItem[];
  tags: Record<string, TagGroupData>;
  filterBadges: BadgeItem[];
  currentFilters: Filters;
  /** When set, the category filter is locked to this slug (category page) */
  lockedCategory?: { name: string; slug: string };
  /** When set, show a collection heading and treat collection as a removable filter */
  lockedCollection?: { name: string; slug: string; description?: string | null; banner_img?: string | null; banner_height?: string };
}

// ── Filter sidebar ────────────────────────────────────────────────────────────

interface FilterGroupProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function FilterGroup({ title, children, defaultOpen = true }: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 py-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-sm font-semibold text-kb-charcoal mb-3"
      >
        {title}
        <svg
          className={`w-4 h-4 text-kb-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShopClient({
  initialProducts,
  initialMeta,
  categories,
  tags,
  filterBadges,
  currentFilters,
  lockedCategory,
  lockedCollection,
}: Props) {
  const router     = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Local state for "Load More"
  const [products, setProducts] = useState<ProductListItem[]>(initialProducts);
  const [meta, setMeta]         = useState<ApiMeta>(initialMeta);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset products when filters change (URL change triggers server re-render → new initialProducts)
  const prevFiltersRef = JSON.stringify(currentFilters);
  const [lastFilters, setLastFilters] = useState(prevFiltersRef);
  if (prevFiltersRef !== lastFilters) {
    setLastFilters(prevFiltersRef);
    setProducts(initialProducts);
    setMeta(initialMeta);
  }

  // ── URL update helpers ──────────────────────────────────────────────────────

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // Reset page on filter change
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }, [router, searchParams]);

  // Toggle a single value within a comma-separated multi-select tag group param
  const toggleTagValue = useCallback((groupName: string, value: string) => {
    const current = searchParams.get(groupName)?.split(',').filter(Boolean) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(groupName, next.length > 0 ? next.join(',') : undefined);
  }, [searchParams, updateFilter]);

  const clearAll = useCallback(() => {
    const keep = lockedCategory ? `?category=${lockedCategory.slug}` : '';
    startTransition(() => {
      router.push(keep || '/shop', { scroll: false });
    });
  }, [router, lockedCategory]);

  // ── Active filter count ─────────────────────────────────────────────────────

  const tagGroupNames = Object.keys(tags);
  const activeTagFilters = tagGroupNames.filter((g) => currentFilters[g]);

  const activeFilterCount = [
    currentFilters.q,
    !lockedCategory && currentFilters.category,
    currentFilters.collection,
    currentFilters.badge,
    ...activeTagFilters,
    currentFilters.price_min,
    currentFilters.price_max,
    currentFilters.in_stock,
  ].filter(Boolean).length;

  // ── Load More ───────────────────────────────────────────────────────────────

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = meta.page + 1;
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(nextPage));
      const res = await apiClient.get<{ data: ProductListItem[]; meta: ApiMeta }>(
        `/products?${params.toString()}`
      );
      setProducts(prev => [...prev, ...res.data.data]);
      setMeta(res.data.meta);
    } catch {
      // fail silently
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Filter sidebar content ──────────────────────────────────────────────────

  // Sorted filter groups (is_filter = true only)
  const filterGroups = Object.entries(tags)
    .filter(([, g]) => g.is_filter && g.tags.length > 0);

  const SORT_OPTIONS = [
    { value: 'newest',      label: 'Newest First' },
    { value: 'price_asc',   label: 'Price: Low to High' },
    { value: 'price_desc',  label: 'Price: High to Low' },
    { value: 'discount_pct', label: 'Best Discount' },
  ];

  const filterContent = (
    <div className="text-sm">
      {/* Sort By */}
      <FilterGroup title="Sort By">
        {SORT_OPTIONS.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sort"
              value={opt.value}
              checked={(currentFilters.sort ?? 'newest') === opt.value}
              onChange={() => updateFilter('sort', opt.value === 'newest' ? undefined : opt.value)}
              className="accent-kb-teal"
            />
            <span className="text-kb-charcoal">{opt.label}</span>
          </label>
        ))}
      </FilterGroup>

      {/* Search */}
      <div className="pb-4 border-b border-gray-100">
        <input
          type="search"
          placeholder="Search products…"
          defaultValue={currentFilters.q ?? ''}
          onChange={e => {
            const val = e.target.value;
            clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => updateFilter('q', val || undefined), 400);
          }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kb-teal"
        />
      </div>

      {/* Category (only when not locked) — recursive tree with indentation */}
      {!lockedCategory && categories.length > 0 && (
        <FilterGroup title="Category">
          {(function renderTree(nodes: CategoryItem[], depth: number): React.ReactNode {
            return nodes.map((cat) => (
              <div key={cat.id}>
                <label
                  className="flex items-center gap-2 cursor-pointer"
                  style={{ paddingLeft: depth * 14 }}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.slug}
                    checked={currentFilters.category === cat.slug}
                    onChange={() => updateFilter('category', cat.slug)}
                    className="accent-kb-teal"
                  />
                  <span className={depth === 0 ? 'text-kb-charcoal font-medium' : 'text-kb-charcoal'}>
                    {cat.name}
                  </span>
                </label>
                {cat.children && cat.children.length > 0 && renderTree(cat.children, depth + 1)}
              </div>
            ));
          })(categories, 0)}
          {currentFilters.category && (
            <button
              onClick={() => updateFilter('category', undefined)}
              className="text-xs text-kb-teal underline mt-1"
            >
              Clear
            </button>
          )}
        </FilterGroup>
      )}

      {/* Dynamic tag group filters */}
      {filterGroups.map(([groupName, groupData]) => {
        const isColorGroup = groupName === 'color';
        const selected = currentFilters[groupName]?.split(',').filter(Boolean) ?? [];
        return (
          <FilterGroup key={groupName} title={groupData.label}>
            {isColorGroup ? (
              <div className="flex flex-wrap gap-2">
                {groupData.tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTagValue(groupName, tag.value)}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
                      selected.includes(tag.value)
                        ? 'border-kb-teal bg-kb-teal/10 text-kb-teal font-medium'
                        : 'border-gray-200 hover:border-kb-teal'
                    }`}
                    title={tag.value}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10 flex-shrink-0"
                      style={{ backgroundColor: tag.hex_color ?? '#9CA3AF' }}
                    />
                    {tag.value}
                  </button>
                ))}
              </div>
            ) : (
              groupData.tags.map(tag => (
                <label key={tag.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(tag.value)}
                    onChange={() => toggleTagValue(groupName, tag.value)}
                    className="accent-kb-teal rounded"
                  />
                  <span className="text-kb-charcoal">{tag.value}</span>
                </label>
              ))
            )}
          </FilterGroup>
        );
      })}

      {/* Badge filters */}
      {filterBadges.length > 0 && (
        <FilterGroup title="Badges">
          <div className="flex flex-wrap gap-2">
            {filterBadges.map((badge) => {
              const selected = currentFilters.badge?.split(',').filter(Boolean) ?? [];
              const active = selected.includes(badge.name);
              return (
                <button
                  key={badge.id}
                  onClick={() => {
                    const next = active
                      ? selected.filter((v) => v !== badge.name)
                      : [...selected, badge.name];
                    updateFilter('badge', next.length > 0 ? next.join(',') : undefined);
                  }}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
                    active ? 'border-transparent font-medium' : 'border-gray-200 hover:border-kb-teal text-kb-charcoal'
                  }`}
                  style={active ? { backgroundColor: badge.hex_color, color: badge.text_color, borderColor: badge.hex_color } : undefined}
                >
                  {badge.name}
                </button>
              );
            })}
          </div>
        </FilterGroup>
      )}

      {/* Price range */}
      <FilterGroup title="Price Range">
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min ₹"
            defaultValue={currentFilters.price_min ?? ''}
            onBlur={e => updateFilter('price_min', e.target.value || undefined)}
            min={0}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-kb-teal"
          />
          <span className="text-kb-muted">–</span>
          <input
            type="number"
            placeholder="Max ₹"
            defaultValue={currentFilters.price_max ?? ''}
            onBlur={e => updateFilter('price_max', e.target.value || undefined)}
            min={0}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-kb-teal"
          />
        </div>
      </FilterGroup>

      {/* In Stock Only */}
      <div className="py-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-semibold text-kb-charcoal">In Stock Only</span>
          <div
            onClick={() => updateFilter('in_stock', currentFilters.in_stock === 'true' ? undefined : 'true')}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
              currentFilters.in_stock === 'true' ? 'bg-kb-teal' : 'bg-gray-200'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              currentFilters.in_stock === 'true' ? 'left-5' : 'left-0.5'
            }`} />
          </div>
        </label>
      </div>

      {/* Clear all */}
      {activeFilterCount > 0 && (
        <button
          onClick={clearAll}
          className="w-full py-2 text-sm text-kb-error border border-kb-error/30 rounded-lg hover:bg-kb-error/5 transition-colors mt-2"
        >
          Clear All Filters ({activeFilterCount})
        </button>
      )}
    </div>
  );

  // ── Active filter chips ─────────────────────────────────────────────────────

  const chips: Array<{ label: string; key: string; removeValue?: string }> = [
    currentFilters.q         ? { label: `Search: ${currentFilters.q}`, key: 'q' }                    : null,
    !lockedCategory && currentFilters.category ? { label: `Category: ${currentFilters.category}`, key: 'category' } : null,
    currentFilters.collection ? { label: `Collection: ${lockedCollection?.name ?? currentFilters.collection}`, key: 'collection' } : null,
    // Dynamic tag group chips — one chip per selected value
    ...Object.entries(tags)
      .flatMap(([groupName, groupData]) =>
        (currentFilters[groupName]?.split(',').filter(Boolean) ?? []).map((val) => ({
          label: `${groupData.label}: ${val}`,
          key: groupName,
          removeValue: val,
        }))
      ),
    currentFilters.price_min ? { label: `Min: ₹${currentFilters.price_min}`, key: 'price_min' }       : null,
    currentFilters.price_max ? { label: `Max: ₹${currentFilters.price_max}`, key: 'price_max' }       : null,
    currentFilters.in_stock === 'true' ? { label: 'In Stock Only', key: 'in_stock' }                  : null,
  ].filter(Boolean) as Array<{ label: string; key: string; removeValue?: string }>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Collection header — full banner if image set, text-only otherwise */}
      {lockedCollection && (() => {
        const bannerUrl   = lockedCollection.banner_img ? imageUrl(lockedCollection.banner_img) : null;
        const minHeight   = BANNER_HEIGHT_PX[(lockedCollection.banner_height as BannerHeight) ?? 'md'];
        return bannerUrl ? (
          <div
            className="relative flex flex-col items-center justify-center text-center px-4 mb-6 rounded-xl overflow-hidden"
            style={{ minHeight, background: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('${bannerUrl}') center/cover no-repeat` }}
          >
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">{lockedCollection.name}</h1>
            {lockedCollection.description && (
              <p className="text-white/80 text-sm max-w-xl">{lockedCollection.description}</p>
            )}
            <button
              onClick={() => updateFilter('collection', undefined)}
              className="mt-3 text-xs text-white/60 hover:text-white underline transition-colors"
            >
              View all products
            </button>
          </div>
        ) : (
          <div className="mb-6 pb-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
                  {lockedCollection.name}
                </h1>
                {lockedCollection.description && (
                  <p className="mt-1 text-sm" style={{ color: 'var(--kb-muted)' }}>
                    {lockedCollection.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => updateFilter('collection', undefined)}
                className="flex-shrink-0 text-xs underline mt-1"
                style={{ color: 'var(--kb-muted)' }}
              >
                View all products
              </button>
            </div>
          </div>
        );
      })()}

      {/* Mobile filter button */}
      <div className="flex items-center justify-between mb-4 md:hidden">
        <button
          onClick={() => setMobileFilterOpen(true)}
          className="flex items-center gap-2 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:border-kb-teal transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-kb-teal text-white text-xs font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort (mobile) */}
        <select
          value={currentFilters.sort ?? 'newest'}
          onChange={e => updateFilter('sort', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-kb-teal bg-white"
        >
          <option value="newest">Newest First</option>
          <option value="price_asc">Price: Low–High</option>
          <option value="price_desc">Price: High–Low</option>
          <option value="best_selling">Best Selling</option>
          <option value="discount_pct">Discount %</option>
        </select>
      </div>

      <div className="flex gap-8">
        {/* Desktop filter sidebar */}
        <aside className="hidden md:block w-60 flex-shrink-0">
          <div className="sticky top-40">
            <h2 className="font-semibold text-kb-charcoal mb-4 text-sm uppercase tracking-wider">Filters</h2>
            {filterContent}
          </div>
        </aside>

        {/* Mobile filter drawer */}
        {mobileFilterOpen && (
          <>
            <div className="filter-drawer-backdrop" onClick={() => setMobileFilterOpen(false)} />
            <div className="filter-drawer">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-kb-charcoal">Filters</h2>
                <button onClick={() => setMobileFilterOpen(false)}>
                  <svg className="w-5 h-5 text-kb-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto h-[calc(100vh-64px)]">
                {filterContent}
              </div>
            </div>
          </>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Sort bar + active chips (desktop) */}
          <div className="hidden md:flex items-center justify-between mb-4">
            <div className="flex flex-wrap gap-2">
              {chips.map(chip => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 text-xs bg-kb-teal/10 text-kb-teal px-2.5 py-1 rounded-full font-medium"
                >
                  {chip.label}
                  <button
                    onClick={() => chip.removeValue
                      ? toggleTagValue(chip.key, chip.removeValue)
                      : updateFilter(chip.key, undefined)
                    }
                    className="ml-0.5 hover:text-kb-error transition-colors"
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {chips.length > 1 && (
                <button onClick={clearAll} className="text-xs text-kb-muted hover:text-kb-error underline">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-kb-muted">
                {meta.total} product{meta.total !== 1 ? 's' : ''}
              </span>
              <select
                value={currentFilters.sort ?? 'newest'}
                onChange={e => updateFilter('sort', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-kb-teal bg-white"
              >
                <option value="newest">Newest First</option>
                <option value="price_asc">Price: Low–High</option>
                <option value="price_desc">Price: High–Low</option>
                <option value="best_selling">Best Selling</option>
                <option value="discount_pct">Discount %</option>
              </select>
            </div>
          </div>

          {/* Mobile chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 md:hidden">
              {chips.map(chip => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 text-xs bg-kb-teal/10 text-kb-teal px-2.5 py-1 rounded-full font-medium"
                >
                  {chip.label}
                  <button onClick={() => updateFilter(chip.key, undefined)}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Product grid */}
          {products.length === 0 ? (
            <div className="py-24 text-center">
              {activeFilterCount > 0 ? (
                <>
                  <p className="text-kb-muted mb-3">No products match your filters.</p>
                  <button onClick={clearAll} className="text-sm text-kb-teal underline">
                    Clear Filters
                  </button>
                </>
              ) : (
                <p className="text-kb-muted">No products available yet. Check back soon.</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Load More */}
              {meta.page < meta.pages && (
                <div className="mt-10 text-center">
                  <p className="text-sm text-kb-muted mb-4">
                    Showing {products.length} of {meta.total} products
                  </p>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-8 py-3 border-2 border-kb-teal text-kb-teal font-medium rounded-lg hover:bg-kb-teal hover:text-white transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load More'}
                  </button>
                </div>
              )}
              {meta.page >= meta.pages && meta.total > 24 && (
                <p className="mt-8 text-center text-sm text-kb-muted">
                  Showing all {meta.total} products
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
