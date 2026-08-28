import { useEffect, useState, type ReactNode } from 'react'
import { useThemeStore } from '@/stores/theme.store'

// Aplica el tema al <html>: 'light'/'dark' → data-theme explícito;
// 'system' → sin atributo (cae al @media prefers-color-scheme en index.css).
// El script anti-flash de index.html ya puso un valor inicial; esto lo
// mantiene sincronizado con el store.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  // En modo 'system', re-render si el usuario cambia el tema del SO
  // (el CSS ya reacciona solo; esto es para consumidores JS de resolveTheme).
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => forceTick((n) => n + 1)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return <>{children}</>
}
