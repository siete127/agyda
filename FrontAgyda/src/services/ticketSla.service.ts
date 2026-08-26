import { api } from '@/lib/axios'
import type { ReglaSla, CrearReglaSlaPayload, ActualizarReglaSlaPayload, ReporteSla } from '@/types/ticketSla.types'

export const ticketSlaService = {
  async listReglas(): Promise<ReglaSla[]> {
    const { data } = await api.get('/tickets/sla/reglas')
    return (data?.data ?? []) as ReglaSla[]
  },

  async crearRegla(payload: CrearReglaSlaPayload): Promise<void> {
    await api.post('/tickets/sla/reglas', payload)
  },

  async actualizarRegla(id: number, payload: ActualizarReglaSlaPayload): Promise<void> {
    await api.patch(`/tickets/sla/reglas/${id}`, payload)
  },

  async eliminarRegla(id: number): Promise<void> {
    await api.delete(`/tickets/sla/reglas/${id}`)
  },

  async getReporte(): Promise<ReporteSla> {
    const { data } = await api.get('/tickets/sla/reporte')
    return data?.data as ReporteSla
  },
}
