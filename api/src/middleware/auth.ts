import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/client';

export interface AdminTokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface CustomerTokenPayload {
  id:     string;
  email:  string | null;
  name:   string;
  phone:  string | null;
  sub:    'customer';
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
        id:    string;
        email: string | null;
        name:  string;
        phone: string | null;
      };
    }
  }
}

// ── Customer auth helpers ─────────────────────────────────────────────────────

const jwtSecret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is not set');
  return s;
};

async function resolveCustomerFromToken(
  token: string,
): Promise<{ id: string; email: string | null; name: string; phone: string | null; is_suspended: boolean } | null> {
  let payload: CustomerTokenPayload;
  try {
    payload = jwt.verify(token, jwtSecret()) as CustomerTokenPayload;
  } catch {
    return null;
  }
  if (payload.sub !== 'customer') return null;

  const { rows } = await pool.query<{ id: string; email: string | null; name: string; phone: string | null; is_suspended: boolean }>(
    'SELECT id, email, name, phone, is_suspended FROM customers WHERE id = $1',
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
  if (customer.is_suspended) {
    res.status(403).json({ error: { message: 'This account has been suspended. Please contact us on WhatsApp.', code: 'ACCOUNT_SUSPENDED' } });
    return;
  }
  req.customer = { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone };
  next();
};

/** Populates req.customer if a valid token is present, but does not block guests. */
export const optionalCustomerAuth: RequestHandler = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const customer = await resolveCustomerFromToken(authHeader.slice(7)).catch(() => null);
    if (customer && !customer.is_suspended) {
      req.customer = { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone };
    }
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

// ── Role-based authorization ─────────────────────────────────────────────────
//
// Use AFTER requireAuth on a route or router to restrict by admin role.
//   router.post('/...', requireAuth, requireRole('order_manager'), handler)
// super_admin always passes regardless of the role list.

export type AdminRole = 'super_admin' | 'catalog_manager' | 'order_manager';

export function requireRole(...allowed: AdminRole[]): RequestHandler {
  return (req, res, next) => {
    const role = req.user?.role as AdminRole | undefined;
    if (!role) {
      res.status(401).json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }
    if (role === 'super_admin' || allowed.includes(role)) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        message: 'You do not have permission to perform this action',
        code: 'FORBIDDEN_ROLE',
      },
    });
  };
}
