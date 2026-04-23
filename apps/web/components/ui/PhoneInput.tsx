import { forwardRef, InputHTMLAttributes } from 'react';

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'maxLength'> & {
  hasError?: boolean;
};

/**
 * Phone number input with a static India (+91) country code prefix.
 * Accepts only the 10-digit local number; country code is display-only.
 * Compatible with react-hook-form's `register()` spread and controlled `value`/`onChange`.
 */
const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, hasError, style, ...props }, ref) => {
    return (
      <div
        className="flex rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-offset-0"
        style={{
          border: `1px solid ${hasError ? 'var(--kb-error)' : '#e5e7eb'}`,
          '--tw-ring-color': 'var(--kb-teal)',
          ...style,
        } as React.CSSProperties}
      >
        {/* Country code prefix — India only for now */}
        <div className="flex items-center gap-1.5 px-3 bg-gray-50 border-r border-gray-200 select-none flex-shrink-0">
          <span className="text-base leading-none">🇮🇳</span>
          <span className="text-sm font-medium" style={{ color: 'var(--kb-muted)' }}>+91</span>
        </div>

        <input
          {...props}
          ref={ref}
          type="tel"
          inputMode="numeric"
          maxLength={10}
          className={`flex-1 px-3 py-3 text-sm bg-white focus:outline-none ${className ?? ''}`}
        />
      </div>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';

export default PhoneInput;
