import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;
const ADMIN_PASSWORD = 'KBAdmin2026!';

export async function runSeed(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ----------------------------------------------------------------
    // 1. Admin users
    // ----------------------------------------------------------------
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

    await client.query(`
      INSERT INTO admin_users (email, name, role, password_hash)
      VALUES
        ('super@krishnabyrr.com',   'Super Admin',     'super_admin',      $1),
        ('catalog@krishnabyrr.com', 'Catalog Manager', 'catalog_manager',  $1),
        ('orders@krishnabyrr.com',  'Order Manager',   'order_manager',    $1)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // ----------------------------------------------------------------
    // 2. Categories — parents first, then children
    // ----------------------------------------------------------------
    const { rows: parentRows } = await client.query(`
      INSERT INTO categories (name, slug, nav_order)
      VALUES
        ('Silks',     'silks',     1),
        ('Handlooms', 'handlooms', 2),
        ('Casuals',   'casuals',   3),
        ('Festive',   'festive',   4)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, slug
    `);

    const catBySlug: Record<string, string> = {};
    for (const row of parentRows) {
      catBySlug[row.slug] = row.id;
    }

    await client.query(`
      INSERT INTO categories (name, slug, parent_id, nav_order)
      VALUES
        ('Maheshwari Silk', 'maheshwari-silk', $1, 1),
        ('Banarasi',        'banarasi',        $1, 2),
        ('Chanderi',        'chanderi',        $2, 1),
        ('Mulmul',          'mulmul',          $3, 1),
        ('Georgette',       'georgette',       $3, 2),
        ('Brocade',         'brocade',         $4, 1)
      ON CONFLICT (slug) DO NOTHING
    `, [
      catBySlug['silks'],
      catBySlug['handlooms'],
      catBySlug['casuals'],
      catBySlug['festive'],
    ]);

    // ----------------------------------------------------------------
    // 3. Tags
    // ----------------------------------------------------------------
    await client.query(`
      INSERT INTO tags (group_name, value)
      VALUES
        ('fabric',   'Maheshwari Silk'),
        ('fabric',   'Banarasi'),
        ('weave',    'Hand-Block Print'),
        ('weave',    'Jamdani'),
        ('occasion', 'Wedding'),
        ('occasion', 'Everyday'),
        ('color',    'Ivory'),
        ('color',    'Teal')
      ON CONFLICT (group_name, value) DO NOTHING
    `);

    // ----------------------------------------------------------------
    // 4. Products (3, in draft status)
    // ----------------------------------------------------------------
    await client.query(`
      INSERT INTO products (name, slug, sku, short_desc, description, care_instr,
                            mrp, sale_price, cost_price, gst_rate, hsn_code,
                            stock_qty, low_stock_threshold, status)
      VALUES
        (
          'Maheshwari Silk Unstitched Suit Set — Ivory Bel Buti',
          'maheshwari-silk-ivory-bel-buti',
          'KB-MS-001',
          'Handwoven Maheshwari silk with traditional bel buti weave. Includes kurta fabric, salwar fabric, and dupatta.',
          'Authentic Maheshwari silk sourced from master weavers of Maheshwar, Madhya Pradesh. The bel buti motif is a timeless pattern symbolising nature and prosperity. Comes as a 3-piece unstitched set: 2.5m kurta fabric, 2m salwar fabric, 2.5m dupatta.',
          'Dry clean only. Store in a muslin bag away from direct sunlight.',
          7500.00, 6750.00, 3200.00, 5.00, '5007',
          3, 2, 'draft'
        ),
        (
          'Banarasi Katan Silk Unstitched Saree Fabric — Deep Teal Zari',
          'banarasi-katan-teal-zari',
          'KB-BN-001',
          'Pure katan silk Banarasi fabric with intricate gold zari weave in deep teal. 6.5 metres, blouse piece included.',
          'Woven on traditional handlooms by Banarasi artisans in Varanasi. Pure katan silk base with real gold zari creates a fabric that catches light beautifully. Includes 6.5m saree fabric and 0.8m matching blouse piece. Perfect for weddings and festive occasions.',
          'Dry clean recommended. Wrap in white muslin to prevent zari tarnish.',
          17500.00, 15999.00, 7800.00, 12.00, '5007',
          2, 2, 'draft'
        ),
        (
          'Chanderi Silk-Cotton Unstitched Suit Set — Blush Rose Jaal',
          'chanderi-silk-cotton-blush-jaal',
          'KB-CH-001',
          'Lightweight Chanderi silk-cotton blend with delicate jaal (net) weave in blush rose. Ideal for festive casuals.',
          'Chanderi fabric from the looms of Chanderi, Madhya Pradesh. The silk-cotton blend makes it suitable for year-round wear — light enough for summer evenings, structured enough for festive occasions. Jaal pattern is woven with fine silk threads on a cotton warp. Set includes 2.5m kurta, 2m salwar, 2.25m dupatta.',
          'Hand wash separately in cold water. Do not wring. Dry in shade.',
          3200.00, 2850.00, 1400.00, 5.00, '5209',
          4, 2, 'draft'
        )
      ON CONFLICT (slug) DO NOTHING
    `);

    // ----------------------------------------------------------------
    // 5. Coupons
    // ----------------------------------------------------------------
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    await client.query(`
      INSERT INTO coupons (code, description, type, value, max_uses_per_customer,
                           customer_eligibility, is_public, is_active)
      VALUES (
        'WELCOME20',
        '20% off your first order. No expiry. One use per customer.',
        'percentage',
        20.00,
        1,
        'NEW_ONLY',
        TRUE,
        TRUE
      )
      ON CONFLICT (code) DO NOTHING
    `);

    await client.query(`
      INSERT INTO coupons (code, description, type, valid_until,
                           max_uses_per_customer, is_public, is_active)
      VALUES (
        'FREESHIP',
        'Free shipping on any order. Valid for 30 days.',
        'free_shipping',
        $1,
        1,
        TRUE,
        TRUE
      )
      ON CONFLICT (code) DO NOTHING
    `, [thirtyDaysLater.toISOString()]);

    // ----------------------------------------------------------------
    // 6. Default settings
    // ----------------------------------------------------------------
    const settings: Array<[string, unknown]> = [
      ['exchange_window_days',  7],
      ['exchange_active',       true],
      ['zone_a_rate',           80],
      ['zone_a_free_above',     999],
      ['zone_b_rate',           120],
      ['zone_b_free_above',     1499],
      ['store_name',            'KrishnaByrr'],
      ['whatsapp_number',       ''],
      ['support_email',         ''],
    ];

    for (const [key, value] of settings) {
      await client.query(`
        INSERT INTO settings (key, value)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [key, JSON.stringify(value)]);
    }

    // ----------------------------------------------------------------
    // 7. Default CMS pages
    // ----------------------------------------------------------------
    await client.query(`
      INSERT INTO pages (slug, title, content)
      VALUES (
        'exchanges',
        'Exchange Policy',
        '<h2>Our Exchange Policy</h2>
<p>We believe you deserve to love what you wear. That is why KrishnaByrr offers hassle-free exchanges within the policy window from your delivery date.</p>
<h3>How It Works</h3>
<ol>
  <li>Log in to your account and visit your order page.</li>
  <li>Click "Request Exchange" and select the items you would like to exchange.</li>
  <li>We will contact you within 24 hours to arrange pickup and dispatch.</li>
</ol>
<h3>Conditions</h3>
<ul>
  <li>Items must be unused, unwashed, and in original packaging with all tags intact.</li>
  <li>Exchanges are for the same or higher value item only.</li>
  <li>Sale items may not be eligible for exchange — check your order details.</li>
</ul>
<h3>Questions?</h3>
<p>WhatsApp us and we will be happy to help. We aim to respond within 2 hours on business days.</p>'
      )
      ON CONFLICT (slug) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run directly: ts-node src/db/seed.ts
if (require.main === module) {
  const { pool: defaultPool } = require('./client');
  runSeed(defaultPool)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
