#!/usr/bin/env node
//
// generate-image-tiles.mjs
//
// Backfills the `-tile.webp` variant for product images uploaded before the
// two-variant pipeline existed.
//
// The storefront requests `<uuid>-tile.webp` for grid cards and thumbnails.
// Without a tile on disk nginx returns 404 and the card renders broken, so
// this must run once after deploying the two-variant upload path.
//
// Idempotent: images that already have a tile are skipped, so it is safe to
// re-run (and worth re-running after a bulk import).
//
// Usage, on the VM:
//   cd ~/krishnabyrr && node scripts/generate-image-tiles.mjs
//   node scripts/generate-image-tiles.mjs --dry-run
//
// Reads DATABASE_URL from api/.env.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');

// Must match api/src/routes/admin/products.ts
const TILE_W = 600;
const TILE_H = 800;
const WEBP_QUALITY = 80;

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(__dirname, '../api/.env');
  if (!fs.existsSync(envPath)) {
    console.error(`No DATABASE_URL in env and no ${envPath}`);
    process.exit(1);
  }
  const line = fs.readFileSync(envPath, 'utf8')
    .split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) { console.error('DATABASE_URL not found in api/.env'); process.exit(1); }
  return line.slice('DATABASE_URL='.length).trim();
}

const tilePathFor = (p) => p.replace(/\.webp$/, '-tile.webp');

const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

const { rows } = await pool.query('SELECT id, gcs_path FROM product_images ORDER BY created_at');
console.log(`${rows.length} product images in the database${DRY ? '  (dry run)' : ''}\n`);

let made = 0, skipped = 0, missing = 0, failed = 0, bytes = 0;

for (const row of rows) {
  const full = row.gcs_path;
  // Legacy non-WebP uploads have no tile convention; the storefront falls back
  // to the full file for those, so there is nothing to generate.
  if (!full || !full.endsWith('.webp')) { skipped++; continue; }

  const tile = tilePathFor(full);
  if (!fs.existsSync(full)) {
    console.warn(`  MISSING source: ${path.basename(full)}`);
    missing++;
    continue;
  }
  if (fs.existsSync(tile)) { skipped++; continue; }

  if (DRY) { console.log(`  would create ${path.basename(tile)}`); made++; continue; }

  try {
    await sharp(full)
      .resize({ width: TILE_W, height: TILE_H, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toFile(tile);
    const size = fs.statSync(tile).size;
    bytes += size;
    made++;
    console.log(`  ${path.basename(tile)}  ${(size / 1024).toFixed(0)}KB`);
  } catch (err) {
    console.error(`  FAILED ${path.basename(full)}: ${err.message}`);
    failed++;
  }
}

console.log(`\ncreated ${made}, skipped ${skipped}, source missing ${missing}, failed ${failed}`);
if (made && !DRY) console.log(`tiles total ${(bytes / 1024 / 1024).toFixed(1)}MB, average ${(bytes / made / 1024).toFixed(0)}KB`);
if (missing) console.log('Sources missing on disk are rows whose file was deleted out of band — safe to ignore, or clean up those rows.');

await pool.end();
