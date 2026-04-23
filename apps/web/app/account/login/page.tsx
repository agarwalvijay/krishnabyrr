'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useCustomerAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';

const schema = z.object({
  identifier: z.string().min(1, 'Email or mobile number is required'),
  password:   z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

// ── WhatsApp login section ────────────────────────────────────────────────────

type WaState = 'idle' | 'sending' | 'sent' | 'error';

function WhatsAppLogin({ identifier }: { identifier: string }) {
  const [waState, setWaState] = useState<WaState>('idle');
  const [waError, setWaError] = useState('');

  const sendLink = async () => {
    if (!identifier.trim()) {
      setWaError('Enter your email or mobile number above first.');
      setWaState('error');
      return;
    }
    setWaState('sending');
    setWaError('');
    try {
      await apiClient.post('/auth/send-login-link', { identifier: identifier.trim() });
      setWaState('sent');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Could not send link. Please try again.';
      setWaError(msg);
      setWaState('error');
    }
  };

  if (waState === 'sent') {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm text-center"
        style={{ background: 'rgba(39,174,96,0.08)', color: 'var(--kb-success)' }}
      >
        <span className="font-semibold">Link sent!</span> Check WhatsApp and tap the button to sign in.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs" style={{ color: 'var(--kb-muted)' }}>or</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <button
        type="button"
        onClick={sendLink}
        disabled={waState === 'sending'}
        className="w-full py-3 rounded-xl text-sm font-semibold border-2 flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
        style={{ borderColor: '#25D366', color: '#25D366' }}
      >
        {/* WhatsApp icon */}
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {waState === 'sending' ? 'Sending…' : 'Sign in via WhatsApp'}
      </button>

      {waState === 'error' && (
        <p className="text-xs text-center" style={{ color: 'var(--kb-error)' }}>{waError}</p>
      )}
    </div>
  );
}

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/account';
  const { login }    = useCustomerAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const identifierValue = watch('identifier') ?? '';

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      await login(values.identifier, values.password);
      router.push(redirect);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setApiError(axiosErr?.response?.data?.error?.message ?? 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--kb-cream)' }}>
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-sm p-8 space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-teal)' }}>
            Krishna&apos;s Bliss
          </Link>
          <p className="mt-1 text-sm" style={{ color: 'var(--kb-muted)' }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
              Email or Mobile Number
            </label>
            <input
              {...register('identifier')}
              type="text"
              autoComplete="email tel"
              placeholder="you@example.com or 9876543210"
              inputMode="email"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            />
            {errors.identifier && <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{errors.identifier.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
              Password
            </label>
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            />
            {errors.password && <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{errors.password.message}</p>}
          </div>

          {apiError && (
            <p className="text-sm text-center py-2 px-3 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ background: 'var(--kb-teal)' }}
          >
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* WhatsApp passwordless login */}
        <WhatsAppLogin identifier={identifierValue} />

        <div className="text-center space-y-2">
          <p className="text-xs" style={{ color: 'var(--kb-muted)' }}>
            <Link href="#" className="underline">Forgot password?</Link>
          </p>
          <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>
            New customer?{' '}
            <Link href="/account/register" className="font-medium underline" style={{ color: 'var(--kb-teal)' }}>
              Create account →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><LoginPage /></Suspense>;
}
