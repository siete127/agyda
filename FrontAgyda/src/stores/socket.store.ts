import { create } from 'zustand'

type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface SocketState {
  status: SocketStatus
  socketId: string | null
  setStatus: (s: SocketStatus) => void
  setSocketId: (id: string | null) => void
}

export const useSocketStore = create<SocketState>()((set) => ({
  status: 'disconnected',
  socketId: null,
  setStatus: (s) => set({ status: s }),
  setSocketId: (id) => set({ socketId: id }),
}))
