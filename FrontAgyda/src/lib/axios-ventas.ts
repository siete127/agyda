import axios from 'axios'
import { useVentasStore } from '@/stores/ventas.store'

export const ventasApi = axios.create({
  baseURL: 'https://ventas.ardabytec.vip:8443/api',
  timeout: 30_000,
})

// Cliente sin token para rutas públicas (web form de VICIdial — sin sesión)
export const ventasPublicApi = axios.create({
  baseURL: 'https://ventas.ardabytec.vip:8443/api',
  timeout: 30_000,
})

ventasApi.interceptors.request.use((config) => {
  const token = useVentasStore.getState().ventasToken
  if (token) {
    config.headers['x-access-token'] = token
  }
  return config
})

ventasApi.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401) {
      useVentasStore.getState().clearVentasSession()
      try {
        const { useAuthStore } = await import('@/stores/auth.store')
        const intranetToken = useAuthStore.getState().token
        if (intranetToken) {
          const res = await fetch('https://ventas.ardabytec.vip:8443/api/auth/intranet-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-intranet-token': intranetToken },
          })
          if (res.ok) {
            const data = await res.json()
            const newToken = data.accessToken ?? data.token
            if (newToken) {
              useVentasStore.getState().setVentasSession(
                String(newToken),
                String(data.role ?? 'agente'),
                String(data.id ?? ''),
                (data.campaigns ?? []).map((c: Record<string, unknown>) => ({ id: Number(c['ID'] ?? c['id']), nombre: String(c['nombre'] ?? '') })),
              )
              error.config.headers['x-access-token'] = newToken
              return ventasApi(error.config)
            }
          }
        }
      } catch { /* sesión limpia, el usuario verá error */ }
    }
    return Promise.reject(error)
  }
)
