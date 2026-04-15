import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-kb-charcoal text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <div className="text-center sm:text-left space-y-1">
          <p className="text-white/90">© {new Date().getFullYear()} Krishna's Bliss. All rights reserved.</p>
          <p className="text-white/50 text-xs">Handcrafted with ♥ in India</p>
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
