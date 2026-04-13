'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { imageUrl, formatINR } from '@/lib/api';

const RECENTLY_VIEWED_KEY = 'kb_recently_viewed';

interface RecentItem {
  id: string;
  name: string;
  slug: string;
  primary_image: string | null;
  mrp: number;
  sale_price: number | null;
}

interface Props {
  currentProductId: string;
}

export default function RecentlyViewed({ currentProductId }: Props) {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
      const all: RecentItem[] = raw ? JSON.parse(raw) : [];
      // Exclude current product, show up to 4
      setItems(all.filter(i => i.id !== currentProductId).slice(0, 4));
    } catch {
      setItems([]);
    }
  }, [currentProductId]);

  if (items.length < 2) return null;

  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl font-semibold text-kb-charcoal mb-6">Recently Viewed</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map(item => {
          const hasSale = item.sale_price != null && item.sale_price < item.mrp;
          const src = item.primary_image ? imageUrl(item.primary_image) : '';
          return (
            <Link key={item.id} href={`/product/${item.slug}`} className="group">
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-2">
                {src ? (
                  <Image
                    src={src}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <h3 className="text-sm font-medium text-kb-charcoal line-clamp-2 group-hover:text-kb-teal transition-colors">
                {item.name}
              </h3>
              <div className="mt-1">
                {hasSale ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-kb-gold">{formatINR(item.sale_price!)}</span>
                    <span className="text-xs text-kb-muted line-through">{formatINR(item.mrp)}</span>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-kb-charcoal">{formatINR(item.mrp)}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
