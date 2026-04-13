'use client';

import { useState, useEffect } from 'react';
import AddToCartButton from '@/components/cart/AddToCartButton';

interface Props {
  product: {
    id: string;
    name: string;
    slug: string;
    stock_qty: number;
    mrp: number;
    sale_price: number | null;
    primary_image?: { gcs_path: string } | null;
  };
  whatsappNumber?: string;
}

const RECENTLY_VIEWED_KEY = 'kb_recently_viewed';
const MAX_RECENT = 8;

interface RecentItem {
  id: string;
  name: string;
  slug: string;
  primary_image: string | null;
  mrp: number;
  sale_price: number | null;
}

export function useRecentlyViewed(product: Props['product']) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
      const items: RecentItem[] = raw ? JSON.parse(raw) : [];
      const filtered = items.filter(i => i.id !== product.id);
      const updated: RecentItem[] = [
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          primary_image: product.primary_image?.gcs_path ?? null,
          mrp: product.mrp,
          sale_price: product.sale_price,
        },
        ...filtered,
      ].slice(0, MAX_RECENT);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
    } catch {
      // localStorage unavailable
    }
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function ProductActions({ product, whatsappNumber }: Props) {
  const [wishlisted, setWishlisted] = useState(false);

  // Track recently viewed
  useRecentlyViewed(product);

  // Load wishlist state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kb_wishlist');
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setWishlisted(ids.includes(product.id));
    } catch {}
  }, [product.id]);

  const toggleWishlist = () => {
    const next = !wishlisted;
    setWishlisted(next);
    try {
      const raw = localStorage.getItem('kb_wishlist');
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const updated = next ? [...new Set([...ids, product.id])] : ids.filter(id => id !== product.id);
      localStorage.setItem('kb_wishlist', JSON.stringify(updated));
    } catch {}
  };

  const waText = encodeURIComponent(
    `Hi, I'm interested in "${product.name}": ${typeof window !== 'undefined' ? window.location.href : ''}`
  );
  const waLink = `https://wa.me/${whatsappNumber ? '91' + whatsappNumber : '919999999999'}?text=${waText}`;

  return (
    <div className="space-y-3">
      {/* Add to cart */}
      <AddToCartButton
        productId={product.id}
        stockQty={product.stock_qty}
        quantity={1}
        label="Add to Cart"
        fullWidth
      />

      {/* Wishlist */}
      <button
        onClick={toggleWishlist}
        className={`w-full py-3 border-2 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors text-sm ${
          wishlisted
            ? 'border-kb-error text-kb-error bg-kb-error/5'
            : 'border-gray-200 text-kb-charcoal hover:border-kb-charcoal'
        }`}
      >
        {wishlisted ? (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        )}
        {wishlisted ? 'Saved to Wishlist' : '♡ Save to Wishlist'}
      </button>

      {/* WhatsApp enquiry */}
      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-sm text-kb-muted hover:text-kb-charcoal transition-colors py-1"
      >
        <svg className="w-4 h-4 fill-current text-[#25D366]" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Have questions? Chat with us
      </a>
    </div>
  );
}
