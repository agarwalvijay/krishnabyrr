'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface SiteSettings {
  newBadgeDays: number;
  storeName: string;
  paymentDisclaimer: { enabled: boolean; text: string };
}

const DEFAULT_DISCLAIMER_TEXT =
  "We're using a new payment processor. If you run into any issue during payment, please let us know and we'll resolve it for you.";

const DEFAULT: SiteSettings = {
  newBadgeDays: 30,
  storeName: "Krishna's Bliss",
  paymentDisclaimer: { enabled: false, text: DEFAULT_DISCLAIMER_TEXT },
};

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
          storeName:    typeof d.store_name === 'string' && d.store_name ? d.store_name : DEFAULT.storeName,
          paymentDisclaimer: {
            enabled: d.payment_disclaimer_enabled === true,
            text:    typeof d.payment_disclaimer_text === 'string' && d.payment_disclaimer_text.trim()
              ? d.payment_disclaimer_text
              : DEFAULT_DISCLAIMER_TEXT,
          },
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
