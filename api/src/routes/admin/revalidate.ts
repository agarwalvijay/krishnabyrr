import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';

const router = Router();

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET ?? '';

// POST /api/admin/revalidate-cache
// Triggers Next.js on-demand revalidation for all public storefront routes.
router.post('/', requireAuth, async (_req, res, next) => {
  try {
    if (!REVALIDATE_SECRET) {
      res.status(503).json({ error: { message: 'REVALIDATE_SECRET not configured', code: 'NOT_CONFIGURED' } });
      return;
    }

    const response = await fetch(`${WEB_ORIGIN}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: REVALIDATE_SECRET }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(502).json({ error: { message: `Revalidation failed: ${text}`, code: 'REVALIDATE_ERROR' } });
      return;
    }

    const data = await response.json() as { revalidated: boolean; at: string };
    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
