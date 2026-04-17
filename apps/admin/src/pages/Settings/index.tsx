import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TagGroup {
  name: string;
  label: string;
  display_order: number;
  is_filter: boolean;
  tag_count: number;
}

type Tab = 'store' | 'shipping' | 'exchange' | 'notifications' | 'tag_groups';

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

// ── Tag Groups tab ────────────────────────────────────────────────────────────

function TagGroupsTab() {
  const queryClient = useQueryClient();
  const [editingGroup, setEditingGroup] = useState<TagGroup | null>(null);
  const [newLabel, setNewLabel]         = useState('');
  const [newName, setNewName]           = useState('');
  const [showNew, setShowNew]           = useState(false);

  const { data, isLoading } = useQuery<{ data: TagGroup[] }>({
    queryKey: ['admin-tag-groups'],
    queryFn: () => api.get('/admin/tag-groups').then((r) => r.data),
  });

  const groups = data?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ name, label, is_filter }: { name: string; label: string; is_filter: boolean }) =>
      api.put(`/admin/tag-groups/${name}`, { label, is_filter }),
    onSuccess: () => {
      toast.success('Group updated');
      queryClient.invalidateQueries({ queryKey: ['admin-tag-groups'] });
      setEditingGroup(null);
    },
    onError: () => toast.error('Update failed'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; label: string }) =>
      api.post('/admin/tag-groups', { ...payload, display_order: groups.length + 1 }),
    onSuccess: () => {
      toast.success('Group created');
      queryClient.invalidateQueries({ queryKey: ['admin-tag-groups'] });
      setShowNew(false);
      setNewName(''); setNewLabel('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Create failed';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/admin/tag-groups/${name}`),
    onSuccess: () => {
      toast.success('Group deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-tag-groups'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Delete failed — tags still reference this group';
      toast.error(msg);
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-lg">
      <p className="text-sm text-kb-muted mb-4">
        Tag groups define the filter categories shown on the shop page. You can add new groups and rename existing ones.
      </p>
      <div className="space-y-2 mb-4">
        {groups.map((g) => (
          <div key={g.name} className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3">
            {editingGroup?.name === g.name ? (
              <>
                <input
                  value={editingGroup.label}
                  onChange={(e) => setEditingGroup({ ...editingGroup, label: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-kb-teal"
                />
                <label className="flex items-center gap-1 text-xs text-kb-muted">
                  <input
                    type="checkbox"
                    checked={editingGroup.is_filter}
                    onChange={(e) => setEditingGroup({ ...editingGroup, is_filter: e.target.checked })}
                    className="accent-kb-teal"
                  />
                  Filter
                </label>
                <button
                  onClick={() => updateMutation.mutate({ name: g.name, label: editingGroup.label, is_filter: editingGroup.is_filter })}
                  disabled={updateMutation.isPending}
                  className="text-xs text-kb-teal font-medium hover:underline"
                >
                  Save
                </button>
                <button onClick={() => setEditingGroup(null)} className="text-xs text-kb-muted hover:underline">Cancel</button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <span className="text-sm font-medium text-kb-charcoal">{g.label}</span>
                  <span className="ml-2 text-xs text-kb-muted font-mono">{g.name}</span>
                </div>
                <span className="text-xs text-kb-muted">{g.tag_count} tags</span>
                {g.is_filter && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-kb-teal">filter</span>
                )}
                <button onClick={() => setEditingGroup(g)} className="text-xs text-kb-teal hover:underline">Edit</button>
                <button
                  onClick={() => {
                    if (g.tag_count > 0) { toast.error(`Remove all ${g.tag_count} tags first`); return; }
                    if (confirm(`Delete group "${g.label}"?`)) deleteMutation.mutate(g.name);
                  }}
                  className="text-xs text-kb-error hover:underline"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {showNew ? (
        <div className="bg-white border border-dashed border-kb-teal/40 rounded-lg px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-kb-muted mb-1">Name (slug, can't change)</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                className={inputCls}
                placeholder="e.g. length"
              />
            </div>
            <div>
              <label className="block text-xs text-kb-muted mb-1">Label (display name)</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className={inputCls}
                placeholder="e.g. Length"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate({ name: newName, label: newLabel })}
              disabled={!newName || !newLabel || createMutation.isPending}
              className="px-4 py-2 text-sm bg-kb-teal text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-kb-muted hover:border-gray-300">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 text-sm text-kb-teal hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Tag Group
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'store',       label: 'Store' },
  { id: 'shipping',    label: 'Shipping' },
  { id: 'exchange',    label: 'Exchange' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'tag_groups',  label: 'Tag Groups' },
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
          {activeTab === 'tag_groups'    && <TagGroupsTab />}
        </>
      )}
    </AdminLayout>
  );
}
