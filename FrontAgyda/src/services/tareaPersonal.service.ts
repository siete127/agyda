import { api } from '@/lib/axios'
import {
  parseTareaPersonal,
  parseMiTareaCombinada,
  type TareaPersonal,
  type MiTareaCombinada,
  type TareaPersonalPrioridad,
} from '@/types/tareaPersonal.types'

export interface CrearTareaPersonalPayload {
  titulo: string
  descripcion?: string
  asignadoA: number
  prioridad?: TareaPersonalPrioridad
  fechaLimite?: string | null
}

export const tareaPersonalService = {
  /** Tareas personales + de Proyectos asignadas al usuario, para "Mis tareas" del Inicio. */
  async getCombinadas(): Promise<MiTareaCombinada[]> {
    const { data } = await api.get('/tareas-personales/combinadas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseMiTareaCombinada)
  },

  async getMisTareas(): Promise<TareaPersonal[]> {
    const { data } = await api.get('/tareas-personales/mis-tareas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseTareaPersonal)
  },

  /** Solo AD: todas las tareas personales asignadas, para administrarlas. */
  async getAll(): Promise<TareaPersonal[]> {
    const { data } = await api.get('/tareas-personales')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseTareaPersonal)
  },

  async create(payload: CrearTareaPersonalPayload): Promise<TareaPersonal> {
    const { data } = await api.post('/tareas-personales', payload)
    return parseTareaPersonal((data?.data ?? data) as Record<string, unknown>)
  },

  async update(id: number, payload: Partial<CrearTareaPersonalPayload>): Promise<TareaPersonal> {
    const { data } = await api.put(`/tareas-personales/${id}`, payload)
    return parseTareaPersonal((data?.data ?? data) as Record<string, unknown>)
  },

  async completar(id: number, completada = true): Promise<TareaPersonal> {
    const { data } = await api.post(`/tareas-personales/${id}/completar`, { completada })
    return parseTareaPersonal((data?.data ?? data) as Record<string, unknown>)
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/tareas-personales/${id}`)
  },
}
