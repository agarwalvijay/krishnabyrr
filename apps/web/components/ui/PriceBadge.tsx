import { formatINR, discountPct } from '@/lib/api';

interface Props {
  mrp: number;
  sale_price?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export default function PriceBadge({ mrp, sale_price, size = 'md' }: Props) {
  const hasSale = sale_price != null && sale_price < mrp;
  const pct     = hasSale ? discountPct(mrp, sale_price!) : 0;

  const saleSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base';
  const mrpSize  = size === 'lg' ? 'text-base' : 'text-sm';

  if (!hasSale) {
    return (
      <span className={`font-semibold text-kb-charcoal ${saleSize}`}>
        {formatINR(mrp)}
      </span>
    );
  }

  return (
    <span className="flex items-baseline gap-1.5 flex-wrap">
      <span className={`price-sale ${saleSize}`}>{formatINR(sale_price!)}</span>
      <span className={`price-mrp ${mrpSize}`}>{formatINR(mrp)}</span>
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full badge-sale">
        -{pct}%
      </span>
    </span>
  );
}
