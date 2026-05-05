'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, type Customer } from '@/lib/api';
import { useCustomerAuth } from '@/contexts/AuthContext';

type Status = 'verifying' | 'success' | 'error';

function LoginLinkPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('t');
  const { loginWithToken } = useCustomerAuth();

  const [status, setStatus]   = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  const [signedInHere, setSignedInHere] = useState<{ token: string; customer: Customer } | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid login link.');
      return;
    }

    apiClient
      .post<{ data: { token: string; customer: Customer } }>(
        '/auth/verify-login-link',
        { token },
      )
      .then(res => {
        const { token: jwt, customer } = res.data.data;
        // Stash the JWT so the user can opt to continue on this device.
        // The laptop that originated the link gets its own copy via polling.
        setSignedInHere({ token: jwt, customer });
        setStatus('success');
      })
      .catch(err => {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? 'Login failed.';
        setStatus('error');
        setMessage(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const continueHere = () => {
    if (!signedInHere) return;
    loginWithToken(signedInHere.token, signedInHere.customer);
    router.replace('/account');
  };

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
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>Signing you in…</p>
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
              You&apos;re signed in
            </h1>
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>
              You can return to the device where you started — it will sign you in automatically.
            </p>
            <button
              type="button"
              onClick={continueHere}
              className="mt-2 w-full py-3 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--kb-teal)' }}
            >
              Continue here instead
            </button>
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
              Back to sign in →
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
      <LoginLinkPage />
    </Suspense>
  );
}
