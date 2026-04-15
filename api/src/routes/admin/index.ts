import { Router } from 'express';
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

const router = Router();

router.use('/auth', authRouter);
router.use('/products', adminProductsRouter);
router.use('/categories', adminCategoriesRouter);
router.use('/tags', adminTagsRouter);
router.use('/tag-groups', adminTagGroupsRouter);
router.use('/collections', adminCollectionsRouter);
router.use('/orders', adminOrdersRouter);
router.use('/coupons', adminCouponsRouter);
router.use('/settings', adminSettingsRouter);
router.use('/homepage', adminHomepageRouter);

export default router;
