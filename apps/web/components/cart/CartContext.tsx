'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { apiClient, type CartData, type CartTotals } from '@/lib/api';
import { useCustomerAuth } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CartState {
  cart:    CartData | null;
  totals:  CartTotals | null;
  loading: boolean;
  open:    boolean;
}

interface CartContextValue extends CartState {
  openCart:      () => void;
  closeCart:     () => void;
  refreshCart:   () => Promise<void>;
  addItem:       (productId: string, quantity?: number) => Promise<void>;
  updateItem:    (itemId: string, quantity: number) => Promise<void>;
  removeItem:    (itemId: string) => Promise<void>;
  applyCoupon:   (code: string, guestEmail?: string) => Promise<void>;
  removeCoupon:  () => Promise<void>;
  clearCart:     () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>({
    cart:    null,
    totals:  null,
    loading: false,
    open:    false,
  });

  // Prevent double-fetches on mount in dev strict-mode
  const fetched = useRef(false);

  const refreshCart = useCallback(async () => {
    try {
      setState(s => ({ ...s, loading: true }));
      const res = await apiClient.get<{ data: { cart: CartData; totals: CartTotals } }>('/cart');
      setState(s => ({
        ...s,
        cart:    res.data.data.cart,
        totals:  res.data.data.totals,
        loading: false,
      }));
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    refreshCart();
  }, [refreshCart]);

  // Re-fetch the cart when the authenticated customer changes (login or logout).
  // The backend keys carts by customer-id when a JWT is present, so we want
  // the UI to immediately reflect "your cart" the moment auth state flips.
  const { customer, isLoading: authLoading } = useCustomerAuth();
  const lastCustomerId = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;       // auth still resolving on initial mount
    if (!fetched.current) return;  // initial fetch hasn't fired yet
    const currentId = customer?.id ?? null;
    if (currentId === lastCustomerId.current) return; // no transition
    lastCustomerId.current = currentId;
    refreshCart();
  }, [customer?.id, authLoading, refreshCart]);

  const openCart  = useCallback(() => setState(s => ({ ...s, open: true })),  []);
  const closeCart = useCallback(() => setState(s => ({ ...s, open: false })), []);

  const addItem = useCallback(async (productId: string, quantity = 1) => {
    setState(s => ({ ...s, loading: true }));
    try {
      await apiClient.post('/cart/items', { productId, quantity });
    } catch {
      // Server may have a different view than the local state — swallow and
      // let the refresh below reconcile.
    }
    await refreshCart();
    setState(s => ({ ...s, loading: false }));
  }, [refreshCart]);

  const updateItem = useCallback(async (itemId: string, quantity: number) => {
    setState(s => ({ ...s, loading: true }));
    try {
      await apiClient.put(`/cart/items/${itemId}`, { quantity });
    } catch {
      // Same as above — likely the item or cart no longer exists server-side
      // (e.g., after checkout cleared the cart). Refresh resolves the drift.
    }
    await refreshCart();
    setState(s => ({ ...s, loading: false }));
  }, [refreshCart]);

  const removeItem = useCallback(async (itemId: string) => {
    setState(s => ({ ...s, loading: true }));
    try {
      await apiClient.delete(`/cart/items/${itemId}`);
    } catch {
      // Most common case: the item was already gone server-side (post-checkout
      // ghost row). Refreshing the cart drops it from the UI cleanly instead
      // of leaving the user staring at an item they can't remove.
    }
    await refreshCart();
    setState(s => ({ ...s, loading: false }));
  }, [refreshCart]);

  const applyCoupon = useCallback(async (code: string, guestEmail?: string) => {
    await apiClient.post('/cart/coupon', { code, guestEmail });
    await refreshCart();
  }, [refreshCart]);

  const removeCoupon = useCallback(async () => {
    await apiClient.delete('/cart/coupon');
    await refreshCart();
  }, [refreshCart]);

  const clearCart = useCallback(async () => {
    await apiClient.delete('/cart');
    await refreshCart();
  }, [refreshCart]);

  return (
    <CartContext.Provider
      value={{
        ...state,
        openCart,
        closeCart,
        refreshCart,
        addItem,
        updateItem,
        removeItem,
        applyCoupon,
        removeCoupon,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
