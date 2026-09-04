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
  telegramVinculado: boolean
}

export interface CanalesDestinatario {
  mail: boolean
  telegram: boolean
}

export interface ConfiguracionCorreo {
  modulos: ModuloNotificacion[]
  usuarios: UsuarioNotificacion[]
  destinatarios: Record<string, Record<number, CanalesDestinatario>>
  telegramConfigurado: boolean
}

export type ServidorCorreoTipo = 'smtp' | 'graph'

export interface ServidorCorreoConfig {
  habilitado: boolean
  tipo: ServidorCorreoTipo
  smtpHost: string | null
  smtpPort: number | null
  smtpSecure: boolean
  smtpUser: string | null
  smtpPassConfigurado: boolean
  tenantId: string | null
  clientId: string | null
  clientSecretConfigurado: boolean
  buzonRemitente: string | null
  correoFrom: string | null
  nombreRemitente: string | null
  transporteActivo: 'ninguno' | 'resend' | 'graph' | 'smtp'
}

export interface GuardarServidorCorreoPayload {
  habilitado: boolean
  tipo: ServidorCorreoTipo
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPass?: string
  tenantId?: string
  clientId?: string
  clientSecret?: string
  buzonRemitente?: string
  correoFrom?: string
  nombreRemitente?: string
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

export interface WebphoneAsignacion {
  neusId: number
  nombre: string
  usuarioAgyda: string
  tipoUsuario: string
  vistaId: number | null
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
  async setDestinatario(modulo: string, usuarioId: number, activo: boolean, canal: 'mail' | 'telegram' = 'mail'): Promise<void> {
    await api.put(`/notificaciones-correo/${modulo}/destinatario/${usuarioId}`, { activo, canal })
  },
  async setCorreoUsuario(usuarioId: number, correo: string): Promise<void> {
    await api.put(`/notificaciones-correo/usuario/${usuarioId}/correo`, { correo })
  },

  async getEstadoTelegram(): Promise<{ vinculado: boolean; telegramConfigurado: boolean }> {
    const { data } = await api.get('/notificaciones-correo/telegram/estado')
    return data.data
  },
  async generarCodigoTelegram(): Promise<{ codigo: string; botUsername: string; expiraEnMinutos: number }> {
    const { data } = await api.post('/notificaciones-correo/telegram/codigo')
    return data.data
  },
  async desvincularTelegram(): Promise<void> {
    await api.post('/notificaciones-correo/telegram/desvincular')
  },

  async getServidorCorreoConfig(): Promise<ServidorCorreoConfig | null> {
    const { data } = await api.get('/notificaciones-correo/servidor')
    return data.data
  },
  async guardarServidorCorreoConfig(payload: GuardarServidorCorreoPayload): Promise<{ transporteActivo: string }> {
    const { data } = await api.put('/notificaciones-correo/servidor', payload)
    return data
  },
  async enviarCorreoPrueba(correo: string): Promise<{ success: boolean; message?: string }> {
    const { data } = await api.post('/notificaciones-correo/servidor/prueba', { correo })
    return data
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

  // ── Asignación dura de vista por usuario ──
  async getMiAsignacionVista(): Promise<number | null> {
    const { data } = await api.get('/webphone/vistas/asignaciones/mi-asignacion')
    return data.vistaId ?? null
  },
  async getAsignaciones(): Promise<WebphoneAsignacion[]> {
    const { data } = await api.get('/webphone/vistas/asignaciones')
    return data.data
  },
  async setAsignacion(neusId: number, vistaId: number | null): Promise<void> {
    await api.put(`/webphone/vistas/asignaciones/${neusId}`, { vistaId })
  },
}
