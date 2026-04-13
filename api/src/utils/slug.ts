import pool from '../db/client';

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Returns a slug that is unique in the products table.
 * Appends -2, -3, ... if the base slug is already taken.
 * Pass excludeId to allow the product itself to keep its slug on update.
 */
export async function uniqueProductSlug(
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const sql = excludeId
      ? 'SELECT 1 FROM products WHERE slug = $1 AND id != $2'
      : 'SELECT 1 FROM products WHERE slug = $1';
    const params = excludeId ? [slug, excludeId] : [slug];
    const { rowCount } = await pool.query(sql, params);
    if (!rowCount) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

/** Same but for categories */
export async function uniqueCategorySlug(
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const sql = excludeId
      ? 'SELECT 1 FROM categories WHERE slug = $1 AND id != $2'
      : 'SELECT 1 FROM categories WHERE slug = $1';
    const params = excludeId ? [slug, excludeId] : [slug];
    const { rowCount } = await pool.query(sql, params);
    if (!rowCount) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

/** Same but for collections */
export async function uniqueCollectionSlug(
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const sql = excludeId
      ? 'SELECT 1 FROM collections WHERE slug = $1 AND id != $2'
      : 'SELECT 1 FROM collections WHERE slug = $1';
    const params = excludeId ? [slug, excludeId] : [slug];
    const { rowCount } = await pool.query(sql, params);
    if (!rowCount) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

/**
 * Auto-generates a SKU: KB-[3-letter name code]-[last 4 digits of timestamp]
 */
export function autoSku(name: string): string {
  const code = name
    .replace(/[^A-Za-z]/g, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  const ts = Date.now().toString().slice(-4);
  return `KB-${code}-${ts}`;
}
