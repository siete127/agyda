import { io, Socket } from 'socket.io-client'
import { ENV } from '@/config/env'

let socket: Socket | null = null

export function getSocket(): Socket {
  // Reusar si existe (conectado o conectando)
  if (socket) return socket

  const token = localStorage.getItem('auth_token')

  socket = io(ENV.SOCKET_URL, {
    transports: ['polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
    auth: token ? { token } : undefined,
  })

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

export function getSocketInstance(): Socket | null {
  return socket
}
