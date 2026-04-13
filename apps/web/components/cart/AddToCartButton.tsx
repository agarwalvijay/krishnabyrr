'use client';

import { useState } from 'react';
import { useCart } from './CartContext';

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

interface AddToCartButtonProps {
  productId:   string;
  stockQty:    number;
  quantity?:   number;
  className?:  string;
  fullWidth?:  boolean;
  label?:      string;
}

export default function AddToCartButton({
  productId,
  stockQty,
  quantity = 1,
  className = '',
  fullWidth = true,
  label = 'Add to Cart',
}: AddToCartButtonProps) {
  const { addItem, openCart } = useCart();
  const [btnState, setBtnState] = useState<ButtonState>('idle');

  const soldOut = stockQty <= 0;

  async function handleClick() {
    if (soldOut || btnState === 'loading') return;

    setBtnState('loading');
    try {
      await addItem(productId, quantity);
      setBtnState('success');
      openCart();
      // Reset after 2.5s
      setTimeout(() => setBtnState('idle'), 2500);
    } catch {
      setBtnState('error');
      setTimeout(() => setBtnState('idle'), 2500);
    }
  }

  if (soldOut) {
    return (
      <button
        disabled
        className={`${fullWidth ? 'w-full' : ''} py-3.5 px-6 rounded-xl font-semibold text-sm bg-gray-100 text-gray-400 cursor-not-allowed ${className}`}
      >
        Sold Out
      </button>
    );
  }

  const stateStyles: Record<ButtonState, string> = {
    idle:    'bg-kb-teal text-white hover:bg-kb-teal/90',
    loading: 'bg-kb-teal/70 text-white cursor-wait',
    success: 'bg-kb-success text-white',
    error:   'bg-kb-error text-white',
  };

  const stateLabels: Record<ButtonState, string> = {
    idle:    label,
    loading: 'Adding…',
    success: 'Added!',
    error:   'Try again',
  };

  return (
    <button
      onClick={handleClick}
      disabled={btnState === 'loading'}
      className={`${fullWidth ? 'w-full' : ''} py-3.5 px-6 rounded-xl font-semibold text-sm transition-colors duration-200 ${stateStyles[btnState]} ${className}`}
    >
      {btnState === 'loading' ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Adding…
        </span>
      ) : (
        stateLabels[btnState]
      )}
    </button>
  );
}
