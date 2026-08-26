import { api } from '@/lib/axios'
import type { ErrorDetectado, CrearErrorPayload, ResumenErrores, EstatusError, SeveridadError } from '@/types/deteccionErrores.types'

export const deteccionErroresService = {
  async list(filtros?: { estatus?: EstatusError; severidad?: SeveridadError; agenteId?: number }): Promise<ErrorDetectado[]> {
    const { data } = await api.get('/calidad/errores', { params: filtros })
    return (data?.data ?? []) as ErrorDetectado[]
  },

  async getResumen(): Promise<ResumenErrores> {
    const { data } = await api.get('/calidad/errores/resumen')
    return data?.data as ResumenErrores
  },

  async crear(payload: CrearErrorPayload): Promise<void> {
    await api.post('/calidad/errores', payload)
  },

  async resolver(id: number, notasResolucion?: string): Promise<void> {
    await api.patch(`/calidad/errores/${id}/resolver`, { notasResolucion })
  },

  async eliminar(id: number): Promise<void> {
    await api.delete(`/calidad/errores/${id}`)
  },
}
