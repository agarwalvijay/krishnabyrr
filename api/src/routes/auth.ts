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
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
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

    const { rows: [customer] } = await pool.query<{ id: string; email: string; name: string }>(
      `INSERT INTO customers (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [normalEmail, name.trim(), password_hash],
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

export default router;
