import type { Config } from 'tailwindcss';

// CyberReserve visual identity: void navy, electric violet (brand), cyan (glow
// lines). Green and red are reserved for station status only.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#05060F',
        deep: '#0A0D1C',
        panel: '#0F1430',
        panel2: '#151B3D',
        line: '#232C5C',
        ink: '#E9EEFF',
        muted: '#8C97C4',
        violet: { DEFAULT: '#9D5CFF', soft: '#C3A1FF', deep: '#6B2BE0' },
        cyan: '#29E0FF',
        free: '#2BFF88',
        busy: '#FF2D55',
        off: '#4A5279',
        gold: '#FFC94D',
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'Tahoma', 'sans-serif'],
        hud: ['var(--font-hud)', 'var(--font-display)', 'monospace'],
      },
      maxWidth: {
        prose: '68ch',
        site: '90rem',
      },
    },
  },
  plugins: [],
};

export default config;
