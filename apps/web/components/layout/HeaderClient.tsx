'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart/CartContext';
import CartDrawer from '@/components/cart/CartDrawer';
import { useCustomerAuth } from '@/contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CollectionItem {
  id: string;
  name: string;
  slug: string;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  children?: Array<{ id: string; name: string; slug: string }>;
}

interface TagGroupData {
  label: string;
  is_filter: boolean;
  is_nav: boolean;
  tags: Array<{ id: string; value: string; hex_color: string | null }>;
}

export interface HeaderNavData {
  collections: CollectionItem[];
  tagGroups: Record<string, TagGroupData>;
  categories: CategoryItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FLYOUT_ITEMS = 10;

const linkBase =
  'text-sm font-medium text-gray-400 hover:text-kb-charcoal transition-colors duration-150';
const mobileLinkBase =
  'block px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-kb-charcoal hover:bg-gray-50 rounded-lg transition-colors';

// ── Flyout dropdown ───────────────────────────────────────────────────────────

interface FlyoutItem { label: string; href: string; color?: string | null }

interface FlyoutProps {
  id: string;
  label: string;
  items: FlyoutItem[];
  browseHref: string;
  browseLabel: string;
  isOpen: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}

function FlyoutMenu({ id, label, items, browseHref, browseLabel, isOpen, onOpen, onClose }: FlyoutProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onOpen(id);
  };
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(onClose, 120);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`${linkBase} flex items-center gap-0.5 py-1`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => (isOpen ? onClose() : onOpen(id))}
      >
        {label}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel — pt-3 bridges the gap so mouseleave doesn't fire mid-travel */}
      <div
        className={[
          'absolute top-full left-1/2 -translate-x-1/2 pt-3 w-52 z-50',
          'transition-all duration-150 origin-top',
          isOpen ? 'opacity-100 scale-y-100 pointer-events-auto' : 'opacity-0 scale-y-95 pointer-events-none',
        ].join(' ')}
      >
      <div className="bg-white rounded-xl shadow-lg ring-1 ring-black/5 py-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-500 hover:text-kb-charcoal hover:bg-gray-50 transition-colors"
          >
            {item.color && (
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/10"
                style={{ backgroundColor: item.color }}
              />
            )}
            {item.label}
          </Link>
        ))}
        {items.length >= MAX_FLYOUT_ITEMS && (
          <div className="border-t border-gray-100 mt-1 pt-1">
            <Link
              href={browseHref}
              onClick={onClose}
              className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-kb-teal hover:text-kb-teal/80 transition-colors"
            >
              {browseLabel}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ── Mobile accordion section ──────────────────────────────────────────────────

interface MobileAccordionProps {
  label: string;
  items: FlyoutItem[];
  browseHref: string;
  isExpanded: boolean;
  onToggle: () => void;
  onNav: () => void;
}

function MobileAccordion({ label, items, browseHref, isExpanded, onToggle, onNav }: MobileAccordionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-kb-charcoal hover:bg-gray-50 rounded-lg transition-colors"
      >
        {label}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="ml-3 mt-0.5 border-l border-gray-100 pl-3 space-y-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className="flex items-center gap-2 px-2 py-2 text-sm text-gray-400 hover:text-kb-charcoal transition-colors rounded-lg"
            >
              {item.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {item.label}
            </Link>
          ))}
          <Link
            href={browseHref}
            onClick={onNav}
            className="flex items-center gap-1 px-2 py-2 text-xs font-medium text-kb-teal"
          >
            Browse all
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Main Header ───────────────────────────────────────────────────────────────

export default function HeaderClient({ collections, tagGroups, categories }: HeaderNavData) {
  const [openMenu, setOpenMenu]         = useState<string | null>(null);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const { cart, openCart }  = useCart();
  const { customer }        = useCustomerAuth();
  const router              = useRouter();

  const itemCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const handleSearchSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q')?.toString().trim();
    router.push(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
    e.currentTarget.reset();
    setMobileOpen(false);
  }, [router]);

  const closeMenu     = useCallback(() => setOpenMenu(null), []);
  const closeMobile   = useCallback(() => { setMobileOpen(false); setMobileExpanded(null); }, []);
  const toggleMobileSection = (key: string) =>
    setMobileExpanded(e => (e === key ? null : key));

  // Build flyout data from tag groups flagged for nav, non-empty
  const filterGroups = Object.entries(tagGroups).filter(
    ([, g]) => g.is_nav && g.tags.length > 0
  );

  const collectionItems: FlyoutItem[] = collections.map((c) => ({
    label: c.name,
    href:  `/shop?collection=${c.slug}`,
  }));

  // Flatten category tree for flyout (parents + children)
  const categoryItems: FlyoutItem[] = categories.flatMap((cat) => [
    { label: cat.name, href: `/shop?category=${cat.slug}` },
    ...(cat.children ?? []).map((child) => ({
      label: `↳ ${child.name}`,
      href:  `/shop?category=${child.slug}`,
    })),
  ]);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-6">

          {/* Embossed medallion seal — breaks through the header bottom edge */}
          <Link
            href="/"
            aria-label="Krishna's Bliss — home"
            className="flex-shrink-0 translate-y-6 sm:translate-y-8"
          >
            <span
              className="flex w-[100px] h-[100px] sm:w-[131px] sm:h-[131px] rounded-full items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #01327a 0%, #012169 55%, #010d3d 100%)',
                border: '1px solid #BF9B30',
                boxShadow: [
                  '0 8px 24px rgba(1,33,105,0.5)',
                  '0 2px 6px rgba(0,0,0,0.3)',
                  'inset 0 1px 3px rgba(255,255,255,0.15)',
                  'inset 0 -2px 5px rgba(0,0,0,0.35)',
                ].join(', '),
              }}
            >
              {/* Inner navy ring gives the feather depth and separation from the gold border */}
              <span className="flex w-[96%] h-[96%] rounded-full items-center justify-center overflow-hidden">
                <Image
                  src="/logo-krishnas-bliss.png"
                  alt="Krishna's Bliss"
                  width={200}
                  height={200}
                  priority
                  className="h-full w-full object-contain"
                />
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 flex-1" onMouseLeave={closeMenu}>

            <Link href="/shop" className={linkBase}>Shop</Link>

            {collectionItems.length > 0 ? (
              <FlyoutMenu
                id="collections"
                label="Collections"
                items={collectionItems.slice(0, MAX_FLYOUT_ITEMS)}
                browseHref="/shop"
                browseLabel="Browse all collections"
                isOpen={openMenu === 'collections'}
                onOpen={setOpenMenu}
                onClose={closeMenu}
              />
            ) : (
              <Link href="/shop" className={linkBase}>Collections</Link>
            )}

            {categoryItems.length > 0 && (
              <FlyoutMenu
                id="categories"
                label="Categories"
                items={categoryItems.slice(0, MAX_FLYOUT_ITEMS)}
                browseHref="/shop"
                browseLabel="Browse all categories"
                isOpen={openMenu === 'categories'}
                onOpen={setOpenMenu}
                onClose={closeMenu}
              />
            )}

            {filterGroups.map(([key, group]) => {
              const items: FlyoutItem[] = group.tags
                .slice(0, MAX_FLYOUT_ITEMS)
                .map((t) => ({
                  label: t.value,
                  href:  `/shop?${key}=${encodeURIComponent(t.value)}`,
                  color: t.hex_color,
                }));
              return (
                <FlyoutMenu
                  key={key}
                  id={key}
                  label={group.label}
                  items={items}
                  browseHref={`/shop?${key}=${encodeURIComponent(group.tags[0]?.value ?? '')}`}
                  browseLabel={`Browse all ${group.label.toLowerCase()}`}
                  isOpen={openMenu === key}
                  onOpen={setOpenMenu}
                  onClose={closeMenu}
                />
              );
            })}

            <Link href="/shop?sort=newest" className={linkBase}>New Arrivals</Link>
            <Link href="/shop?on_sale=true" className={linkBase}>Sale</Link>
          </nav>

          {/* Desktop search */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center gap-2 bg-gray-50 rounded-full px-3 h-9 w-40 focus-within:w-52 focus-within:bg-white focus-within:ring-1 focus-within:ring-kb-teal/30 transition-all duration-200"
          >
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              name="q"
              type="text"
              placeholder="Search…"
              className="flex-1 min-w-0 bg-transparent text-sm text-kb-charcoal placeholder-gray-300 outline-none focus-visible:outline-none"
            />
          </form>

          {/* Right icons */}
          <div className="flex items-center gap-2">

            {/* Cart */}
            <button
              onClick={openCart}
              aria-label={`Cart${itemCount > 0 ? `, ${itemCount} items` : ''}`}
              className="relative flex w-9 h-9 items-center justify-center rounded-full hover:bg-gray-50 transition-colors text-gray-400 hover:text-kb-charcoal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-kb-teal text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>

            {/* Account */}
            <Link
              href={customer ? '/account' : '/account/login'}
              aria-label={customer ? `My account (${customer.name})` : 'Sign in'}
              className="hidden md:flex w-9 h-9 items-center justify-center rounded-full hover:bg-gray-50 transition-colors text-gray-400 hover:text-kb-charcoal"
            >
              {customer ? (
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: 'var(--kb-teal)' }}
                >
                  {customer.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors text-gray-400 hover:text-kb-charcoal"
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="px-4 pt-3 pb-1">
              <form
                onSubmit={handleSearchSubmit}
                className="flex items-center gap-2 bg-gray-50 rounded-full px-3 h-10 focus-within:ring-1 focus-within:ring-kb-teal/30 focus-within:bg-white transition-all duration-150"
              >
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  name="q"
                  type="text"
                  placeholder="Search products…"
                  className="flex-1 bg-transparent text-sm text-kb-charcoal placeholder-gray-300 outline-none focus-visible:outline-none"
                />
              </form>
            </div>
            <nav className="px-4 py-2 space-y-0.5">

              <Link href="/shop" className={mobileLinkBase} onClick={closeMobile}>
                Shop All
              </Link>

              {collectionItems.length > 0 ? (
                <MobileAccordion
                  label="Collections"
                  items={collectionItems}
                  browseHref="/shop"
                  isExpanded={mobileExpanded === 'collections'}
                  onToggle={() => toggleMobileSection('collections')}
                  onNav={closeMobile}
                />
              ) : (
                <Link href="/shop" className={mobileLinkBase} onClick={closeMobile}>Collections</Link>
              )}

              {categoryItems.length > 0 && (
                <MobileAccordion
                  label="Categories"
                  items={categoryItems}
                  browseHref="/shop"
                  isExpanded={mobileExpanded === 'categories'}
                  onToggle={() => toggleMobileSection('categories')}
                  onNav={closeMobile}
                />
              )}

              {filterGroups.map(([key, group]) => (
                <MobileAccordion
                  key={key}
                  label={group.label}
                  items={group.tags.slice(0, MAX_FLYOUT_ITEMS).map((t) => ({
                    label: t.value,
                    href:  `/shop?${key}=${encodeURIComponent(t.value)}`,
                    color: t.hex_color,
                  }))}
                  browseHref={`/shop`}
                  isExpanded={mobileExpanded === key}
                  onToggle={() => toggleMobileSection(key)}
                  onNav={closeMobile}
                />
              ))}

              <Link href="/shop?sort=newest" className={mobileLinkBase} onClick={closeMobile}>
                New Arrivals
              </Link>
              <Link href="/shop?on_sale=true" className={mobileLinkBase} onClick={closeMobile}>
                Sale
              </Link>

              <div className="border-t border-gray-100 pt-2 mt-2">
                <Link
                  href={customer ? '/account' : '/account/login'}
                  className={mobileLinkBase}
                  onClick={closeMobile}
                >
                  {customer ? `My Account (${customer.name})` : 'Sign In'}
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <CartDrawer />
    </>
  );
}
