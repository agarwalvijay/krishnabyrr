'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/layout/Logo';
import ExchangePolicyModal from '@/components/ui/ExchangePolicyModal';

const PHONE         = '8076664500';
const PHONE_DISPLAY = '+91 80766 64500';
const WA_URL        = `https://wa.me/91${PHONE}`;
const INSTAGRAM_URL = 'https://www.instagram.com/krishnas_bliss_';
const FACEBOOK_URL  = 'https://www.facebook.com/krishnasbliss';

const APP_URL = 'https://dlapp.krishnasbliss.com';

export default function Footer() {
  const [policyOpen, setPolicyOpen] = useState(false);

  return (
    <>
      <footer className="bg-kb-charcoal text-white">

        {/* ── App promo strip ── */}
        <div className="border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Get the Krishna&apos;s Bliss App</p>
                <p className="text-xs text-white/50 leading-tight">Shop on the go — available on iOS &amp; Android</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a href={APP_URL} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badge-app-store.svg" alt="Download on the App Store" width={120} height={40} className="h-9 w-auto opacity-90 hover:opacity-100 transition-opacity" />
              </a>
              <a href={APP_URL} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* Play Store PNG has ~16% built-in padding so needs to be taller to appear the same visual size */}
                <img src="/badge-google-play.png" alt="Get it on Google Play" width={646} height={250} className="h-11 w-auto opacity-90 hover:opacity-100 transition-opacity rounded-lg" style={{ background: '#000' }} />
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col sm:flex-row gap-8 justify-between">

            {/* Brand */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <Logo className="h-12 w-auto" textColor="rgba(255,255,255,0.9)" />
              <p className="text-white/50 text-xs mt-1">Handcrafted with ♥ in India</p>
            </div>

            {/* Links */}
            <div className="flex flex-col items-center sm:items-start gap-2 text-sm">
              <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-1">Quick Links</p>
              <Link href="/shop" className="text-white/70 hover:text-white transition-colors">Shop</Link>
              <button
                onClick={() => setPolicyOpen(true)}
                className="text-white/70 hover:text-white transition-colors text-left"
              >
                Exchange Policy
              </button>
            </div>

            {/* Policies */}
            <div className="flex flex-col items-center sm:items-start gap-2 text-sm">
              <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-1">Policies</p>
              <Link href="/pages/shipping" className="text-white/70 hover:text-white transition-colors">Shipping</Link>
              <Link href="/pages/refund"   className="text-white/70 hover:text-white transition-colors">Refund &amp; Exchange</Link>
              <Link href="/pages/privacy"  className="text-white/70 hover:text-white transition-colors">Privacy</Link>
              <Link href="/pages/terms"    className="text-white/70 hover:text-white transition-colors">Terms &amp; Conditions</Link>
            </div>

            {/* Contact */}
            <div className="flex flex-col items-center sm:items-start gap-2 text-sm">
              <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-1">Contact Us</p>
              <a
                href={`tel:+91${PHONE}`}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {PHONE_DISPLAY}
              </a>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp us
              </a>
            </div>

            {/* Social */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-1">Follow Us</p>
              <div className="flex items-center gap-3">
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors text-white">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors text-white">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a href={WA_URL} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors text-white">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
            <p>© {new Date().getFullYear()} Krishna&apos;s Bliss. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link href="/pages/terms"    className="hover:text-white/70 transition-colors">Terms</Link>
              <Link href="/pages/privacy"  className="hover:text-white/70 transition-colors">Privacy</Link>
              <Link href="/pages/refund"   className="hover:text-white/70 transition-colors">Refund Policy</Link>
              <Link href="/pages/shipping" className="hover:text-white/70 transition-colors">Shipping</Link>
            </div>
          </div>
        </div>
      </footer>

      {policyOpen && <ExchangePolicyModal onClose={() => setPolicyOpen(false)} />}
    </>
  );
}
