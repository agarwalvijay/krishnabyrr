import { Router } from 'express';
import authRouter from './auth';
import adminProductsRouter from './products';
import adminCategoriesRouter from './categories';
import adminTagsRouter from './tags';
import adminCollectionsRouter from './collections';

const router = Router();

router.use('/auth', authRouter);
router.use('/products', adminProductsRouter);
router.use('/categories', adminCategoriesRouter);
router.use('/tags', adminTagsRouter);
router.use('/collections', adminCollectionsRouter);

export default router;
