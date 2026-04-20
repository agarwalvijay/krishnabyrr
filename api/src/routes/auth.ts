import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/client';
import { requireCustomerAuth } from '../middleware/auth';

const router = Router();

const JWT_SECRET  = () => process.env.JWT_SECRET ?? 'change-me-in-production';
const JWT_EXPIRES = '30d';
const BCRYPT_ROUNDS = 12;

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, phone } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      phone?: string;
    };

    if (!email || !password || !name) {
      res.status(400).json({
        error: { message: 'email, password, and name are required', code: 'VALIDATION_ERROR' },
      });
      return;
    }

    const normalEmail = email.toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail)) {
      res.status(400).json({ error: { message: 'Invalid email address', code: 'VALIDATION_ERROR' } });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' },
      });
      return;
    }

    // Check for duplicate email
    const existing = await pool.query('SELECT id FROM customers WHERE email = $1', [normalEmail]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ error: { message: 'Email already registered', code: 'EMAIL_TAKEN' } });
      return;
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const cleanPhone = phone?.replace(/\D/g, '').slice(-10) || null;

    const { rows: [customer] } = await pool.query<{ id: string; email: string; name: string; phone: string | null }>(
      `INSERT INTO customers (email, name, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, phone`,
      [normalEmail, name.trim(), password_hash, cleanPhone],
    );

    const token = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    res.status(201).json({ data: { token, customer } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(401).json({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const normalEmail = email.toLowerCase().trim();

    const { rows: [customer] } = await pool.query<{
      id: string; email: string; name: string; password_hash: string | null;
    }>(
      'SELECT id, email, name, password_hash FROM customers WHERE email = $1',
      [normalEmail],
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
      { id: customer.id, email: customer.email, name: customer.name, sub: 'customer' },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES },
    );

    res.json({ data: { token, customer: { id: customer.id, email: customer.email, name: customer.name } } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', requireCustomerAuth, async (req, res, next) => {
  try {
    const { rows: [customer] } = await pool.query<{
      id: string; email: string; name: string; phone: string | null;
      total_orders: number; lifetime_value: string; created_at: Date;
    }>(
      `SELECT id, email, name, phone, total_orders, lifetime_value::text, created_at
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
// Called from registration page: links a guest order to the newly-created customer.
// Only links if order.guest_email === email AND order.customer_id IS NULL.

router.post('/link-order', async (req, res, next) => {
  try {
    const { orderNumber, email } = req.body as { orderNumber?: string; email?: string };

    if (!orderNumber || !email) {
      res.status(400).json({ error: { message: 'orderNumber and email are required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const normalEmail = email.toLowerCase().trim();

    // Find the customer who just registered with this email
    const { rows: [customer] } = await pool.query<{ id: string }>(
      'SELECT id FROM customers WHERE email = $1',
      [normalEmail],
    );

    if (!customer) {
      res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
      return;
    }

    // Only link if the order is unlinked and guest_email matches
    const { rows: [order] } = await pool.query<{ id: string }>(
      `SELECT id FROM orders
       WHERE order_number = $1
         AND customer_id IS NULL
         AND LOWER(guest_email) = $2`,
      [orderNumber.toUpperCase(), normalEmail],
    );

    if (!order) {
      // Silent success — order may already be linked or not belong to this email
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

    res.json({ data: { message: 'Password updated successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
