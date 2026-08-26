import { api } from '@/lib/axios'

export interface AsistenciaReporte {
  id: number
  fechaCreacion: string
}

export interface AsistenciaActa {
  id: number
  usuarioId: number
  nombre: string
  anio: number
  mes: number
  totalRetardos: number
  fechaCreacion: string
  reconocida?: boolean
}

export interface ActaPendiente {
  id: number
  anio: number
  mes: number
  totalRetardos: number
  fechaCreacion: string
}

async function blobUrl(path: string): Promise<string> {
  const { data } = await api.get(path, { responseType: 'blob' })
  return URL.createObjectURL(data as Blob)
}

export const asistenciaReporteService = {
  async crear(asistenciaId: number): Promise<AsistenciaReporte> {
    const { data } = await api.post(`/asistencia/${asistenciaId}/reporte`)
    return data.data
  },

  async getPorAsistencia(asistenciaId: number): Promise<AsistenciaReporte | null> {
    const { data } = await api.get(`/asistencia/${asistenciaId}/reporte`)
    return data.data ?? null
  },

  /** Descarga el PDF como blob y devuelve una URL local para abrir/imprimir */
  async obtenerPdfUrl(reporteId: number): Promise<string> {
    return blobUrl(`/asistencia/reporte/${reporteId}/pdf`)
  },

  async listarActas(): Promise<AsistenciaActa[]> {
    const { data } = await api.get('/asistencia/actas')
    return Array.isArray(data) ? data : (data?.data ?? [])
  },

  async obtenerActaPdfUrl(actaId: number): Promise<string> {
    return blobUrl(`/asistencia/acta/${actaId}/pdf`)
  },

  async getActaPendiente(): Promise<ActaPendiente | null> {
    const { data } = await api.get('/asistencia/acta/pendiente')
    return data.data ?? null
  },

  async reconocerActa(actaId: number): Promise<void> {
    await api.post(`/asistencia/acta/${actaId}/reconocer`)
  },

  /** Marca (o actualiza) un día como Vacaciones para un usuario. Solo AD/TI. */
  async marcarVacaciones(usuarioId: number, fecha: string): Promise<{ id: number }> {
    const { data } = await api.post('/asistencia/excepciones', { usuarioId, fecha, tipo: 'VACACIONES' })
    return { id: data.id }
  },

  /** Quita la marca de Vacaciones de un registro. Solo AD/TI. */
  async quitarExcepcion(excepcionId: number): Promise<void> {
    await api.delete(`/asistencia/excepciones/${excepcionId}`)
  },
}
