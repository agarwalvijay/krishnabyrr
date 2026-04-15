import Link from 'next/link';
import type { ProductListItem } from '@/lib/api';
import ProductCard from '@/components/ui/ProductCard';
import AsymmetricProductGrid from './AsymmetricProductGrid';

export interface ProductSectionPayload {
  heading: string;
  // New schema fields
  source_type?: 'collection' | 'tag_filter' | 'latest';
  source_id?: string;
  tag_group?: string;
  tag_value?: string;
  editorial_text?: string;
  view_all_url?: string;
  show_view_all?: boolean;
  limit?: number;
  layout?: 'grid' | 'asymmetric';
  // Legacy field kept for backward compat
  collection_slug?: string;
}

interface Props {
  payload: ProductSectionPayload;
  products: ProductListItem[];
}

export default function HomepageProductSection({ payload, products }: Props) {
  const { heading, editorial_text, view_all_url, show_view_all, collection_slug, tag_group, tag_value, layout } = payload;

  // Derive view-all URL: prefer explicit field, else derive from source
  const viewAllHref =
    view_all_url ||
    (collection_slug ? `/shop?collection=${collection_slug}` : null) ||
    (tag_group && tag_value ? `/shop?${tag_group}=${encodeURIComponent(tag_value)}` : null);

  const shouldShowViewAll = show_view_all !== false && !!viewAllHref;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="flex items-end justify-between mb-4">
        <h2 className="font-display text-3xl font-semibold text-kb-charcoal">{heading}</h2>
        {shouldShowViewAll && (
          <Link
            href={viewAllHref!}
            className="text-sm font-medium text-kb-teal hover:underline flex items-center gap-1 flex-shrink-0"
          >
            View All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {editorial_text && (
        <p className="text-sm text-kb-muted mb-8 max-w-xl">{editorial_text}</p>
      )}

      {layout === 'asymmetric' ? (
        <AsymmetricProductGrid products={products} />
      ) : (
        products.length === 0 ? (
          <div className="text-center py-20 text-kb-muted">
            <p>Products coming soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )
      )}
    </section>
  );
}
