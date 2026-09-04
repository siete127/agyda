import { create } from 'zustand'

/** Un enlace del encabezado abierto en el panel flotante (estilo Spotify): el
 *  iframe vive fuera del <Outlet>, no se desmonta al navegar, se puede arrastrar
 *  y minimizar a una burbuja. Solo uno abierto a la vez. */
export interface EnlaceAbierto {
  id: string
  label: string
  url: string
  color: string
}

interface EnlaceFrameStore {
  abierto: EnlaceAbierto | null
  minimizado: boolean
  abrir: (e: EnlaceAbierto) => void
  cerrar: () => void
  toggleMinimizado: () => void
  setMinimizado: (v: boolean) => void
}

export const useEnlaceFrameStore = create<EnlaceFrameStore>((set) => ({
  abierto: null,
  minimizado: false,
  abrir: (e) => set({ abierto: e, minimizado: false }),
  cerrar: () => set({ abierto: null, minimizado: false }),
  toggleMinimizado: () => set((s) => ({ minimizado: !s.minimizado })),
  setMinimizado: (v) => set({ minimizado: v }),
}))
