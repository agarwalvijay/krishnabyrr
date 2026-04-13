/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'kb-teal':       '#1A6B6B',
        'kb-blue':       '#1E3F8B',
        'kb-gold':       '#C8971A',
        'kb-emerald':    '#2D7A4F',
        'kb-iridescent': '#5BBCB0',
        'kb-cream':      '#FAF6EF',
        'kb-charcoal':   '#1C1C1C',
        'kb-muted':      '#6E6E6E',
        'kb-error':      '#C0392B',
        'kb-success':    '#27AE60',
        'kb-amber':      '#E67E22',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
