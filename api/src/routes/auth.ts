import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/client';
import { requireCustomerAuth } from '../middleware/auth';
import { createVerificationToken, createLoginToken, verifyToken } from '../services/otp';
import { sendVerificationLink, sendLoginLink, sendPasswordChanged } from '../services/whatsapp';
import { createPairing, markApproved, pollSession } from '../services/magic-session';

const router = Router();

const JWT_SECRET  = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is not set');
  return s;
};
const JWT_EXPIRES = '30d';
const BCRYPT_ROUNDS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

/** Strip non-digits and keep last 10 — our canonical phone format */
function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, phone } = req.body as {
      email?:    string;
      password?: string;
      name?:     string;
      phone?:    string;
    };

    if (!name?.trim()) {
      res.status(400).json({ error: { message: 'Name is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (!password) {
      res.status(400).json({ error: { message: 'Password is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: { message: 'Phone number or email is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' } });
      return;
    }

    const normalEmail  = email ? email.toLowerCase().trim() : null;
    const normalPhone  = phone ? cleanPhone(phone) : null;

    if (normalEmail && !isEmail(normalEmail)) {
      res.status(400).json({ error: { message: 'Invalid email address', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (normalPhone && normalPhone.length !== 10) {
      res.status(400).json({ error: { message: 'Enter a valid 10-digit mobile number', code: 'VALIDATION_ERROR' } });
      return;
    }

    // Uniqueness checks
    if (normalEmail) {
      const { rowCount } = await pool.query('SELECT id FROM customers WHERE email = $1', [normalEmail]);
      if (rowCount && rowCount > 0) {
        res.status(409).json({ error: { message: 'Email already registered', code: 'EMAIL_TAKEN' } });
        return;
      }
    }
    if (normalPhone) {
      const { rowCount } = await pool.query('SELECT id FROM customers WHERE phone = $1', [normalPhone]);
      if (rowCount && rowCount > 0) {
        res.status(409).json({ error: { message: 'Phone number already registered', code: 'PHONE_TAKEN' } });
        return;
      }
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows: [customer] } = await pool.query<{
      id: string; email: string | null; name: string; phone: string | null;
    }>(
      `INSERT INTO customers (email, name, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone`,
      [normalEmail, name.trim(), password_hash, normalPhone],
    );

    // Auto-link any guest orders placed with this email before registration.
    // Also bump customers.total_orders / lifetime_value so the customer
    // dashboard count matches the orders listing.
    if (normalEmail) {
      const { rows: linked } = await pool.query<{ total: string }>(
        `UPDATE orders SET customer_id = $1, updated_at = NOW()
         WHERE LOWER(guest_email) = $2 AND customer_id IS NULL
         RETURNING total::text`,
        [customer.id, normalEmail],
      );
      if (linked.length > 0) {
        const sum = linked.reduce((s, r) => s + parseFloat(r.total), 0);
        await pool.query(
          `UPDATE customers
             SET total_orders   = total_orders + $1,
                 lifetime_value = lifetime_value + $2,
                 updated_at     = NOW()
           WHERE id = $3`,
          [linked.length, sum, customer.id],
        );
      }
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    // Send phone verification magic link + pair the laptop's session for live update.
    // The pairing happens synchronously so we can return the session_id; the WhatsApp
    // send itself is fire-and-forget.
    let verifySessionId: string | null = null;
    if (normalPhone) {
      try {
        const verifyTok = await createVerificationToken(normalPhone);
        verifySessionId = await createPairing(verifyTok, 'verify');
        sendVerificationLink(normalPhone, name.trim(), verifyTok); // fire-and-forget
      } catch {
        // Never block registration on verification-link issues
      }
    }

    res.status(201).json({ data: { token, customer, verify_session_id: verifySessionId } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Accepts { identifier, password } where identifier is an email or phone number.

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string };

    if (!identifier || !password) {
      res.status(401).json({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    // Detect whether identifier is email or phone
    const trimmed    = identifier.trim();
    const byEmail    = isEmail(trimmed);
    const byPhone    = !byEmail;
    const lookupVal  = byEmail ? trimmed.toLowerCase() : cleanPhone(trimmed);

    const { rows: [customer] } = await pool.query<{
      id: string; email: string | null; name: string; phone: string | null; password_hash: string | null; is_suspended: boolean;
    }>(
      byEmail
        ? 'SELECT id, email, name, phone, password_hash, is_suspended FROM customers WHERE email = $1'
        : 'SELECT id, email, name, phone, password_hash, is_suspended FROM customers WHERE phone = $1',
      [lookupVal],
    );

    // Always run bcrypt to prevent timing attacks
    const DUMMY_HASH = '$2b$12$invalidhashfortimingprotection00000000000000000000000';
    const hashToCompare = customer?.password_hash ?? DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashToCompare);

    if (!customer || !customer.password_hash || !passwordMatch) {
      res.status(401).json({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
      return;
    }
    if (customer.is_suspended) {
      res.status(403).json({ error: { message: 'This account has been suspended. Please contact us on WhatsApp.', code: 'ACCOUNT_SUSPENDED' } });
      return;
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    res.json({ data: { token, customer: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone } } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', requireCustomerAuth, async (req, res, next) => {
  try {
    // Compute total_orders + lifetime_value live from the orders table rather
    // than trusting the denormalised counter on customers. Otherwise orders
    // linked AFTER registration (via auto-link or /link-order) wouldn't be
    // reflected in the dashboard count.
    const { rows: [customer] } = await pool.query<{
      id: string; email: string | null; name: string; phone: string | null;
      phone_verified: boolean; total_orders: number; lifetime_value: string; created_at: Date;
    }>(
      `SELECT
         c.id, c.email, c.name, c.phone, c.phone_verified,
         COUNT(o.id)::int               AS total_orders,
         COALESCE(SUM(o.total), 0)::text AS lifetime_value,
         c.created_at
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [req.customer!.id],
    );

    if (!customer) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/link-order ─────────────────────────────────────────────────

router.post('/link-order', async (req, res, next) => {
  try {
    const { orderNumber, email } = req.body as { orderNumber?: string; email?: string };

    if (!orderNumber || !email) {
      res.status(400).json({ error: { message: 'orderNumber and email are required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const normalEmail = email.toLowerCase().trim();

    const { rows: [customer] } = await pool.query<{ id: string }>(
      'SELECT id FROM customers WHERE email = $1',
      [normalEmail],
    );

    if (!customer) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }

    const { rows: [order] } = await pool.query<{ id: string; total: string }>(
      `SELECT id, total::text FROM orders
       WHERE order_number = $1
         AND customer_id IS NULL
         AND LOWER(guest_email) = $2`,
      [orderNumber.toUpperCase(), normalEmail],
    );

    if (!order) {
      res.json({ data: { linked: false } });
      return;
    }

    await pool.query(
      `UPDATE orders SET customer_id = $1, updated_at = NOW() WHERE id = $2`,
      [customer.id, order.id],
    );

    // Keep customers.total_orders + lifetime_value consistent with the linked
    // order so admin Customers page reflects reality.
    await pool.query(
      `UPDATE customers
         SET total_orders   = total_orders + 1,
             lifetime_value = lifetime_value + $1,
             updated_at     = NOW()
       WHERE id = $2`,
      [parseFloat(order.total), customer.id],
    );

    res.json({ data: { linked: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/change-password ────────────────────────────────────────────

router.post('/change-password', requireCustomerAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?:     string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: { message: 'currentPassword and newPassword are required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: { message: 'New password must be at least 8 characters', code: 'VALIDATION_ERROR' } });
      return;
    }

    const { rows: [customer] } = await pool.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM customers WHERE id = $1',
      [req.customer!.id],
    );

    if (!customer?.password_hash) {
      res.status(400).json({ error: { message: 'No password set for this account', code: 'NO_PASSWORD' } });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, customer.password_hash);
    if (!valid) {
      res.status(401).json({ error: { message: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE customers SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.customer!.id]);

    // Security alert via WhatsApp (fire-and-forget)
    if (req.customer!.phone) {
      sendPasswordChanged(req.customer!.phone, req.customer!.name);
    }

    res.json({ data: { message: 'Password updated successfully' } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/send-login-link ───────────────────────────────────────────
// Passwordless login: find account by email or phone, send WhatsApp magic link.
// No auth required — this is the entry point for unauthenticated users.

router.post('/send-login-link', async (req, res, next) => {
  try {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier?.trim()) {
      res.status(400).json({ error: { message: 'Email or mobile number is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const trimmed  = identifier.trim();
    const byEmail  = isEmail(trimmed);
    const lookupVal = byEmail ? trimmed.toLowerCase() : cleanPhone(trimmed);

    const { rows: [customer] } = await pool.query<{
      id: string; name: string; phone: string | null; email: string | null;
    }>(
      byEmail
        ? 'SELECT id, name, phone, email FROM customers WHERE email = $1'
        : 'SELECT id, name, phone, email FROM customers WHERE phone = $1',
      [lookupVal],
    );

    // Always respond with success to prevent account enumeration
    if (!customer?.phone) {
      // Either account not found or account has no phone — can't send WhatsApp.
      // Respond as if we sent a link, with a synthesised session_id so the laptop
      // can still show a "waiting" UI without revealing the account doesn't exist.
      // The session simply expires after 15 minutes since nothing approves it.
      const fakeId = (await import('crypto')).randomBytes(16).toString('hex');
      res.json({ data: {
        message:    'If an account exists, a login link has been sent via WhatsApp.',
        session_id: fakeId,
      }});
      return;
    }

    let loginSessionId: string;
    try {
      const token   = await createLoginToken(customer.phone);
      loginSessionId = await createPairing(token, 'login');
      sendLoginLink(customer.phone, customer.name, token); // fire-and-forget
    } catch (err) {
      if ((err as Error).message === 'RATE_LIMITED') {
        res.status(429).json({ error: { message: 'Too many requests. Please wait a few minutes before trying again.', code: 'RATE_LIMITED' } });
        return;
      }
      throw err;
    }

    res.json({ data: {
      message:    'If an account exists, a login link has been sent via WhatsApp.',
      session_id: loginSessionId,
    }});
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/verify-login-link ─────────────────────────────────────────
// Called by /login-link?t=<token> — verifies token and returns a full JWT.
// No auth required — token proves identity.

router.post('/verify-login-link', async (req, res, next) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: { message: 'token is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    let phone: string;
    try {
      phone = await verifyToken(token, 'login');
    } catch (err) {
      const code_ = (err as Error).message;
      const messages: Record<string, string> = {
        INVALID:      'This login link is invalid.',
        EXPIRED:      'This login link has expired. Please request a new one.',
        ALREADY_USED: 'This link has already been used. Please request a new one.',
      };
      res.status(422).json({ error: { message: messages[code_] ?? 'Login failed', code: code_ } });
      return;
    }

    const { rows: [customer] } = await pool.query<{
      id: string; email: string | null; name: string; phone: string | null; is_suspended: boolean;
    }>(
      'SELECT id, email, name, phone, is_suspended FROM customers WHERE phone = $1',
      [phone],
    );

    if (!customer) {
      res.status(404).json({ error: { message: 'Account not found', code: 'NOT_FOUND' } });
      return;
    }
    if (customer.is_suspended) {
      res.status(403).json({ error: { message: 'This account has been suspended. Please contact us on WhatsApp.', code: 'ACCOUNT_SUSPENDED' } });
      return;
    }

    const freshToken = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    // If a laptop is polling for this magic link, hand it the JWT
    await markApproved(token, { token: freshToken, customer }).catch(() => {});

    res.json({ data: { token: freshToken, customer } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/send-verification ─────────────────────────────────────────
// (Re)sends a magic-link verification message to the customer's phone.
// Requires auth — we look up the phone from the DB.

router.post('/send-verification', requireCustomerAuth, async (req, res, next) => {
  try {
    const phone = req.customer!.phone;
    if (!phone) {
      res.status(400).json({ error: { message: 'No phone number on this account', code: 'NO_PHONE' } });
      return;
    }

    const { rows: [c] } = await pool.query<{ phone_verified: boolean; name: string }>(
      'SELECT phone_verified, name FROM customers WHERE id = $1',
      [req.customer!.id],
    );
    if (c?.phone_verified) {
      res.status(409).json({ error: { message: 'Phone already verified', code: 'ALREADY_VERIFIED' } });
      return;
    }

    let verifySessionId: string;
    try {
      const token     = await createVerificationToken(phone);
      verifySessionId = await createPairing(token, 'verify');
      sendVerificationLink(phone, c?.name ?? req.customer!.name, token);
    } catch (err) {
      if ((err as Error).message === 'RATE_LIMITED') {
        res.status(429).json({ error: { message: 'Too many requests. Please wait a few minutes before trying again.', code: 'RATE_LIMITED' } });
        return;
      }
      throw err;
    }

    res.json({ data: { message: 'Verification link sent', session_id: verifySessionId } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/verify-phone ───────────────────────────────────────────────
// Called by the /verify-phone frontend page after the user taps the magic link.
// No auth required — the token itself proves phone ownership.
// Returns a fresh JWT so the user is logged in even if they opened the link
// in a fresh browser (e.g. from WhatsApp on a different device).

router.post('/verify-phone', async (req, res, next) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: { message: 'token is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    let phone: string;
    try {
      phone = await verifyToken(token, 'verify');
    } catch (err) {
      const code_ = (err as Error).message;
      const messages: Record<string, string> = {
        INVALID:      'This verification link is invalid.',
        EXPIRED:      'This verification link has expired. Please request a new one.',
        ALREADY_USED: 'This link has already been used.',
      };
      res.status(422).json({ error: { message: messages[code_] ?? 'Verification failed', code: code_ } });
      return;
    }

    // Mark the customer's phone as verified and return a fresh JWT
    const { rows: [customer] } = await pool.query<{
      id: string; email: string | null; name: string; phone: string | null;
    }>(
      `UPDATE customers SET phone_verified = true, updated_at = NOW()
       WHERE phone = $1
       RETURNING id, email, name, phone`,
      [phone],
    );

    if (!customer) {
      res.status(404).json({ error: { message: 'Account not found', code: 'NOT_FOUND' } });
      return;
    }

    const jwt_ = await import('jsonwebtoken');
    const freshToken = jwt_.default.sign(
      { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    // If a laptop is polling for this verification, signal it now.
    // payload includes the customer (with phone_verified=true) so the laptop
    // can refresh its UI without an extra /auth/me call.
    await markApproved(token, {
      verified: true,
      token:    freshToken,
      customer: { ...customer, phone_verified: true },
    }).catch(() => {});

    res.json({ data: { verified: true, token: freshToken, customer } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/magic-session/:id ──────────────────────────────────────────
// Polled by the requesting laptop every 1–2s. Returns 'pending' until the
// phone approves the link (by visiting /verify-phone or /login-link), at
// which point it returns 'approved' with the payload (JWT + customer) and
// the session is deleted (single-use).

router.get('/magic-session/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9]{32}$/.test(id)) {
      res.status(400).json({ error: { message: 'Invalid session id', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await pollSession(id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
