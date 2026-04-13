import request from 'supertest';
import { Pool } from 'pg';
import { createTestPool } from '../db/client';
import app from '../app';

let db: Pool;

beforeAll(async () => {
  db = createTestPool();
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query(`DELETE FROM customers WHERE email LIKE '%@authtest.com'`);
});

// ── POST /api/auth/register ────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('creates a new customer and returns token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email:    'alice@authtest.com',
      password: 'Password123',
      name:     'Alice',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.customer.email).toBe('alice@authtest.com');
    expect(res.body.data.customer.name).toBe('Alice');
    expect(res.body.data.customer.password_hash).toBeUndefined();
  });

  it('returns 400 if email is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({
      password: 'Password123',
      name:     'Alice',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 if password is too short', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email:    'short@authtest.com',
      password: '1234567',
      name:     'Short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 if email format is invalid', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email:    'notanemail',
      password: 'Password123',
      name:     'Bad',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 if email is already taken', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dup@authtest.com', password: 'Password123', name: 'Dup',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@authtest.com', password: 'Password123', name: 'Dup2',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      email: 'login@authtest.com', password: 'Correct123', name: 'Login User',
    });
  });

  it('returns token on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@authtest.com', password: 'Correct123',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.customer.email).toBe('login@authtest.com');
  });

  it('is case-insensitive for email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'LOGIN@AUTHTEST.COM', password: 'Correct123',
    });
    expect(res.status).toBe(200);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@authtest.com', password: 'WrongPassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@authtest.com', password: 'Password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns customer data with valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'me@authtest.com', password: 'Password123', name: 'Me User',
    });
    const token = reg.body.data.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@authtest.com');
    expect(res.body.data.name).toBe('Me User');
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer notavalidtoken');
    expect(res.status).toBe(401);
  });
});
