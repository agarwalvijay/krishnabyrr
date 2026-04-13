import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { CartProvider } from '@/components/cart/CartContext';
import { CustomerAuthProvider } from '@/contexts/AuthContext';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-cormorant',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'KrishnaByrr — Handcrafted Indian Ethnic Wear',
    template: '%s | KrishnaByrr',
  },
  description:
    'Discover handcrafted Indian ethnic wear — sarees, dupattas, kurta sets and more. Authentic weaves, timeless elegance.',
  keywords: ['Indian ethnic wear', 'handcrafted sarees', 'Maheshwari silk', 'Chanderi', 'KrishnaByrr'],
  openGraph: {
    siteName: 'KrishnaByrr',
    locale: 'en_IN',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="flex flex-col min-h-screen">
        <CartProvider>
          <CustomerAuthProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </CustomerAuthProvider>
        </CartProvider>
      </body>
    </html>
  );
}
