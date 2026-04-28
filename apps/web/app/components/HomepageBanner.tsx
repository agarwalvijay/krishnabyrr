import Link from 'next/link';
import Image from 'next/image';
import { imageUrl, BANNER_HEIGHT_PX, type BannerHeight } from '@/lib/api';

export interface BannerPayload {
  heading: string;
  subheading?: string;
  cta_label?: string;
  cta_href?: string;
  image_desktop?: string;
  image_mobile?: string;
  /** @deprecated use image_desktop */
  image_url?: string;
  bg_color?: string;
  height?: BannerHeight;
}

interface Props {
  payload: BannerPayload;
  priority?: boolean;
}

export default function HomepageBanner({ payload, priority = false }: Props) {
  const { heading, subheading, cta_label, cta_href, image_desktop, image_mobile, image_url, bg_color, height = 'lg' } = payload;
  const desktopSrc = (image_desktop || image_url) ? imageUrl(image_desktop ?? image_url) : null;
  const mobileSrc  = image_mobile ? imageUrl(image_mobile) : desktopSrc;
  const minHeight  = BANNER_HEIGHT_PX[height];

  return (
    <section
      className="relative flex flex-col items-center justify-center text-center px-4"
      style={{ minHeight, backgroundColor: bg_color ?? 'var(--kb-charcoal)' }}
    >
      {/* Background image — desktop and mobile served separately */}
      {desktopSrc && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Desktop */}
          <div className="hidden sm:block absolute inset-0">
            <Image src={desktopSrc} alt={heading} fill priority={priority} className="object-cover" sizes="100vw" />
          </div>
          {/* Mobile — falls back to desktop if no mobile image uploaded */}
          {mobileSrc && (
            <div className="sm:hidden absolute inset-0">
              <Image src={mobileSrc} alt={heading} fill priority={priority} className="object-cover" sizes="100vw" />
            </div>
          )}
          <div className="absolute inset-0 bg-kb-charcoal/45" />
        </div>
      )}

      <div className="relative z-10 space-y-4 max-w-2xl mx-auto">
        <h1 className="font-display text-5xl sm:text-6xl font-semibold text-white tracking-tight">
          {heading}
        </h1>
        {subheading && (
          <p className="text-lg sm:text-xl text-white/80 font-light">
            {subheading}
          </p>
        )}
        {cta_label && cta_href && (
          <Link
            href={cta_href}
            className="inline-flex items-center gap-2 mt-2 px-7 py-3.5 bg-white text-kb-teal font-semibold rounded-full hover:shadow-lg transition-shadow text-sm"
          >
            {cta_label}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </section>
  );
}
