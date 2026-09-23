import { api } from '@/lib/axios'
import {
  type Cita, type Tratamiento, type CitaSolicitud,
  type CitaModalidad, type CitaEstatus,
  parseCita, parseTratamiento, parseCitaSolicitud,
} from '@/types/cita.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown })?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export interface NuevaCitaBody {
  contactoId: number
  titulo: string
  modalidad: CitaModalidad
  fechaHora: string
  duracionMin?: number
  motivo?: string
  enlace?: string
  telefono?: string
  asignadoA?: number
  recordarMinAntes?: number[]
  tratamientoId?: number
  numeroSesion?: number
}

export interface NuevoTratamientoBody {
  contactoId: number
  nombre: string
  descripcion?: string
  totalSesiones?: number
  asignadoA?: number
  fechaInicio?: string
}

const B = '/atencion-cliente'

export const citaService = {
  getAll: async (filtros?: { desde?: string; hasta?: string; estatus?: CitaEstatus; asignadoA?: number; contactoId?: number; tratamientoId?: number }): Promise<Cita[]> => {
    const { data } = await api.get(`${B}/citas`, { params: filtros })
    return norm(data?.data ?? data, parseCita)
  },
  getByContacto: async (contactoId: number): Promise<Cita[]> => {
    const { data } = await api.get(`${B}/clientes/${contactoId}/citas`)
    return norm(data?.data ?? data, parseCita)
  },
  getById: async (id: number): Promise<Cita> => {
    const { data } = await api.get(`${B}/citas/${id}`)
    return parseCita(data?.data ?? data)
  },
  create: (body: NuevaCitaBody) => api.post(`${B}/citas`, body).then((r) => r.data),
  update: (id: number, body: Partial<NuevaCitaBody>) => api.patch(`${B}/citas/${id}`, body).then((r) => r.data),
  updateEstatus: (id: number, estatus: CitaEstatus, notaResultado?: string) =>
    api.patch(`${B}/citas/${id}/estatus`, { estatus, notaResultado }).then((r) => r.data),
  cancelar: (id: number, motivo?: string) => api.post(`${B}/citas/${id}/cancelar`, { motivo }).then((r) => r.data),
  remove: (id: number) => api.delete(`${B}/citas/${id}`).then((r) => r.data),

  getTratamientos: async (filtros?: { contactoId?: number; estatus?: string }): Promise<Tratamiento[]> => {
    const { data } = await api.get(`${B}/tratamientos`, { params: filtros })
    return norm(data?.data ?? data, parseTratamiento)
  },
  getTratamiento: async (id: number): Promise<Tratamiento> => {
    const { data } = await api.get(`${B}/tratamientos/${id}`)
    return parseTratamiento(data?.data ?? data)
  },
  createTratamiento: (body: NuevoTratamientoBody) => api.post(`${B}/tratamientos`, body).then((r) => r.data),
  updateTratamiento: (id: number, body: Partial<NuevoTratamientoBody> & { estatus?: string }) =>
    api.patch(`${B}/tratamientos/${id}`, body).then((r) => r.data),
  addSesion: (tratamientoId: number, body: Omit<NuevaCitaBody, 'contactoId'>) =>
    api.post(`${B}/tratamientos/${tratamientoId}/sesiones`, body).then((r) => r.data),

  getSolicitudes: async (): Promise<CitaSolicitud[]> => {
    const { data } = await api.get(`${B}/citas/solicitudes`)
    return norm(data?.data ?? data, parseCitaSolicitud)
  },
  resolverSolicitud: (id: number, accion: 'aprobar' | 'rechazar') =>
    api.patch(`${B}/citas/solicitudes/${id}`, { accion }).then((r) => r.data),
}
