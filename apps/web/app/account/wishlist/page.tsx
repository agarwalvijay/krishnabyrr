'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountLayout from '@/components/account/AccountLayout';
import { apiClient, imageUrl, formatINR, type ProductListItem } from '@/lib/api';
import AddToCartButton from '@/components/cart/AddToCartButton';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCustomerAuth } from '@/contexts/AuthContext';

export default function WishlistPage() {
  const { customer } = useCustomerAuth();
  const { ids, toggle } = useWishlist();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    if (customer) {
      // Logged in: fetch full product objects from the DB wishlist
      apiClient
        .get<{ data: ProductListItem[] }>('/account/wishlist')
        .then((r) => setProducts(r.data.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      // Guest: batch-fetch by IDs from context
      const idList = [...ids];
      if (idList.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }
      apiClient
        .get<{ data: ProductListItem[] }>(`/products?ids=${idList.join(',')}`)
        .then((r) => setProducts(r.data.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  // Re-run when ids change (item removed) or auth changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, ids]);

  const remove = (productId: string) => {
    toggle(productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

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
          {products.map((product) => {
            const isOos = product.stock_qty === 0;
            const price = product.sale_price ?? product.mrp;
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
                    {product.sale_price && product.sale_price < product.mrp && (
                      <span className="text-xs line-through" style={{ color: 'var(--kb-muted)' }}>{formatINR(product.mrp)}</span>
                    )}
                  </div>
                  {!isOos && (
                    <AddToCartButton productId={product.id} stockQty={product.stock_qty ?? 1} className="w-full text-xs py-1.5 rounded-lg" />
                  )}
                  <button
                    onClick={() => remove(product.id)}
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
