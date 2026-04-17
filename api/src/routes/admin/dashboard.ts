import { Router } from 'express';
import pool from '../../db/client';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// GET /api/admin/dashboard
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const [revenue, orders, products, customers, recentOrders] = await Promise.all([
      // Revenue: today / this month / all-time (paid orders only)
      pool.query<{
        today: string; this_month: string; all_time: string;
        today_count: number; month_count: number;
      }>(`
        SELECT
          COALESCE(SUM(total) FILTER (WHERE created_at >= CURRENT_DATE),                    0)::numeric AS today,
          COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('month', NOW())),       0)::numeric AS this_month,
          COALESCE(SUM(total),                                                               0)::numeric AS all_time,
          COUNT(*)  FILTER (WHERE created_at >= CURRENT_DATE)::int                            AS today_count,
          COUNT(*)  FILTER (WHERE created_at >= date_trunc('month', NOW()))::int              AS month_count
        FROM orders
        WHERE payment_status = 'paid'
      `),

      // Order counts by status
      pool.query<{
        total: number; pending: number; fulfilled: number; cancelled: number;
      }>(`
        SELECT
          COUNT(*)::int                                                             AS total,
          COUNT(*) FILTER (WHERE fulfillment_status = 'unfulfilled'
                             AND  payment_status    = 'paid')::int                 AS pending,
          COUNT(*) FILTER (WHERE fulfillment_status = 'fulfilled')::int            AS fulfilled,
          COUNT(*) FILTER (WHERE fulfillment_status = 'cancelled')::int            AS cancelled
        FROM orders
      `),

      // Product health
      pool.query<{
        active: number; low_stock: number; out_of_stock: number; draft: number;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')::int                                        AS active,
          COUNT(*) FILTER (WHERE status = 'active'
                             AND  stock_qty > 0
                             AND  stock_qty <= low_stock_threshold)::int                        AS low_stock,
          COUNT(*) FILTER (WHERE status = 'active' AND stock_qty = 0)::int                     AS out_of_stock,
          COUNT(*) FILTER (WHERE status = 'draft')::int                                         AS draft
        FROM products
      `),

      // Customer stats
      pool.query<{ total: number; new_this_month: number }>(`
        SELECT
          COUNT(*)::int                                                                   AS total,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int          AS new_this_month
        FROM customers
      `),

      // Recent orders
      pool.query(`
        SELECT
          id, order_number, created_at, total,
          payment_status, fulfillment_status,
          COALESCE(
            (SELECT name FROM customers WHERE id = o.customer_id),
            shipping_address->>'name'
          ) AS customer_name
        FROM orders o
        ORDER BY created_at DESC
        LIMIT 10
      `),
    ]);

    res.json({
      data: {
        revenue:       revenue.rows[0],
        orders:        orders.rows[0],
        products:      products.rows[0],
        customers:     customers.rows[0],
        recent_orders: recentOrders.rows,
      },
    });
  } catch (err) { next(err); }
});

export default router;
