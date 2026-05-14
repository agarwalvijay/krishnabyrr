'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCart } from './CartContext';
import { imageUrl, formatINR, type CartItem } from '@/lib/api';

// ── CartDrawer ─────────────────────────────────────────────────────────────────

export default function CartDrawer() {
  const {
    open, closeCart, cart, totals, loading,
    updateItem, removeItem, applyCoupon, removeCoupon,
  } = useCart();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Reset coupon input when drawer closes
  useEffect(() => {
    if (!open) {
      setCouponInput('');
      setCouponError('');
    }
  }, [open]);

  // Trap focus + prevent body scroll
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      await applyCoupon(couponInput.trim().toUpperCase());
      setCouponInput('');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Invalid coupon code.';
      setCouponError(msg);
    } finally {
      setCouponLoading(false);
    }
  }

  const itemCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl font-semibold text-kb-charcoal">
            Your Cart {itemCount > 0 && <span className="text-kb-muted text-base font-normal">({itemCount})</span>}
          </h2>
          <button
            onClick={closeCart}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close cart"
          >
            <svg className="w-5 h-5 text-kb-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Empty state */}
          {(!cart || cart.items.length === 0) && !loading && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <svg className="w-16 h-16 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-kb-muted text-sm">Your cart is empty.</p>
              <button
                onClick={closeCart}
                className="mt-4 text-sm font-medium text-kb-teal underline"
              >
                Continue shopping
              </button>
            </div>
          )}

          {/* Items */}
          {cart?.items.map(item => (
            <CartItemRow
              key={item.id}
              item={item}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}

          {/* Coupon section */}
          {cart && cart.items.length > 0 && (
            <div className="pt-2">
              {cart.couponData ? (
                <div className="flex items-center justify-between bg-kb-teal/5 border border-kb-teal/30 rounded-lg px-3 py-2.5">
                  <div>
                    <span className="text-xs font-semibold text-kb-teal uppercase tracking-wide">
                      {cart.couponData.code}
                    </span>
                    <p className="text-xs text-kb-muted mt-0.5">{cart.couponData.description}</p>
                  </div>
                  <button
                    onClick={removeCoupon}
                    className="text-kb-error text-xs font-medium hover:underline ml-3"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                      placeholder="Coupon code"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="px-4 py-2 bg-kb-charcoal text-white text-sm rounded-lg hover:bg-black disabled:opacity-50 transition-colors"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <p className="text-xs text-kb-error mt-1.5">{couponError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with totals + checkout */}
        {cart && cart.items.length > 0 && totals && (
          <div className="border-t border-gray-100 px-5 pt-4 pb-6 space-y-3">
            {/* Order summary */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-kb-charcoal">
                <span>Subtotal <span className="text-xs text-kb-muted">(incl. GST)</span></span>
                <span>{formatINR(totals.subtotal)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-kb-success">
                  <span>Discount ({cart.couponCode})</span>
                  <span>−{formatINR(totals.discountAmount)}</span>
                </div>
              )}
              {cart.couponData?.type === 'free_shipping' && (
                <div className="flex justify-between text-kb-success">
                  <span>Shipping</span>
                  <span>FREE</span>
                </div>
              )}
              {cart.couponData?.type !== 'free_shipping' && (
                <div className="flex justify-between text-kb-muted">
                  <span>Shipping {!cart.zone && <span className="text-xs">(add pincode)</span>}</span>
                  <span>{cart.zone ? formatINR(totals.shipping) : '—'}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-kb-charcoal text-base pt-1 border-t border-gray-100 mt-1">
                <span>Total</span>
                <span>{formatINR(totals.total)}</span>
              </div>
            </div>

            {/* Checkout button */}
            <Link
              href="/checkout"
              onClick={closeCart}
              className="block w-full text-center py-3.5 bg-kb-teal text-white font-semibold rounded-xl hover:bg-kb-teal/90 transition-colors"
            >
              Proceed to Checkout
            </Link>
            <p className="text-xs text-kb-muted text-center">
              Inclusive of all taxes. Free exchanges within {' '}
              <Link href="/exchange-policy" className="underline" onClick={closeCart}>7 days</Link>.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ── CartItemRow ────────────────────────────────────────────────────────────────

function CartItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item:     CartItem;
  onUpdate: (itemId: string, qty: number) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const price = item.salePrice ?? item.mrp;

  async function change(delta: number) {
    const newQty = item.quantity + delta;
    setBusy(true);
    try {
      if (newQty <= 0) {
        await onRemove(item.id);
      } else {
        await onUpdate(item.id, newQty);
      }
    } finally {
      setBusy(false);
    }
  }

  const imgSrc = imageUrl(item.primaryImage);

  return (
    <div className="flex gap-3">
      {/* Image */}
      <div className="relative w-20 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-100" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/product/${item.slug}`}
          className="text-sm font-medium text-kb-charcoal hover:text-kb-teal line-clamp-2 leading-snug"
        >
          {item.name}
        </Link>
        <p className="text-xs text-kb-muted mt-0.5">{item.sku}</p>

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-sm font-semibold text-kb-charcoal">{formatINR(price)}</span>
          {item.salePrice && (
            <span className="text-xs text-kb-muted line-through">{formatINR(item.mrp)}</span>
          )}
        </div>

        {/* Quantity controls */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => change(-1)}
              disabled={busy}
              className="w-7 h-7 flex items-center justify-center text-kb-charcoal hover:bg-gray-50 disabled:opacity-40 transition-colors text-lg leading-none"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-7 text-center text-sm font-medium text-kb-charcoal">
              {item.quantity}
            </span>
            <button
              onClick={() => change(1)}
              disabled={busy || item.quantity >= item.maxQty}
              className="w-7 h-7 flex items-center justify-center text-kb-charcoal hover:bg-gray-50 disabled:opacity-40 transition-colors text-lg leading-none"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <button
            onClick={() => { setBusy(true); onRemove(item.id).finally(() => setBusy(false)); }}
            disabled={busy}
            className="text-xs text-kb-muted hover:text-kb-error transition-colors"
          >
            Remove
          </button>
        </div>

        {/* Low stock warning */}
        {item.maxQty > 0 && item.maxQty <= 3 && (
          <p className="text-xs text-kb-amber mt-1">Only {item.maxQty} left!</p>
        )}
        {item.maxQty === 0 && (
          <p className="text-xs text-kb-error mt-1">Out of stock</p>
        )}
      </div>
    </div>
  );
}
