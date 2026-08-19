/**
 * Shared logo helper for generated PDFs (tax invoice, shipping label).
 *
 * The logo ships alongside the API — api/package.json's build step copies
 * src/assets into dist/assets — so the same relative path resolves in dev
 * (src/) and prod (dist/). Same convention as utils/gemini-cleanup.ts.
 *
 * Deliberately fail-soft: a missing or unreadable asset must never turn a
 * customer's tax invoice or a dispatch label into a 500. drawLogo() returns
 * the horizontal space it actually consumed so callers can lay out the header
 * either way — 0 means "nothing drawn, close the gap".
 */

import fs from 'fs';
import path from 'path';

const LOGO_PATH = path.resolve(__dirname, '../assets/logo-krishnas-bliss.png');

// Resolved once per process: existsSync on every PDF is pointless syscall churn.
let logoAvailable: boolean | null = null;

function isAvailable(): boolean {
  if (logoAvailable === null) {
    try {
      logoAvailable = fs.existsSync(LOGO_PATH);
      if (!logoAvailable) console.warn(`[pdf] Logo not found at ${LOGO_PATH} — PDFs will render without it`);
    } catch {
      logoAvailable = false;
    }
  }
  return logoAvailable;
}

/**
 * Draws the logo at (x, y) fitted into a size x size box.
 * Returns the width consumed including the trailing gap, or 0 if not drawn.
 *
 * PDFKit registers an opened image once per document, so callers that draw the
 * same logo on many pages (bulk label batches) pay for the image data once.
 */
export function drawLogo(
  doc:  PDFKit.PDFDocument,
  x:    number,
  y:    number,
  size: number,
  gap = 10,
): number {
  if (!isAvailable()) return 0;
  try {
    // left/top are PDFKit defaults; the typings only expose the non-default values.
    doc.image(LOGO_PATH, x, y, { fit: [size, size] });
    return size + gap;
  } catch (err) {
    // Corrupt/unreadable file — degrade to a text-only header rather than fail.
    logoAvailable = false;
    console.warn('[pdf] Could not draw logo:', (err as Error).message);
    return 0;
  }
}
