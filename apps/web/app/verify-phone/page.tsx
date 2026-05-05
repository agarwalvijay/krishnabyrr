'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

type Status = 'verifying' | 'success' | 'error';

function VerifyPhonePage() {
  const searchParams = useSearchParams();
  const token        = searchParams.get('t');

  const [status, setStatus]   = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link.');
      return;
    }

    apiClient
      .post('/auth/verify-phone', { token })
      .then(() => {
        // Server has already signalled the laptop's polling session — no need
        // to set anything in this device's local storage. The laptop will
        // pick up the JWT through /magic-session/:id.
        setStatus('success');
      })
      .catch(err => {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? 'Verification failed.';
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
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>Verifying your phone number…</p>
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
              Phone verified
            </h1>
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>
              Return to the device where you started — it will continue automatically.
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
              Verification failed
            </h1>
            <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>{message}</p>
            <Link
              href="/account"
              className="inline-block mt-2 text-sm font-medium underline"
              style={{ color: 'var(--kb-teal)' }}
            >
              Go to account to request a new link →
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
      <VerifyPhonePage />
    </Suspense>
  );
}
