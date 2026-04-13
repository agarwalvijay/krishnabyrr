'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useCustomerAuth } from '@/contexts/AuthContext';

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/account';
  const { login }    = useCustomerAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      await login(values.email, values.password);
      router.push(redirect);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setApiError(axiosErr?.response?.data?.error?.message ?? 'Invalid email or password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--kb-cream)' }}>
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-sm p-8 space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-teal)' }}>
            KrishnaByrr
          </Link>
          <p className="mt-1 text-sm" style={{ color: 'var(--kb-muted)' }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            />
            {errors.email && <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{errors.email.message}</p>}
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
