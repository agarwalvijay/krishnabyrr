import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Suspense } from 'react';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
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
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Google Analytics — only rendered when ga_tag is configured in Settings */}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
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
          <CartProvider>
            <CustomerAuthProvider>
              <WishlistProvider>
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </WishlistProvider>
            </CustomerAuthProvider>
          </CartProvider>
        </SiteSettingsProvider>
      </body>
    </html>
  );
}
