import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/axios'

export type BgMode = 'solid' | 'gradient'

export type BgDirection = 0 | 1 | 2 | 3
// 0: diagonal (↘), 1: vertical (↓), 2: diagonal inversa (↙), 3: horizontal (→)

const DIRECTION_LABELS: Record<BgDirection, string> = {
  0: 'Diagonal ↘',
  1: 'Vertical ↓',
  2: 'Diagonal ↙',
  3: 'Horizontal →',
}

const DIRECTION_STYLES: Record<BgDirection, string> = {
  0: 'to bottom right',
  1: 'to bottom',
  2: 'to bottom left',
  3: 'to right',
}

export { DIRECTION_LABELS, DIRECTION_STYLES }

export interface BgState {
  mode:      BgMode
  color1:    string   // hex
  color2:    string   // hex (solo en gradient)
  direction: BgDirection
}

interface BackgroundStore extends BgState {
  setMode:      (mode: BgMode) => void
  setColor1:    (c: string) => void
  setColor2:    (c: string) => void
  setDirection: (d: BgDirection) => void
  reset:        () => void
  loadFromServer: () => Promise<void>
  persistGlobal:  () => Promise<void>
}

const DEFAULT: BgState = {
  mode:      'solid',
  color1:    '#F7F9FC',
  color2:    '#E0E7FF',
  direction: 0,
}

export const useBackgroundStore = create<BackgroundStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT,

      setMode:      (mode)      => set({ mode }),
      setColor1:    (color1)    => set({ color1 }),
      setColor2:    (color2)    => set({ color2 }),
      setDirection: (direction) => set({ direction }),

      reset: () => set({ ...DEFAULT }),

      loadFromServer: async () => {
        // Si ya hay configuración guardada en localStorage, no sobreescribir
        const stored = localStorage.getItem('bg-store')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (parsed?.state?.color1) return
          } catch { /* ignorar */ }
        }
        try {
          const { data } = await api.get('/ui/background')
          const d = data?.data ?? data
          if (!d) return
          const mode      = d.mode === 'gradient' ? 'gradient' : 'solid'
          const color1    = d.color1 ? `#${Number(d.color1).toString(16).slice(-6).padStart(6, '0')}` : get().color1
          const color2    = d.color2 ? `#${Number(d.color2).toString(16).slice(-6).padStart(6, '0')}` : get().color2
          const direction = ([0, 1, 2, 3].includes(Number(d.direction)) ? Number(d.direction) : get().direction) as BgDirection
          set({ mode, color1, color2, direction })
        } catch {
          // sin conexión — usa localStorage
        }
      },

      persistGlobal: async () => {
        const { mode, color1, color2, direction } = get()
        const toInt = (hex: string) => parseInt(hex.replace('#', 'FF'), 16)
        await api.put('/ui/background', {
          mode,
          color1:    toInt(color1),
          color2:    toInt(color2),
          direction,
        })
      },
    }),
    {
      name: 'bg-store',
      version: 1,
      // v0 → v1: se migra al nuevo fondo neutro del sistema (#F7F9FC), descartando
      // personalizaciones previas (ej. gradientes de pruebas) para todos los usuarios.
      migrate: () => ({ ...DEFAULT }),
      partialize: (s) => ({
        mode: s.mode, color1: s.color1, color2: s.color2, direction: s.direction,
      }),
    }
  )
)

/** Devuelve el CSS `background` listo para usar en style= */
export function bgCss(state: BgState): string {
  if (state.mode === 'gradient') {
    return `linear-gradient(${DIRECTION_STYLES[state.direction]}, ${state.color1}, ${state.color2})`
  }
  return state.color1
}
