'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { apiClient, type Customer } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuthState {
  customer:  Customer | null;
  token:     string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login:    (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout:   () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useCustomerAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used inside <CustomerAuthProvider>');
  return ctx;
}

export function useCustomer(): Customer | null {
  return useCustomerAuth().customer;
}

export function useIsLoggedIn(): boolean {
  return useCustomerAuth().customer !== null;
}

// ── Provider ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'kb_customer_token';

// ── Native app bridge ─────────────────────────────────────────────────────────
// When the website runs inside the Krishna's Bliss Android/iOS app (WebView),
// window.ReactNativeWebView is injected by the native shell. We use it to
// pass the auth token so the app can register the device for push notifications.

function notifyNativeApp(type: 'USER_LOGIN' | 'USER_LOGOUT', token?: string) {
  if (typeof window === 'undefined') return;
  const rn = (window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } }).ReactNativeWebView;
  if (!rn) return;
  rn.postMessage(JSON.stringify({ type, token }));
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    customer:  null,
    token:     null,
    isLoading: true,
  });
  const initialised = useRef(false);

  // On mount: validate existing token
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState({ customer: null, token: null, isLoading: false });
      return;
    }

    apiClient
      .get<{ data: Customer }>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(res => {
        setState({ customer: res.data.data, token, isLoading: false });
        notifyNativeApp('USER_LOGIN', token); // re-register device on app open
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ customer: null, token: null, isLoading: false });
      });
  }, []);

  const storeToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    // Ensure the axios interceptor picks it up for subsequent calls
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient.post<{ data: { token: string; customer: Customer } }>(
      '/auth/login',
      { email, password },
    );
    const { token, customer } = res.data.data;
    storeToken(token);
    setState({ customer, token, isLoading: false });
    notifyNativeApp('USER_LOGIN', token);
  }, [storeToken]);

  const register = useCallback(async (name: string, email: string, phone: string, password: string) => {
    const res = await apiClient.post<{ data: { token: string; customer: Customer } }>(
      '/auth/register',
      { name, email, phone, password },
    );
    const { token, customer } = res.data.data;
    storeToken(token);
    setState({ customer, token, isLoading: false });
    notifyNativeApp('USER_LOGIN', token);
  }, [storeToken]);

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    notifyNativeApp('USER_LOGOUT', currentToken ?? undefined); // deregister device before clearing
    localStorage.removeItem(TOKEN_KEY);
    delete apiClient.defaults.headers.common['Authorization'];
    setState({ customer: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
