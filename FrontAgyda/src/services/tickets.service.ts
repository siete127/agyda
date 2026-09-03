import { api } from '@/lib/axios'
import { parseTicket, parseTicketComment, type Ticket, type TicketComment, type TicketEstado, type TicketPrioridad, type KpisTickets } from '@/types/ticket.types'
import type { FichaUsuario } from '@/types/fichaUsuario.types'

export const ticketsService = {
  async getAll(filtros?: {
    prioridad?: string
    area?: string
    asignadoA?: number
    fechaDesde?: string
    fechaHasta?: string
    limit?: number
    offset?: number
  }): Promise<Ticket[]> {
    const { data } = await api.get('/tickets', { params: filtros })
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
    elemento?: string
    sede?: string
    departamento?: string
    activoAfectado?: string
    servicioAfectado?: string
    activoAfectadoId?: number
    servicioAfectadoId?: number
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

  async escalar(id: number, nivelDestino?: number, motivo?: string, proveedorId?: number): Promise<{ nivelActual: number; asignadoA: number | null; proveedorNombre: string | null }> {
    const { data } = await api.post(`/tickets/${id}/escalar`, { nivelDestino, motivo, proveedorId })
    return { nivelActual: data?.nivelActual, asignadoA: data?.asignadoA ?? null, proveedorNombre: data?.proveedorNombre ?? null }
  },

  async resolver(id: number, payload: {
    diagnostico: string
    accionesRealizadas: string
    causaRaiz?: string
    codigoCierre?: string
    articuloKbId?: number
    nuevoArticuloKb?: { titulo: string; contenido: string; categoria?: string; tipo?: string }
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

  async getKpisConfig(): Promise<{ umbralSlaBueno: number; umbralReabiertosMalo: number; umbralSatisfaccionBueno: number }> {
    const { data } = await api.get('/tickets/kpis-config')
    return data?.data ?? { umbralSlaBueno: 80, umbralReabiertosMalo: 10, umbralSatisfaccionBueno: 4 }
  },

  async actualizarKpisConfig(payload: { umbralSlaBueno: number; umbralReabiertosMalo: number; umbralSatisfaccionBueno: number }): Promise<void> {
    await api.put('/tickets/kpis-config', payload)
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

  async getRecordatoriosConfig(): Promise<{ activo: boolean; diasSinActividad: number }> {
    const { data } = await api.get('/tickets/recordatorios-config')
    return data?.data ?? { activo: true, diasSinActividad: 3 }
  },

  async actualizarRecordatoriosConfig(payload: { activo: boolean; diasSinActividad: number }): Promise<void> {
    await api.put('/tickets/recordatorios-config', payload)
  },

  async runRecordatoriosCronNow(): Promise<void> {
    await api.post('/tickets/recordatorios/run-cron')
  },

  async exportTicketsCsv(filtros: { from?: string; to?: string; area?: string } = {}): Promise<void> {
    const { data } = await api.get('/tickets/reportes/tickets-satisfaccion.csv', { params: filtros, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([data]))
    const link = document.createElement('a')
    link.href = url
    link.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
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

  async getKpis(): Promise<KpisTickets> {
    const { data } = await api.get('/tickets/reportes/kpis')
    return data?.data as KpisTickets
  },
}
