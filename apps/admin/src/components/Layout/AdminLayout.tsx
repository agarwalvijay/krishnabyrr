import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_LABELS } from '../../lib/format';
import { api } from '../../lib/api';

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const Icons = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2"/>
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2"/>
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2"/>
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2"/>
    </svg>
  ),
  products: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  categories: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  tags: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  collections: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  orders: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  coupons: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  ),
  customers: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  homepage: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  signOut: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  refresh: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { label: 'Dashboard',   path: '/dashboard',   icon: Icons.dashboard },
  { label: 'Products',    path: '/products',    icon: Icons.products },
  { label: 'Categories',  path: '/categories',  icon: Icons.categories },
  { label: 'Tags',        path: '/tags',        icon: Icons.tags },
  { label: 'Badges',      path: '/badges',      icon: Icons.tags },
  { label: 'Collections', path: '/collections', icon: Icons.collections },
  { label: 'Homepage',    path: '/homepage',    icon: Icons.homepage },
  { label: 'Orders',      path: '/orders',      icon: Icons.orders },
  { label: 'Coupons',     path: '/coupons',     icon: Icons.coupons },
  { label: 'Customers',   path: '/customers',   icon: Icons.customers },
  { label: 'Settings',    path: '/settings',    icon: Icons.settings },
];

interface AdminLayoutProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function AdminLayout({ title, action, children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [cacheState, setCacheState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleRefreshCache = async () => {
    setCacheState('loading');
    try {
      await api.post('/admin/revalidate-cache');
      setCacheState('done');
      setTimeout(() => setCacheState('idle'), 3000);
    } catch {
      setCacheState('error');
      setTimeout(() => setCacheState('idle'), 3000);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-kb-cream">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col flex-shrink-0 bg-white scroll-y"
        style={{ width: 240, borderRight: '1px solid #EBEBEB' }}
      >
        {/* Brand */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span
              className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-[#faf7f0]"
              style={{ outline: '1.5px solid #BF9B30' }}
            >
              <img
                src="/logo-krishnas-bliss.png"
                alt="Krishna's Bliss"
                className="w-full h-full object-contain"
              />
            </span>
            <div>
              <p className="text-sm font-semibold text-kb-charcoal leading-none" style={{ fontFamily: 'Georgia, serif' }}>
                Krishna's Bliss
              </p>
              <p className="text-xs text-kb-muted mt-0.5">Admin</p>
            </div>
          </div>
          {user && (
            <span
              className="mt-3 inline-block text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(26,107,107,0.1)', color: 'var(--kb-teal)' }}
            >
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ label, path, icon }) => {
            // Products sub-paths should also highlight Products nav item
            const isActive =
              path === '/products'
                ? location.pathname.startsWith('/products')
                : location.pathname === path;

            return (
              <NavLink
                key={path}
                to={path}
                className={() =>
                  [
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    isActive
                      ? 'font-medium text-kb-teal bg-teal-50'
                      : 'text-kb-muted hover:text-kb-charcoal hover:bg-gray-50',
                  ].join(' ')
                }
                style={isActive ? { borderLeft: '3px solid var(--kb-teal)', paddingLeft: 9 } : undefined}
              >
                {icon}
                {label}
              </NavLink>
            );
          })}
        </nav>

        {/* User footer */}
        {user && (
          <div className="px-4 py-4 border-t border-gray-100">
            <p className="text-sm font-medium text-kb-charcoal truncate">{user.name}</p>
            <p className="text-xs text-kb-muted truncate mb-3">{user.email}</p>
            <button
              onClick={handleRefreshCache}
              disabled={cacheState === 'loading'}
              className={`flex items-center gap-2 text-xs transition-colors mb-2 ${
                cacheState === 'done'  ? 'text-kb-teal' :
                cacheState === 'error' ? 'text-kb-error' :
                'text-kb-muted hover:text-kb-charcoal'
              }`}
            >
              <span className={cacheState === 'loading' ? 'animate-spin' : ''}>
                {Icons.refresh}
              </span>
              {cacheState === 'loading' ? 'Refreshing…' :
               cacheState === 'done'    ? 'Cache refreshed!' :
               cacheState === 'error'   ? 'Refresh failed' :
               'Refresh Site Cache'}
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-xs text-kb-muted hover:text-kb-error transition-colors"
            >
              {Icons.signOut}
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top header */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white"
          style={{ borderBottom: '1px solid #EBEBEB', minHeight: 56 }}
        >
          <h1 className="text-base font-semibold text-kb-charcoal">{title}</h1>
          {action && <div>{action}</div>}
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
