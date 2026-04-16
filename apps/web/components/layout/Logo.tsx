import Link from 'next/link';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  showText?: boolean;
  textColor?: string;
  linked?: boolean;
}

export default function Logo({
  className = 'h-10 w-auto',
  showText = true,
  textColor = 'var(--kb-charcoal)',
  linked = true,
}: LogoProps) {
  const inner = (
    <span className="flex items-center gap-2.5">
      <Image
        src="/logo-krishnas-bliss.png"
        alt="Krishna's Bliss"
        width={200}
        height={200}
        className={className}
        priority
      />
      {showText && (
        <span className="flex flex-col leading-none select-none">
          <span className="font-display text-xl font-normal tracking-wide" style={{ color: textColor }}>
            Krishna's
          </span>
          <span className="font-display text-base italic font-light -mt-0.5 tracking-wide" style={{ color: textColor, opacity: 0.8 }}>
            Bliss
          </span>
        </span>
      )}
    </span>
  );

  if (!linked) return inner;
  return <Link href="/" aria-label="Krishna's Bliss — home">{inner}</Link>;
}
