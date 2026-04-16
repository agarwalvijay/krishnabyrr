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
          <div className="inline-flex flex-col items-center gap-1 mb-3">
            <span
              className="w-20 h-20 rounded-full overflow-hidden bg-[#faf7f0] shadow-md inline-flex items-center justify-center"
              style={{ outline: '1.5px solid #BF9B30' }}
            >
              <img
                src="/logo-krishnas-bliss.png"
                alt="Krishna's Bliss"
                className="w-full h-full object-contain"
              />
            </span>
            <span className="mt-2 flex flex-col items-center leading-none">
              <span className="text-xl font-normal tracking-wide" style={{ fontFamily: 'Georgia, serif', color: 'var(--kb-charcoal)' }}>
                Krishna's
              </span>
              <span className="text-base italic font-light -mt-0.5 tracking-wide" style={{ fontFamily: 'Georgia, serif', color: 'var(--kb-charcoal)', opacity: 0.75 }}>
                Bliss
              </span>
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
          Krishna's Bliss © {new Date().getFullYear()} — Internal use only
        </p>
      </div>
    </div>
  );
}
