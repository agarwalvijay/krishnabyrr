import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CartProvider } from '@/components/cart/CartContext';
import { CustomerAuthProvider } from '@/contexts/AuthContext';
import { SiteSettingsProvider } from '@/contexts/SiteSettingsContext';
import { WishlistProvider } from '@/contexts/WishlistContext';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      <body className="flex flex-col min-h-screen">
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
