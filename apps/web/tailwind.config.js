/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        /** Phones in landscape and other short viewports. */
        short: { raw: '(max-height: 520px)' },
      },
      /**
       * Typography tokens (Keyo design system): body 500, labels/buttons 600–700, headings 700–800.
       * Values live in CSS variables (index.css) so one change re-weights the whole game.
       */
      fontWeight: {
        body: 'var(--fw-body)',
        label: 'var(--fw-label)',
        strong: 'var(--fw-strong)',
        heading: 'var(--fw-heading)',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        ink: { 950: '#05040b', 900: '#0a0818', 800: '#120e26', 700: '#1b1636', 600: '#272048', 500: '#3a3166' },
        emerald: { 950: '#03170e', 900: '#062a1b', 800: '#0b4128', 700: '#0f5a39', 600: '#167a4e', 500: '#1f9d61', 400: '#3fc583' },
        gold: { 50: '#fff8e1', 100: '#fff1b8', 200: '#f7d77a', 300: '#f2c14e', 400: '#e0a83a', 500: '#b9801c', 600: '#8a5a12' },
        ruby: { 400: '#ff5a6e', 500: '#d42a44', 600: '#9c1d33' },
        neon: { violet: '#b45cff', cyan: '#5ad8ff', pink: '#ff4fd8' },
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(135deg, #fff1b8 0%, #f2c14e 35%, #b9801c 60%, #f7d77a 100%)',
        'glass': 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)',
        'lounge': 'radial-gradient(ellipse at 50% -10%, #2a1f5a 0%, #120e26 45%, #05040b 100%)',
        'felt': 'radial-gradient(ellipse at 50% 40%, #1f8a5a 0%, #0f5a39 55%, #062a1b 100%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(242,193,78,0.35)',
        'glow-violet': '0 0 28px rgba(180,92,255,0.35)',
        panel: '0 18px 40px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
        button: '0 6px 16px -4px rgba(185,128,28,0.6), inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      keyframes: {
        sheen: { '0%': { transform: 'translateX(-120%) skewX(-20deg)' }, '100%': { transform: 'translateX(220%) skewX(-20deg)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'none' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 12px rgba(242,193,78,0.25)' }, '50%': { boxShadow: '0 0 28px rgba(242,193,78,0.6)' } },
      },
      animation: {
        sheen: 'sheen 2.8s ease-in-out infinite',
        'spin-slow': 'spin 6s linear infinite',
        rise: 'rise .35s ease-out both',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
