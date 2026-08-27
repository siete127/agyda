import { api } from '@/lib/axios'

export type WebphoneProvider = 'Azul1' | 'Vici' | 'Integra'

export interface WebphoneVista {
  id: number
  label: string
  url: string
  requiereVpn: boolean
  orden: number
  provider: WebphoneProvider
}

export interface ModuloNotificacion {
  key: string
  nombre: string
  descripcion: string
}

export interface UsuarioNotificacion {
  id: number
  nombre: string
  tipoUsuario: string
  correo: string | null
}

export interface ConfiguracionCorreo {
  modulos: ModuloNotificacion[]
  usuarios: UsuarioNotificacion[]
  destinatarios: Record<string, number[]>
}

export interface WebphoneCredencialVista {
  vistaId: number
  vistaLabel: string
  vdLogin: string | null
  campana: string | null
  tieneCredenciales: boolean
}

export interface WebphoneCredencial {
  neusId: number
  nombre: string
  usuarioAgyda: string
  tipoUsuario: string
  credencialesPorVista: WebphoneCredencialVista[]
}

export const configuracionService = {
  async getVistas(): Promise<WebphoneVista[]> {
    const { data } = await api.get('/webphone/vistas')
    return data.data
  },
  async crearVista(payload: { label: string; url: string; requiereVpn: boolean; provider: WebphoneProvider }): Promise<void> {
    await api.post('/webphone/vistas', payload)
  },
  async actualizarVista(id: number, payload: Partial<{ label: string; url: string; requiereVpn: boolean; provider: WebphoneProvider }>): Promise<void> {
    await api.put(`/webphone/vistas/${id}`, payload)
  },
  async eliminarVista(id: number): Promise<void> {
    await api.delete(`/webphone/vistas/${id}`)
  },
  async hacerVistaPredeterminada(id: number): Promise<void> {
    await api.put(`/webphone/vistas/${id}/predeterminada`)
  },

  async getConfiguracionCorreo(): Promise<ConfiguracionCorreo> {
    const { data } = await api.get('/notificaciones-correo')
    return data.data
  },
  async setDestinatario(modulo: string, usuarioId: number, activo: boolean): Promise<void> {
    await api.put(`/notificaciones-correo/${modulo}/destinatario/${usuarioId}`, { activo })
  },
  async setCorreoUsuario(usuarioId: number, correo: string): Promise<void> {
    await api.put(`/notificaciones-correo/usuario/${usuarioId}/correo`, { correo })
  },

  async getCredencialesVicidial(): Promise<WebphoneCredencial[]> {
    const { data } = await api.get('/webphone/credenciales')
    return data.data
  },
  async guardarCredencialVicidial(neusId: number, vistaId: number, payload: { vdLogin: string; vdPass?: string; campana?: string }): Promise<void> {
    await api.put(`/webphone/credenciales/${neusId}/${vistaId}`, payload)
  },
  async eliminarCredencialVicidial(neusId: number, vistaId: number): Promise<void> {
    await api.delete(`/webphone/credenciales/${neusId}/${vistaId}`)
  },
  async getAutoLoginUrl(vistaId: number): Promise<string | null> {
    const { data } = await api.get('/webphone/credenciales/auto-login-url', { params: { vistaId } })
    return data.url ?? null
  },
}
