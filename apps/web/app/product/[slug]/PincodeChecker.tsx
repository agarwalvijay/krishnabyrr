'use client';

import { useState } from 'react';
import { isDelNcrPincode, getShippingZone } from '@/lib/constants';
import { formatINR } from '@/lib/api';

interface Props {
  zoneARate: number;
  zoneBRate: number;
  freeShippingThreshold?: number;
  productPrice: number;
}

type CheckResult =
  | { status: 'idle' }
  | { status: 'invalid' }
  | { status: 'zone_a'; rate: number; free: boolean }
  | { status: 'zone_b'; rate: number; free: boolean };

export default function PincodeChecker({ zoneARate, zoneBRate, freeShippingThreshold, productPrice }: Props) {
  const [pincode, setPincode] = useState('');
  const [result, setResult]   = useState<CheckResult>({ status: 'idle' });

  const check = () => {
    const cleaned = pincode.replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setResult({ status: 'invalid' });
      return;
    }
    const zone   = getShippingZone(cleaned);
    const rate   = zone === 'A' ? zoneARate : zoneBRate;
    const isFree = freeShippingThreshold != null && productPrice >= freeShippingThreshold;
    if (zone === 'A') {
      setResult({ status: 'zone_a', rate, free: isFree });
    } else {
      setResult({ status: 'zone_b', rate, free: isFree });
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-medium text-kb-charcoal mb-3">
        Check delivery to your pincode
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]*"
          value={pincode}
          onChange={e => {
            setPincode(e.target.value.replace(/\D/g, '').slice(0, 6));
            if (result.status !== 'idle') setResult({ status: 'idle' });
          }}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="Enter 6-digit pincode"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kb-teal"
        />
        <button
          onClick={check}
          disabled={pincode.length < 6}
          className="px-4 py-2 bg-kb-teal text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Check
        </button>
      </div>

      {result.status === 'invalid' && (
        <p className="mt-2 text-xs text-kb-error">Please enter a valid 6-digit pincode.</p>
      )}
      {(result.status === 'zone_a' || result.status === 'zone_b') && (
        <div className="mt-3 flex flex-col gap-1">
          <p className="text-sm font-medium text-kb-success flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {result.status === 'zone_a'
              ? 'Zone A: Estimated delivery in 2–3 business days'
              : 'Zone B: Estimated delivery in 5–7 business days'}
          </p>
          <p className="text-xs text-kb-muted">
            {result.free
              ? 'Free Shipping on this order'
              : `Shipping: ${formatINR(result.rate)}`}
          </p>
        </div>
      )}
    </div>
  );
}
