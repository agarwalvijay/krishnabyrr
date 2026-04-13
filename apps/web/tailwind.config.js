/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'kb-teal':       '#1A6B6B',
        'kb-blue':       '#1E3F8B',
        'kb-gold':       '#C8971A',
        'kb-emerald':    '#2D7A4F',
        'kb-iridescent': '#5BBCB0',
        'kb-cream':      '#FAF6EF',
        'kb-warm-white': '#FFFFFF',
        'kb-charcoal':   '#1C1C1C',
        'kb-muted':      '#6E6E6E',
        'kb-error':      '#C0392B',
        'kb-success':    '#27AE60',
        'kb-amber':      '#E67E22',
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Georgia', 'serif'],
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      aspectRatio: {
        '3/4': '3 / 4',
      },
    },
  },
  plugins: [],
};
