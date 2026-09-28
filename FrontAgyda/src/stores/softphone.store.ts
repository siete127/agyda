import { create } from 'zustand'

// Estado del softphone SIP propio (sip.js contra el PBX) — distinto de
// webphone.store.ts, que es del iframe de VICIdial. Solo lo escribe
// services/softphone.service.ts; la UI lo lee para pintar y nunca toca sip.js.

export type EstadoRegistro = 'desconectado' | 'conectando' | 'registrado' | 'reconectando' | 'error'

export type EstadoLlamada =
  | 'libre'
  | 'marcando'   // saliente: INVITE enviado, esperando que contesten
  | 'timbrando'  // entrante: sonando, esperando que el agente conteste
  | 'en-llamada'
  | 'finalizada' // se muestra un momento para que el agente vea cómo terminó

export interface LlamadaActual {
  direccion: 'saliente' | 'entrante'
  numero: string
  nombre: string | null
  estado: EstadoLlamada
  inicio: number | null // epoch ms al contestar, para el cronómetro
  silenciada: boolean
  enEspera: boolean
  motivoFin: string | null
}

interface SoftphoneState {
  registro: EstadoRegistro
  extension: string | null
  vistaId: number | null // vista PBX con la que está registrado
  error: string | null
  avisoMic: string | null // micrófono no disponible; no impide el registro
  llamada: LlamadaActual | null
  setRegistro: (registro: EstadoRegistro, error?: string | null) => void
  setAvisoMic: (avisoMic: string | null) => void
  setExtension: (extension: string | null) => void
  setVistaId: (vistaId: number | null) => void
  setLlamada: (llamada: LlamadaActual | null) => void
  patchLlamada: (patch: Partial<LlamadaActual>) => void
}

export const useSoftphoneStore = create<SoftphoneState>()((set) => ({
  registro: 'desconectado',
  extension: null,
  vistaId: null,
  error: null,
  avisoMic: null,
  llamada: null,
  setRegistro: (registro, error = null) => set({ registro, error }),
  setAvisoMic: (avisoMic) => set({ avisoMic }),
  setExtension: (extension) => set({ extension }),
  setVistaId: (vistaId) => set({ vistaId }),
  setLlamada: (llamada) => set({ llamada }),
  patchLlamada: (patch) => set((s) => (s.llamada ? { llamada: { ...s.llamada, ...patch } } : {})),
}))
