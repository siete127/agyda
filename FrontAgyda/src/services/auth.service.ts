import { api, getApiError } from '@/lib/axios'
import type { User } from '@/types/user.types'

interface LoginRawResponse {
  success: boolean
  accessToken?: string
  token?: string
  user?: Record<string, unknown>
  [key: string]: unknown
}

export const authService = {
  async login(usuario: string, contra: string, empresa: string): Promise<{ user: User; token: string }> {
    const { data } = await api.post<LoginRawResponse>('/auth/login', { usuario, password: contra, empresa })
    // El backend devuelve { success, data: { id, nombre, accessToken, ... } }
    const payload = (data.data ?? data.user ?? data) as Record<string, unknown>
    const token = (payload.accessToken ?? payload.token ?? data.accessToken ?? data.token ?? '') as string

    const user: User = {
      id: Number(payload.id ?? 0),
      nombres: String(payload.nombres ?? payload.nombre ?? ''),
      usuario: String(payload.usuario ?? ''),
      tipoUsuario: String(payload.tipoUsuario ?? payload.NEUS_TIPOUSUARIO ?? '').toUpperCase(),
      activo: Boolean(payload.activo ?? true),
      status: Boolean(payload.status ?? true),
      base: String(payload.base ?? payload.cartera ?? '1'),
      fechaRegistro: payload.fechaRegistro ? String(payload.fechaRegistro) : null,
      fechaIngreso: payload.fechaIngreso ? String(payload.fechaIngreso) : null,
      ventasUsuario: String(payload.ventasUsuario ?? payload.ventas_usuario ?? ''),
      ventasPassword: String(payload.ventasPassword ?? payload.ventas_password ?? ''),
      ventasRol: String(payload.ventasRol ?? 'vendedor'),
      accessToken: token,
      codigo: payload.codigo ? String(payload.codigo) : null,
      empresa: payload.empresa ? String(payload.empresa) : undefined,
    }

    return { user, token }
  },

  async validate(): Promise<boolean> {
    try {
      const { data } = await api.get('/auth/validate')
      return Boolean(data?.success)
    } catch {
      return false
    }
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } catch {
      // silencioso
    }
  },
}

export { getApiError }
