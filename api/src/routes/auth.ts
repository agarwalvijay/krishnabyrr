import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/client';
import { requireCustomerAuth } from '../middleware/auth';
import { createOtp, verifyOtp } from '../services/otp';
import { sendOtp, sendPasswordChanged } from '../services/whatsapp';

const router = Router();

const JWT_SECRET  = () => process.env.JWT_SECRET ?? 'change-me-in-production';
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

    // Auto-link any guest orders placed with this email before registration
    if (normalEmail) {
      await pool.query(
        `UPDATE orders SET customer_id = $1, updated_at = NOW()
         WHERE LOWER(guest_email) = $2 AND customer_id IS NULL`,
        [customer.id, normalEmail],
      );
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    // Send phone verification OTP (fire-and-forget)
    if (normalPhone) {
      createOtp(normalPhone)
        .then(otp => sendOtp(normalPhone, otp))
        .catch(() => {}); // never block registration on OTP failure
    }

    res.status(201).json({ data: { token, customer } });
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
      id: string; email: string | null; name: string; phone: string | null; password_hash: string | null;
    }>(
      byEmail
        ? 'SELECT id, email, name, phone, password_hash FROM customers WHERE email = $1'
        : 'SELECT id, email, name, phone, password_hash FROM customers WHERE phone = $1',
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
    const { rows: [customer] } = await pool.query<{
      id: string; email: string | null; name: string; phone: string | null;
      phone_verified: boolean; total_orders: number; lifetime_value: string; created_at: Date;
    }>(
      `SELECT id, email, name, phone, phone_verified, total_orders, lifetime_value::text, created_at
       FROM customers WHERE id = $1`,
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

    const { rows: [order] } = await pool.query<{ id: string }>(
      `SELECT id FROM orders
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

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
// Sends (or resends) a verification OTP to the customer's phone.
// Requires auth so we always know the phone from the DB.

router.post('/send-otp', requireCustomerAuth, async (req, res, next) => {
  try {
    const phone = req.customer!.phone;
    if (!phone) {
      res.status(400).json({ error: { message: 'No phone number on this account', code: 'NO_PHONE' } });
      return;
    }

    // Check already verified
    const { rows: [c] } = await pool.query<{ phone_verified: boolean }>(
      'SELECT phone_verified FROM customers WHERE id = $1',
      [req.customer!.id],
    );
    if (c?.phone_verified) {
      res.status(409).json({ error: { message: 'Phone already verified', code: 'ALREADY_VERIFIED' } });
      return;
    }

    try {
      const otp = await createOtp(phone);
      sendOtp(phone, otp);
    } catch (err) {
      if ((err as Error).message === 'RATE_LIMITED') {
        res.status(429).json({ error: { message: 'Too many requests. Please wait before requesting another code.', code: 'RATE_LIMITED' } });
        return;
      }
      throw err;
    }

    res.json({ data: { message: 'OTP sent' } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────

router.post('/verify-otp', requireCustomerAuth, async (req, res, next) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) {
      res.status(400).json({ error: { message: 'code is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const phone = req.customer!.phone;
    if (!phone) {
      res.status(400).json({ error: { message: 'No phone number on this account', code: 'NO_PHONE' } });
      return;
    }

    try {
      await verifyOtp(phone, code);
    } catch (err) {
      const code_ = (err as Error).message;
      const messages: Record<string, string> = {
        INVALID:      'Invalid verification code',
        EXPIRED:      'Code has expired. Please request a new one.',
        ALREADY_USED: 'Code has already been used. Please request a new one.',
      };
      res.status(422).json({ error: { message: messages[code_] ?? 'Verification failed', code: code_ } });
      return;
    }

    await pool.query(
      'UPDATE customers SET phone_verified = true, updated_at = NOW() WHERE id = $1',
      [req.customer!.id],
    );

    res.json({ data: { message: 'Phone verified successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
