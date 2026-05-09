import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import authRouter from './auth';
import adminProductsRouter from './products';
import adminCategoriesRouter from './categories';
import adminTagsRouter from './tags';
import adminTagGroupsRouter from './tag-groups';
import adminCollectionsRouter from './collections';
import adminOrdersRouter from './orders';
import adminCouponsRouter from './coupons';
import adminSettingsRouter from './settings';
import adminHomepageRouter from './homepage';
import adminRevalidateRouter from './revalidate';
import adminCustomersRouter from './customers';
import adminDashboardRouter from './dashboard';
import adminBadgesRouter from './badges';
import adminWhatsappRouter from './whatsapp';

const router = Router();

// Auth endpoints (login etc) are public — they have their own checks.
router.use('/auth', authRouter);

// Catalog domain — managed by catalog_manager (and super_admin via passthrough)
router.use('/products',    requireAuth, requireRole('catalog_manager'), adminProductsRouter);
router.use('/categories',  requireAuth, requireRole('catalog_manager'), adminCategoriesRouter);
router.use('/tags',        requireAuth, requireRole('catalog_manager'), adminTagsRouter);
router.use('/tag-groups',  requireAuth, requireRole('catalog_manager'), adminTagGroupsRouter);
router.use('/collections', requireAuth, requireRole('catalog_manager'), adminCollectionsRouter);
router.use('/badges',      requireAuth, requireRole('catalog_manager'), adminBadgesRouter);
router.use('/homepage',    requireAuth, requireRole('catalog_manager'), adminHomepageRouter);

// Order domain — managed by order_manager (and super_admin via passthrough)
router.use('/orders',    requireAuth, requireRole('order_manager'), adminOrdersRouter);
router.use('/customers', requireAuth, requireRole('order_manager'), adminCustomersRouter);
router.use('/coupons',   requireAuth, requireRole('order_manager'), adminCouponsRouter);

// Cross-cutting endpoints — read-only or shared utilities
router.use('/dashboard',        requireAuth, adminDashboardRouter);
router.use('/revalidate-cache', requireAuth, adminRevalidateRouter);

// Site settings + WhatsApp token — only super_admin (no role passes the empty allow-list)
router.use('/settings', requireAuth, requireRole(), adminSettingsRouter);
router.use('/whatsapp', requireAuth, requireRole(), adminWhatsappRouter);

export default router;
