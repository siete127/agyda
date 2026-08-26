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
        /* Azul de marca — único acento del sistema */
        brand: {
          DEFAULT: '#2F6FED',
          dark:    '#1E4FC4',
          light:   '#EEF3FE',   /* fondo de ícono / chip suave */
          muted:   '#7FA8F5',   /* texto de item activo en sidebar */
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
