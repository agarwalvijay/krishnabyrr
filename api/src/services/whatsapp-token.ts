/**
 * WhatsApp access token manager.
 *
 * Goal: turn the 24-hour temporary tokens that Meta issues from the developer
 * dashboard into effectively permanent tokens, without touching System Users
 * (which require unrestricted Business Account admin access).
 *
 * How:
 *   1. Admin pastes a fresh 24h temp token via the admin UI ONCE.
 *   2. Server immediately exchanges it for a 60-day long-lived token via
 *      Meta's fb_exchange_token OAuth endpoint, and stores it in the
 *      `settings` table (keys: whatsapp_access_token, whatsapp_token_expires_at).
 *   3. On every send, if the stored token's remaining TTL drops below 14 days,
 *      the server exchanges the current long-lived token for ANOTHER long-lived
 *      token (Meta's exchange endpoint accepts long-lived tokens as input and
 *      returns a fresh 60-day window). This rolls indefinitely.
 *   4. If a send fails with error 190 (auth), the cache is invalidated so the
 *      next call re-reads from the DB — useful when an admin has just pasted
 *      a new token but this Node process still had the old one cached.
 *
 * Fallback: if no token is stored in the DB, falls back to WHATSAPP_ACCESS_TOKEN
 * env var. This preserves existing behaviour during/after deploys while the
 * admin hasn't seeded a token yet.
 */

import pool from '../db/client';

const SETTING_TOKEN      = 'whatsapp_access_token';
const SETTING_EXPIRES_AT = 'whatsapp_token_expires_at';

const CACHE_TTL_MS                = 60_000;
const RENEWAL_THRESHOLD_DAYS      = 14;
const RENEWAL_THRESHOLD_MS        = RENEWAL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export interface TokenInfo {
  token:      string;
  expires_at: string | null; // ISO timestamp, or null if unknown / never expires
}

let cached:   TokenInfo | null = null;
let cachedAt = 0;

let autoRefreshInProgress = false;

// ── Storage ───────────────────────────────────────────────────────────────────

async function loadFromSettings(): Promise<TokenInfo | null> {
  const { rows } = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM settings WHERE key IN ($1, $2)`,
    [SETTING_TOKEN, SETTING_EXPIRES_AT],
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const token = map.get(SETTING_TOKEN);
  if (typeof token !== 'string' || !token) return null;
  const exp = map.get(SETTING_EXPIRES_AT);
  return {
    token,
    expires_at: typeof exp === 'string' ? exp : null,
  };
}

async function saveToSettings(info: TokenInfo): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [SETTING_TOKEN, JSON.stringify(info.token)],
    );
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [SETTING_EXPIRES_AT, JSON.stringify(info.expires_at)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchanges any user access token (short-lived OR long-lived) for a fresh
 * 60-day long-lived user access token. Preserves all scopes.
 */
async function exchangeForLongLived(token: string): Promise<TokenInfo> {
  const appId     = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('WHATSAPP_APP_ID and WHATSAPP_APP_SECRET must both be set to exchange tokens');
  }

  const url = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  url.searchParams.set('grant_type',        'fb_exchange_token');
  url.searchParams.set('client_id',         appId);
  url.searchParams.set('client_secret',     appSecret);
  url.searchParams.set('fb_exchange_token', token);

  const res  = await fetch(url.toString());
  const data = await res.json() as {
    access_token?: string;
    token_type?:   string;
    expires_in?:   number;
    error?:        { message: string; code: number; type?: string };
  };

  if (!res.ok || !data.access_token) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Token exchange failed: ${msg}`);
  }

  // expires_in is seconds. Some token types return 0 / omit it ("never expires" — System Users).
  const expiresAt =
    data.expires_in && data.expires_in > 0
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

  return { token: data.access_token, expires_at: expiresAt };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the active access token. Reads from DB → cache → env-var fallback. */
