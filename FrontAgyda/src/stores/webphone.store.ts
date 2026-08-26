import { create } from 'zustand'

interface WebphoneState {
  vistaId: number | null
  zoom: number
  reloadKey: number
  loading: boolean
  loadError: boolean
  // Picture-in-Picture: WebphoneFrame registra la función real (requiere gesto
  // de usuario para abrir la ventana flotante — el navegador la rechaza si no
  // se llama directamente desde un click); WebphonePage y el Sidebar la invocan
  // desde sus propios clics. `scale` es opcional: 0.45 por defecto (botón manual),
  // 0.65 cuando se dispara automáticamente al salir del módulo por navegación.
  pipSupported: boolean
  pipActive: boolean
  requestPip: ((scale?: number) => void) | null
  // El Sidebar llama esto en el mismo click que navega, ANTES de cambiar de ruta
  // — es el único punto donde aún hay gesto de usuario válido para abrir el PiP.
  onNavigateAway: (() => void) | null
  setVistaId: (id: number | null) => void
  setZoom: (z: number) => void
  bumpReloadKey: () => void
  setLoading: (v: boolean) => void
  setLoadError: (v: boolean) => void
  setPipSupported: (v: boolean) => void
  setPipActive: (v: boolean) => void
  setRequestPip: (fn: ((scale?: number) => void) | null) => void
  setOnNavigateAway: (fn: (() => void) | null) => void
}

export const useWebphoneStore = create<WebphoneState>()((set) => ({
  vistaId: null,
  zoom: 1,
  reloadKey: 0,
  loading: true,
  loadError: false,
  pipSupported: false,
  pipActive: false,
  requestPip: null,
  onNavigateAway: null,
  setVistaId: (id) => set({ vistaId: id }),
  setZoom: (z) => set({ zoom: z }),
  bumpReloadKey: () => set((s) => ({ reloadKey: s.reloadKey + 1 })),
  setLoading: (v) => set({ loading: v }),
  setLoadError: (v) => set({ loadError: v }),
  setPipSupported: (v) => set({ pipSupported: v }),
  setPipActive: (v) => set({ pipActive: v }),
  setRequestPip: (fn) => set({ requestPip: fn }),
  setOnNavigateAway: (fn) => set({ onNavigateAway: fn }),
}))
