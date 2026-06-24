'use client';

import { useCallback, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useCustomerAuth } from '@/contexts/AuthContext';
import { apiClient, type Customer } from '@/lib/api';
import PhoneInput from '@/components/ui/PhoneInput';
import PairingWaiter from '@/components/auth/PairingWaiter';

// ── Schemas ───────────────────────────────────────────────────────────────────

const whatsappSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
});

const passwordSchema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type WhatsappValues = z.infer<typeof whatsappSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage() {
  const router                    = useRouter();
  const searchParams              = useSearchParams();
  const redirect                  = searchParams.get('redirect') ?? '/account';
  const { login, loginWithToken } = useCustomerAuth();

  // 'whatsapp' = default, phone field + WhatsApp magic-link.
  // 'password' = email + password (secondary fallback).
  const [mode, setMode] = useState<'whatsapp' | 'password'>('whatsapp');

  // WhatsApp flow state
  const [waState, setWaState] = useState<'idle' | 'sending' | 'waiting' | 'error'>('idle');
  const [waError, setWaError] = useState('');
  const [sessionId, setSession] = useState<string | null>(null);

  // Password flow state
  const [pwError, setPwError] = useState<string | null>(null);

  // ── WhatsApp form ────────────────────────────────────────────────────────
  const waForm = useForm<WhatsappValues>({ resolver: zodResolver(whatsappSchema) });

  const onWhatsappSubmit = useCallback(async (values: WhatsappValues) => {
    setWaState('sending');
    setWaError('');
    try {
      const res = await apiClient.post<{ data: { session_id: string } }>(
        '/auth/send-login-link',
        { identifier: values.phone },
      );
      setSession(res.data.data.session_id);
      setWaState('waiting');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Could not send link. Please try again.';
      setWaError(msg);
      setWaState('error');
    }
  }, []);

  const handleApproved = useCallback((payload: unknown) => {
    const p = payload as { token?: string; customer?: Customer };
    if (p?.token && p?.customer) {
      loginWithToken(p.token, p.customer);
      router.push(redirect);
    }
  }, [loginWithToken, router, redirect]);

  // ── Password form ────────────────────────────────────────────────────────
  const pwForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const onPasswordSubmit = useCallback(async (values: PasswordValues) => {
    setPwError(null);
    try {
      await login(values.email, values.password);
      router.push(redirect);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setPwError(axiosErr?.response?.data?.error?.message ?? 'Invalid credentials');
    }
  }, [login, router, redirect]);

  // ── WhatsApp waiting state — show pairing UI ─────────────────────────────
  if (waState === 'waiting' && sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--kb-cream)' }}>
        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-sm p-8 space-y-6">
          <div className="text-center">
            <Link href="/" className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-teal)' }}>
              Krishna&apos;s Bliss
            </Link>
          </div>
          <PairingWaiter
            sessionId={sessionId}
            onApproved={handleApproved}
            onResend={() => { setSession(null); setWaState('idle'); }}
            title="Check WhatsApp on your phone"
            subtitle="We've sent you a tap-to-sign-in link. Once you tap it on your phone, this page will sign you in automatically."
            resendLabel="Send a new link"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--kb-cream)' }}>
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-sm p-8 space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-teal)' }}>
            Krishna&apos;s Bliss
          </Link>
          <p className="mt-1 text-sm" style={{ color: 'var(--kb-muted)' }}>
            {mode === 'whatsapp' ? 'Sign in with your mobile number' : 'Sign in with email & password'}
          </p>
        </div>

        {/* ── WhatsApp mode (default) ───────────────────────────────────── */}
        {mode === 'whatsapp' && (
          <form onSubmit={waForm.handleSubmit(onWhatsappSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                Mobile Number
              </label>
              <PhoneInput
                {...waForm.register('phone')}
                placeholder="9876543210"
                autoComplete="tel"
                hasError={!!waForm.formState.errors.phone}
              />
              {waForm.formState.errors.phone && (
                <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>
                  {waForm.formState.errors.phone.message}
                </p>
              )}
            </div>

            {waState === 'error' && waError && (
              <p className="text-sm text-center py-2 px-3 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
                {waError}
              </p>
            )}

            <button
              type="submit"
              disabled={waState === 'sending'}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
              style={{ background: '#25D366' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {waState === 'sending' ? 'Sending…' : 'Continue on WhatsApp'}
            </button>

            <p className="text-xs text-center" style={{ color: 'var(--kb-muted)' }}>
              <button
                type="button"
                onClick={() => { setWaError(''); setWaState('idle'); setMode('password'); }}
                className="underline hover:no-underline"
              >
                Sign in with email & password
              </button>
            </p>
          </form>
        )}

        {/* ── Password mode (fallback) ──────────────────────────────────── */}
        {mode === 'password' && (
          <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                Email
              </label>
              <input
                {...pwForm.register('email')}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              />
              {pwForm.formState.errors.email && (
                <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>
                  {pwForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                Password
              </label>
              <input
                {...pwForm.register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              />
              {pwForm.formState.errors.password && (
                <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>
                  {pwForm.formState.errors.password.message}
                </p>
              )}
            </div>

            {pwError && (
              <p className="text-sm text-center py-2 px-3 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
                {pwError}
              </p>
            )}

            <button
              type="submit"
              disabled={pwForm.formState.isSubmitting}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
              style={{ background: 'var(--kb-teal)' }}
            >
              {pwForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>

            <p className="text-xs text-center" style={{ color: 'var(--kb-muted)' }}>
              <button
                type="button"
                onClick={() => { setPwError(null); setMode('whatsapp'); }}
                className="underline hover:no-underline"
              >
                Use WhatsApp instead
              </button>
            </p>
          </form>
        )}

        <div className="text-center">
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
