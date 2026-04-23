'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AccountLayout from '@/components/account/AccountLayout';
import { useCustomerAuth, useCustomer } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import PhoneInput from '@/components/ui/PhoneInput';

export default function ProfilePage() {
  const customer = useCustomer();
  const { logout } = useCustomerAuth();
  const router = useRouter();

  // Profile edit
  const [name, setName]   = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [profileError, setProfileError]     = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [savingProfile, setSavingProfile]   = useState(false);

  // Password change
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwError, setPwError]       = useState<string | null>(null);
  const [pwSuccess, setPwSuccess]   = useState(false);
  const [savingPw, setSavingPw]     = useState(false);

  const handleSaveProfile = useCallback(async () => {
    if (!name.trim()) { setProfileError('Name is required.'); return; }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) { setProfileError('Enter a valid 10-digit mobile number.'); return; }
    setProfileError(null);
    setSavingProfile(true);
    try {
      await apiClient.put('/account/profile', { name: name.trim(), phone: phone || undefined });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string } } } };
      setProfileError(ax?.response?.data?.error?.message ?? 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }, [name, phone]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPw) { setPwError('Enter your current password.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwError(null);
    setSavingPw(true);
    try {
      await apiClient.post('/auth/change-password', { current_password: currentPw, new_password: newPw });
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string } } } };
      setPwError(ax?.response?.data?.error?.message ?? 'Failed to change password.');
    } finally {
      setSavingPw(false);
    }
  }, [currentPw, newPw, confirmPw]);

  const handleSignOut = () => {
    logout();
    router.push('/');
  };

  return (
    <AccountLayout title="My Profile">
      <div className="space-y-6">

        {/* Profile info */}
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--kb-charcoal)' }}>Personal Information</h2>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Email Address</label>
            <input
              type="email"
              value={customer?.email ?? ''}
              disabled
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 cursor-not-allowed"
              style={{ color: 'var(--kb-muted)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--kb-muted)' }}>Email cannot be changed.</p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Mobile Number</label>
            <PhoneInput
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="9876543210"
            />
          </div>

          {profileError && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
              {profileError}
            </p>
          )}
          {profileSuccess && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(39,174,96,0.08)', color: 'var(--kb-success)' }}>
              Profile updated successfully.
            </p>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: 'var(--kb-teal)' }}
          >
            {savingProfile ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--kb-charcoal)' }}>Change Password</h2>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Current Password</label>
            <input
              type="password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>New Password</label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          {pwError && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
              {pwError}
            </p>
          )}
          {pwSuccess && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(39,174,96,0.08)', color: 'var(--kb-success)' }}>
              Password changed successfully.
            </p>
          )}

          <button
            onClick={handleChangePassword}
            disabled={savingPw}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: 'var(--kb-teal)' }}
          >
            {savingPw ? 'Updating…' : 'Update Password'}
          </button>
        </div>

        {/* Sign out */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-sm mb-1" style={{ color: 'var(--kb-charcoal)' }}>Sign Out</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--kb-muted)' }}>You will be signed out of your account on this device.</p>
          <button
            onClick={handleSignOut}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold border transition-colors"
            style={{ color: 'var(--kb-error)', borderColor: 'rgba(192,57,43,0.3)' }}
          >
            Sign Out
          </button>
        </div>

      </div>
    </AccountLayout>
  );
}
