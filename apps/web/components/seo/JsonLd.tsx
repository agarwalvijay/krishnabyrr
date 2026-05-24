/**
 * JSON-LD structured data helpers.
 *
 * Each <Component /> emits a single <script type="application/ld+json">
 * with the right schema.org shape so Google can render rich snippets
 * (price, availability, breadcrumbs, search box, etc.).
 */

import { imageUrl, type ProductDetail, type CategoryItem } from '@/lib/api';

const SITE   = 'https://krishnasbliss.com';
const BRAND  = "Krishna's Bliss";
const LOGO   = `${SITE}/logo-krishnas-bliss.png`;

function script(data: object) {
  // Server component, safe to embed since data is built from typed inputs.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ── Organization + WebSite (global, render in root layout) ───────────────────

export function OrganizationJsonLd() {
  return script({
    '@context':   'https://schema.org',
    '@type':      'Organization',
    name:         BRAND,
    url:          SITE,
    logo:         LOGO,
    description:  'Authentic handwoven Indian fabric — sarees, suit sets, dupattas, and by-the-metre fabric, direct from heritage weaving clusters.',
  });
}

export function WebSiteJsonLd() {
  // The potentialAction tells Google to render a sitelinks search box
  // for the brand SERP (only kicks in once you rank for your brand name).
  return script({
    '@context':   'https://schema.org',
    '@type':      'WebSite',
    name:         BRAND,
    url:          SITE,
    potentialAction: {
      '@type':       'SearchAction',
      target:        `${SITE}/shop?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  });
}

// ── Product (render inside /product/[slug]) ──────────────────────────────────

export function ProductJsonLd({ product }: { product: ProductDetail }) {
  // Postgres NUMERIC columns arrive as strings via node-pg; coerce before
  // calling .toFixed() (which only exists on numbers).
  const rawPrice  = product.sale_price ?? product.mrp;
  const price     = Number(rawPrice ?? 0).toFixed(2);
  const stockQty  = Number(product.stock_qty ?? 0);
  const availability = stockQty > 0
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  return script({
    '@context':   'https://schema.org',
    '@type':      'Product',
    name:         product.name,
    description:  product.short_desc || product.description || product.name,
    image:        (product.images ?? []).map((i) => imageUrl(i.gcs_path)),
    sku:          product.sku,
    brand:        { '@type': 'Brand', name: BRAND },
    offers: {
      '@type':         'Offer',
      url:             `${SITE}/product/${product.slug}`,
      priceCurrency:   'INR',
      price,
      availability,
      itemCondition:   'https://schema.org/NewCondition',
      seller:          { '@type': 'Organization', name: BRAND },
    },
  });
}

// ── Breadcrumb (renderable on any page where you have the trail) ─────────────

export function BreadcrumbJsonLd({
  items,
}: {
  items: Array<{ label: string; url: string }>;
}) {
  return script({
    '@context':   'https://schema.org',
    '@type':      'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type':    'ListItem',
      position:   i + 1,
      name:       it.label,
      item:       it.url,
    })),
  });
}

// ── CollectionPage (render on /shop/<slug>) ──────────────────────────────────

export function CollectionPageJsonLd({
  category,
}: {
  category: CategoryItem & { description?: string | null };
}) {
  return script({
    '@context':   'https://schema.org',
    '@type':      'CollectionPage',
    name:         `${category.name} — ${BRAND}`,
    description:  category.description || `Shop ${category.name} at ${BRAND}.`,
    url:          `${SITE}/shop/${category.slug}`,
  });
}
