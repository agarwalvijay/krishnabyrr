'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useCart } from '@/components/cart/CartContext';
import { useCustomerAuth, useIsLoggedIn } from '@/contexts/AuthContext';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { apiClient, formatINR, imageUrl, type CartData, type CartTotals } from '@/lib/api';
import ExchangePolicyModal from '@/components/ui/ExchangePolicyModal';

// ── Razorpay types (minimal) ───────────────────────────────────────────────────
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}
declare global {
  interface Window { Razorpay: new (options: RazorpayOptions) => { open: () => void }; }
}

// ── Razorpay lazy loader ───────────────────────────────────────────────────────
// Only injects the script when the user actually clicks "Proceed to Payment"
function loadRazorpay(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.Razorpay !== 'undefined') { resolve(); return; }
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ── Zod schema ─────────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
] as const;

const schema = z.object({
  email:                 z.string().email('Enter a valid email address'),
  phone:                 z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  name:                  z.string().min(1, 'Full name is required').max(100),
  line1:                 z.string().min(1, 'Address is required'),
  line2:                 z.string().optional(),
  city:                  z.string().min(1, 'City is required'),
  state:                 z.string().min(1, 'Please select a state'),
  pincode:               z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  billing_gstin:         z.string().optional(),
  exchange_acknowledged: z.literal(true, {
    errorMap: () => ({ message: 'You must acknowledge the exchange policy' }),
  }),
});

type FormValues = z.infer<typeof schema>;

// ── Types ──────────────────────────────────────────────────────────────────────

interface SavedAddress {
  id:         string;
  name:       string;
  phone:      string;
  line1:      string;
  line2:      string | null;
  city:       string;
  state:      string;
  pincode:    string;
  is_default: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs" style={{ color: 'var(--kb-error)' }}>{msg}</p>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const router    = useRouter();
  const { storeName } = useSiteSettings();
  const { cart: ctxCart, totals: ctxTotals, refreshCart, removeCoupon } = useCart();
  const { customer } = useCustomerAuth();
  const isLoggedIn = useIsLoggedIn();

  const [liveTotals, setLiveTotals]             = useState<CartTotals | null>(null);
  const [liveCart, setLiveCart]                 = useState<CartData | null>(null);
  const [showGst, setShowGst]                   = useState(false);
  const [toast, setToast]                       = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
  const [showExchangePolicy, setShowExchangePolicy] = useState(false);

  // Saved addresses (logged-in users)
  const [savedAddresses, setSavedAddresses]     = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new' | null>(null);
  const [saveAddress, setSaveAddress]           = useState(false);

  // Razorpay script is loaded lazily on demand (see loadRazorpay below)

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Use live data (merged from context + local state)
  const cart   = liveCart   ?? ctxCart;
  const totals = liveTotals ?? ctxTotals;

  // Redirect if cart empty
  useEffect(() => {
    if (cart && cart.items.length === 0) router.replace('/shop');
  }, [cart, router]);

