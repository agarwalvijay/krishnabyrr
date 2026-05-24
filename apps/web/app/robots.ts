import type { MetadataRoute } from 'next';

const SITE = 'https://krishnasbliss.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Logged-in / cart-flow pages are noise for crawlers
          '/account/',
          '/cart',
          '/checkout',
          '/login-link',
          '/verify-phone',

          // Internal API surface, not for crawling
          '/api/',

          // Filter combinations explode URL space — keep canonicals only.
          // Crawlers will still find /shop, /shop/<slug>, etc. via the sitemap.
          '/shop?',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
