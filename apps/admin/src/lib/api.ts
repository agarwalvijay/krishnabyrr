import axios from 'axios';

const TOKEN_KEY = 'kb_admin_token';
const DEFAULT_API_ORIGIN = 'http://localhost:3001';
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? DEFAULT_API_ORIGIN;

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach token ───────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — handle 401 ────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Only redirect if not already on login page
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function imageUrl(gcsPath: string | null | undefined): string {
  if (!gcsPath) return '';
  if (gcsPath.startsWith('http://') || gcsPath.startsWith('https://')) return gcsPath;
  if (gcsPath.startsWith('/uploads/')) return `${API_ORIGIN}${gcsPath}`;
  if (gcsPath.startsWith('uploads/')) return `${API_ORIGIN}/${gcsPath}`;
  const filename = gcsPath.split('/').pop() ?? '';
  return `${API_ORIGIN}/uploads/${filename}`;
}
