import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  cycle: () => void
}

const ORDER: Theme[] = ['light', 'dark', 'system']

// Tema efectivo ('light' | 'dark') resolviendo 'system' contra el SO.
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'dark' || theme === 'light') return theme
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (t) => set({ theme: t }),
      cycle: () => {
        const i = ORDER.indexOf(get().theme)
        set({ theme: ORDER[(i + 1) % ORDER.length] })
      },
    }),
    {
      name: 'theme-store',
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
)
