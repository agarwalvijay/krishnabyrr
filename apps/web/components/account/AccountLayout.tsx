'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAuth, useIsLoggedIn } from '@/contexts/AuthContext';

const NAV_LINKS = [
  { href: '/account',           label: 'Overview' },
  { href: '/account/orders',    label: 'Orders' },
  { href: '/account/wishlist',  label: 'Wishlist' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/profile',   label: 'Profile' },
] as const;

interface AccountLayoutProps {
  children: React.ReactNode;
  title?:   string;
}

export default function AccountLayout({ children, title }: AccountLayoutProps) {
  const pathname   = usePathname();
  const router     = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const { isLoading } = useCustomerAuth();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace(`/account/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isLoggedIn, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--kb-cream)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Mobile tab strip */}
        <nav className="md:hidden flex overflow-x-auto gap-1 mb-6 -mx-4 px-4 pb-1 scrollbar-hide">
          {NAV_LINKS.map(link => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
                style={{
                  background: active ? 'var(--kb-teal)' : 'white',
                  color:      active ? 'white' : 'var(--kb-charcoal)',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="md:grid md:grid-cols-[220px_1fr] gap-8 items-start">
          {/* Desktop sidebar */}
          <aside className="hidden md:block bg-white rounded-2xl shadow-sm p-4 sticky top-6">
            <nav className="space-y-0.5">
              {NAV_LINKS.map(link => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{
                      color:             active ? 'var(--kb-teal)' : 'var(--kb-charcoal)',
                      borderLeft:        active ? '3px solid var(--kb-teal)' : '3px solid transparent',
                      background:        active ? 'rgba(26,107,107,0.06)' : 'transparent',
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main>
            {title && (
              <h1 className="font-display text-3xl font-semibold mb-6" style={{ color: 'var(--kb-charcoal)' }}>
                {title}
              </h1>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
