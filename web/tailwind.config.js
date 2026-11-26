/** @type {import('tailwindcss').Config} */
// Alle Farben kommen aus den Design-Tokens (src/ui/styles/tokens.css).
// Hier werden sie nur auf Tailwind-Namen abgebildet – Werte ändert man in tokens.css.
const scale = (name) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => [s, `rgb(var(--color-${name}-${s}) / <alpha-value>)`]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // ui/components setzen Varianten dynamisch (`btn--${variant}`) → nicht aus dem Code erkennbar
  safelist: [{ pattern: /^(btn|badge|alert|input|field-message)--/ }],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        white: 'rgb(var(--color-white) / <alpha-value>)',
        brand: scale('brand'),
        gray: scale('gray'),
        // Semantische Farben statt red/amber/sky/violet
        danger: scale('danger'),
        warning: scale('warning'),
        info: scale('info'),
        accent: scale('accent'),
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      zIndex: {
        'map-overlay': 'var(--z-map-overlay)',
        sidebar: 'var(--z-sidebar)',
        floating: 'var(--z-floating)',
        header: 'var(--z-header)',
        modal: 'var(--z-modal)',
      },
    },
  },
  plugins: [],
};
