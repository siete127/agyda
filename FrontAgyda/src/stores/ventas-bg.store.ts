import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { bgCss, type BgMode, type BgDirection } from './background.store'

export { bgCss }

interface VentasBgStore {
  mode:      BgMode
  color1:    string
  color2:    string
  direction: BgDirection
  setMode:      (m: BgMode) => void
  setColor1:    (c: string) => void
  setColor2:    (c: string) => void
  setDirection: (d: BgDirection) => void
  reset:        () => void
}

const DEFAULT = {
  mode:      'solid'    as BgMode,
  color1:    '#0f172a',
  color2:    '#1e3a5f',
  direction: 0          as BgDirection,
}

export const useVentasBgStore = create<VentasBgStore>()(
  persist(
    (set) => ({
      ...DEFAULT,
      setMode:      (mode)      => set({ mode }),
      setColor1:    (color1)    => set({ color1 }),
      setColor2:    (color2)    => set({ color2 }),
      setDirection: (direction) => set({ direction }),
      reset:        ()          => set({ ...DEFAULT }),
    }),
    {
      name: 'ventas-bg-store',
      partialize: (s) => ({ mode: s.mode, color1: s.color1, color2: s.color2, direction: s.direction }),
    },
  ),
)
