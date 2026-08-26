import { api } from '@/lib/axios'
import { parseIncapacidad, type Incapacidad, type IncapacidadTipo, type IncapacidadEstado } from '@/types/incapacidad.types'

export const incapacidadesService = {
  async getMisIncapacidades(): Promise<Incapacidad[]> {
    const { data } = await api.get('/incapacidades/mis')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseIncapacidad)
  },

  async getAll(estado?: IncapacidadEstado): Promise<Incapacidad[]> {
    const { data } = await api.get('/incapacidades', { params: estado ? { estado } : {} })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseIncapacidad)
  },

  async crearSolicitud(payload: { tipo: IncapacidadTipo; motivo?: string; fechaInicio: string; fechaFin: string; comprobante: File }): Promise<Incapacidad> {
    const form = new FormData()
    form.append('tipo', payload.tipo)
    if (payload.motivo) form.append('motivo', payload.motivo)
    form.append('fechaInicio', payload.fechaInicio)
    form.append('fechaFin', payload.fechaFin)
    form.append('comprobante', payload.comprobante)
    const { data } = await api.post('/incapacidades', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return parseIncapacidad((data?.data ?? data) as Record<string, unknown>)
  },

  async responder(id: number, estado: 'aprobada' | 'rechazada', comentarioAdmin?: string): Promise<Incapacidad> {
    const { data } = await api.patch(`/incapacidades/${id}/responder`, { estado, comentarioAdmin })
    return parseIncapacidad((data?.data ?? data) as Record<string, unknown>)
  },

  async descargarComprobante(docId: number, nombre: string): Promise<void> {
    const { data } = await api.get(`/incapacidades/documentos/${docId}/download`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([data]))
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}
