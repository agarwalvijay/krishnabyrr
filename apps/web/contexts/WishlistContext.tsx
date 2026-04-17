'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useCustomerAuth } from './AuthContext';
import { apiClient } from '@/lib/api';

const LS_KEY = 'kb_wishlist';

function getLocalIds(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}
function setLocalIds(ids: string[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch {}
}

interface WishlistCtx {
  ids: Set<string>;
  isWishlisted: (id: string) => boolean;
  toggle: (id: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistCtx>({
  ids: new Set(),
  isWishlisted: () => false,
  toggle: async () => {},
});

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { customer } = useCustomerAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  // Keep a ref so toggle() always sees the current set without being recreated
  const idsRef = useRef(ids);
  useEffect(() => { idsRef.current = ids; }, [ids]);

  // Load + sync when auth state changes
  useEffect(() => {
    if (customer) {
      // Logged in: fetch from API, merge any localStorage leftovers
      apiClient
        .get<{ data: { id: string }[] }>('/account/wishlist')
        .then(async (r) => {
          const dbIds = new Set(r.data.data.map((p) => p.id));
          const localIds = getLocalIds();
          const toSync = localIds.filter((id) => !dbIds.has(id));
          await Promise.all(
            toSync.map((id) =>
              apiClient.post('/account/wishlist', { product_id: id }).catch(() => {})
            )
          );
          if (localIds.length > 0) localStorage.removeItem(LS_KEY);
          setIds(new Set([...dbIds, ...toSync]));
        })
        .catch(() => {
          // API unavailable — fall back to localStorage
          setIds(new Set(getLocalIds()));
        });
    } else {
      setIds(new Set(getLocalIds()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const toggle = useCallback(async (productId: string) => {
    const wasWishlisted = idsRef.current.has(productId);

    // Optimistic update
    setIds((prev) => {
      const next = new Set(prev);
      wasWishlisted ? next.delete(productId) : next.add(productId);
      return next;
    });

    if (customer) {
      try {
        if (wasWishlisted) {
          await apiClient.delete(`/account/wishlist/${productId}`);
        } else {
          await apiClient.post('/account/wishlist', { product_id: productId });
        }
      } catch {
        // Revert on error
        setIds((prev) => {
          const next = new Set(prev);
          wasWishlisted ? next.add(productId) : next.delete(productId);
          return next;
        });
      }
    } else {
      const current = getLocalIds();
      setLocalIds(
        wasWishlisted
          ? current.filter((id) => id !== productId)
          : [...new Set([...current, productId])]
      );
    }
  }, [customer]);

  const isWishlisted = useCallback((id: string) => ids.has(id), [ids]);

  return (
    <WishlistContext.Provider value={{ ids, isWishlisted, toggle }}>
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);
