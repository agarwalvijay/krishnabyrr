/**
 * Shipping label + packing slip PDF generation.
 *
 * Used by the admin order endpoints to replace hand-written parcel addresses.
 * Streams a generated PDF directly to the supplied Response. Caller is
 * responsible for auth — this function trusts its inputs.
 *
 * Layout: one A4 page per order. Address label on the top half (cut along the
 * dashed line and paste on the parcel), packing slip on the bottom half as the
 * packer's checklist.
 *
 * Inputs:
 *   - orderIds: array of UUIDs or order_numbers — one page each, in the order
 *               given. Passing several produces a single multi-page PDF so a
 *               day's dispatch can be printed in one go.
 *   - res:      express Response (PDF is piped, content-type/disposition set)
 *
 * Returns:
 *   - true  if the PDF was written
 *   - false if none of the ids matched an order (caller should set 404)
 *
 * Note: this is a self-printed address label, NOT a courier waybill. There is
 * no AWB or barcode because no courier API is integrated — the courier still
 * issues its own tracking sticker at pickup. Record that AWB against the order
 * via the courier_name / tracking_number fields on PATCH /admin/orders/:id.
 */

import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import pool from '../db/client';

interface LineItem {
  name:       string;
  sku:        string;
  quantity:   number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function streamShippingLabelPdf(orderIds: string[], res: Response): Promise<boolean> {
  if (orderIds.length === 0) return false;

  // Split into UUIDs vs order_numbers so a single query can serve both forms,
  // matching the id-or-number convention used by the invoice and admin routes.
  const uuids   = orderIds.filter((id) => UUID_RE.test(id));
  const numbers = orderIds.filter((id) => !UUID_RE.test(id));

  const { rows: orders } = await pool.query(
    `SELECT o.*,
            COALESCE(c.name, (o.shipping_address->>'name')) AS customer_name_db
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ANY($1::uuid[]) OR o.order_number = ANY($2::text[])`,
    [uuids, numbers]
  );
  if (orders.length === 0) return false;

  // Preserve the caller's ordering — ANY() returns rows in table order, but the
  // admin prints in the sequence shown on screen and expects the stack to match.
  const position = new Map<string, number>();
  orderIds.forEach((id, idx) => position.set(id.toLowerCase(), idx));
  orders.sort((a, b) => {
    const ai = position.get(String(a.id).toLowerCase())
            ?? position.get(String(a.order_number).toLowerCase()) ?? 0;
    const bi = position.get(String(b.id).toLowerCase())
            ?? position.get(String(b.order_number).toLowerCase()) ?? 0;
    return ai - bi;
  });

  // ── Load merchant info from settings ───────────────────────────────────────
  const { rows: settingRows } = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM settings
     WHERE key IN ('store_name','merchant_address','support_email','store_phone')`
  );
  const settings: Record<string, string> = {};
  for (const r of settingRows) {
    settings[r.key] = typeof r.value === 'string' ? r.value : String(r.value ?? '');
  }
  const merchantName    = settings.store_name       ?? "Krishna's Bliss";
  const merchantAddress = settings.merchant_address ?? '';
  const supportEmail    = settings.support_email    ?? '';
  const storePhone      = settings.store_phone      ?? '';

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const filename = orders.length === 1
    ? `label-${orders[0].order_number}.pdf`
    : `labels-${orders.length}-orders.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const TEAL  = '#1A6B6B';
  const MUTED = '#888888';
  const DARK  = '#1C1C1C';
  const LEFT  = 50;
  const RIGHT = 545;
  const WIDTH = RIGHT - LEFT;

  orders.forEach((order, idx) => {
    if (idx > 0) doc.addPage();
    drawLabelPage(doc, order, {
      merchantName, merchantAddress, supportEmail, storePhone,
      TEAL, MUTED, DARK, LEFT, RIGHT, WIDTH,
    });
  });

  doc.end();
  return true;
}

interface DrawOpts {
  merchantName:    string;
  merchantAddress: string;
  supportEmail:    string;
  storePhone:      string;
  TEAL:  string;
  MUTED: string;
  DARK:  string;
  LEFT:  number;
  RIGHT: number;
  WIDTH: number;
}

function drawLabelPage(
  doc:   PDFKit.PDFDocument,
  order: Record<string, any>,
  o:     DrawOpts,
): void {
  const { merchantName, merchantAddress, supportEmail, storePhone,
          TEAL, MUTED, DARK, LEFT, RIGHT, WIDTH } = o;

  const addr      = (order.shipping_address ?? {}) as Record<string, string>;
  const lineItems = (order.line_items ?? []) as LineItem[];
  const totalQty  = lineItems.reduce((sum, it) => sum + (it.quantity ?? 0), 0);

  // Prepaid vs COD matters to the courier and to whoever hands over the parcel,
  // so it goes on the label itself rather than only the slip.
  const isPaid      = order.payment_status === 'paid';
  const paymentNote = isPaid
    ? 'PREPAID — do not collect cash'
    : `PAYMENT: ${String(order.payment_status ?? '—').replace(/_/g, ' ').toUpperCase()}`;

  // ── Label block (top half) ─────────────────────────────────────────────────
  let y = 50;

  doc.fontSize(16).font('Helvetica-Bold').fillColor(TEAL).text(merchantName, LEFT, y);
  doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK)
    .text(order.order_number, LEFT, y, { width: WIDTH, align: 'right' });
  y += 26;

  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(1.5).stroke();
  y += 16;

