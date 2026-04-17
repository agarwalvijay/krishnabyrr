import { type Metadata } from 'next';
import PolicyPage from '@/app/components/PolicyPage';

export const metadata: Metadata = {
  title:       'Terms & Conditions',
  description: "Terms and conditions governing the use of Krishna's Bliss website and purchase of our products.",
};

export default function TermsPage() {
  return (
    <PolicyPage slug="terms" defaultTitle="Terms & Conditions">
      <p className="text-xs text-gray-400 mb-6">Last updated: April 2025</p>

      <h2>1. About Us</h2>
      <p>
        Krishna&apos;s Bliss (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is an online retailer of
        handcrafted Indian ethnic wear, including sarees, dupattas, kurta sets, and related accessories.
        We operate through the website krishnabyrr.com.
      </p>

      <h2>2. Acceptance of Terms</h2>
      <p>
        By accessing our website or placing an order, you agree to be bound by these Terms and Conditions and
        our Privacy Policy. If you do not agree, please do not use our website or services.
      </p>

      <h2>3. Products</h2>
      <p>
        We make every effort to display our products as accurately as possible. However, colours may vary slightly
        due to monitor settings and photographic lighting. Handcrafted products may exhibit minor natural variations —
        these are not defects but reflect the authentic nature of the craft.
      </p>
      <p>
        All product descriptions, dimensions, and weights are approximate. We reserve the right to modify
        product offerings without prior notice.
      </p>

      <h2>4. Orders and Pricing</h2>
      <p>
        All prices are listed in Indian Rupees (INR) and are inclusive of applicable GST unless stated otherwise.
        We reserve the right to change prices at any time. An order is confirmed only upon successful payment
        and our acknowledgment.
      </p>
      <p>
        We reserve the right to cancel any order due to pricing errors, stock unavailability, or suspected
        fraudulent activity, in which case a full refund will be issued to the original payment source.
      </p>

      <h2>5. Payment</h2>
      <p>
        We accept payments via Razorpay and PhonePe, which support UPI, debit/credit cards, and net banking.
        All payment transactions are encrypted and processed securely by our payment partners. We do not store
        any card or payment instrument details on our servers.
      </p>

      <h2>6. Exchanges and Refunds</h2>
      <p>
        Our standard policy offers exchanges only — no cash refunds — within the exchange window stated at the
        time of purchase. Please refer to our <a href="/pages/refund">Refund &amp; Exchange Policy</a> for full details.
      </p>
      <p>
        Refunds to the original payment source are issued only in cases where: (a) an order is cancelled by us
        before dispatch; (b) an item is lost in transit; or (c) a significantly wrong item is delivered.
      </p>

      <h2>7. Shipping</h2>
      <p>
        We ship within India only. Delivery timelines are estimates and may vary. Please see our{' '}
        <a href="/pages/shipping">Shipping Policy</a> for full details.
      </p>

      <h2>8. Intellectual Property</h2>
      <p>
        All content on this website — including images, text, logos, and designs — is the property of
        Krishna&apos;s Bliss and may not be reproduced, distributed, or used without our express written permission.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Krishna&apos;s Bliss shall not be liable for any indirect,
        incidental, or consequential damages arising from your use of our website or products.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive
        jurisdiction of the courts of Delhi, India.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        For any questions regarding these Terms, please contact us at{' '}
        <strong>care@krishnabyrr.com</strong> or call <strong>+91 80766 64500</strong>.
      </p>
    </PolicyPage>
  );
}
