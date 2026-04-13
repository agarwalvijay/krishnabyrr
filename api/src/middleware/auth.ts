import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/client';

export interface AdminTokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface CustomerTokenPayload {
  id: string;
  email: string;
  name: string;
  sub: 'customer';
}

// Extend Express Request to carry authenticated user context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        is_active: boolean;
      };
      customer?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

// ── Customer auth helpers ─────────────────────────────────────────────────────

const jwtSecret = () => process.env.JWT_SECRET ?? 'change-me-in-production';

async function resolveCustomerFromToken(token: string): Promise<{ id: string; email: string; name: string } | null> {
  let payload: CustomerTokenPayload;
  try {
    payload = jwt.verify(token, jwtSecret()) as CustomerTokenPayload;
  } catch {
    return null;
  }
  if (payload.sub !== 'customer') return null;

  const { rows } = await pool.query<{ id: string; email: string; name: string }>(
    'SELECT id, email, name FROM customers WHERE id = $1',
    [payload.id],
  );
  return rows[0] ?? null;
}

/** Blocks the request if the customer is not authenticated. */
export const requireCustomerAuth: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    return;
  }
  const customer = await resolveCustomerFromToken(authHeader.slice(7)).catch(() => null);
  if (!customer) {
    res.status(401).json({ error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } });
    return;
  }
  req.customer = customer;
  next();
};

/** Populates req.customer if a valid token is present, but does not block guests. */
export const optionalCustomerAuth: RequestHandler = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const customer = await resolveCustomerFromToken(authHeader.slice(7)).catch(() => null);
    if (customer) req.customer = customer;
  }
  next();
};

// ── Admin auth ────────────────────────────────────────────────────────────────

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    return;
  }

  const token = authHeader.slice(7);
  const secret = jwtSecret();

  let payload: AdminTokenPayload;
  try {
    payload = jwt.verify(token, secret) as AdminTokenPayload;
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string; email: string; name: string; role: string; is_active: boolean;
    }>(
      'SELECT id, email, name, role, is_active FROM admin_users WHERE id = $1 AND is_active = true',
      [payload.id]
    );

    if (!rows.length) {
      res.status(401).json({ error: { message: 'Admin user not found or inactive', code: 'UNAUTHORIZED' } });
      return;
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
};
