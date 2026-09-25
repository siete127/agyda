import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
})

// Cliente para endpoints públicos sin sesión (ej. formularios en modo
// 'externo' para VICIdial, /q/:token de QR). A propósito NO comparte los
// interceptores de `api` de arriba: esas páginas pueden abrirse en un
// navegador/iframe sin ninguna sesión de AGYDA, y un 401/403 de otra
// petición en vuelo no debe redirigir esta pestaña a /login.
export const apiPublico = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Inyectar headers de usuario que el backend lee en cada endpoint
    try {
      const raw = localStorage.getItem('auth-store')
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { user?: { id?: number; tipoUsuario?: string } } }
        const user = parsed?.state?.user
        if (user?.id) config.headers['usuarioid'] = String(user.id)
        if (user?.tipoUsuario) config.headers['x-user-tipo'] = user.tipoUsuario
      }
    } catch {
      // ignorar si no se puede leer el store
    }

    return config
  },
  (error) => Promise.reject(error)
)

// ¿El backend rechazó el token? Solo eso cierra la sesión:
//   401 siempre = sin token → login
//   403 solo cuando el backend dice que el token expiró/es inválido (no por rol insuficiente)
// Un error de red, un timeout o un 5xx (p. ej. el backend reiniciándose en un
// deploy, o el proxy respondiendo 502) NO es un rechazo: la sesión sigue.
export function esTokenRechazado(error: unknown): boolean {
  if (!(error instanceof AxiosError) || !error.response) return false
  const status = error.response.status
  const msg = (error.response.data as Record<string, unknown> | undefined)?.message as string | undefined
  return status === 401 ||
    (status === 403 && !!(msg?.includes('expirado') || msg?.includes('inválido') || msg?.includes('invalido')))
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (esTokenRechazado(error)) {
      // El puente de sesión (/auth-bridge) maneja su propia autenticación: valida
      // el ?token= de la URL contra /auth/me y decide a dónde ir. Si aquí
      // redirigimos a /login por un 401 de otra request en vuelo (p.ej. el
      // /auth/validate de AppInitializer con un token viejo), matamos el puente
      // a mitad de camino — de forma intermitente, según qué request gane la
      // carrera. En esa ruta no tocamos nada.
      if (window.location.pathname === '/auth-bridge') {
        return Promise.reject(error)
      }
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth-store')
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }
    return Promise.reject(error)
  }
)

export function getApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as Record<string, unknown> | undefined
    if (typeof data?.message === 'string') return data.message
    if (typeof data?.error === 'string') return data.error
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Error desconocido'
}
