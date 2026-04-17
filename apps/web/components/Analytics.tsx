'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

export default function Analytics({ gaId }: { gaId: string }) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window.gtag !== 'function') return;
    const url = pathname + (searchParams.toString() ? `?${searchParams}` : '');
    window.gtag('config', gaId, { page_path: url });
  }, [pathname, searchParams, gaId]);

  return null;
}
