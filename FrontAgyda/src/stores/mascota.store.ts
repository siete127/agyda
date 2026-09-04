import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Preferencia del usuario, por dispositivo: si la mascota flotante está visible.
 *  El admin la habilita a nivel empresa (personalización.mascota.modo); esto solo
 *  decide si ESTE navegador la muestra o la tiene oculta. */
interface MascotaStore {
  flotanteVisible: boolean
  setFlotanteVisible: (v: boolean) => void
  toggleFlotante: () => void
}

export const useMascotaStore = create<MascotaStore>()(
  persist(
    (set) => ({
      flotanteVisible: true,
      setFlotanteVisible: (v) => set({ flotanteVisible: v }),
      toggleFlotante: () => set((s) => ({ flotanteVisible: !s.flotanteVisible })),
    }),
    { name: 'mascota-flotante' },
  ),
)
