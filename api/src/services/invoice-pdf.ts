/**
 * Tax invoice PDF generation.
 *
 * Used by both the admin order detail endpoint and the customer-facing invoice
 * download. Streams a generated PDF directly to the supplied Response. Caller is
 * responsible for auth — this function trusts its inputs.
 *
 * Inputs:
 *   - orderId: UUID or order_number
 *   - res:     express Response (PDF is piped, content-type/disposition set)
 *
 * Returns:
 *   - true  if the PDF was written
 *   - false if the order was not found (caller should set 404)
 *
 * GST handling: product prices are GST-inclusive. The invoice extracts the
 * taxable + GST portions from each line at its own gst_rate, aggregates by rate,
 * and splits into CGST+SGST (intra-state) or IGST (inter-state) based on the
 * merchant_state setting vs the shipping address state.
 */

import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import pool from '../db/client';
import { drawLogo } from './pdf-logo';

interface LineItem {
  name:           string;
  sku:            string;
  hsn_code:       string | null;
  quantity:       number;
  unit_price:     number;            // GST-inclusive
  line_total:     number;            // GST-inclusive
  taxable_amount?: number;           // pre-GST (post inclusive-pricing change)
  gst_amount?:    number;            // GST portion (post inclusive-pricing change)
  gst_rate:       number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function streamInvoicePdf(orderId: string, res: Response): Promise<boolean> {
  const isUUID = UUID_RE.test(orderId);

  const { rows: [order] } = await pool.query(
    `SELECT o.*,
            COALESCE(c.email, o.guest_email) AS customer_email,
            COALESCE(c.name, (o.shipping_address->>'name')) AS customer_name_db,
            c.phone AS customer_phone_db
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE ${isUUID ? 'o.id = $1' : 'o.order_number = $1'}`,
    [orderId]
  );
  if (!order) return false;

  const addr      = order.shipping_address as Record<string, string>;
  const lineItems = order.line_items as LineItem[];
  const orderDate = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Load merchant info from settings ───────────────────────────────────────
  const { rows: settingRows } = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM settings
     WHERE key IN ('store_name','merchant_state','merchant_gstin','merchant_address','support_email')`
  );
  const settings: Record<string, string> = {};
  for (const r of settingRows) {
    settings[r.key] = typeof r.value === 'string' ? r.value : String(r.value ?? '');
  }
  const merchantName    = settings.store_name       ?? "Krishna's Bliss";
  const merchantState   = settings.merchant_state   ?? '';
  const merchantGstin   = settings.merchant_gstin   ?? '';
  const merchantAddress = settings.merchant_address ?? '';
  const supportEmail    = settings.support_email    ?? '';

  // Intra-state vs inter-state determines CGST+SGST vs IGST
  const buyerState  = (addr.state ?? '').trim();
  const isIntraState = !!merchantState
    && buyerState.toLowerCase() === merchantState.toLowerCase();

  // Per-line tax breakdown (legacy fallback for orders missing taxable_amount)
  function lineTax(item: LineItem) {
    if (item.taxable_amount != null && item.gst_amount != null) {
      return { taxable: item.taxable_amount, gst: item.gst_amount };
    }
    const rate    = item.gst_rate || 0;
    const taxable = item.line_total / (1 + rate / 100);
    return { taxable, gst: item.line_total - taxable };
  }

  // Aggregate per GST rate
  const taxByRate = new Map<number, { taxable: number; gst: number }>();
  for (const item of lineItems) {
    const { taxable, gst } = lineTax(item);
    const bucket = taxByRate.get(item.gst_rate) ?? { taxable: 0, gst: 0 };
    bucket.taxable += taxable;
    bucket.gst     += gst;
    taxByRate.set(item.gst_rate, bucket);
  }

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
  doc.pipe(res);

  const TEAL   = '#1A6B6B';
  const MUTED  = '#888888';
  const DARK   = '#1C1C1C';
  const LEFT   = 50;
  const RIGHT  = 545;
  const WIDTH  = RIGHT - LEFT;
  const fmt    = (n: number | string) =>
    parseFloat(String(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Header. drawLogo returns 0 when the asset is missing, so the wordmark
  // slides back to the margin instead of leaving a hole.
  const logoW    = drawLogo(doc, LEFT, 44, 46);
  const headLeft = LEFT + logoW;
  doc.fontSize(22).font('Helvetica-Bold').fillColor(TEAL).text(merchantName, headLeft, 50);
  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text('Handcrafted with love in India', headLeft, 76);

  doc.fontSize(20).font('Helvetica-Bold').fillColor(DARK)
    .text('TAX INVOICE', RIGHT - 200, 50, { width: 200, align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor(MUTED)
    .text(`# ${order.order_number}`, RIGHT - 200, 76, { width: 200, align: 'right' })
    .text(orderDate,                  RIGHT - 200, 90, { width: 200, align: 'right' });

  doc.moveTo(LEFT, 110).lineTo(RIGHT, 110).strokeColor('#E5E5E5').lineWidth(1).stroke();

  // Seller (left) and Buyer (right)
  const COL2 = LEFT + WIDTH / 2 + 10;
  let y = 122;

  // Column widths for the two-block layout
  const HALF_W = WIDTH / 2 - 10;

  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('SELLER', LEFT, y);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(merchantName, LEFT, y + 13);
  doc.fontSize(9).font('Helvetica').fillColor(MUTED);
  let sy = y + 27;
  if (merchantAddress) {
    // Reserve actual rendered height — multi-line addresses no longer
    // collide with GSTIN below.
    const h = doc.heightOfString(merchantAddress, { width: HALF_W });
    doc.text(merchantAddress, LEFT, sy, { width: HALF_W });
    sy += h + 3;
  }
  if (merchantGstin)   { doc.text(`GSTIN: ${merchantGstin}`, LEFT, sy, { width: HALF_W }); sy += 13; }
  if (merchantState)   { doc.text(`State: ${merchantState}`, LEFT, sy, { width: HALF_W }); sy += 13; }
  if (supportEmail)    { doc.text(supportEmail,              LEFT, sy, { width: HALF_W }); sy += 13; }

  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('BILL / SHIP TO', COL2, y);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(addr.name, COL2, y + 13, { width: HALF_W });
  doc.fontSize(9).font('Helvetica').fillColor(MUTED);
  let by = y + 27;
  const line1Full = addr.line1 + (addr.line2 ? `, ${addr.line2}` : '');
  const line1H    = doc.heightOfString(line1Full, { width: HALF_W });
  doc.text(line1Full, COL2, by, { width: HALF_W });
  by += line1H + 1;
  doc.text(`${addr.city}, ${addr.state} - ${addr.pincode}`, COL2, by, { width: HALF_W }); by += 13;
  doc.text(`Phone: ${addr.phone}`, COL2, by, { width: HALF_W }); by += 13;
  if (order.billing_gstin) { doc.text(`GSTIN: ${order.billing_gstin}`, COL2, by, { width: HALF_W }); by += 13; }
  doc.text(`Place of Supply: ${buyerState || '-'}`, COL2, by, { width: HALF_W });
  by += 13;

  y = Math.max(sy, by) + 12;

  // Items table
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(1).stroke();
  y += 10;

  // Columns sized to fit exactly in WIDTH (495 pt). All right-aligned numeric
  // columns abut — text is short so the right-aligned content doesn't collide.
  // ITEM holds the product name (wraps) with SKU + HSN as a small subtitle.
  const COL_ITEM  = LEFT;            // width 220 — fits 2 lines of wrap comfortably
  const COL_QTY   = LEFT + 220;      // width 40
  const COL_PRICE = LEFT + 260;      // width 65
  const COL_TAX   = LEFT + 325;      // width 65
  const COL_GST   = LEFT + 390;      // width 50
  const COL_TOTAL = LEFT + 440;      // width 55 — ends at 495 (right margin = 495 above LEFT)
  const W = { item: 215, qty: 40, price: 65, tax: 65, gst: 50, total: 55 };

  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('ITEM',    COL_ITEM,  y, { width: W.item });
  doc.text('QTY',     COL_QTY,   y, { width: W.qty,   align: 'right' });
  doc.text('PRICE',   COL_PRICE, y, { width: W.price, align: 'right' });
  doc.text('TAXABLE', COL_TAX,   y, { width: W.tax,   align: 'right' });
  doc.text('GST',     COL_GST,   y, { width: W.gst,   align: 'right' });
  doc.text('TOTAL',   COL_TOTAL, y, { width: W.total, align: 'right' });
  y += 14;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
  y += 8;

  for (const item of lineItems) {
    const { taxable, gst } = lineTax(item);

    // Measure the actual rendered height of the product name so the SKU
    // subtitle doesn't overlap when the name wraps to 2+ lines.
    doc.fontSize(9).font('Helvetica').fillColor(DARK);
    const nameHeight = doc.heightOfString(item.name, { width: W.item });
    doc.text(item.name, COL_ITEM, y, { width: W.item });

    // SKU + HSN combined as a single subtitle (saves a column)
    const subtitle = item.hsn_code
      ? `${item.sku} · HSN ${item.hsn_code}`
      : item.sku;
    doc.fontSize(8).fillColor(MUTED)
       .text(subtitle, COL_ITEM, y + nameHeight + 1, { width: W.item });

    doc.fontSize(9).fillColor(DARK)
       .text(String(item.quantity), COL_QTY,   y, { width: W.qty,   align: 'right' })
       .text(fmt(item.unit_price),  COL_PRICE, y, { width: W.price, align: 'right' })
       .text(fmt(taxable),          COL_TAX,   y, { width: W.tax,   align: 'right' })
       .text(fmt(gst),              COL_GST,   y, { width: W.gst,   align: 'right' })
       .text(fmt(item.line_total),  COL_TOTAL, y, { width: W.total, align: 'right' });

    // Row height = name height + subtitle line + gap. Minimum keeps tight rows.
    y += Math.max(nameHeight + 14, 22);
  }

  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(1).stroke();
  y += 12;

  // Tax summary
  const totalsLeft   = RIGHT - 240;
  const taxableSubtotal = Array.from(taxByRate.values()).reduce((s, b) => s + b.taxable, 0);

  const sumRows: Array<[string, string, boolean?]> = [];
  sumRows.push(['Taxable value', `Rs. ${fmt(taxableSubtotal)}`]);

  const rates = Array.from(taxByRate.keys()).sort((a, b) => a - b);
  for (const rate of rates) {
    const { gst } = taxByRate.get(rate)!;
    if (isIntraState) {
      const half = gst / 2;
      sumRows.push([`CGST @ ${rate / 2}%`, `Rs. ${fmt(half)}`]);
      sumRows.push([`SGST @ ${rate / 2}%`, `Rs. ${fmt(half)}`]);
    } else {
      sumRows.push([`IGST @ ${rate}%`, `Rs. ${fmt(gst)}`]);
    }
  }

  if (parseFloat(order.discount_amount) > 0) {
    sumRows.push([
      `Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`,
      `-Rs. ${fmt(order.discount_amount)}`,
    ]);
  }
  sumRows.push([
    'Shipping',
    parseFloat(order.shipping_amount) === 0 ? 'Free' : `Rs. ${fmt(order.shipping_amount)}`,
  ]);
  sumRows.push(['Total', `Rs. ${fmt(order.total)}`, true]);

  for (const [label, value, bold] of sumRows) {
    if (bold) {
      y += 4;
      doc.moveTo(totalsLeft, y).lineTo(RIGHT, y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
      y += 8;
      doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(label, totalsLeft, y, { width: 120 });
      doc.fontSize(12).font('Helvetica-Bold').fillColor(TEAL).text(value, totalsLeft + 130, y, { width: 110, align: 'right' });
    } else {
      doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(label, totalsLeft, y, { width: 120 });
      doc.fontSize(9).fillColor(DARK).text(value, totalsLeft + 130, y, { width: 110, align: 'right' });
    }
    y += 16;
  }

  // Tax-supply note
  y += 12;
  const supplyNote = isIntraState
    ? `Intra-state supply (seller and buyer both in ${merchantState}). CGST + SGST applied.`
    : merchantState
    ? `Inter-state supply (seller in ${merchantState}, buyer in ${buyerState || '—'}). IGST applied.`
    : 'Place of supply: see Bill/Ship To. Set merchant_state in Settings to enable CGST/SGST/IGST split.';
  doc.fontSize(8).font('Helvetica').fillColor(MUTED).text(supplyNote, LEFT, y, { width: WIDTH });
  y += 16;

  if (!merchantGstin) {
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#B26500')
      .text('Note: merchant GSTIN not configured in Settings — this document is a bill of supply, not a tax invoice for input-credit purposes.',
        LEFT, y, { width: WIDTH });
    y += 16;
  }

  // Footer
  const pageBottom = doc.page.height - 60;
  doc.moveTo(LEFT, pageBottom - 10).lineTo(RIGHT, pageBottom - 10).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
  doc.fontSize(8).font('Helvetica').fillColor(MUTED)
    .text("Thank you for shopping with Krishna's Bliss!", LEFT, pageBottom, { align: 'center', width: WIDTH });

  doc.end();
  return true;
}
