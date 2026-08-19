import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

type Tab = 'store' | 'shipping' | 'exchange' | 'notifications' | 'payments' | 'mobile' | 'security' | 'whatsapp';

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

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function StoreTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [storeName, setStoreName]               = useState(String(settings.store_name ?? ''));
  const [newBadgeDays, setNewBadgeDays]         = useState(Number(settings.new_badge_days ?? 30));
  const [gaTag, setGaTag]                       = useState(String(settings.ga_tag ?? ''));
  const [merchantState, setMerchantState]       = useState(String(settings.merchant_state ?? ''));
  const [merchantGstin, setMerchantGstin]       = useState(String(settings.merchant_gstin ?? ''));
  const [merchantAddress, setMerchantAddress]   = useState(String(settings.merchant_address ?? ''));
  const [storePhone, setStorePhone]             = useState(String(settings.store_phone ?? ''));

  const gstinValid = !merchantGstin || GSTIN_REGEX.test(merchantGstin.toUpperCase());

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

      <div className="pt-4 mt-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Tax invoice details</h3>
        <p className="text-xs text-kb-muted mb-4">
          Used on the order PDF for proper GST tax invoices.
          Merchant state determines CGST+SGST (intra-state) vs IGST (inter-state) on each order.
        </p>
        <div className="space-y-4">
          <Field label="Merchant State" hint="The state where you are GST-registered (e.g. Delhi, Maharashtra).">
            <input
              value={merchantState}
              onChange={(e) => setMerchantState(e.target.value)}
              className={inputCls}
              placeholder="Delhi"
            />
          </Field>
          <Field label="Merchant GSTIN" hint="15-character GST Identification Number. Must be valid to issue tax invoices.">
            <input
              value={merchantGstin}
              onChange={(e) => setMerchantGstin(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono`}
              placeholder="07AAAAA0000A1Z5"
              maxLength={15}
            />
            {merchantGstin && !gstinValid && (
              <p className="text-xs mt-1" style={{ color: '#c0392b' }}>
                Doesn't match GSTIN format (NNCCCCCNNNNCNZN — 2 digits + 5 letters + 4 digits + 1 letter + alphanumeric + Z + alphanumeric)
              </p>
            )}
          </Field>
          <Field label="Merchant Address" hint="Appears on tax invoices below the store name, and as the FROM address on shipping labels.">
            <textarea
              value={merchantAddress}
              onChange={(e) => setMerchantAddress(e.target.value)}
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Shop No. X, Block Y, Lajpat Nagar, New Delhi 110024"
            />
          </Field>
          <Field label="Return / Pickup Phone" hint="Printed as the FROM contact on shipping labels — couriers call this number on a failed delivery or RTO.">
            <input
              type="text"
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              className={inputCls}
              placeholder="+91 98450 00000"
              maxLength={20}
            />
          </Field>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
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
      </div>

      <div className="pt-2">
        <button
          onClick={() => saveMutation.mutate({
            store_name:       storeName,
            new_badge_days:   newBadgeDays,
            ga_tag:           gaTag || null,
            merchant_state:   merchantState.trim() || null,
            merchant_gstin:   merchantGstin.trim() || null,
            merchant_address: merchantAddress.trim() || null,
            store_phone:      storePhone.trim() || null,
          })}
          disabled={saveMutation.isPending || !gstinValid}
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

// ── Payments settings ─────────────────────────────────────────────────────────

const GATEWAYS = [
  {
    id:          'razorpay',
    label:       'Razorpay',
    description: 'Modal-based card / UPI / netbanking. Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars.',
  },
  {
    id:          'phonepe',
    label:       'PhonePe',
    description: 'Redirect-based UPI / card payments. Requires PHONEPE_MERCHANT_ID and PHONEPE_SALT_KEY env vars.',
  },
  {
    id:          'manual',
    label:       'Manual (WhatsApp)',
    description: 'Orders are held pending confirmation. Owner coordinates payment via WhatsApp.',
  },
];

const DEFAULT_PAYMENT_DISCLAIMER =
  "We're using a new payment processor. If you run into any issue during payment, please let us know and we'll resolve it for you.";

function PaymentsTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [gateway, setGateway]             = useState(String(settings.payment_gateway ?? 'razorpay'));
  const [disclaimerOn, setDisclaimerOn]   = useState(Boolean(settings.payment_disclaimer_enabled ?? false));
  const [disclaimerText, setDisclaimerText] = useState(
    String(settings.payment_disclaimer_text ?? DEFAULT_PAYMENT_DISCLAIMER),
  );

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Payment settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <Field
        label="Active Payment Gateway"
        hint="Takes effect immediately for all new orders. Existing orders are unaffected."
      >
        <div className="space-y-2 mt-1">
          {GATEWAYS.map((g) => (
            <label
              key={g.id}
              className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                gateway === g.id
                  ? 'border-kb-teal bg-teal-50/50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="gateway"
                value={g.id}
                checked={gateway === g.id}
                onChange={() => setGateway(g.id)}
                className="mt-0.5 accent-kb-teal flex-shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-kb-charcoal">{g.label}</p>
                <p className="text-xs text-kb-muted mt-0.5">{g.description}</p>
              </div>
            </label>
          ))}
        </div>
      </Field>

      {/* ── Checkout disclaimer ────────────────────────────────────────── */}
      <div className="pt-4 mt-4 border-t border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-kb-charcoal">Show checkout disclaimer</p>
            <p className="text-xs text-kb-muted">A short note shown above the "Proceed to Payment" button on checkout. Useful during a gateway switchover.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-3">
            <input
              type="checkbox"
              checked={disclaimerOn}
              onChange={(e) => setDisclaimerOn(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-kb-teal" />
          </label>
        </div>
        <Field label="Disclaimer text" hint="Plain text only. Leave the default if you're not sure.">
          <textarea
            value={disclaimerText}
            onChange={(e) => setDisclaimerText(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none ${disclaimerOn ? '' : 'opacity-60'}`}
            disabled={!disclaimerOn}
            maxLength={400}
          />
        </Field>
      </div>

      <div className="pt-2">
        <button
          onClick={() => saveMutation.mutate({
            payment_gateway:             gateway,
            payment_disclaimer_enabled:  disclaimerOn,
            payment_disclaimer_text:     disclaimerText.trim() || DEFAULT_PAYMENT_DISCLAIMER,
          })}
          disabled={saveMutation.isPending}
          className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Mobile App settings ───────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy');
        }
      }}
      className="text-xs underline text-kb-teal"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

function MobileAppTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();

  // Customer app (public store listings — power the dlapp.krishnasbliss.com page)
  const [androidUrl, setAndroidUrl] = useState(String(settings.android_url ?? ''));
  const [iosUrl, setIosUrl]         = useState(String(settings.ios_url ?? ''));

  // Admin app (internal builds — typically sideloaded APK + TestFlight for iOS)
  const [adminApkUrl, setAdminApkUrl] = useState(String(settings.admin_apk_url ?? ''));
  const [adminIosUrl, setAdminIosUrl] = useState(String(settings.admin_ios_url ?? ''));

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Mobile App settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  return (
    <div className="space-y-8 max-w-lg">
      {/* ── Customer app ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Customer app — store links</h3>
        <p className="text-xs text-kb-muted mb-4">
          These URLs power the smart download page at{' '}
          <a href="https://dlapp.krishnasbliss.com" target="_blank" rel="noopener noreferrer"
             className="text-kb-teal underline underline-offset-2">
            dlapp.krishnasbliss.com
          </a>. Leave a field blank to hide that store button.
        </p>
        <div className="space-y-4">
          <Field
            label="Google Play Store URL"
            hint="Full URL, e.g. https://play.google.com/store/apps/details?id=com.krishnasbliss.shop"
          >
            <input
              value={androidUrl}
              onChange={(e) => setAndroidUrl(e.target.value.trim())}
              className={inputCls}
              placeholder="https://play.google.com/store/apps/details?id=…"
            />
          </Field>
          <Field
            label="Apple App Store URL"
            hint="Full URL, e.g. https://apps.apple.com/app/krishnas-bliss/id123456789"
          >
            <input
              value={iosUrl}
              onChange={(e) => setIosUrl(e.target.value.trim())}
              className={inputCls}
              placeholder="https://apps.apple.com/app/…"
            />
          </Field>
        </div>
      </section>

      {/* ── Admin app ────────────────────────────────────────────────────── */}
      <section className="pt-6 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Admin app — install links</h3>
        <p className="text-xs text-kb-muted mb-4">
          Internal builds of the KB Admin app. Typically a direct APK download
          for Android (EAS build artifact or your own hosting) and a TestFlight
          link for iOS. Share these only with team members.
        </p>

        <div className="space-y-4">
          <Field
            label="Android APK URL"
            hint="EAS artifact URL after `npm run build:android`, or a permanent link if you host the APK yourself."
          >
            <input
              value={adminApkUrl}
              onChange={(e) => setAdminApkUrl(e.target.value.trim())}
              className={inputCls}
              placeholder="https://expo.dev/artifacts/eas/…apk"
            />
            {adminApkUrl && (
              <div className="mt-1.5 flex items-center gap-3 text-xs">
                <a
                  href={adminApkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kb-teal underline"
                >
                  Open
                </a>
                <CopyButton value={adminApkUrl} />
              </div>
            )}
          </Field>

          <Field
            label="iOS install URL"
            hint="TestFlight invite link (https://testflight.apple.com/join/…) or App Store URL if/when you publish."
          >
            <input
              value={adminIosUrl}
              onChange={(e) => setAdminIosUrl(e.target.value.trim())}
              className={inputCls}
              placeholder="https://testflight.apple.com/join/…"
            />
            {adminIosUrl && (
              <div className="mt-1.5 flex items-center gap-3 text-xs">
                <a
                  href={adminIosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kb-teal underline"
                >
                  Open
                </a>
                <CopyButton value={adminIosUrl} />
              </div>
            )}
          </Field>
        </div>
      </section>

      <div className="pt-2">
        <button
          onClick={() => saveMutation.mutate({
            android_url:    androidUrl   || null,
            ios_url:        iosUrl       || null,
            admin_apk_url:  adminApkUrl  || null,
            admin_ios_url:  adminIosUrl  || null,
          })}
          disabled={saveMutation.isPending}
          className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Security settings ─────────────────────────────────────────────────────────

function SecurityTab({ settings }: { settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [otpMax, setOtpMax]       = useState(Number(settings.otp_rate_limit_max ?? 10));
  const [otpWindow, setOtpWindow] = useState(Number(settings.otp_rate_limit_window_minutes ?? 15));

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put('/admin/settings', data),
    onSuccess: () => {
      toast.success('Security settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: () => toast.error('Save failed'),
  });

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="text-sm font-semibold text-kb-charcoal mb-1">WhatsApp OTP rate limit</h3>
        <p className="text-xs text-kb-muted mb-4">
          Limits how many verification or login links can be requested per phone
          number within a sliding window. Higher values are friendlier during
          QA; tighter values protect against abuse in production.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Max attempts"
            hint="Number of links per phone allowed in the window"
          >
            <input
              type="number"
              min={1}
              max={100}
              value={otpMax}
              onChange={(e) => setOtpMax(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field
            label="Window (minutes)"
            hint="Sliding window the limit applies over"
          >
            <input
              type="number"
              min={1}
              max={1440}
              value={otpWindow}
              onChange={(e) => setOtpWindow(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>
      </div>
      <div className="pt-2">
        <button
          onClick={() =>
            saveMutation.mutate({
              otp_rate_limit_max:            otpMax,
              otp_rate_limit_window_minutes: otpWindow,
            })
          }
          disabled={saveMutation.isPending}
          className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── WhatsApp token settings ───────────────────────────────────────────────────

interface TokenStatus {
  configured:        boolean;
  source?:           'database' | 'env' | 'none';
  stored_expires_at: string | null;
  meta_debug?:       {
    is_valid?:    boolean;
    expires_at?:  number;       // unix seconds, 0 = never
    data_access_expires_at?: number;
    scopes?:      string[];
    application?: string;
    error?:       { message: string; code: number };
  } | null;
  message?:          string;
}

function fmtUnix(seconds: number | undefined): string {
  if (!seconds) return '—';
  if (seconds === 0)  return 'Never';
  return new Date(seconds * 1000).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function daysUntil(seconds: number | undefined): string {
  if (!seconds || seconds === 0) return '';
  const ms = seconds * 1000 - Date.now();
  if (ms <= 0) return 'expired';
  return `${Math.round(ms / 86_400_000)}d remaining`;
}

// External links to the Meta dashboards we need to interact with regularly.
// Grouped by what you're trying to do, since Meta scatters these across at
// least three different sub-domains and renames the navigation every quarter.
const META_LINKS: Array<{
  section: string;
  hint:    string;
  links:   Array<{ label: string; desc: string; url: string }>;
}> = [
  {
    section: 'Day-to-day',
    hint:    'Usage, costs, and what Meta will bill you',
    links: [
      {
        label: 'Usage & insights',
        desc:  'Conversations sent, delivery rates, template usage',
        url:   'https://business.facebook.com/wa/manage/insights/',
      },
      {
        label: 'Billing & charges',
        desc:  'Outstanding balance, monthly statements (PDF)',
        url:   'https://business.facebook.com/billing_hub/payment_activity',
      },
      {
        label: 'Payment methods',
        desc:  'Cards, UPI, spending limits',
        url:   'https://business.facebook.com/billing_hub/payment_methods',
      },
    ],
  },
  {
    section: 'Setup & maintenance',
    hint:    'When you need to add a template, change webhook, or refresh the token',
    links: [
      {
        label: 'Message templates',
        desc:  'Submit/edit kb_verify_phone, kb_order_conf, kb_owner_new_order, etc.',
        url:   'https://business.facebook.com/wa/manage/message-templates/',
      },
      {
        label: 'Phone numbers',
        desc:  'Display name, business profile, two-step verification PIN',
        url:   'https://business.facebook.com/wa/manage/phone-numbers/',
      },
      {
        label: 'App dashboard (ID, Secret, temp token)',
        desc:  'Generate fresh 24h temp token, find App ID + App Secret, configure webhook',
        url:   'https://developers.facebook.com/apps/',
      },
    ],
  },
  {
    section: 'Account health',
    hint:    'When something is broken at the account level',
    links: [
      {
        label: 'Account quality',
        desc:  'Restrictions, appeals, policy violations',
        url:   'https://business.facebook.com/accountquality',
      },
      {
        label: 'Business verification',
        desc:  'GST / CIN / Aadhar verification status',
        url:   'https://business.facebook.com/settings/security',
      },
      {
        label: 'Support cases',
        desc:  'Track open support tickets and appeal responses',
        url:   'https://business.facebook.com/business-support-home',
      },
    ],
  },
];

function MetaQuickLinks() {
  return (
    <div className="rounded-xl border border-gray-100 bg-kb-cream/40 p-4 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-kb-charcoal">Meta dashboards — quick links</h3>
        <p className="text-xs text-kb-muted mt-0.5">
          Bookmarks for the pages you'll actually visit. Open in a new tab.
        </p>
      </div>
      {META_LINKS.map((group) => (
        <div key={group.section}>
          <p className="text-xs font-semibold uppercase tracking-wide text-kb-muted mb-1.5">
            {group.section} <span className="font-normal normal-case tracking-normal opacity-70">— {group.hint}</span>
          </p>
          <div className="space-y-1.5">
            {group.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white hover:bg-teal-50/50 border border-gray-100 hover:border-kb-teal/40 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-kb-charcoal group-hover:text-kb-teal">
                      {link.label}
                    </span>
                    {/* External-link glyph */}
                    <svg className="w-3 h-3 text-kb-muted group-hover:text-kb-teal flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                  <p className="text-xs text-kb-muted mt-0.5">{link.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WhatsAppTab() {
  const queryClient = useQueryClient();
  const [tempToken, setTempToken] = useState('');

  const { data, isLoading, refetch } = useQuery<{ data: TokenStatus }>({
    queryKey: ['admin-whatsapp-token'],
    queryFn:  () => api.get('/admin/whatsapp/token').then((r) => r.data),
  });

  const seedMutation = useMutation({
    mutationFn: (token: string) => api.post('/admin/whatsapp/token', { token }),
    onSuccess: () => {
      toast.success('Token exchanged and stored');
      setTempToken('');
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp-token'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Exchange failed';
      toast.error(msg);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.post('/admin/whatsapp/token/refresh'),
    onSuccess:  () => {
      toast.success('Token refreshed — extended by another 60 days');
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp-token'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Refresh failed';
      toast.error(msg);
    },
  });

  const status = data?.data;
  const debug  = status?.meta_debug ?? null;
  const isValid = debug?.is_valid === true;
  const tokenExp  = debug?.expires_at;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Current token</h3>
        <p className="text-xs text-kb-muted mb-4">
          Live status of the WhatsApp Cloud API access token used by the server.
          The 24-hour temp tokens Meta issues from the developer dashboard are
          exchanged for 60-day long-lived tokens and auto-renewed before they expire.
        </p>

        {isLoading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && status && (
          <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-kb-muted">Configured</span>
              <span className={status.configured ? 'text-green-700' : 'text-red-600'}>
                {status.configured ? 'Yes' : 'No'}
              </span>
            </div>
            {status.configured && (
              <>
                <div className="flex justify-between">
                  <span className="text-kb-muted">Source</span>
                  <span className="text-kb-charcoal">
                    {status.source === 'database'
                      ? 'Database (managed)'
                      : status.source === 'env'
                      ? 'Environment variable (fallback)'
                      : '—'}
                  </span>
                </div>
                {debug && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-kb-muted">Valid (per Meta)</span>
                      <span className={isValid ? 'text-green-700' : 'text-red-600'}>
                        {isValid ? '✓ Valid' : '✕ Invalid'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-kb-muted">Expires</span>
                      <span className="text-kb-charcoal">
                        {fmtUnix(tokenExp)}
                        {tokenExp ? <span className="text-kb-muted ml-2">({daysUntil(tokenExp)})</span> : null}
                      </span>
                    </div>
                    {debug.scopes && debug.scopes.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-kb-muted whitespace-nowrap">Scopes</span>
                        <span className="text-kb-charcoal text-right text-xs font-mono">
                          {debug.scopes.join(', ')}
                        </span>
                      </div>
                    )}
                    {debug.error && (
                      <div className="mt-2 text-xs text-red-600 border-t border-gray-100 pt-2">
                        Meta says: {debug.error.code} — {debug.error.message}
                      </div>
                    )}
                  </>
                )}
                {status.message && (
                  <p className="text-xs text-kb-muted border-t border-gray-100 pt-2 mt-2">{status.message}</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => refetch()}
            className="text-xs underline text-kb-teal"
          >
            Re-check status
          </button>
          {status?.source === 'database' && (
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="text-xs underline text-kb-teal disabled:opacity-50"
            >
              {refreshMutation.isPending ? 'Refreshing…' : 'Force refresh now'}
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Paste a fresh temp token</h3>
        <p className="text-xs text-kb-muted mb-4">
          When the current token is dying or has expired:
          go to Meta Developers → WhatsApp → API Setup → click ↻ next to the
          <strong> Temporary access token</strong>, then paste it here. The server
          will immediately exchange it for a 60-day long-lived token.
        </p>
        <textarea
          value={tempToken}
          onChange={(e) => setTempToken(e.target.value)}
          placeholder="EAAB..."
          rows={3}
          className={`${inputCls} font-mono text-xs`}
        />
        <div className="mt-3">
          <button
            onClick={() => seedMutation.mutate(tempToken)}
            disabled={seedMutation.isPending || !tempToken.trim()}
            className="px-5 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {seedMutation.isPending ? 'Exchanging…' : 'Exchange & Save'}
          </button>
        </div>
      </div>

      <MetaQuickLinks />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'store',         label: 'Store' },
  { id: 'shipping',      label: 'Shipping' },
  { id: 'exchange',      label: 'Exchange' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'payments',      label: 'Payments' },
  { id: 'mobile',        label: 'Mobile App' },
  { id: 'whatsapp',      label: 'WhatsApp' },
  { id: 'security',      label: 'Security' },
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
          {activeTab === 'payments'      && <PaymentsTab settings={settings} />}
          {activeTab === 'mobile'        && <MobileAppTab settings={settings} />}
          {activeTab === 'whatsapp'      && <WhatsAppTab />}
          {activeTab === 'security'      && <SecurityTab settings={settings} />}
        </>
      )}
    </AdminLayout>
  );
}
