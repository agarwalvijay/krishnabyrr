import Image from 'next/image';
import Link from 'next/link';
import { imageUrl, formatINR, discountPct, type ProductListItem } from '@/lib/api';

function Placeholder() {
  return (
    <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

function PriceRow({ product }: { product: ProductListItem }) {
  const hasSale = product.sale_price != null && product.sale_price < product.mrp;
  const pct = hasSale ? discountPct(product.mrp, product.sale_price!) : 0;
  return (
    <div className="flex items-baseline gap-2">
      {hasSale ? (
        <>
          <span className="text-sm font-semibold text-kb-gold">{formatINR(product.sale_price!)}</span>
          <span className="text-xs text-kb-muted line-through">{formatINR(product.mrp)}</span>
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-kb-gold text-white">-{pct}%</span>
        </>
      ) : (
        <span className="text-sm font-semibold text-kb-charcoal">{formatINR(product.mrp)}</span>
      )}
    </div>
  );
}

export default function AsymmetricProductGrid({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return (
      <div className="text-center py-20 text-kb-muted">
        <p>Products coming soon.</p>
      </div>
    );
  }

  const featured = products[0];
  const sidebar  = products[1];
  const rest     = products.slice(2, 5);

  const featuredSrc = featured.primary_image ? imageUrl(featured.primary_image.gcs_path) : null;
  const sidebarSrc  = sidebar?.primary_image  ? imageUrl(sidebar.primary_image.gcs_path)  : null;

  const featuredSubtitle =
    featured.tags.find(t => t.group_name === 'fabric')?.value ??
    featured.tags.find(t => t.group_name === 'weave')?.value ??
    'Featured Weave';

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">

      {/* ── Large Featured Item (8 cols) ─────────────────────────────────── */}
      <Link href={`/product/${featured.slug}`} className="md:col-span-8 group block">
        <div className="relative aspect-[16/10] overflow-hidden bg-gray-100 rounded-xl">
          {featuredSrc ? (
            <Image
              src={featuredSrc}
              alt={featured.primary_image?.alt_text ?? featured.name}
              fill
              sizes="(max-width: 768px) 100vw, 66vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              priority
            />
          ) : (
            <Placeholder />
          )}

          {/* Gradient scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {/* Caption */}
          <div className="absolute bottom-5 left-5 right-5">
            <div className="inline-block bg-white/90 backdrop-blur-sm px-4 py-3 rounded-lg max-w-xs">
              <p className="text-xs text-kb-muted uppercase tracking-widest mb-0.5">{featuredSubtitle}</p>
              <p className="font-display text-lg font-semibold text-kb-charcoal leading-tight line-clamp-2">
                {featured.name}
              </p>
              <PriceRow product={featured} />
            </div>
          </div>

          {/* Out-of-stock overlay */}
          {featured.stock_qty === 0 && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
              <span className="text-white font-semibold text-sm tracking-wide uppercase px-3 py-1.5 border border-white/60 rounded-full">
                Sold Out
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* ── Tall Sidebar Item (4 cols) ───────────────────────────────────── */}
      {sidebar && (
        <Link href={`/product/${sidebar.slug}`} className="md:col-span-4 group block">
          <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 rounded-xl">
            {sidebarSrc ? (
              <Image
                src={sidebarSrc}
                alt={sidebar.primary_image?.alt_text ?? sidebar.name}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <Placeholder />
            )}
            <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors rounded-xl" />

            {sidebar.stock_qty === 0 && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                <span className="text-white font-semibold text-sm tracking-wide uppercase px-3 py-1.5 border border-white/60 rounded-full">
                  Sold Out
                </span>
              </div>
            )}
          </div>
          <div className="mt-3">
            <h3 className="font-medium text-kb-charcoal line-clamp-2 text-sm group-hover:text-kb-teal transition-colors">
              {sidebar.name}
            </h3>
            <div className="mt-1">
              <PriceRow product={sidebar} />
            </div>
          </div>
        </Link>
      )}

      {/* ── Regular Items (4 cols each) ──────────────────────────────────── */}
      {rest.map((product) => {
        const src = product.primary_image ? imageUrl(product.primary_image.gcs_path) : null;
        return (
          <Link key={product.id} href={`/product/${product.slug}`} className="md:col-span-4 group block">
            <div className="relative aspect-square overflow-hidden bg-gray-100 rounded-xl mb-3">
              {src ? (
                <Image
                  src={src}
                  alt={product.primary_image?.alt_text ?? product.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <Placeholder />
              )}
              {product.stock_qty === 0 && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                  <span className="text-white font-semibold text-sm tracking-wide uppercase px-3 py-1.5 border border-white/60 rounded-full">
                    Sold Out
                  </span>
                </div>
              )}
            </div>
            <h3 className="font-medium text-kb-charcoal line-clamp-2 text-sm group-hover:text-kb-teal transition-colors">
              {product.name}
            </h3>
            <div className="mt-1">
              <PriceRow product={product} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
