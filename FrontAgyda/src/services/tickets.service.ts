import { api } from '@/lib/axios'
import { parseTicket, parseTicketComment, type Ticket, type TicketComment, type TicketEstado } from '@/types/ticket.types'

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
    prioridad: string
    area: string
    asignadoA?: number
  }): Promise<Ticket> {
    const { data } = await api.post('/tickets', payload)
    return parseTicket((data?.ticket ?? data) as Record<string, unknown>)
  },

  async cambiarEstado(id: number, estado: TicketEstado): Promise<void> {
    await api.post(`/tickets/${id}/estado`, { estado })
  },

  async transferir(id: number, usuarioId: number): Promise<void> {
    await api.post(`/tickets/${id}/transferir`, { usuarioId })
  },

  async registrarSatisfaccion(id: number, rating: number, comentario?: string): Promise<void> {
    await api.post(`/tickets/${id}/satisfaccion`, { rating, comentario })
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

  async getStaffTI(): Promise<{ usuarioId: number; nombre: string; area: string; disponible: boolean }[]> {
    const { data } = await api.get('/tickets/ti/staff')
    const list: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.data ?? [])
    return list.map((s) => ({
      usuarioId: Number(s['usuarioId'] ?? s['userId'] ?? s['NEUS_ID'] ?? 0),
      nombre:    String(s['nombre']    ?? s['NEUS_NOMBRES'] ?? ''),
      area:      String(s['area']      ?? s['AREA'] ?? 'TI'),
      disponible: Boolean(s['disponible'] ?? s['DISPONIBLE'] ?? true),
    }))
  },
}
