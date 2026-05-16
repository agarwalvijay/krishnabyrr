'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, type Customer } from '@/lib/api';
import { useCustomerAuth } from '@/contexts/AuthContext';

type Status = 'verifying' | 'success' | 'error';

function ClaimPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token');
  const { loginWithToken } = useCustomerAuth();

  const [status, setStatus]           = useState<Status>('verifying');
  const [message, setMessage]         = useState('');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This link is missing its token.');
      return;
    }

    apiClient
      .post<{ data: { token: string; customer: Customer; order_number: string } }>(
        '/auth/claim-order',
        { token },
      )
      .then(res => {
        const { token: jwt, customer, order_number } = res.data.data;
        loginWithToken(jwt, customer);
        setOrderNumber(order_number);
        setStatus('success');
        // Take them straight to their order list after a brief confirmation.
        setTimeout(() => router.replace('/account/orders'), 1500);
      })
      .catch(err => {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? 'Could not claim this order.';
        setStatus('error');
        setMessage(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--kb-cream)' }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 text-center space-y-4">
        <Link href="/" className="font-display text-xl font-semibold" style={{ color: 'var(--kb-teal)' }}>
          Krishna&apos;s Bliss
        </Link>

        {status === 'verifying' && (
          <>
            <div
              className="w-10 h-10 mx-auto rounded-full border-4 animate-spin"
              style={{ borderColor: 'var(--kb-teal)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>Linking your order…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div
              className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'rgba(39,174,96,0.1)', color: 'var(--kb-success)' }}
            >
              ✓
            </div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
              Order saved to your account
            </h1>
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>
              {orderNumber ? `#${orderNumber} ` : ''}is now in your order history. Taking you there…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}
            >
              ✕
            </div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
              Link expired or invalid
            </h1>
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>{message}</p>
            <Link
              href="/account/login"
              className="inline-block mt-2 text-sm font-medium underline"
              style={{ color: 'var(--kb-teal)' }}
            >
              Sign in instead →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ClaimPage />
    </Suspense>
  );
}
