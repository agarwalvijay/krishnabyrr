import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

type Tab = 'store' | 'shipping' | 'exchange' | 'notifications';

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-kb-charcoal mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-kb-muted mt-1">{hint}</p>}
    </div>
  );
}

// ── Store settings ────────────────────────────────────────────────────────────

function StoreTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [storeName, setStoreName]       = useState(String(settings.store_name ?? ''));
  const [newBadgeDays, setNewBadgeDays] = useState(Number(settings.new_badge_days ?? 30));
  const [gaTag, setGaTag]               = useState(String(settings.ga_tag ?? ''));

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <Field label="Store Name">
        <input value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputCls} />
      </Field>
      <Field
        label="'New' Badge — Days"
        hint="Products added within this many days will show a 'New' badge. Set to 0 to disable."
      >
        <input
          type="number" min="0" max="365"
          value={newBadgeDays}
          onChange={(e) => setNewBadgeDays(Number(e.target.value))}
          className={inputCls}
        />
      </Field>
      <Field
        label="Google Analytics Tag ID"
        hint="Your GA4 Measurement ID, e.g. G-XXXXXXXXXX. Leave blank to disable analytics."
      >
        <input
          value={gaTag}
          onChange={(e) => setGaTag(e.target.value.trim())}
          className={inputCls}
          placeholder="G-XXXXXXXXXX"
        />
      </Field>
      <div className="pt-2">
        <button
          onClick={() => saveMutation.mutate({ store_name: storeName, new_badge_days: newBadgeDays, ga_tag: gaTag || null })}
          disabled={saveMutation.isPending}
          className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Shipping settings ─────────────────────────────────────────────────────────

function ShippingTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [vals, setVals] = useState({
    zone_a_rate:        Number(settings.zone_a_rate ?? 80),
    zone_a_free_above:  Number(settings.zone_a_free_above ?? 999),
    zone_b_rate:        Number(settings.zone_b_rate ?? 120),
    zone_b_free_above:  Number(settings.zone_b_free_above ?? 1499),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Shipping settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  const set = (k: keyof typeof vals, v: string) => setVals((prev) => ({ ...prev, [k]: Number(v) }));

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-sm font-semibold text-kb-charcoal mb-4">Zone A (Metro / Tier 1)</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rate (₹)" hint="Shipping charge">
            <input type="number" min="0" value={vals.zone_a_rate} onChange={(e) => set('zone_a_rate', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Free Above (₹)" hint="0 = never free">
            <input type="number" min="0" value={vals.zone_a_free_above} onChange={(e) => set('zone_a_free_above', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-kb-charcoal mb-4">Zone B (Rest of India)</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rate (₹)">
            <input type="number" min="0" value={vals.zone_b_rate} onChange={(e) => set('zone_b_rate', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Free Above (₹)">
            <input type="number" min="0" value={vals.zone_b_free_above} onChange={(e) => set('zone_b_free_above', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>
      <button
        onClick={() => saveMutation.mutate(vals)}
        disabled={saveMutation.isPending}
        className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Shipping'}
      </button>
    </div>
  );
}

// ── Exchange settings ─────────────────────────────────────────────────────────

function ExchangeTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [windowDays, setWindowDays]   = useState(Number(settings.exchange_window_days ?? 7));
  const [isActive, setIsActive]       = useState(Boolean(settings.exchange_active ?? true));

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Exchange settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <Field label="Exchange Window (days)" hint="Days from delivery within which exchange can be requested">
        <input
          type="number" min="1" max="30"
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className={inputCls}
        />
      </Field>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="w-4 h-4 rounded accent-kb-teal"
        />
        <div>
          <p className="text-sm font-medium text-kb-charcoal">Exchange program active</p>
          <p className="text-xs text-kb-muted">When disabled, the "Request Exchange" button is hidden for customers</p>
        </div>
      </label>
      <button
        onClick={() => saveMutation.mutate({ exchange_window_days: windowDays, exchange_active: isActive })}
        disabled={saveMutation.isPending}
        className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Exchange'}
      </button>
    </div>
  );
}

// ── Notifications settings ────────────────────────────────────────────────────

function NotificationsTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [whatsapp, setWhatsapp]     = useState(String(settings.whatsapp_number ?? ''));
  const [email, setEmail]           = useState(String(settings.support_email ?? ''));

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Notification settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <Field label="WhatsApp Number" hint="With country code, e.g. +919876543210">
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={inputCls} placeholder="+91…" />
      </Field>
      <Field label="Support Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="support@krishnabyrr.com" />
      </Field>
      <button
        onClick={() => saveMutation.mutate({ whatsapp_number: whatsapp, support_email: email })}
        disabled={saveMutation.isPending}
        className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'store',         label: 'Store' },
  { id: 'shipping',      label: 'Shipping' },
  { id: 'exchange',      label: 'Exchange' },
  { id: 'notifications', label: 'Notifications' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('store');

  const { data, isLoading } = useQuery<{ data: Record<string, unknown> }>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings').then((r) => r.data),
  });

  const settings = data?.data ?? {};

  return (
    <AdminLayout title="Settings">
      {/* Tab navigation */}
      <div className="border-b border-gray-100 mb-6">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors',
                activeTab === tab.id
                  ? 'text-kb-teal border-b-2 border-kb-teal -mb-px bg-white'
                  : 'text-kb-muted hover:text-kb-charcoal',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'store'         && <StoreTab settings={settings} />}
          {activeTab === 'shipping'      && <ShippingTab settings={settings} />}
          {activeTab === 'exchange'      && <ExchangeTab settings={settings} />}
          {activeTab === 'notifications' && <NotificationsTab settings={settings} />}
        </>
      )}
    </AdminLayout>
  );
}
