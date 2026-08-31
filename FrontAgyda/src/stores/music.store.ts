import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Track {
  id: number
  titulo: string
  artista: string
  emoji: string
  url: string
}

interface MusicStore {
  // Lista cargada en la burbuja
  tracks: Track[]
  setTracks: (t: Track[]) => void

  // Visibilidad de la burbuja flotante (por dispositivo, persistida)
  bubbleVisible: boolean
  setBubbleVisible: (v: boolean) => void

  // Reproducción
  currentTrack: Track | null
  isPlaying: boolean
  audio: HTMLAudioElement | null

  play: (track: Track) => void
  pause: () => void
  resume: () => void
  stop: () => void
  next: () => void
  prev: () => void
}

export const useMusicStore = create<MusicStore>()(persist((set, get) => ({
  tracks: [],
  setTracks: (tracks) => set({ tracks }),

  bubbleVisible: true,
  setBubbleVisible: (v) => set({ bubbleVisible: v }),

  currentTrack: null,
  isPlaying: false,
  audio: null,

  play: (track) => {
    const { audio: prev } = get()
    prev?.pause()

    const el = new Audio(track.url)
    el.onended = () => {
      // Auto-siguiente
      const { tracks, currentTrack } = get()
      if (!currentTrack) return
      const idx = tracks.findIndex((t) => t.id === currentTrack.id)
      const next = tracks[idx + 1]
      if (next) get().play(next)
      else set({ isPlaying: false, currentTrack: null, audio: null })
    }
    el.onerror = () => set({ isPlaying: false })
    el.play().catch(() => set({ isPlaying: false }))

    set({ currentTrack: track, isPlaying: true, audio: el })
  },

  pause: () => {
    get().audio?.pause()
    set({ isPlaying: false })
  },

  resume: () => {
    get().audio?.play().catch(() => {})
    set({ isPlaying: true })
  },

  stop: () => {
    get().audio?.pause()
    set({ currentTrack: null, isPlaying: false, audio: null })
  },

  next: () => {
    const { tracks, currentTrack } = get()
    if (!currentTrack) return
    const idx = tracks.findIndex((t) => t.id === currentTrack.id)
    const next = tracks[idx + 1] ?? tracks[0]
    if (next) get().play(next)
  },

  prev: () => {
    const { tracks, currentTrack } = get()
    if (!currentTrack) return
    const idx = tracks.findIndex((t) => t.id === currentTrack.id)
    const prev = tracks[idx - 1] ?? tracks[tracks.length - 1]
    if (prev) get().play(prev)
  },
}), {
  name: 'music-store',
  partialize: (s) => ({ bubbleVisible: s.bubbleVisible }),
}))
