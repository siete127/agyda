import { api } from '@/lib/axios'

export interface DiaHorarioAsesor {
  diaSemana: number // 1=Lunes ... 7=Domingo
  horaInicio: string // 'HH:mm'
  horaFin: string
  comidaInicio: string | null
  comidaFin: string | null
  activo?: boolean
}

export interface PropuestaHorario {
  id: number
  usuarioId: number
  usuarioNombre?: string
  dias: DiaHorarioAsesor[]
  estatus: 'pendiente' | 'aprobada' | 'rechazada'
  comentario: string | null
  enviadaEn: string
  resueltaEn: string | null
}

export interface DisponibilidadDia {
  fecha: string // 'YYYY-MM-DD'
  slots: string[] // ['09:00', '09:30', ...]
}

export const horarioAsesorService = {
  async getHorario(usuarioId: number): Promise<DiaHorarioAsesor[]> {
    const { data } = await api.get(`/horario-asesor/${usuarioId}`)
    return (data?.data ?? []) as DiaHorarioAsesor[]
  },
  async getMiPropuestaPendiente(usuarioId: number): Promise<PropuestaHorario | null> {
    const { data } = await api.get(`/horario-asesor/${usuarioId}/propuesta`)
    return data?.data ?? null
  },
  async proponerHorario(usuarioId: number, dias: DiaHorarioAsesor[]): Promise<void> {
    await api.post(`/horario-asesor/${usuarioId}/proponer`, { dias })
  },
  async listarPropuestasPendientes(): Promise<PropuestaHorario[]> {
    const { data } = await api.get('/horario-asesor/propuestas/pendientes')
    return (data?.data ?? []) as PropuestaHorario[]
  },
  async resolverPropuesta(propuestaId: number, accion: 'aprobar' | 'rechazar', dias?: DiaHorarioAsesor[], comentario?: string): Promise<void> {
    await api.post(`/horario-asesor/propuestas/${propuestaId}/resolver`, { accion, dias, comentario })
  },
  async getDisponibilidadAsesor(): Promise<{ asesorId: number | null; dias: DisponibilidadDia[] }> {
    const { data } = await api.get('/portal-cliente/disponibilidad-asesor')
    return data?.data ?? { asesorId: null, dias: [] }
  },
}
