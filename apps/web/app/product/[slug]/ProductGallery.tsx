'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { imageUrl, type ProductImage } from '@/lib/api';

interface Props {
  images: ProductImage[];
  productName: string;
  videoUrl?: string | null;
}

function VideoModal({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) {
  // Extract YouTube ID
  const ytId = videoUrl.match(/(?:youtu\.be\/|watch\?v=)([^&\s]+)/)?.[1];

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl aspect-video bg-black rounded-xl overflow-hidden">
          {ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            <video src={videoUrl} controls autoPlay className="w-full h-full object-contain" />
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          aria-label="Close video"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </>
  );
}

export default function ProductGallery({ images, productName, videoUrl }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [videoOpen, setVideoOpen]     = useState(false);
  const touchStartX = useRef<number | null>(null);

  const selected = images[selectedIdx];
  const displayImages = images.slice(0, 5); // Max 5 thumbnails

  const goNext = () => setSelectedIdx(i => (i + 1) % images.length);
  const goPrev = () => setSelectedIdx(i => (i - 1 + images.length) % images.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) goNext(); else goPrev();
    }
    touchStartX.current = null;
  };

  if (images.length === 0) {
    return (
      <div className="aspect-[3/4] bg-gray-100 rounded-2xl flex items-center justify-center">
        <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div>
      {/* Main image */}
      <div
        className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {selected && (
          <Image
            src={imageUrl(selected.gcs_path)}
            alt={selected.alt_text ?? productName}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover transition-opacity duration-300"
          />
        )}

        {/* Swipe arrows (mobile) */}
        {images.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/70 backdrop-blur rounded-full flex items-center justify-center md:hidden"
              aria-label="Previous image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/70 backdrop-blur rounded-full flex items-center justify-center md:hidden"
              aria-label="Next image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Mobile dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 md:hidden">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === selectedIdx ? 'bg-white' : 'bg-white/40'
                }`}
                aria-label={`Image ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail strip (desktop) */}
      {images.length > 1 && (
        <div className="hidden md:flex gap-2 mt-3">
          {displayImages.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setSelectedIdx(i)}
              className={`relative w-[72px] h-[72px] rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                i === selectedIdx ? 'border-kb-gold' : 'border-transparent hover:border-gray-200'
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <Image
                src={imageUrl(img.gcs_path)}
                alt={img.alt_text ?? `${productName} ${i + 1}`}
                fill
                sizes="72px"
                className="object-cover"
              />
            </button>
          ))}

          {/* Video thumbnail */}
          {videoUrl && (
            <button
              onClick={() => setVideoOpen(true)}
              className="relative w-[72px] h-[72px] rounded-lg overflow-hidden flex-shrink-0 border-2 border-transparent hover:border-gray-200 bg-black flex items-center justify-center"
              aria-label="Play video"
            >
              <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-kb-charcoal fill-kb-charcoal ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Share row */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
        <ShareButtons productName={productName} />
      </div>

      {/* Video modal */}
      {videoOpen && videoUrl && (
        <VideoModal videoUrl={videoUrl} onClose={() => setVideoOpen(false)} />
      )}
    </div>
  );
}

function ShareButtons({ productName }: { productName: string }) {
  const [copied, setCopied] = useState(false);

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Check out "${productName}" at Krishna's Bliss: ${window.location.href}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        onClick={shareWhatsApp}
        className="flex items-center gap-2 text-sm text-kb-muted hover:text-kb-charcoal transition-colors"
      >
        <svg className="w-5 h-5 fill-current text-[#25D366]" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Share on WhatsApp
      </button>
      <button
        onClick={copyLink}
        className="flex items-center gap-2 text-sm text-kb-muted hover:text-kb-charcoal transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </>
  );
}
