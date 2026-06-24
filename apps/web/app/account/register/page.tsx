'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useCustomerAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import PhoneInput from '@/components/ui/PhoneInput';
import PairingWaiter from '@/components/auth/PairingWaiter';

const schema = z.object({
  name:            z.string().min(1, 'Name is required').max(100),
  email:           z.union([z.string().email('Enter a valid email address'), z.literal('')]).optional(),
  phone:           z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  password:        z.union([z.string().min(8, 'Password must be at least 8 characters'), z.literal('')]).optional(),
  confirmPassword: z.string().optional(),
}).refine(d => !d.password || d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

function RegisterPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { register: registerCustomer, refreshCustomer } = useCustomerAuth();

  const prefillEmail  = searchParams.get('email')  ?? '';
  const linkedOrder   = searchParams.get('order')  ?? '';
  const [apiError, setApiError]       = useState<string | null>(null);
  const [linkToast, setLinkToast]     = useState(false);
  const [verifySession, setVerifySession] = useState<string | null>(null);
  const [customerName, setCustomerName]   = useState('');
  const [showPassword, setShowPassword]   = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: prefillEmail },
  });

  useEffect(() => {
    if (prefillEmail) setValue('email', prefillEmail);
  }, [prefillEmail, setValue]);

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      const emailVal    = values.email?.trim() || '';
      const passwordVal = (showPassword ? values.password : '') || '';
      const result      = await registerCustomer(values.name, emailVal, values.phone, passwordVal);

      // Link the guest order if we came from the confirmation page
      if (linkedOrder && emailVal) {
        try {
          await apiClient.post('/auth/link-order', { orderNumber: linkedOrder, email: emailVal });
          setLinkToast(true);
        } catch {}
      }

      // Show the pairing waiter so the user can verify their phone on WhatsApp
      // and the laptop completes automatically. If the API didn't issue a session
      // (no phone, WhatsApp send failed, etc), skip straight to /account.
      if (result.verify_session_id) {
        setCustomerName(result.customer.name);
        setVerifySession(result.verify_session_id);
      } else {
        router.push('/account');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setApiError(axiosErr?.response?.data?.error?.message ?? 'Registration failed. Please try again.');
    }
  };

  const handleVerifyApproved = useCallback(async () => {
    // Phone is now verified — refresh the customer so phone_verified flips in UI
    await refreshCustomer();
    router.push('/account');
  }, [refreshCustomer, router]);

  const handleResendVerification = useCallback(async () => {
    try {
      const res = await apiClient.post<{ data: { session_id: string } }>('/auth/send-verification', {});
      setVerifySession(res.data.data.session_id);
    } catch {
      // surface a toast or noop — user can also click "verify later"
    }
  }, []);

  const phoneValue = watch('phone') ?? '';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--kb-cream)' }}>
      {linkToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-white text-sm shadow-xl" style={{ background: 'var(--kb-success)' }}>
          Account created! Your order has been linked.
        </div>
      )}

      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-sm p-8 space-y-6">
        <div className="text-center">
          <Link href="/" className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-teal)' }}>
            Krishna's Bliss
          </Link>
          <p className="mt-1 text-sm" style={{ color: 'var(--kb-muted)' }}>
            {verifySession ? `Welcome, ${customerName}` : 'Create your account'}
          </p>
        </div>

        {verifySession && (
          <PairingWaiter
            sessionId={verifySession}
            onApproved={handleVerifyApproved}
            onResend={handleResendVerification}
            onSkip={() => router.push('/account')}
            title={`We sent a verification link to +91 ${phoneValue}`}
            subtitle="Tap the link in your WhatsApp message to confirm your number — this page will continue automatically."
            resendLabel="Send a new link"
            skipLabel="Skip for now — verify later from my account"
          />
        )}

        {!verifySession && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {[
            { name: 'name',  label: 'Full Name',       type: 'text',     placeholder: 'Priya Sharma',   autoComplete: 'name' },
            { name: 'email', label: 'Email (optional)', type: 'email', placeholder: 'you@example.com', autoComplete: 'email' },
          ].map(field => (
            <div key={field.name}>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                {field.label}
              </label>
              <input
                {...register(field.name as keyof FormValues)}
                type={field.type}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              />
              {errors[field.name as keyof FormValues] && (
                <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>
                  {errors[field.name as keyof FormValues]?.message}
                </p>
              )}
            </div>
          ))}

          {/* Phone — rendered separately to use PhoneInput */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
              Mobile Number
            </label>
            <PhoneInput
              {...register('phone')}
              placeholder="9876543210"
              autoComplete="tel"
              hasError={!!errors.phone}
            />
            {errors.phone && (
              <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{errors.phone.message}</p>
            )}
          </div>

          {/* Password — optional, behind a toggle. WhatsApp is the default
              sign-in method; password is for users who want a backup. */}
          {!showPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword(true)}
              className="w-full text-xs text-center underline hover:no-underline py-1"
              style={{ color: 'var(--kb-muted)' }}
            >
              Add a password (optional — for sign-in without WhatsApp)
            </button>
          ) : (
            <div className="space-y-4 p-4 rounded-xl border border-gray-100" style={{ background: 'rgba(0,0,0,0.015)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: 'var(--kb-muted)' }}>Password (optional)</p>
                <button
                  type="button"
                  onClick={() => setShowPassword(false)}
                  className="text-xs underline hover:no-underline"
                  style={{ color: 'var(--kb-muted)' }}
                >
                  Skip
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Password</label>
                <input
                  {...register('password')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                />
                {errors.password && <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Confirm Password</label>
                <input
                  {...register('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                />
                {errors.confirmPassword && <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{errors.confirmPassword.message}</p>}
              </div>
            </div>
          )}

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
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        )}

        {!verifySession && (
        <p className="text-sm text-center" style={{ color: 'var(--kb-muted)' }}>
          Already have an account?{' '}
          <Link href="/account/login" className="font-medium underline" style={{ color: 'var(--kb-teal)' }}>
            Sign in
          </Link>
        </p>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><RegisterPage /></Suspense>;
}
