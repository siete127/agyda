import { api } from '@/lib/axios'
import { parseTicket, parseTicketComment, type Ticket, type TicketComment, type TicketEstado, type TicketPrioridad } from '@/types/ticket.types'
import type { FichaUsuario } from '@/types/fichaUsuario.types'

export const ticketsService = {
  async getAll(): Promise<Ticket[]> {
    const { data } = await api.get('/tickets')
    const list = Array.isArray(data) ? data : (data?.data ?? data?.tickets ?? [])
    return (list as Record<string, unknown>[]).map(parseTicket)
  },

  async getById(id: number): Promise<Ticket> {
    const { data } = await api.get(`/tickets/${id}`)
    const raw = data?.ticket ?? data?.data ?? data
    return parseTicket(raw as Record<string, unknown>)
  },

  async create(payload: {
    titulo: string
    descripcion: string
    prioridad?: string
    prioridadManual?: boolean
    area: string
    asignadoA?: number
    clasificacion?: string
    categoria?: string
    subcategoria?: string
    sede?: string
    departamento?: string
    activoAfectado?: string
    servicioAfectado?: string
    impacto?: string
    urgencia?: string
    camposPersonalizados?: Record<number, string>
  }): Promise<Ticket> {
    const { data } = await api.post('/tickets', payload)
    return parseTicket((data?.ticket ?? data?.data ?? data) as Record<string, unknown>)
  },

  async cambiarEstado(id: number, estado: TicketEstado): Promise<void> {
    await api.post(`/tickets/${id}/estado`, { estado })
  },

  async ponerEnEspera(id: number, motivo: string): Promise<void> {
    await api.post(`/tickets/${id}/espera`, { motivo })
  },

  async salirDeEspera(id: number): Promise<void> {
    await api.post(`/tickets/${id}/salir-espera`)
  },

  async transferir(id: number, usuarioId: number): Promise<void> {
    await api.post(`/tickets/${id}/transferir`, { usuarioId })
  },

  async escalar(id: number, nivelDestino?: number, motivo?: string): Promise<{ nivelActual: number; asignadoA: number | null }> {
    const { data } = await api.post(`/tickets/${id}/escalar`, { nivelDestino, motivo })
    return { nivelActual: data?.nivelActual, asignadoA: data?.asignadoA ?? null }
  },

  async resolver(id: number, payload: {
    diagnostico: string
    accionesRealizadas: string
    causaRaiz?: string
    codigoCierre?: string
    articuloKbId?: number
  }): Promise<void> {
    await api.post(`/tickets/${id}/resolver`, payload)
  },

  async validar(id: number, confirma: boolean, comentario?: string): Promise<void> {
    await api.post(`/tickets/${id}/validar`, { confirma, comentario })
  },

  async registrarSatisfaccion(id: number, rating: number, comentario?: string): Promise<void> {
    await api.post(`/tickets/${id}/satisfaccion`, { rating, comentario })
  },

  async getCategorias(): Promise<string[]> {
    const { data } = await api.get('/tickets/categorias')
    return (data?.data ?? []) as string[]
  },

  async getCodigosCierre(): Promise<string[]> {
    const { data } = await api.get('/tickets/codigos-cierre')
    return (data?.data ?? []) as string[]
  },

  // Comentarios
  async getComentarios(id: number): Promise<TicketComment[]> {
    const { data } = await api.get(`/tickets/${id}/comentarios`)
    const list = Array.isArray(data) ? data : (data?.data ?? data?.comentarios ?? [])
    return (list as Record<string, unknown>[]).map(parseTicketComment)
  },

  async addComentario(id: number, comentario: string): Promise<void> {
    await api.post(`/tickets/${id}/comentarios`, { comentario })
  },

  async getHistorial(id: number): Promise<{
    id: number; tipo: string; detalle: string | null
    userId: number | null; usuarioNombre: string | null; createdAt: string
  }[]> {
    const { data } = await api.get(`/tickets/${id}`)
    const raw = data?.data ?? data
    return (raw?.historial ?? []) as {
      id: number; tipo: string; detalle: string | null
      userId: number | null; usuarioNombre: string | null; createdAt: string
    }[]
  },

  async getStaffTI(): Promise<{ usuarioId: number; nombre: string; area: string; disponible: boolean; nivel: number; grupoNombre: string | null }[]> {
    const { data } = await api.get('/tickets/ti/staff')
    const list: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.data ?? [])
    return list.map((s) => ({
      usuarioId: Number(s['usuarioId'] ?? s['userId'] ?? s['NEUS_ID'] ?? 0),
      nombre:    String(s['nombre']    ?? s['NEUS_NOMBRES'] ?? ''),
      area:      String(s['area']      ?? s['AREA'] ?? 'TI'),
      disponible: Boolean(s['disponible'] ?? s['DISPONIBLE'] ?? true),
      nivel: Number(s['nivel'] ?? s['NIVEL'] ?? 1),
      grupoNombre: (s['grupoNombre'] ?? s['GRUPO_NOMBRE'] ?? null) as string | null,
    }))
  },

  async actualizarStaffTI(userId: number, payload: { area?: string; disponible?: boolean; nivel?: number }): Promise<void> {
    await api.post('/tickets/ti/staff', { userId, ...payload })
  },

  async getGruposSoporte(): Promise<{ id: number; area: string; nivel: number; nombre: string }[]> {
    const { data } = await api.get('/tickets/grupos-soporte')
    return (data?.data ?? []) as { id: number; area: string; nivel: number; nombre: string }[]
  },

  async createGrupoSoporte(payload: { area: string; nivel: number; nombre: string }): Promise<void> {
    await api.post('/tickets/grupos-soporte', payload)
  },

  async actualizarGrupoSoporte(id: number, payload: { area: string; nivel: number; nombre: string }): Promise<void> {
    await api.put(`/tickets/grupos-soporte/${id}`, payload)
  },

  async eliminarGrupoSoporte(id: number): Promise<void> {
    await api.delete(`/tickets/grupos-soporte/${id}`)
  },

  async getEscalamientoConfig(): Promise<{ autoEscalamiento: boolean; umbralRiesgo: number }> {
    const { data } = await api.get('/tickets/escalamiento-config')
    return data?.data ?? { autoEscalamiento: true, umbralRiesgo: 0.8 }
  },

  async actualizarEscalamientoConfig(payload: { autoEscalamiento: boolean; umbralRiesgo: number }): Promise<void> {
    await api.put('/tickets/escalamiento-config', payload)
  },

  async getEncuestaConfig(): Promise<{ id: number; area: string; prioridadMinima: TicketPrioridad }[]> {
    const { data } = await api.get('/tickets/encuesta-config')
    return data?.data ?? []
  },

  async actualizarEncuestaConfig(area: string, prioridadMinima: TicketPrioridad): Promise<void> {
    await api.put('/tickets/encuesta-config', { area, prioridadMinima })
  },

  async getFichaUsuario(userId: number): Promise<FichaUsuario> {
    const { data } = await api.get(`/tickets/ficha-usuario/${userId}`)
    return data.data
  },

  async runSlaCronNow(): Promise<void> {
    await api.post('/tickets/sla/run-cron')
  },

  async getReporteSatisfaccion(): Promise<{ id: number; rating: number | null; comentario: string | null; area: string }[]> {
    const { data } = await api.get('/tickets/reportes/tickets-satisfaccion')
    return (data?.data ?? []) as { id: number; rating: number | null; comentario: string | null; area: string }[]
  },

  // Evidencias
  async uploadEvidencia(id: number, file: File): Promise<{ filename: string; url: string; originalname: string }> {
    const fd = new FormData()
    fd.append('evidencia', file)
    const { data } = await api.post(`/tickets/${id}/evidencias`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async deleteEvidencia(id: number, histId: number): Promise<void> {
    await api.delete(`/tickets/${id}/evidencias/${histId}`)
  },

  // API keys (administración, solo AD)
  async getApiKeys(): Promise<{ id: number; nombre: string; activa: boolean; fechaCreacion: string; ultimoUso: string | null }[]> {
    const { data } = await api.get('/tickets/api-keys')
    return (data?.data ?? []) as { id: number; nombre: string; activa: boolean; fechaCreacion: string; ultimoUso: string | null }[]
  },

  async createApiKey(nombre: string): Promise<{ id: number; nombre: string; key: string }> {
    const { data } = await api.post('/tickets/api-keys', { nombre })
    return data.data
  },

  async revokeApiKey(id: number): Promise<void> {
    await api.delete(`/tickets/api-keys/${id}`)
  },
}
