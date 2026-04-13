'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AccountLayout from '@/components/account/AccountLayout';
import { apiClient, imageUrl, formatINR, type ProductListItem } from '@/lib/api';
import AddToCartButton from '@/components/cart/AddToCartButton';

export default function WishlistPage() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      // Merge DB wishlist + localStorage wishlist
      const [dbRes] = await Promise.allSettled([
        apiClient.get<{ data: ProductListItem[] }>('/account/wishlist'),
      ]);

      let ids: string[] = [];

      // Grab localStorage IDs
      try {
        const local = JSON.parse(localStorage.getItem('kb_wishlist') ?? '[]') as string[];
        ids = [...local];
      } catch {}

      // Merge DB products
      if (dbRes.status === 'fulfilled') {
        const dbProducts = dbRes.value.data.data;
        setProducts(dbProducts);
        // Sync: push any localStorage IDs not yet in DB
        const dbIds = new Set(dbProducts.map(p => p.id));
        for (const lid of ids) {
          if (!dbIds.has(lid)) {
            await apiClient.post('/account/wishlist', { product_id: lid }).catch(() => {});
          }
        }
        if (ids.length > 0) localStorage.removeItem('kb_wishlist');
        // Reload
        const final = await apiClient.get<{ data: ProductListItem[] }>('/account/wishlist');
        setProducts(final.data.data);
        return;
      }

      // Fallback: localStorage only
      if (ids.length > 0) {
        const res = await apiClient.get<{ data: ProductListItem[] }>(`/products?ids=${ids.join(',')}`);
        setProducts(res.data.data);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeFromWishlist = useCallback(async (productId: string) => {
    await apiClient.delete(`/account/wishlist/${productId}`).catch(() => {});
    setProducts(prev => prev.filter(p => p.id !== productId));
  }, []);

  return (
    <AccountLayout title="My Wishlist">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center space-y-3">
          <p className="text-lg" style={{ color: 'var(--kb-muted)' }}>♡</p>
          <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>Your wishlist is empty.</p>
          <Link href="/shop" className="inline-block text-sm font-medium underline" style={{ color: 'var(--kb-teal)' }}>
            Start browsing →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map(product => {
            const isOos   = product.stock_qty === 0;
            const price   = product.sale_price ?? product.mrp;

            return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm overflow-hidden group">
                <Link href={`/product/${product.slug}`} className="block relative">
                  <div className="aspect-[3/4] bg-gray-50 overflow-hidden relative">
                    {product.primary_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl(product.primary_image.gcs_path)}
                        alt={product.primary_image.alt_text ?? product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100" />
                    )}
                    {isOos && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-white" style={{ color: 'var(--kb-muted)' }}>
                          Sold Out
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
                <div className="p-3 space-y-2">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--kb-charcoal)' }}>{product.name}</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold">{formatINR(price)}</span>
                    {product.sale_price && (
                      <span className="text-xs line-through" style={{ color: 'var(--kb-muted)' }}>{formatINR(product.mrp)}</span>
                    )}
                  </div>
                  {!isOos && (
                    <AddToCartButton productId={product.id} stockQty={product.stock_qty ?? 1} className="w-full text-xs py-1.5 rounded-lg" />
                  )}
                  <button
                    onClick={() => removeFromWishlist(product.id)}
                    className="w-full text-xs py-1.5 rounded-lg border transition-colors"
                    style={{ color: 'var(--kb-muted)', borderColor: '#e5e7eb' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AccountLayout>
  );
}
