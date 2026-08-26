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

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status
    const msg = (error.response?.data as Record<string, unknown>)?.message as string | undefined
    // 401 siempre = sin token → login
    // 403 solo cuando el backend dice que el token expiró/es inválido (no por rol insuficiente)
    const esTokenInvalido = status === 401 ||
      (status === 403 && (msg?.includes('expirado') || msg?.includes('inválido') || msg?.includes('invalido')))
    if (esTokenInvalido) {
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
