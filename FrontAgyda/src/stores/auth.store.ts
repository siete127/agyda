import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/user.types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isInitialized: boolean
  isLoading: boolean
  error: string | null
  setUser: (user: User, token: string) => void
  clearSession: () => void
  setLoading: (v: boolean) => void
  setError: (msg: string | null) => void
  setInitialized: () => void
  updatePerfil: (alias: string | null, fotoUrl: string | null, portadaUrl: string | null) => void
  isAdmin: () => boolean
  isADorTI: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: false,
      isLoading: false,
      error: null,

      setUser: (user, token) => {
        localStorage.setItem('auth_token', token)
        set({ user, token, isAuthenticated: true, error: null })
      },

      clearSession: () => {
        localStorage.removeItem('auth_token')
        set({ user: null, token: null, isAuthenticated: false })
      },

      setLoading: (v) => set({ isLoading: v }),
      setError: (msg) => set({ error: msg }),
      setInitialized: () => set({ isInitialized: true }),

      updatePerfil: (alias, fotoUrl, portadaUrl) =>
        set((s) => ({
          user: s.user
            ? { ...s.user, perfilAlias: alias, perfilFotoUrl: fotoUrl, perfilPortadaUrl: portadaUrl }
            : null,
        })),

      isAdmin: () => get().user?.tipoUsuario?.toUpperCase() === 'AD',
      isADorTI: () => {
        const t = get().user?.tipoUsuario?.toUpperCase() ?? ''
        return t === 'AD' || t === 'TI'
      },
    }),
    {
      name: 'auth-store',
      partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }),
    }
  )
)
