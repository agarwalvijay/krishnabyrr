import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Already logged in
  useEffect(() => {
    if (user) navigate('/products', { replace: true });
  }, [user, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.email, data.password);
    } catch {
      toast.error('Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-kb-cream flex items-center justify-center px-4">
      {/* Decorative teal accent bar */}
      <div
        className="fixed top-0 left-0 right-0 h-1"
        style={{ background: 'linear-gradient(90deg, var(--kb-teal), var(--kb-iridescent))' }}
      />

      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 mb-3"
            style={{ color: 'var(--kb-teal)' }}
          >
            {/* Peacock feather icon */}
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" fill="var(--kb-teal)" opacity="0.1" />
              <circle cx="16" cy="16" r="5" fill="var(--kb-teal)" />
              <path d="M16 4 C16 4 20 10 20 16 C20 22 16 28 16 28" stroke="var(--kb-iridescent)" strokeWidth="1.5" fill="none" />
              <path d="M4 16 C4 16 10 20 16 20 C22 20 28 16 28 16" stroke="var(--kb-iridescent)" strokeWidth="1.5" fill="none" />
              <path d="M7 7 C7 7 12 12 16 16 C20 20 25 25 25 25" stroke="var(--kb-gold)" strokeWidth="1.2" fill="none" />
              <path d="M25 7 C25 7 20 12 16 16 C12 20 7 25 7 25" stroke="var(--kb-gold)" strokeWidth="1.2" fill="none" />
            </svg>
            <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--kb-teal)' }}>
              KrishnaByrr
            </span>
          </div>
          <p className="text-sm text-kb-muted">Admin Portal</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h1 className="text-lg font-semibold text-kb-charcoal mb-6">Sign in to your account</h1>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="admin@krishnabyrr.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-kb-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-kb-error">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-kb-muted mt-6">
          KrishnaByrr © {new Date().getFullYear()} — Internal use only
        </p>
      </div>
    </div>
  );
}