  const fetchCart = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: { cart: CartData; totals: CartTotals } }>('/cart');
      setLiveCart(res.data.data.cart);
      setLiveTotals(res.data.data.totals);
    } catch {}
  }, []);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      exchange_acknowledged: undefined as unknown as true,
    },
  });

  // Pre-fill from customer context
  useEffect(() => {
    if (customer) {
      if (customer.email) setValue('email', customer.email);
      setValue('name',  customer.name);
      if (customer.phone) setValue('phone', customer.phone);
    }
  }, [customer, setValue]);

  // Pincode blur → update shipping zone
  const handlePincodeBlur = useCallback(async (pincode: string) => {
    if (!/^\d{6}$/.test(pincode)) return;
    try {
      await apiClient.post('/cart/pincode', { pincode });
      await fetchCart();
    } catch {}
  }, [fetchCart]);

  // Fill address form fields from a saved address
  const fillAddress = useCallback((addr: SavedAddress) => {
    setValue('name',    addr.name);
    setValue('phone',   addr.phone);
    setValue('line1',   addr.line1);
    setValue('line2',   addr.line2 ?? '');
    setValue('city',    addr.city);
    setValue('state',   addr.state);
    setValue('pincode', addr.pincode);
    handlePincodeBlur(addr.pincode);
  }, [setValue, handlePincodeBlur]);

  // Fetch saved addresses for logged-in users and auto-select default
  useEffect(() => {
    if (!isLoggedIn) return;
    apiClient.get<{ data: SavedAddress[] }>('/account/addresses')
      .then(res => {
        const addrs = res.data.data;
        setSavedAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find(a => a.is_default) ?? addrs[0];
          setSelectedAddressId(def.id);
          fillAddress(def);
        } else {
          setSelectedAddressId('new');
        }
      })
      .catch(() => setSelectedAddressId('new'));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = useCallback(async (values: FormValues) => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        shippingAddress: {
          name:    values.name,
          phone:   values.phone,
          line1:   values.line1,
          line2:   values.line2 || undefined,
          city:    values.city,
          state:   values.state,
          pincode: values.pincode,
          country: 'India',
        },
        billingGstin: values.billing_gstin || undefined,
        couponCode:   cart?.couponCode || undefined,
        saveAddress:  isLoggedIn && selectedAddressId === 'new' && saveAddress,
      };

      if (!isLoggedIn) {
        body.guestEmail = values.email;
        body.guestPhone = values.phone;
      }

      const res = await apiClient.post<{
        data: {
          order: { order_number: string; total: number };
          payment: {
            method: string;
            // Razorpay fields
            key_id?: string;
            razorpay_order_id?: string;
            amount?: number;
            currency?: string;
            name?: string;
            description?: string;
            // PhonePe fields
            redirect_url?: string;
            merchant_transaction_id?: string;
            // Manual fallback
            whatsapp_link?: string;
          };
        };
      }>('/orders', body);

      const { order, payment } = res.data.data;
      const orderNumber = order.order_number;
      const emailSuffix = isLoggedIn ? '' : `?email=${encodeURIComponent(values.email)}`;

      if (payment.method === 'razorpay' && payment.key_id && payment.razorpay_order_id) {
        // Load Razorpay script on demand (only when actually needed)
        await loadRazorpay();
        setSubmitting(false);
        const rzp = new window.Razorpay({
          key:         payment.key_id,
          amount:      payment.amount!,
          currency:    payment.currency ?? 'INR',
          name:        payment.name ?? "Krishna's Bliss",
          description: payment.description ?? `Order ${orderNumber}`,
          order_id:    payment.razorpay_order_id,
          prefill: {
            name:    values.name,
            email:   values.email,
            contact: values.phone,
          },
          theme: { color: '#1a6b6b' },
          handler: async (response) => {
            try {
              await apiClient.post(`/orders/${orderNumber}/verify-payment`, {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              });
              router.push(`/order/${orderNumber}/confirmation${emailSuffix}`);
            } catch {
              showToast('Payment received but verification failed — please contact us.');
              router.push(`/order/${orderNumber}/confirmation${emailSuffix}`);
            }
          },
          modal: {
            ondismiss: () => {
              showToast('Payment was not completed. You can retry from your orders page.');
            },
          },
        });
        rzp.open();
      } else if (payment.method === 'phonepe' && payment.redirect_url) {
        // Full-page redirect to PhonePe payment page
        window.location.href = payment.redirect_url;
      } else {
        // Manual payment fallback
        router.push(`/order/${orderNumber}/confirmation${emailSuffix}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code     = axiosErr?.response?.data?.error?.code;
      const message  = axiosErr?.response?.data?.error?.message;

      if (code === 'COUPON_INVALID') {
        showToast('Your coupon expired — it has been removed');
        await removeCoupon().catch(() => {});
        await fetchCart();
      } else if (code === 'INSUFFICIENT_STOCK') {
        showToast(message ?? 'Some items in your cart are out of stock — please review');
        await refreshCart();
        await fetchCart();
      } else {
        showToast(message ?? 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }, [cart, isLoggedIn, router, showToast, removeCoupon, refreshCart, fetchCart]);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-kb-muted">Your cart is empty — redirecting…</p>
      </div>
    );
  }

  const shippingLabel =
    totals == null              ? 'Calculated after pincode' :
    totals.shipping === 0       ? 'Free' :
    formatINR(totals.shipping);

  return (
    <div className="min-h-screen" style={{ background: 'var(--kb-cream)' }}>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-white text-sm shadow-xl"
          style={{ background: 'var(--kb-charcoal)' }}
        >
          {toast}
        </div>
      )}

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-semibold mb-8" style={{ color: 'var(--kb-charcoal)' }}>
          Checkout
        </h1>

        <div className="lg:grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* ── LEFT: Form ── */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

            {/* Section 1 — Contact (guests only) */}
            {!isLoggedIn && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--kb-charcoal)' }}>
                  Contact
                </h2>
                <p className="text-xs mb-4" style={{ color: 'var(--kb-muted)' }}>
                  We&apos;ll WhatsApp you payment details after your order is confirmed.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      Email <span style={{ color: 'var(--kb-error)' }}>*</span>
                    </label>
                    <input
                      {...register('email')}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': 'var(--kb-teal)' } as React.CSSProperties}
                    />
                    <FieldError msg={errors.email?.message} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      Mobile Number <span style={{ color: 'var(--kb-error)' }}>*</span>
                    </label>
                    <input
                      {...register('phone')}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="9876543210"
                      maxLength={10}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                    />
                    <FieldError msg={errors.phone?.message} />
                  </div>
                </div>
                <p className="mt-4 text-xs" style={{ color: 'var(--kb-muted)' }}>
                  Already have an account?{' '}
                  <Link href="/account/login?redirect=/checkout" className="underline" style={{ color: 'var(--kb-teal)' }}>
                    Sign in
                  </Link>
                </p>
              </div>
            )}

            {isLoggedIn && (
              <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--kb-charcoal)' }}>
                  Ordering as <strong>{customer?.email}</strong>
                </p>
                <Link
                  href="#"
                  onClick={e => { e.preventDefault(); useCustomerAuth; }}
                  className="text-xs underline"
                  style={{ color: 'var(--kb-muted)' }}
                >
                  {/* logout is handled from account page */}
                </Link>
              </div>
            )}

            {/* Section 2 — Delivery Address */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--kb-charcoal)' }}>
                Delivery Address
              </h2>

              {/* Saved address picker — logged-in users with at least one saved address */}
              {isLoggedIn && savedAddresses.length > 0 && (
                <div className="mb-5 space-y-2">
                  {savedAddresses.map(addr => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => {
                        setSelectedAddressId(addr.id);
                        setSaveAddress(false);
                        fillAddress(addr);
                      }}
                      className="w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors"
                      style={{
                        borderColor: selectedAddressId === addr.id ? 'var(--kb-teal)' : '#e5e7eb',
                        background:  selectedAddressId === addr.id ? 'rgba(26,107,107,0.04)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium" style={{ color: 'var(--kb-charcoal)' }}>{addr.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {addr.is_default && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(26,107,107,0.1)', color: 'var(--kb-teal)' }}>
                              Default
                            </span>
                          )}
                          {selectedAddressId === addr.id && (
                            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--kb-teal)' }} fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--kb-muted)' }}>
                        {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}, {addr.state} – {addr.pincode}
                      </p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAddressId('new');
                      setValue('line1',   '');
                      setValue('line2',   '');
                      setValue('city',    '');
                      setValue('state',   '');
                      setValue('pincode', '');
                    }}
                    className="w-full text-left rounded-xl border-2 border-dashed px-4 py-3 text-sm transition-colors"
                    style={{
                      borderColor: selectedAddressId === 'new' ? 'var(--kb-teal)' : '#e5e7eb',
                      color:       selectedAddressId === 'new' ? 'var(--kb-teal)' : 'var(--kb-muted)',
                    }}
                  >
                    + Use a different address
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                    Full Name <span style={{ color: 'var(--kb-error)' }}>*</span>
                  </label>
                  <input
                    {...register('name')}
                    type="text"
                    autoComplete="name"
                    placeholder="Priya Sharma"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  />
                  <FieldError msg={errors.name?.message} />
                </div>

                {/* Phone for logged-in users (still needed for shipping label) */}
                {isLoggedIn && (
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      Mobile Number <span style={{ color: 'var(--kb-error)' }}>*</span>
                    </label>
                    <input
                      {...register('phone')}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="9876543210"
                      maxLength={10}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                    />
                    <FieldError msg={errors.phone?.message} />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                    Address Line 1 <span style={{ color: 'var(--kb-error)' }}>*</span>
                  </label>
                  <input
                    {...register('line1')}
                    type="text"
                    autoComplete="address-line1"
                    placeholder="Flat, Building, Street"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  />
                  <FieldError msg={errors.line1?.message} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                    Address Line 2 <span className="text-xs font-normal" style={{ color: 'var(--kb-muted)' }}>(optional)</span>
                  </label>
                  <input
                    {...register('line2')}
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Area, Landmark"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      City <span style={{ color: 'var(--kb-error)' }}>*</span>
                    </label>
                    <input
                      {...register('city')}
                      type="text"
                      autoComplete="address-level2"
                      placeholder="Delhi"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                    />
                    <FieldError msg={errors.city?.message} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      Pincode <span style={{ color: 'var(--kb-error)' }}>*</span>
                    </label>
                    <input
                      {...register('pincode')}
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="110001"
                      maxLength={6}
                      onBlur={e => {
                        register('pincode').onBlur(e);
                        handlePincodeBlur(e.target.value);
                      }}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                    />
                    <FieldError msg={errors.pincode?.message} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      State <span style={{ color: 'var(--kb-error)' }}>*</span>
                    </label>
                    <select
                      {...register('state')}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white"
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <FieldError msg={errors.state?.message} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                      Country
                    </label>
                    <div className="border border-gray-100 rounded-xl px-4 py-3 text-sm bg-gray-50" style={{ color: 'var(--kb-muted)' }}>
                      India
                    </div>
                  </div>
                </div>

                {/* Save to address book — shown only when entering a new address while logged in */}
                {isLoggedIn && selectedAddressId === 'new' && savedAddresses.length < 5 && (
                  <label className="flex items-center gap-3 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={e => setSaveAddress(e.target.checked)}
                      className="w-4 h-4 rounded accent-teal-600 flex-shrink-0"
                    />
                    <span className="text-sm" style={{ color: 'var(--kb-muted)' }}>
                      Save this address to my address book
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Section 3 — GST Invoice (optional) */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <button
                type="button"
                onClick={() => setShowGst(v => !v)}
                className="flex items-center gap-2 text-sm font-medium w-full text-left"
                style={{ color: 'var(--kb-charcoal)' }}
              >
                <span className="text-lg">{showGst ? '−' : '+'}</span>
                I need a GST invoice
              </button>
              {showGst && (
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>
                    GSTIN
                  </label>
                  <input
                    {...register('billing_gstin')}
                    type="text"
                    placeholder="22AAAAA0000A1Z5"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {/* Section 4 — Exchange Policy acknowledgement */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('exchange_acknowledged')}
                  className="mt-0.5 w-4 h-4 rounded accent-teal-600 flex-shrink-0"
                  onChange={e => {
                    // react-hook-form needs a boolean cast for z.literal(true)
                    setValue(
                      'exchange_acknowledged',
                      (e.target.checked ? true : undefined) as true,
                    );
                    trigger('exchange_acknowledged');
                  }}
                />
                <span className="text-sm" style={{ color: 'var(--kb-charcoal)' }}>
                  I understand {storeName} offers <strong>exchanges only</strong> — no cash refunds.{' '}
                  <button
                    type="button"
                    onClick={() => setShowExchangePolicy(true)}
                    className="underline"
                    style={{ color: 'var(--kb-teal)' }}
                  >
                    View exchange policy →
                  </button>
                </span>
              </label>
              <FieldError msg={errors.exchange_acknowledged?.message} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-[52px] rounded-2xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
              style={{ background: 'var(--kb-teal)' }}
            >
              {submitting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Please wait…
                </>
              ) : 'Proceed to Payment'}
            </button>
          </form>

          {/* ── RIGHT: Order Summary ── */}
          <aside className="lg:sticky lg:top-6 mt-6 lg:mt-0">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-lg mb-5" style={{ color: 'var(--kb-charcoal)' }}>
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-3 mb-5">
                {cart.items.map(item => (
                  <div key={item.id} className="flex gap-3 items-start">
                    {item.primaryImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl(item.primaryImage)}
                        alt={item.name}
                        className="w-12 h-12 object-cover rounded-lg flex-shrink-0 border border-gray-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg flex-shrink-0 bg-gray-100" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--kb-charcoal)' }}>
                        {item.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--kb-muted)' }}>
                        Qty {item.quantity} × {formatINR(item.salePrice ?? item.mrp)}
                      </p>
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--kb-charcoal)' }}>
                      {formatINR((item.salePrice ?? item.mrp) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--kb-muted)' }}>Subtotal</span>
                  <span style={{ color: 'var(--kb-charcoal)' }}>{formatINR(totals?.subtotal ?? 0)}</span>
                </div>

                {cart.couponData && (
                  <div className="flex justify-between text-sm items-center">
                    <span className="flex items-center gap-1" style={{ color: 'var(--kb-success)' }}>
                      <span>{cart.couponData.code}</span>
                      <button
                        type="button"
                        onClick={async () => { await removeCoupon(); await fetchCart(); }}
                        className="text-xs px-1.5 py-0.5 rounded border leading-none"
                        style={{ color: 'var(--kb-muted)', borderColor: 'var(--kb-muted)' }}
                        aria-label="Remove coupon"
                      >
                        ×
                      </button>
                    </span>
                    <span style={{ color: 'var(--kb-success)' }}>
                      −{formatINR(totals?.discountAmount ?? cart.couponData.discount_amount)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--kb-muted)' }}>Shipping</span>
                  <span style={{ color: 'var(--kb-charcoal)' }}>{shippingLabel}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--kb-muted)' }}>GST (5%)</span>
                  <span style={{ color: 'var(--kb-charcoal)' }}>{formatINR(totals?.gst ?? 0)}</span>
                </div>

                <div className="border-t border-gray-100 pt-3 flex justify-between items-baseline">
                  <span className="font-semibold text-base" style={{ color: 'var(--kb-charcoal)' }}>Total</span>
                  <span className="font-bold text-xl" style={{ color: 'var(--kb-charcoal)' }}>
                    {formatINR(totals?.total ?? 0)}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-xs rounded-xl p-3 leading-relaxed" style={{ background: 'rgba(26,107,107,0.06)', color: 'var(--kb-teal)' }}>
                  🔐 Secure payment via Razorpay — UPI, cards, net banking &amp; more accepted.
                </p>
                <p className="text-xs text-center" style={{ color: 'var(--kb-muted)' }}>
                  🔒 Your details are safe with us
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showExchangePolicy && <ExchangePolicyModal onClose={() => setShowExchangePolicy(false)} />}
    </div>
  );
}
