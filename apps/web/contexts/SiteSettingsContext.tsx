'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface SiteSettings {
  newBadgeDays: number;
  storeName: string;
}

const DEFAULT: SiteSettings = { newBadgeDays: 30, storeName: "Krishna's Bliss" };

const SiteSettingsContext = createContext<SiteSettings>(DEFAULT);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT);

  useEffect(() => {
    apiClient
      .get<{ data: Record<string, unknown> }>('/settings/public')
      .then((r) => {
        const d = r.data.data;
        setSettings({
          newBadgeDays: typeof d.new_badge_days === 'number' ? d.new_badge_days : DEFAULT.newBadgeDays,
          storeName: typeof d.store_name === 'string' && d.store_name ? d.store_name : DEFAULT.storeName,
        });
      })
      .catch(() => {/* keep defaults */});
  }, []);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export const useSiteSettings = () => useContext(SiteSettingsContext);
