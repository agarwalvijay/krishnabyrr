import Link from 'next/link';
import Logo from '@/components/layout/Logo';

export default function Footer() {
  return (
    <footer className="bg-kb-charcoal text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm">
        <div className="flex flex-col items-center sm:items-start gap-2">
          <Logo className="h-10 w-auto" textColor="rgba(255,255,255,0.9)" />
          <p className="text-white/50 text-xs">Handcrafted with ♥ in India</p>
          <p className="text-white/40 text-xs">© {new Date().getFullYear()} Krishna's Bliss. All rights reserved.</p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-white/70">
          <Link href="/shop"            className="hover:text-white transition-colors">Shop</Link>
          <Link href="/about"           className="hover:text-white transition-colors">About</Link>
          <Link href="/contact"         className="hover:text-white transition-colors">Contact</Link>
          <Link href="/exchange-policy" className="hover:text-white transition-colors">Exchange Policy</Link>
        </nav>
      </div>
    </footer>
  );
}
