'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface SiteSettings {
  newBadgeDays: number;
}

const DEFAULT: SiteSettings = { newBadgeDays: 30 };

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
