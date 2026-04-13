import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { stockColorClass, stockLabel } from '../lib/format';

const REASONS = [
  'New Stock Received',
  'Damaged',
  'Manual Correction',
  'Exchange Return',
] as const;

interface Props {
  product: { id: string; name: string; stock_qty: number };
  onClose: () => void;
}

export default function StockAdjustModal({ product, onClose }: Props) {
  const [change, setChange]   = useState<string>('');
  const [reason, setReason]   = useState<string>(REASONS[0]);
  const queryClient           = useQueryClient();

  const changeNum = parseInt(change, 10);
  const newStock  = isNaN(changeNum) ? product.stock_qty : product.stock_qty + changeNum;
  const invalid   = isNaN(changeNum) || change === '' || newStock < 0;

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/products/${product.id}/stock-adjust`, {
        change: changeNum,
        reason,
      }),
    onSuccess: () => {
      toast.success(`Stock updated to ${newStock} unit${newStock === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-product', product.id] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to update stock';
      toast.error(msg);
    },
  });

  const colorCls = stockColorClass(product.stock_qty);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-kb-charcoal">Adjust Stock</h2>
            <button
              onClick={onClose}
              className="text-kb-muted hover:text-kb-charcoal transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Product name */}
            <div>
              <p className="text-xs text-kb-muted mb-1">Product</p>
              <p className="text-sm font-medium text-kb-charcoal">{product.name}</p>
            </div>

            {/* Current stock */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div>
                <p className="text-xs text-kb-muted mb-1">Current Stock</p>
                <span className={`text-2xl font-bold ${colorCls.replace('stock-high', 'text-kb-success').replace('stock-low', 'text-kb-amber').replace('stock-zero', 'text-kb-error')}`}>
                  {product.stock_qty}
                </span>
              </div>
              <div className="ml-auto">
                <span className={colorCls}>{stockLabel(product.stock_qty)}</span>
              </div>
            </div>

            {/* Adjustment input */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Adjustment <span className="text-kb-muted font-normal">(positive = add, negative = remove)</span>
              </label>
              <input
                type="number"
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="e.g. +2 or -1"
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kb-teal
                  ${newStock < 0 ? 'border-kb-error' : 'border-gray-200'}`}
              />
              {change !== '' && !isNaN(changeNum) && (
                <p className={`mt-1.5 text-sm font-medium ${newStock < 0 ? 'text-kb-error' : 'text-kb-muted'}`}>
                  {newStock < 0
                    ? `Stock cannot go below 0 (would be ${newStock})`
                    : `New stock will be: ${newStock}`
                  }
                </p>
              )}
            </div>

            {/* Reason dropdown */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Reason</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={invalid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : 'Confirm Adjustment'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
