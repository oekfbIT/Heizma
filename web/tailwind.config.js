/** @type {import('tailwindcss').Config} */
// Farben & Schrift an heizma.at angelehnt (Grün #4DA547, Text #20242D, Inter)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8f0',
          100: '#ddefdb',
          200: '#bcdfb8',
          300: '#90c98a',
          400: '#66b55f',
          500: '#4da547',
          600: '#3d8a38',
          700: '#326d2f',
          800: '#2b5729',
          900: '#244824',
        },
        ink: '#20242d',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
      },
    },
  },
  plugins: [],
};
