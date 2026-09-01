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
        /* ── Escala de gris a CSS vars (ver src/index.css). Permite el modo
           oscuro sin editar los ~8000 usos de text-gray / bg-gray / border-gray.
           En claro son los valores estandar de Tailwind; en oscuro se invierten. */
        gray: {
          50:  'rgb(var(--gray-50) / <alpha-value>)',
          100: 'rgb(var(--gray-100) / <alpha-value>)',
          200: 'rgb(var(--gray-200) / <alpha-value>)',
          300: 'rgb(var(--gray-300) / <alpha-value>)',
          400: 'rgb(var(--gray-400) / <alpha-value>)',
          500: 'rgb(var(--gray-500) / <alpha-value>)',
          600: 'rgb(var(--gray-600) / <alpha-value>)',
          700: 'rgb(var(--gray-700) / <alpha-value>)',
          800: 'rgb(var(--gray-800) / <alpha-value>)',
          900: 'rgb(var(--gray-900) / <alpha-value>)',
        },
        /* Superficie sólida de tarjeta — reemplaza `bg-white` sólido (el codemod
           lo cambió por `bg-card`). `bg-white/N` translúcido queda como blanco. */
        card: 'rgb(var(--card) / <alpha-value>)',
        /* Texto — a CSS var para el modo oscuro */
        ink: {
          DEFAULT:  'rgb(var(--ink) / <alpha-value>)',
          secondary:'rgb(var(--ink-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--ink-tertiary) / <alpha-value>)',
        },
        /* Superficie app — a CSS var para el modo oscuro */
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          card:    'rgb(var(--card) / <alpha-value>)',
          border:  'rgb(var(--surface-border) / <alpha-value>)',
        },
        success: '#12B76A',
      },
      boxShadow: {
        /* Color de sombra por var: negro suave en claro, negro más denso en
           oscuro (para que la sombra siga leyéndose sobre superficies oscuras). */
        card:    '0 1px 3px rgb(var(--shadow) / .06), 0 1px 2px rgb(var(--shadow) / .04)',
        'card-md':'0 4px 16px rgb(var(--shadow) / .08)',
        'card-lg':'0 8px 32px rgb(var(--shadow) / .12)',
        glow:    '0 0 20px rgb(var(--color-brand) / .35)',
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