  // FROM — deliberately small; the courier and the recipient both care about TO.
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('FROM', LEFT, y);
  y += 12;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(merchantName, LEFT, y, { width: WIDTH });
  y += 14;
  doc.fontSize(9).font('Helvetica').fillColor(MUTED);
  if (merchantAddress) {
    doc.text(merchantAddress, LEFT, y, { width: WIDTH });
    y = doc.y + 2;
  }
  const fromContact = [storePhone && `Phone: ${storePhone}`, supportEmail].filter(Boolean).join('   ');
  if (fromContact) { doc.text(fromContact, LEFT, y, { width: WIDTH }); y += 13; }

  y += 10;

  // TO — the part that actually replaces handwriting, so it is set large.
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('DELIVER TO', LEFT, y);
  y += 14;
  doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
    .text(addr.name || order.customer_name_db || '—', LEFT, y, { width: WIDTH });
  y = doc.y + 4;

  doc.fontSize(12).font('Helvetica').fillColor(DARK);
  const line1Full = [addr.line1, addr.line2].filter(Boolean).join(', ');
  if (line1Full) { doc.text(line1Full, LEFT, y, { width: WIDTH }); y = doc.y + 2; }
  doc.text(`${addr.city ?? ''}, ${addr.state ?? ''}`.replace(/^, |, $/, ''), LEFT, y, { width: WIDTH });
  y = doc.y + 2;

  // Pincode is what the courier sorts on — biggest element on the label.
  doc.fontSize(17).font('Helvetica-Bold').fillColor(DARK)
    .text(`PIN ${addr.pincode ?? '—'}`, LEFT, y, { width: WIDTH });
  y = doc.y + 4;

  doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK)
    .text(`Phone: ${addr.phone ?? order.guest_phone ?? '—'}`, LEFT, y, { width: WIDTH });
  y = doc.y + 12;

  doc.fontSize(10).font('Helvetica-Bold').fillColor(isPaid ? TEAL : '#B26500')
    .text(paymentNote, LEFT, y, { width: WIDTH });
  y += 14;
  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text(`${totalQty} item${totalQty === 1 ? '' : 's'}`, LEFT, y, { width: WIDTH });
  y += 20;

  // ── Cut line ───────────────────────────────────────────────────────────────
  doc.moveTo(LEFT, y).lineTo(RIGHT, y)
    .strokeColor('#BBBBBB').lineWidth(0.75).dash(4, { space: 3 }).stroke().undash();
  doc.fontSize(7).font('Helvetica').fillColor(MUTED)
    .text('cut here — paste the block above on the parcel', LEFT, y + 4, { width: WIDTH, align: 'center' });
  y += 26;

  // ── Packing slip (bottom half) ─────────────────────────────────────────────
  doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text('PACKING SLIP', LEFT, y);
  doc.fontSize(10).font('Helvetica').fillColor(MUTED)
    .text(`Order ${order.order_number}`, LEFT, y, { width: WIDTH, align: 'right' });
  y += 20;

  const COL_SKU  = LEFT;
  const COL_ITEM = LEFT + 110;
  const COL_QTY  = RIGHT - 40;
  const W_ITEM   = COL_QTY - COL_ITEM - 10;

  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('SKU',  COL_SKU,  y, { width: 100 });
  doc.text('ITEM', COL_ITEM, y, { width: W_ITEM });
  doc.text('QTY',  COL_QTY,  y, { width: 40, align: 'right' });
  y += 12;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
  y += 8;

  for (const item of lineItems) {
    // Page-break guard: long orders spill onto a continuation page rather than
    // silently running off the bottom.
    if (y > doc.page.height - 90) {
      doc.addPage();
      y = 50;
      doc.fontSize(9).font('Helvetica-Oblique').fillColor(MUTED)
        .text(`Packing slip continued — Order ${order.order_number}`, LEFT, y, { width: WIDTH });
      y += 20;
    }
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text(item.sku ?? '—', COL_SKU, y + 1, { width: 100 });
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(item.name, COL_ITEM, y, { width: W_ITEM });
    const rowBottom = doc.y;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK)
      .text(String(item.quantity), COL_QTY, y, { width: 40, align: 'right' });
    y = Math.max(rowBottom, y + 13) + 6;
  }

  y += 4;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
  y += 10;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
    .text(`Total: ${totalQty} item${totalQty === 1 ? '' : 's'}`, LEFT, y, { width: 200 });
  doc.fontSize(10).font('Helvetica').fillColor(MUTED);
  doc.text('Packed',  RIGHT - 190, y, { width: 52, align: 'right' });
  doc.rect(RIGHT - 132, y - 1, 10, 10).strokeColor('#999999').lineWidth(0.75).stroke();
  doc.text('Checked', RIGHT - 112, y, { width: 52, align: 'right' });
  doc.rect(RIGHT - 12,  y - 1, 10, 10).strokeColor('#999999').lineWidth(0.75).stroke();

  if (order.admin_notes) {
    y += 22;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('NOTES', LEFT, y);
    y += 11;
    doc.fontSize(9).font('Helvetica').fillColor(DARK).text(order.admin_notes, LEFT, y, { width: WIDTH });
  }
}
