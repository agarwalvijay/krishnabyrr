import express from 'express';
import cors from 'cors';
import path from 'path';

import healthRouter from './routes/health';
import productsRouter, {
  categoriesRouter,
  collectionsRouter,
  tagsRouter,
  searchRouter,
  badgesRouter,
} from './routes/products';
import settingsRouter from './routes/settings';
import homepageRouter from './routes/homepage';
import adminRouter from './routes/admin/index';
import cartRouter from './routes/cart';
import authRouter from './routes/auth';
import ordersRouter from './routes/orders';
import exchangesRouter from './routes/exchanges';
import accountRouter from './routes/account';
import pagesRouter from './routes/pages';
import paymentsRouter from './routes/payments';
import appLinksRouter from './routes/app-links';
import whatsappWebhookRouter from './routes/whatsapp-webhook';
import { errorHandler } from './middleware/error';

const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3002,http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

const app = express();

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve locally-uploaded product images (dev only — use object storage in production)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// ── Public routes ─────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/badges', badgesRouter);
app.use('/api/search', searchRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/homepage', homepageRouter);

// ── Customer auth routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Cart routes ───────────────────────────────────────────────────────────────
app.use('/api/cart', cartRouter);

// ── Order routes ──────────────────────────────────────────────────────────────
app.use('/api/orders', ordersRouter);

// ── Exchange routes ───────────────────────────────────────────────────────────
app.use('/api/exchanges', exchangesRouter);

// ── Account routes (wishlist, addresses, profile) ─────────────────────────────
app.use('/api/account', accountRouter);

// ── Pages (CMS static pages) ──────────────────────────────────────────────────
app.use('/api/pages', pagesRouter);

// ── App download links (public, CORS *) ───────────────────────────────────────
app.use('/api/app-links', appLinksRouter);

// ── Payment gateway callbacks (public — no auth, PhonePe etc) ────────────────
app.use('/api/payments', paymentsRouter);

// ── WhatsApp webhook (public — verified by token, not auth) ──────────────────
app.use('/api/whatsapp/webhook', whatsappWebhookRouter);

// ── Admin routes (all require auth via their own middleware) ──────────────────
app.use('/api/admin', adminRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
