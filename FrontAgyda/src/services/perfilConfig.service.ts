import { api } from '@/lib/axios'

export interface Perfil {
  PERFIL_ID: number
  NOMBRE: string
  DESCRIPCION: string | null
  ROL_ID: number | null
  ROL_NOMBRE: string | null
  ROL_BASE: string | null
  PUESTO: string | null
  DEPARTAMENTO: string | null
  ID_HORARIO: number | null
  ACTIVO: boolean
}

export interface PerfilPayload {
  nombre: string
  descripcion?: string
  rolId?: number | null
  puesto?: string
  departamento?: string
  idHorario?: number | null
}

export interface Horario {
  id: number
  rol: string
  nombreArea: string
  horaEntrada: string
  horaSalida: string
}

export const perfilConfigService = {
  async list(): Promise<Perfil[]> {
    const { data } = await api.get('/perfiles')
    return (data?.data ?? []) as Perfil[]
  },
  async get(id: number): Promise<Perfil> {
    const { data } = await api.get(`/perfiles/${id}`)
    return data.data as Perfil
  },
  async create(payload: PerfilPayload): Promise<number> {
    const { data } = await api.post('/perfiles', payload)
    return data?.data?.perfilId as number
  },
  async update(id: number, payload: PerfilPayload): Promise<void> {
    await api.put(`/perfiles/${id}`, payload)
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/perfiles/${id}`)
  },
  async horarios(): Promise<Horario[]> {
    try {
      const { data } = await api.get('/asistencia/horarios')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return list as Horario[]
    } catch {
      return []
    }
  },
}