export async function getAccessToken(): Promise<string | null> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    // Schedule a non-blocking renewal check while serving from cache
    void maybeAutoRefresh(cached);
    return cached.token;
  }

  const fromDb = await loadFromSettings();
  if (fromDb) {
    cached   = fromDb;
    cachedAt = Date.now();
    void maybeAutoRefresh(fromDb);
    return fromDb.token;
  }

  // Fallback: env var. Used the first time before an admin has seeded a DB token.
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (envToken) {
    cached   = { token: envToken, expires_at: null };
    cachedAt = Date.now();
    return envToken;
  }

  return null;
}

/** Force the next getAccessToken() call to re-read from DB. */
export function invalidateCache(): void {
  cached   = null;
  cachedAt = 0;
}

/** Admin: paste a fresh 24h temp token; we'll exchange + store. */
export async function seedToken(shortLivedToken: string): Promise<TokenInfo> {
  const trimmed   = shortLivedToken.trim();
  if (!trimmed) throw new Error('Empty token');
  const longLived = await exchangeForLongLived(trimmed);
  await saveToSettings(longLived);
  invalidateCache();
  return longLived;
}

/** Admin: extend the currently-stored token by another 60 days. */
export async function refreshStoredToken(): Promise<TokenInfo> {
  const current = await loadFromSettings();
  if (!current) throw new Error('No stored WhatsApp token — paste a fresh temp token first');
  const refreshed = await exchangeForLongLived(current.token);
  await saveToSettings(refreshed);
  invalidateCache();
  return refreshed;
}

/** Admin: full status snapshot for the UI (expiry, scopes, validity). */
export async function getTokenStatus(): Promise<{
  configured:    boolean;
  source:        'database' | 'env' | 'none';
  stored_expires_at: string | null;
  meta_debug:    unknown | null;
  message?:      string;
}> {
  const stored   = await loadFromSettings();
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const token    = stored?.token ?? envToken ?? null;

  if (!token) {
    return { configured: false, source: 'none', stored_expires_at: null, meta_debug: null };
  }

  const appId     = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    return {
      configured:        true,
      source:            stored ? 'database' : 'env',
      stored_expires_at: stored?.expires_at ?? null,
      meta_debug:        null,
      message:           'Set WHATSAPP_APP_ID and WHATSAPP_APP_SECRET to enable Meta debug-token inspection.',
    };
  }

  // Meta's debug_token endpoint requires an "app access token" formatted as APP_ID|APP_SECRET
  try {
    const debugUrl = new URL('https://graph.facebook.com/v19.0/debug_token');
    debugUrl.searchParams.set('input_token',   token);
    debugUrl.searchParams.set('access_token',  `${appId}|${appSecret}`);
    const res  = await fetch(debugUrl.toString());
    const data = await res.json() as { data?: unknown; error?: unknown };
    return {
      configured:        true,
      source:            stored ? 'database' : 'env',
      stored_expires_at: stored?.expires_at ?? null,
      meta_debug:        data.data ?? data.error ?? data,
    };
  } catch (err) {
    return {
      configured:        true,
      source:            stored ? 'database' : 'env',
      stored_expires_at: stored?.expires_at ?? null,
      meta_debug:        null,
      message:           `Could not contact Meta debug endpoint: ${(err as Error).message}`,
    };
  }
}

// ── Internal: background renewal ──────────────────────────────────────────────

async function maybeAutoRefresh(current: TokenInfo): Promise<void> {
  if (!current.expires_at) return;
  const remaining = new Date(current.expires_at).getTime() - Date.now();
  if (remaining > RENEWAL_THRESHOLD_MS) return;
  if (remaining < 0) return; // expired — let an admin re-seed
  if (autoRefreshInProgress)  return;

  autoRefreshInProgress = true;
  try {
    console.log(`[whatsapp-token] Auto-refreshing — ${Math.round(remaining / 86_400_000)}d remaining`);
    await refreshStoredToken();
    console.log('[whatsapp-token] Auto-refresh successful');
  } catch (err) {
    console.error('[whatsapp-token] Auto-refresh failed:', (err as Error).message);
  } finally {
    autoRefreshInProgress = false;
  }
}
