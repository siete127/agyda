import { useEffect, Component, type ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { router } from '@/router'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/stores/auth.store'
import { authService } from '@/services/auth.service'
import { ThemeProvider } from '@/providers/ThemeProvider'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Algo salió mal</h2>
            <p className="mt-1 text-sm text-gray-500">Recarga la página para continuar.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function AppInitializer() {
  const { token, isAuthenticated, clearSession, setInitialized } = useAuthStore()

  useEffect(() => {
    async function init() {
      // En /auth-bridge, esa página es la dueña de la autenticación: valida el
      // ?token= de la URL contra el backend y navega. Si aquí lanzáramos
      // /auth/validate en paralelo con un token viejo del store, su 401 podría
      // (según quién gane la carrera) tumbar el puente y mandar a /login.
      if (window.location.pathname === '/auth-bridge') {
        setInitialized()
        return
      }
      if (token && isAuthenticated) {
        const valid = await authService.validate()
        if (!valid) clearSession()
      }
      setInitialized()
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AppInitializer />
          <RouterProvider router={router} />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '10px',
                fontSize: '14px',
                background: 'rgb(var(--card))',
                color: 'rgb(var(--ink))',
                border: '1px solid rgb(var(--surface-border))',
              },
            }}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
