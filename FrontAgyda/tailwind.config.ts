import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Instrument Sans"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        /* Color de marca — configurable por empresa vía CSS vars (ver
           src/index.css :root y PersonalizacionProvider). Los defaults son el
           azul histórico #2F6FED / #1E4FC4 / #EEF3FE / #7FA8F5. El patrón
           rgb(var(--x) / <alpha-value>) mantiene el soporte de opacidad
           (bg-brand/20, text-brand/40, etc.). */
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          dark:    'rgb(var(--color-brand-dark) / <alpha-value>)',
          light:   'rgb(var(--color-brand-light) / <alpha-value>)',
          muted:   'rgb(var(--color-brand-muted) / <alpha-value>)',
        },
        /* Retenido para páginas aún no migradas a este design system */
        accent: {
          DEFAULT: '#2DD4BF',
          dark:    '#14B8A6',
          light:   '#EFFCFB',
        },
        /* Sidebar — degradado navy */
        nav: {
          bg:        '#0B1730',
          bgTo:      '#14274E',
          active:    'rgba(47,111,237,0.16)',
          border:    'rgba(255,255,255,0.08)',
          text:      '#8B96AC',
          textHover: '#FFFFFF',
        },
        /* Texto */
        ink: {
          DEFAULT:  '#101828',  /* texto principal */
          secondary:'#475467',
          tertiary: '#98A2B3',
        },
        /* Superficie app */
        surface: {
          DEFAULT: '#F7F9FC',
          card:    '#FFFFFF',
          border:  '#E7ECF5',
        },
        success: '#12B76A',
      },
      boxShadow: {
        /* Retenidas para páginas aún no migradas; el design system nuevo usa borde de 1px, no sombra */
        card:    '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        'card-md':'0 4px 16px rgba(0,0,0,.08)',
        'card-lg':'0 8px 32px rgba(0,0,0,.12)',
        glow:    '0 0 20px rgba(47,111,237,.35)',
      },
      borderRadius: {
        '2xl': '1rem', /* 16px — radio estándar de tarjeta */
      },
      width: {
        sidebar:           '220px',
        'sidebar-collapsed': '64px',
      },
      height: {
        topbar: '64px',
      },
      animation: {
        'fade-in':  'fadeIn .18s ease-out',
        'slide-up': 'slideUp .2s ease-out',
        'pulse-dot':'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' },                                    to: { opacity: '1' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(10px)' },     to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '1', transform: 'scale(1)' },        '50%': { opacity: '.5', transform: 'scale(.85)' } },
      },
    },
  },
  plugins: [],
}
export default config
