// Single source of truth for Exchange Policy copy. Rendered by both the
// dedicated /pages/exchanges page and the in-product ExchangePolicyModal,
// so the two surfaces never drift apart. Edit only here.

const PHONE         = '8076664500';
const PHONE_DISPLAY = '+91 80766 64500';
const WA_URL        = `https://wa.me/91${PHONE}`;

export default function ExchangePolicyContent() {
  return (
    <>
      <p className="text-kb-muted text-xs uppercase tracking-widest font-medium">
        Last updated January 2025
      </p>

      <p>
        At Krishna&apos;s Bliss, every piece is handcrafted with care. We want
        you to love what you receive, and we offer exchanges to make sure you do.
      </p>

      <div>
        <h3 className="font-semibold text-kb-charcoal mb-1">What we accept for exchange</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Items exchanged within <strong>7 days</strong> of delivery.</li>
          <li>Products must be unworn, unwashed, and in original condition with all tags attached.</li>
          <li>Exchange is for a different size or colour of the same product, or store credit.</li>
        </ul>
      </div>

      <div>
        <h3 className="font-semibold text-kb-charcoal mb-1">What we do not accept</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Items that have been worn, washed, or altered.</li>
          <li>Products purchased during a sale or with a discount coupon.</li>
          <li>Custom or made-to-order pieces.</li>
          <li>Items without original packaging or tags.</li>
        </ul>
      </div>

      <div>
        <h3 className="font-semibold text-kb-charcoal mb-1">How to initiate an exchange</h3>
        <p>You can start an exchange in either of two ways, within 7 days of delivery:</p>
        <ul className="list-disc pl-4 space-y-1 mt-1">
          <li>
            <strong>From your account:</strong> go to{' '}
            <strong>My Account → Orders → Request Exchange</strong> on the order you
            want to exchange. Add a short note and photos if relevant.
          </li>
          <li>
            <strong>WhatsApp:</strong> message us at{' '}
            <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="text-kb-teal underline">
              {PHONE_DISPLAY}
            </a>{' '}
            with your order number and photos of the item.
          </li>
        </ul>
        <p className="mt-2">Our team will reach out within 24 hours to coordinate pickup and replacement.</p>
      </div>

      <div>
        <h3 className="font-semibold text-kb-charcoal mb-1">Shipping for exchanges</h3>
        <p>
          Return shipping charges are borne by the customer. We will ship the exchanged item
          to you free of charge.
        </p>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs text-kb-muted">
          For any questions, reach us on WhatsApp at{' '}
          <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="underline">{PHONE_DISPLAY}</a>.
        </p>
      </div>
    </>
  );
}

// Re-export the WhatsApp URL so callers (e.g. the modal's CTA button)
// can stay in sync with whatever number the content uses.
export const EXCHANGE_WA_URL = WA_URL;
