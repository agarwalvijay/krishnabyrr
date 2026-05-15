'use client';

import { useEffect, useState, useCallback } from 'react';
import AccountLayout from '@/components/account/AccountLayout';
import { apiClient } from '@/lib/api';
import PhoneInput from '@/components/ui/PhoneInput';

const INDIAN_STATES = [
  'Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam',
  'Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir',
  'Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry',
  'Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal',
];

interface Address {
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

interface FormData {
  name:    string;
  phone:   string;
  line1:   string;
  line2:   string;
  city:    string;
  state:   string;
  pincode: string;
}

const EMPTY_FORM: FormData = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.name.trim())                        e.name    = 'Name is required';
  if (!/^[6-9]\d{9}$/.test(f.phone))        e.phone   = 'Enter a valid 10-digit mobile number';
  if (!f.line1.trim())                       e.line1   = 'Address line 1 is required';
  if (!f.city.trim())                        e.city    = 'City is required';
  if (!f.state)                              e.state   = 'State is required';
  if (!/^\d{6}$/.test(f.pincode))           e.pincode = 'Enter a valid 6-digit pincode';
  return e;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors]       = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: Address[] }>('/account/addresses');
      setAddresses(res.data.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setApiError(null);
    setShowForm(true);
  };

  const openEdit = (addr: Address) => {
    setEditId(addr.id);
    setForm({
      name:    addr.name,
      phone:   addr.phone,
      line1:   addr.line1,
      line2:   addr.line2 ?? '',
      city:    addr.city,
      state:   addr.state,
      pincode: addr.pincode,
    });
    setErrors({});
    setApiError(null);
    setShowForm(true);
  };

  const cancel = () => { setShowForm(false); setEditId(null); };

  const handleSubmit = async () => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    setApiError(null);
    try {
      const payload = { ...form, line2: form.line2 || undefined };
      if (editId) {
        await apiClient.put(`/account/addresses/${editId}`, payload);
      } else {
        await apiClient.post('/account/addresses', payload);
      }
      await load();
      setShowForm(false);
      setEditId(null);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string } } } };
      setApiError(ax?.response?.data?.error?.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiClient.delete(`/account/addresses/${id}`).catch(() => {});
    setAddresses(prev => prev.filter(a => a.id !== id));
  };

  const handleSetDefault = async (id: string) => {
    await apiClient.put(`/account/addresses/${id}/default`, {}).catch(() => {});
    setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id })));
  };

  const atLimit = addresses.length >= 5;

  const field = (key: keyof FormData, label: string, opts?: { placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>{label}</label>
      <input
        type={opts?.type ?? 'text'}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={opts?.placeholder}
        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none"
        style={{ borderColor: errors[key] ? 'var(--kb-error)' : '#e5e7eb' }}
      />
      {errors[key] && <p className="text-xs mt-1" style={{ color: 'var(--kb-error)' }}>{errors[key]}</p>}
    </div>
  );

  return (
    <AccountLayout title="Saved Addresses">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
        </div>
      ) : (
        <div className="space-y-4">
          {!atLimit && !showForm && (
            <button
              onClick={openAdd}
              className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors"
              style={{ borderColor: 'var(--kb-teal)', color: 'var(--kb-teal)' }}
            >
              + Add New Address
            </button>
          )}
          {atLimit && !showForm && (
            <p className="text-xs px-3 py-2 rounded-lg text-center" style={{ background: 'rgba(26,107,107,0.06)', color: 'var(--kb-muted)' }}>
              You&apos;ve reached the maximum of 5 saved addresses. Delete one to add another.
            </p>
          )}

          {/* Inline form */}
          {showForm && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--kb-charcoal)' }}>
                {editId ? 'Edit Address' : 'New Address'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field('name', 'Full Name', { placeholder: 'Recipient name' })}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Mobile Number</label>
                  <PhoneInput
                    value={form.phone}
                    onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="9876543210"
                    hasError={!!errors.phone}
                  />
                  {errors.phone && <p className="text-xs mt-1" style={{ color: 'var(--kb-error)' }}>{errors.phone}</p>}
                </div>
                <div className="sm:col-span-2">{field('line1', 'Address Line 1', { placeholder: 'House no., street, locality' })}</div>
                <div className="sm:col-span-2">{field('line2', 'Address Line 2 (optional)', { placeholder: 'Landmark, area' })}</div>
                {field('city',    'City',           { placeholder: 'City' })}
                {field('pincode', 'Pincode',        { placeholder: '6-digit pincode', type: 'tel' })}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>State</label>
                  <select
                    value={form.state}
                    onChange={e => setForm(prev => ({ ...prev, state: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{ borderColor: errors.state ? 'var(--kb-error)' : '#e5e7eb' }}
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.state && <p className="text-xs mt-1" style={{ color: 'var(--kb-error)' }}>{errors.state}</p>}
                </div>
              </div>
              {apiError && (
                <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
                  {apiError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
                  style={{ background: 'var(--kb-teal)' }}
                >
                  {submitting ? 'Saving…' : editId ? 'Save Changes' : 'Add Address'}
                </button>
                <button
                  onClick={cancel}
                  className="px-5 py-2.5 rounded-xl text-sm border transition-colors"
                  style={{ color: 'var(--kb-muted)', borderColor: '#e5e7eb' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Address cards */}
          {addresses.length === 0 && !showForm ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>No saved addresses yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map(addr => (
                <div
                  key={addr.id}
                  className="bg-white rounded-2xl p-5 shadow-sm"
                  style={{ borderLeft: addr.is_default ? '3px solid var(--kb-teal)' : undefined }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 text-sm">
                      <div className="flex items-center gap-2">
                        <p className="font-medium" style={{ color: 'var(--kb-charcoal)' }}>{addr.name}</p>
                        {addr.is_default && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(26,107,107,0.1)', color: 'var(--kb-teal)' }}>
                            Default
                          </span>
                        )}
                      </div>
                      <p style={{ color: 'var(--kb-muted)' }}>{addr.line1}</p>
                      {addr.line2 && <p style={{ color: 'var(--kb-muted)' }}>{addr.line2}</p>}
                      <p style={{ color: 'var(--kb-muted)' }}>{addr.city}, {addr.state} – {addr.pincode}</p>
                      <p style={{ color: 'var(--kb-muted)' }}>📞 {addr.phone}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => openEdit(addr)}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ color: 'var(--kb-teal)', borderColor: 'var(--kb-teal)' }}
                    >
                      Edit
                    </button>
                    {!addr.is_default && (
                      <button
                        onClick={() => handleSetDefault(addr.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                        style={{ color: 'var(--kb-muted)', borderColor: '#e5e7eb' }}
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(addr.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ color: 'var(--kb-error)', borderColor: 'rgba(192,57,43,0.3)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AccountLayout>
  );
}
