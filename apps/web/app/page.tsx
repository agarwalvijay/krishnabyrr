import Link from 'next/link';
import { serverFetchList, type ProductListItem } from '@/lib/api';
import ProductCard from '@/components/ui/ProductCard';

export const revalidate = 3600;

export default async function HomePage() {
  const { data: products } = await serverFetchList<ProductListItem>(
    '/api/products?sort=newest&limit=8',
    { revalidate: 3600 }
  ).catch(() => ({ data: [] as ProductListItem[], meta: { total: 0, page: 1, limit: 8, pages: 0 } }));

  return (
    <>
      {/* Hero */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-4"
        style={{ minHeight: 400, backgroundColor: 'var(--kb-teal)' }}
      >
        {/* Decorative circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10 bg-white" />
          <div className="absolute -bottom-10 -left-10 w-60 h-60 rounded-full opacity-10 bg-white" />
        </div>

        <div className="relative z-10 space-y-4">
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-semibold text-white tracking-tight">
            KrishnaByrr
          </h1>
          <p className="text-lg sm:text-xl text-white/80 font-light max-w-md mx-auto">
            Handcrafted Indian Ethnic Wear
          </p>
          <p className="text-sm text-white/60">
            Timeless weaves. Authentic craftsmanship.
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 mt-2 px-7 py-3.5 bg-white text-kb-teal font-semibold rounded-full hover:shadow-lg transition-shadow text-sm"
          >
            Shop Now
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* New Arrivals */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-kb-charcoal">New Arrivals</h2>
            <p className="text-sm text-kb-muted mt-1">
              Our latest handcrafted additions
            </p>
          </div>
          <Link
            href="/shop"
            className="text-sm font-medium text-kb-teal hover:underline flex items-center gap-1 flex-shrink-0"
          >
            View All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-20 text-kb-muted">
            <p>Our collection is coming soon. Check back shortly!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Simple value props */}
      <section className="bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              {
                icon: '🪡',
                title: 'Handwoven Fabrics',
                desc: 'Every piece woven by skilled artisans using traditional techniques',
              },
              {
                icon: '🇮🇳',
                title: 'Ships Across India',
                desc: 'Delhi NCR in 2–3 days · Rest of India in 5–7 days',
              },
              {
                icon: '🔄',
                title: 'Easy Exchange',
                desc: 'Not satisfied? Exchange within 7 days of delivery',
              },
            ].map(item => (
              <div key={item.title} className="space-y-2">
                <div className="text-3xl">{item.icon}</div>
                <h3 className="font-semibold text-kb-charcoal">{item.title}</h3>
                <p className="text-sm text-kb-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
