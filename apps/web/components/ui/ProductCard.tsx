'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { imageUrl, formatINR, discountPct, getStockStatus, type ProductListItem } from '@/lib/api';
import AddToCartButton from '@/components/cart/AddToCartButton';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { useWishlist } from '@/contexts/WishlistContext';

// ── Quick View Modal ──────────────────────────────────────────────────────────

interface QuickViewProps {
  product: ProductListItem;
  onClose: () => void;
}

function QuickViewModal({ product, onClose }: QuickViewProps) {
  const hasSale = product.sale_price != null && product.sale_price < product.mrp;
  const pct = hasSale ? discountPct(product.mrp, product.sale_price!) : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <h3 className="font-display text-lg font-semibold text-kb-charcoal line-clamp-1">
              {product.name}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close quick view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
            {/* Image */}
            <div className="relative w-full sm:w-56 flex-shrink-0 aspect-[3/4]">
              {product.primary_image ? (
                <Image
                  src={imageUrl(product.primary_image.gcs_path)}
                  alt={product.primary_image.alt_text ?? product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 224px"
                />
              ) : (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                  <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col p-5 overflow-y-auto flex-1">
              {/* Tags */}
              {product.tags.length > 0 && (
                <p className="text-xs text-kb-muted uppercase tracking-widest mb-2">
                  {product.tags.filter(t => t.group_name === 'fabric').map(t => t.value).join(', ')}
                  {product.tags.filter(t => t.group_name === 'color').map(t => t.value).join(', ')}
                </p>
              )}

              {/* Price */}
              <div className="flex items-baseline gap-2 mb-3">
                {hasSale ? (
                  <>
                    <span className="text-xl font-semibold text-kb-gold">{formatINR(product.sale_price!)}</span>
                    <span className="text-sm text-kb-muted line-through">{formatINR(product.mrp)}</span>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-kb-gold text-white">
                      -{pct}%
                    </span>
                  </>
                ) : (
                  <span className="text-xl font-semibold text-kb-charcoal">{formatINR(product.mrp)}</span>
                )}
              </div>

              {/* Stock */}
              {product.stock_qty === 0 && (
                <p className="text-sm text-kb-error font-medium mb-2">Sold Out</p>
              )}
              {product.stock_qty > 0 && product.stock_qty <= 3 && (
                <p className="text-sm text-kb-amber font-medium mb-2">Only {product.stock_qty} left!</p>
              )}

              {/* Short desc */}
              {product.short_desc && (
                <p className="text-sm text-kb-muted mb-4 line-clamp-3">{product.short_desc}</p>
              )}

              <div className="mt-auto space-y-2">
                <AddToCartButton
                  productId={product.id}
                  stockQty={product.stock_qty}
                  quantity={1}
                  fullWidth
                  className="h-11 rounded-lg text-sm font-medium"
                />
                <Link
                  href={`/product/${product.slug}`}
                  className="flex items-center justify-center gap-1 w-full h-11 border border-kb-teal text-kb-teal font-medium rounded-lg hover:bg-kb-teal/5 transition-colors text-sm"
                  onClick={onClose}
                >
                  View Full Details
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: ProductListItem;
  showQuickView?: boolean;
}

export default function ProductCard({ product, showQuickView = true }: ProductCardProps) {
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const openQuickView  = useCallback(() => setQuickViewOpen(true), []);
  const closeQuickView = useCallback(() => setQuickViewOpen(false), []);
  const { isWishlisted, toggle: wishlistToggle } = useWishlist();

  const { newBadgeDays } = useSiteSettings();
  const hasSale   = product.sale_price != null && product.sale_price < product.mrp;
  const pct       = hasSale ? discountPct(product.mrp, product.sale_price!) : 0;
  const status    = getStockStatus(product.stock_qty);
  const isNew     = !hasSale && newBadgeDays > 0 &&
    (Date.now() - new Date(product.created_at).getTime()) / 86_400_000 <= newBadgeDays;
  const primarySrc  = product.primary_image ? imageUrl(product.primary_image.gcs_path) : '';
  const secondarySrc = product.second_image  ? imageUrl(product.second_image.gcs_path)  : '';

  // Fabric + color tags for subtitle
  const fabric = product.tags.find(t => t.group_name === 'fabric')?.value;
  const color  = product.tags.find(t => t.group_name === 'color')?.value;
  const subtitle = [fabric, color].filter(Boolean).join(' · ');

  const toggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    wishlistToggle(product.id);
  };

  return (
    <>
      <article className="group">
        {/* Image area */}
        <Link href={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true">
        <div className="product-card-image rounded-xl overflow-hidden bg-gray-100 aspect-[3/4] relative">
          {/* Primary image */}
          {primarySrc ? (
            <Image
              src={primarySrc}
              alt={product.primary_image?.alt_text ?? product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="primary-img object-cover"
              priority={false}
            />
          ) : (
            <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {/* Secondary image (crossfade on hover) */}
          {secondarySrc && (
            <Image
              src={secondarySrc}
              alt={product.second_image?.alt_text ?? product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="secondary-img object-cover absolute inset-0 opacity-0 transition-opacity duration-400"
              aria-hidden="true"
            />
          )}

          {/* Top badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {status === 'out_of_stock' ? null : hasSale ? (
              <span className="badge-sale text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                SALE -{pct}%
              </span>
            ) : isNew ? (
              <span className="badge-new text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                NEW
              </span>
            ) : null}
          </div>

          {/* Wishlist heart */}
          <button
            onClick={toggleWishlist}
            aria-label={isWishlisted(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
            className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors shadow-sm"
          >
            {isWishlisted(product.id) ? (
              <svg className="w-4 h-4 text-kb-error fill-kb-error" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-kb-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>

          {/* Sold Out overlay */}
          {status === 'out_of_stock' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
              <span className="text-white font-semibold text-sm tracking-wide uppercase px-3 py-1.5 border border-white/60 rounded-full">
                Sold Out
              </span>
            </div>
          )}

          {/* Low stock pill (inside image, bottom-left) */}
          {status === 'low_stock' && (
            <div className="absolute bottom-2 left-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full badge-stock-low">
                Only {product.stock_qty} left!
              </span>
            </div>
          )}

          {/* Quick view button (desktop hover only) */}
          {showQuickView && (
            <div className="quick-view-btn absolute bottom-0 left-0 right-0 translate-y-full opacity-0 transition-all duration-200">
              <button
                onClick={(e) => { e.preventDefault(); openQuickView(); }}
                className="w-full py-2.5 bg-white/90 backdrop-blur-sm text-kb-charcoal text-xs font-semibold uppercase tracking-wider hover:bg-white transition-colors"
              >
                Quick View
              </button>
            </div>
          )}
        </div>
        </Link>

        {/* Card body */}
        <Link href={`/product/${product.slug}`} className="block mt-3 group/link">
          {subtitle && (
            <p className="text-xs text-kb-muted uppercase tracking-widest mb-1 truncate">
              {subtitle}
            </p>
          )}
          <h3 className="text-sm font-medium text-kb-charcoal line-clamp-2 leading-snug group-hover/link:text-kb-teal transition-colors">
            {product.name}
          </h3>
          <div className="mt-1.5">
            {hasSale ? (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-kb-gold">{formatINR(product.sale_price!)}</span>
                <span className="text-xs text-kb-muted line-through">{formatINR(product.mrp)}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-kb-charcoal">{formatINR(product.mrp)}</span>
            )}
          </div>
        </Link>
      </article>

      {/* Quick View Modal */}
      {quickViewOpen && (
        <QuickViewModal product={product} onClose={closeQuickView} />
      )}
    </>
  );
}
