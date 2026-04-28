const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle only the minimal runtime needed — server never has to npm install Next.js.
  output: 'standalone',
  // Monorepo root so the file tracer picks up shared packages.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    // Image optimisation (resize + WebP conversion) is disabled — the e2-micro
    // (1 GB RAM, 2 vCPU) does not have enough headroom to run the optimiser
    // alongside the API and OS without causing OOM restarts.
    // nginx serves /uploads/ with a 1-year Cache-Control header so browsers
    // cache images aggressively after the first load.
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/collections/:slug',
        destination: '/shop?collection=:slug',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      // Fallback: proxy /uploads/ to the API so images work even if nginx
      // doesn't have the direct-serve location configured yet.
      // nginx should intercept this before it reaches Next.js (see nginx conf).
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:3001/uploads/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
