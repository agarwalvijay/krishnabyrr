'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useCustomerAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import PhoneInput from '@/components/ui/PhoneInput';

const schema = z.object({
  name:            z.string().min(1, 'Name is required').max(100),
  email:           z.union([z.string().email('Enter a valid email address'), z.literal('')]).optional(),
  phone:           z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

function RegisterPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { register: registerCustomer } = useCustomerAuth();

  const prefillEmail  = searchParams.get('email')  ?? '';
  const linkedOrder   = searchParams.get('order')  ?? '';
  const [apiError, setApiError]   = useState<string | null>(null);
  const [linkToast, setLinkToast] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: prefillEmail },
  });

  useEffect(() => {
    if (prefillEmail) setValue('email', prefillEmail);
  }, [prefillEmail, setValue]);

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      const emailVal = values.email?.trim() || '';
      await registerCustomer(values.name, emailVal, values.phone, values.password);

      // Link the guest order if we came from the confirmation page
      if (linkedOrder && emailVal) {
        try {
          await apiClient.post('/auth/link-order', { orderNumber: linkedOrder, email: emailVal });
          setLinkToast(true);
        } catch {}
      }

      router.push('/account');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setApiError(axiosErr?.response?.data?.error?.message ?? 'Registration failed. Please try again.');
    }
  };

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
          <p className="mt-1 text-sm" style={{ color: 'var(--kb-muted)' }}>Create your account</p>
        </div>

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

        <p className="text-sm text-center" style={{ color: 'var(--kb-muted)' }}>
          Already have an account?{' '}
          <Link href="/account/login" className="font-medium underline" style={{ color: 'var(--kb-teal)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><RegisterPage /></Suspense>;
}
