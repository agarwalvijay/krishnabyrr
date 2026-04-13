import { getStockStatus } from '@/lib/api';

interface Props {
  stock_qty: number;
  className?: string;
}

export default function StockBadge({ stock_qty, className = '' }: Props) {
  const status = getStockStatus(stock_qty);

  if (status === 'in_stock') return null;

  if (status === 'out_of_stock') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full badge-sold-out ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-kb-error" />
        Sold Out
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full badge-stock-low ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-kb-amber" />
      Only {stock_qty} left!
    </span>
  );
}
