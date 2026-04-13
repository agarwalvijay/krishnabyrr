import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

const JWT_SECRET = () => process.env.JWT_SECRET ?? 'change-me-in-production';
const JWT_EXPIRES = '8h';

// POST /api/admin/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(401).json({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const { rows: [user] } = await pool.query<{
      id: string; email: string; name: string; role: string;
      password_hash: string; is_active: boolean;
    }>(
      `SELECT id, email, name, role, password_hash, is_active
       FROM admin_users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    // Always perform bcrypt compare to prevent timing attacks,
    // even if user not found (compare against dummy hash)
    const DUMMY_HASH = '$2b$12$invalidhashfortimingprotection00000000000000000000000';
    const hashToCompare = user?.password_hash ?? DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !user.is_active || !passwordMatch) {
      // Never distinguish wrong email vs wrong password
      res.status(401).json({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    // Update last_login
    pool.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [user.id]).catch(() => {});

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/auth/logout  (stateless — client discards token)
router.post('/logout', (_req, res) => {
  res.json({ data: { message: 'Logged out' } });
});

// GET /api/admin/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ data: req.user });
});

export default router;
