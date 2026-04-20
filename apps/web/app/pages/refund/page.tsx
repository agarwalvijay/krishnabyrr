import { type Metadata } from 'next';
import PolicyPage from '@/app/components/PolicyPage';

export const metadata: Metadata = {
  title:       'Refund & Exchange Policy',
  description: "Krishna's Bliss refund and exchange policy for Indian ethnic wear purchases.",
};

export default function RefundPage() {
  return (
    <PolicyPage slug="refund" defaultTitle="Refund & Exchange Policy">
      <p className="text-xs text-gray-400 mb-6">Last updated: April 2025</p>

      <p>
        At Krishna&apos;s Bliss, we want you to love what you receive. Please read this policy carefully
        before placing an order.
      </p>

      <h2>Our Exchange-First Policy</h2>
      <p>
        Because our products are handcrafted ethnic wear, we offer <strong>exchanges only</strong> — we
        do not provide cash or online refunds for change of mind or sizing issues. We believe this allows us
        to source the finest fabrics while keeping our prices fair.
      </p>

      <h2>Exchange Eligibility</h2>
      <p>You may request an exchange within <strong>7 days of delivery</strong> if:</p>
      <ul>
        <li>The item has a manufacturing defect or fabric flaw</li>
        <li>You received the wrong item (different from what was ordered)</li>
        <li>The size is significantly different from the size chart (not a fit preference)</li>
      </ul>
      <p>Items are <strong>not eligible</strong> for exchange if they are:</p>
      <ul>
        <li>Worn, washed, or altered</li>
        <li>Returned without original tags and packaging</li>
        <li>Damaged due to customer handling</li>
        <li>Returned after the exchange window has closed</li>
      </ul>

      <h2>How to Request an Exchange</h2>
      <ol>
        <li>Log in to your account and go to <strong>My Orders</strong>.</li>
        <li>Select the order and click <strong>Request Exchange</strong>.</li>
        <li>Describe the issue and upload photos if applicable.</li>
        <li>Our team will contact you within <strong>24–48 hours</strong> to confirm and arrange pickup.</li>
        <li>Once we receive and inspect the returned item, we will dispatch the replacement within 5–7 working days.</li>
      </ol>

      <h2>When Refunds Are Issued</h2>
      <p>
        We issue a refund to your original payment source — not store credit — in the following circumstances:
      </p>
      <ul>
        <li>Your order is cancelled by us before dispatch (e.g., the item is out of stock)</li>
        <li>Your item is lost or significantly delayed in transit with no resolution</li>
        <li>A replacement is not available for an exchange-eligible item</li>
      </ul>
      <p>
        Refunds are processed within <strong>5–7 business days</strong> of approval. Depending on your bank
        or payment provider, the credit may take an additional 3–5 business days to appear.
      </p>

      <h2>Cancellations</h2>
      <p>
        Orders may be cancelled within <strong>24 hours of placement</strong> for a full refund to the
        original payment source. After dispatch, orders cannot be cancelled.
      </p>

      <h2>Contact Us</h2>
      <p>
        For exchange or refund queries, WhatsApp us at <strong>+91 80766 64500</strong>.
      </p>
    </PolicyPage>
  );
}
