import { Router } from 'express';
import pool from '../db/client';

const router = Router();

// GET /api/pages/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const { rows: [page] } = await pool.query<{
      slug: string; title: string; content: string | null;
      meta_title: string | null; meta_desc: string | null;
    }>(
      'SELECT slug, title, content, meta_title, meta_desc FROM pages WHERE slug = $1',
      [slug],
    );

    if (!page) {
      res.status(404).json({ error: { message: 'Page not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json({ data: page });
  } catch (err) {
    next(err);
  }
});

export default router;
