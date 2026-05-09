import { Router } from 'express';
import {
  seedToken,
  refreshStoredToken,
  getTokenStatus,
} from '../../services/whatsapp-token';

const router = Router();

// ── GET /api/admin/whatsapp/token ─────────────────────────────────────────────
// Returns the current token's status: source, expiry, Meta debug-token info.
// Auth + super_admin gating is applied at the parent router in admin/index.ts.

router.get('/token', async (_req, res, next) => {
  try {
    const status = await getTokenStatus();
    res.json({ data: status });
  } catch (err) { next(err); }
});

// ── POST /api/admin/whatsapp/token ────────────────────────────────────────────
// Body: { token: '<24h-temp-token>' }
// Server immediately exchanges it for a 60-day long-lived token and stores it.

router.post('/token', async (req, res, next) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token?.trim()) {
      res.status(400).json({ error: { message: 'token is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    const stored = await seedToken(token);
    res.json({
      data: {
        stored:     true,
        expires_at: stored.expires_at,
        message:    stored.expires_at
          ? `Token exchanged. Long-lived token stored, expires ${stored.expires_at}.`
          : 'Token stored (no explicit expiry returned by Meta).',
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    res.status(422).json({ error: { message, code: 'EXCHANGE_FAILED' } });
  }
});

// ── POST /api/admin/whatsapp/token/refresh ────────────────────────────────────
// Manually trigger an exchange of the current stored token. Useful as a
// safety check before going on holiday or when paranoid about expiry.

router.post('/token/refresh', async (_req, res, next) => {
  try {
    const refreshed = await refreshStoredToken();
    res.json({
      data: {
        refreshed:  true,
        expires_at: refreshed.expires_at,
        message:    refreshed.expires_at
          ? `Token refreshed, now expires ${refreshed.expires_at}.`
          : 'Token refreshed (no explicit expiry returned by Meta).',
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    res.status(422).json({ error: { message, code: 'REFRESH_FAILED' } });
  }
});

export default router;
