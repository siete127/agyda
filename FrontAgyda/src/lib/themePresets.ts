import type { Theme } from '@/stores/theme.store'
import type { Branding, SidebarEstilo } from '@/services/personalizacion.service'

/* ════════════════════════════════════════════════════════════════════════
   PLANTILLAS DE DISEÑO
   ────────────────────────────────────────────────────────────────────────
   Cada plantilla combina de una sola vez:
   - `modo`      → preferencia de tema (POR DISPOSITIVO — useThemeStore)
   - `branding`  → color de marca + estilo de sidebar + burbujas + fondos
                   (POR EMPRESA — updateBranding; requiere permiso de admin)
   Elegir una plantilla aplica ambas partes.
   ════════════════════════════════════════════════════════════════════════ */

export interface ThemePreset {
  key: string
  nombre: string
  descripcion: string
  modo: Theme
  branding: Pick<
    Branding,
    'colorBrand' | 'sidebarEstilo' | 'sidebarBurbujas' | 'fondoClaro' | 'fondoOscuro'
  >
  /** Colores para la mini-ilustración de la tarjeta. */
  preview: {
    sidebar: string   // css background del sidebar
    fondo: string     // fondo del área de contenido
    card: string      // superficie de tarjeta
    acento: string    // color de marca
    texto: string     // color de texto/skeletons
  }
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'agyda',
    nombre: 'AGYDA Clásico',
    descripcion: 'Azul corporativo, sidebar degradado y modo claro. El estándar de la marca.',
    modo: 'light',
    branding: {
      colorBrand: '#2F6FED',
      sidebarEstilo: 'degradado-azul',
      sidebarBurbujas: true,
      fondoClaro: '#F7F9FC',
      fondoOscuro: '#0F131B',
    },
    preview: {
      sidebar: 'linear-gradient(180deg,#14225C,#2C57C4)',
      fondo: '#F7F9FC', card: '#FFFFFF', acento: '#2F6FED', texto: '#94A3B8',
    },
  },
  {
    key: 'nocturno',
    nombre: 'Nocturno',
    descripcion: 'Modo oscuro permanente, sidebar sólido y acento azul. Ideal para turnos largos.',
    modo: 'dark',
    branding: {
      colorBrand: '#3B82F6',
      sidebarEstilo: 'solido-oscuro',
      sidebarBurbujas: false,
      fondoClaro: '#F7F9FC',
      fondoOscuro: '#0B0F17',
    },
    preview: {
      sidebar: '#0B1730',
      fondo: '#0B0F17', card: '#181D27', acento: '#3B82F6', texto: '#475569',
    },
  },
  {
    key: 'esmeralda',
    nombre: 'Esmeralda',
    descripcion: 'Verde de marca, sidebar del color corporativo y fondo claro y limpio.',
    modo: 'light',
    branding: {
      colorBrand: '#10B981',
      sidebarEstilo: 'color-marca',
      sidebarBurbujas: true,
      fondoClaro: '#F5FAF8',
      fondoOscuro: '#0C1512',
    },
    preview: {
      sidebar: '#065F46',
      fondo: '#F5FAF8', card: '#FFFFFF', acento: '#10B981', texto: '#94A3B8',
    },
  },
  {
    key: 'purpura',
    nombre: 'Púrpura Moderno',
    descripcion: 'Acento violeta, sidebar en degradado de marca y modo automático.',
    modo: 'system',
    branding: {
      colorBrand: '#8B5CF6',
      sidebarEstilo: 'gradiente-marca',
      sidebarBurbujas: true,
      fondoClaro: '#FAF8FF',
      fondoOscuro: '#120F1C',
    },
    preview: {
      sidebar: 'linear-gradient(180deg,#5B21B6,#8B5CF6)',
      fondo: '#FAF8FF', card: '#FFFFFF', acento: '#8B5CF6', texto: '#94A3B8',
    },
  },
  {
    key: 'grafito',
    nombre: 'Grafito',
    descripcion: 'Neutro y sobrio: acento slate, sidebar sólido oscuro y fondo gris muy tenue.',
    modo: 'light',
    branding: {
      colorBrand: '#64748B',
      sidebarEstilo: 'solido-oscuro',
      sidebarBurbujas: false,
      fondoClaro: '#F4F5F7',
      fondoOscuro: '#0E1013',
    },
    preview: {
      sidebar: '#1E293B',
      fondo: '#F4F5F7', card: '#FFFFFF', acento: '#64748B', texto: '#94A3B8',
    },
  },
]

/** ¿El branding actual coincide (color + sidebar + fondos) con esta plantilla? */
export function presetMatchesBranding(preset: ThemePreset, b: Branding): boolean {
  const eq = (a?: string, c?: string) => (a || '').toLowerCase() === (c || '').toLowerCase()
  return (
    eq(b.colorBrand, preset.branding.colorBrand)
    && b.sidebarEstilo === preset.branding.sidebarEstilo
    && !!b.sidebarBurbujas === !!preset.branding.sidebarBurbujas
    && eq(b.fondoClaro, preset.branding.fondoClaro)
    && eq(b.fondoOscuro, preset.branding.fondoOscuro)
  )
}

export type { SidebarEstilo }
