import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';

// Self-hosted Google Fonts via next/font — no render-blocking
// external stylesheet request, no FOIT/FOUT, full preloading.
const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500'],
  variable: '--font-inter',
  display:  'swap',
});
const cormorant = Cormorant_Garamond({
  subsets:  ['latin'],
  weight:   ['400', '600'],
  style:    ['normal', 'italic'],
  variable: '--font-cormorant',
  display:  'swap',
});
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/seo/JsonLd';
import Analytics from '@/components/Analytics';
import { CartProvider } from '@/components/cart/CartContext';
import { CustomerAuthProvider } from '@/contexts/AuthContext';
import { SiteSettingsProvider } from '@/contexts/SiteSettingsContext';
import { WishlistProvider } from '@/contexts/WishlistContext';
import { serverFetch, type PublicSettings } from '@/lib/api';

export const metadata: Metadata = {
  title: {
    default: "Krishna's Bliss — Handcrafted Indian Ethnic Wear",
    template: "%s | Krishna's Bliss",
  },
  description:
    'Discover handcrafted Indian ethnic wear — sarees, dupattas, kurta sets and more. Authentic weaves, timeless elegance.',
  keywords: ['Indian ethnic wear', 'handcrafted sarees', 'Maheshwari silk', 'Chanderi', "Krishna's Bliss"],
  openGraph: {
    siteName: "Krishna's Bliss",
    locale: 'en_IN',
    type: 'website',
  },
  icons: {
    icon: '/logo-krishnas-bliss.png',
    shortcut: '/logo-krishnas-bliss.png',
    apple: '/logo-krishnas-bliss.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await serverFetch<PublicSettings>('/api/settings/public', { revalidate: 3600 }).catch(() => ({} as PublicSettings));
  const gaId = settings.ga_tag ?? null;

  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <head />

      {/* Google Analytics — only rendered when ga_tag is configured in Settings */}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="lazyOnload"
          />
          <Script id="ga-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { page_path: window.location.pathname });
            `}
          </Script>
        </>
      )}
      <body className="flex flex-col min-h-screen">
        {gaId && (
          <Suspense fallback={null}>
            <Analytics gaId={gaId} />
          </Suspense>
        )}
        <SiteSettingsProvider>
          {/* AuthProvider wraps CartProvider so the cart can observe login/logout
              transitions and refetch (cross-device cart sync). */}
          <CustomerAuthProvider>
            <CartProvider>
              <WishlistProvider>
                <OrganizationJsonLd />
                <WebSiteJsonLd />
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </WishlistProvider>
            </CartProvider>
          </CustomerAuthProvider>
        </SiteSettingsProvider>
      </body>
    </html>
  );
}
