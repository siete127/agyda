import { api } from '@/lib/axios'
import { parseProyecto, parseTarea, joinAsignados, type Proyecto, type Tarea, type MiembroProyecto, type TareaEstado, type EstatusProyecto } from '@/types/proyecto.types'

/** Traduce { asignados: string[] } del modelo de UI a { asignadoA: string } que espera el backend */
function toTareaBody(payload: Partial<Tarea>): Record<string, unknown> {
  const { asignados, ...rest } = payload
  return asignados !== undefined ? { ...rest, asignadoA: joinAsignados(asignados) } : rest
}

export type ProyectosFilter = { usuarioId: number; tipoUsuario: string; usuario: string }

export const proyectosService = {
  async getAll(filter?: ProyectosFilter): Promise<Proyecto[]> {
    const params: Record<string, string | number> = {}
    if (filter) {
      params['usuarioId'] = filter.usuarioId
      params['tipoUsuario'] = filter.tipoUsuario
      params['usuario'] = filter.usuario
    }
    const { data } = await api.get('/proyectos', { params })
    const list = Array.isArray(data) ? data : (data?.data ?? data?.proyectos ?? [])
    return (list as Record<string, unknown>[]).map(parseProyecto)
  },

  async getConfigAD(): Promise<boolean> {
    const { data } = await api.get('/proyectos/config/ad-ve-todos')
    return Boolean(data?.adVeTodos)
  },

  async setConfigAD(adVeTodos: boolean): Promise<void> {
    await api.put('/proyectos/config/ad-ve-todos', { adVeTodos })
  },

  async getById(id: number): Promise<Proyecto> {
    const { data } = await api.get(`/proyectos/${id}`)
    const raw = data?.proyecto ?? data?.data ?? data
    return parseProyecto(raw as Record<string, unknown>)
  },

  async create(payload: Partial<Proyecto>): Promise<Proyecto> {
    const { data } = await api.post('/proyectos', payload)
    return parseProyecto((data?.proyecto ?? data) as Record<string, unknown>)
  },

  async update(id: number, payload: Partial<Proyecto>): Promise<Proyecto> {
    const { data } = await api.put(`/proyectos/${id}`, payload)
    return parseProyecto((data?.proyecto ?? data) as Record<string, unknown>)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/proyectos/${id}`)
  },

  // Tareas (Kanban)
  async getTareas(proyectoId: number): Promise<Tarea[]> {
    const { data } = await api.get(`/proyectos/${proyectoId}/tareas`)
    const list = Array.isArray(data) ? data : (data?.data ?? data?.tareas ?? [])
    return (list as Record<string, unknown>[]).map((r) => parseTarea({ ...r, proyectoId }))
  },

  async createTarea(proyectoId: number, payload: Partial<Tarea>): Promise<Tarea> {
    const { data } = await api.post(`/proyectos/${proyectoId}/tareas`, toTareaBody(payload))
    return parseTarea({ ...((data?.tarea ?? data) as Record<string, unknown>), proyectoId })
  },

  async updateTarea(proyectoId: number, tareaId: number, payload: Partial<Tarea>): Promise<Tarea> {
    const { data } = await api.put(`/proyectos/${proyectoId}/tareas/${tareaId}`, toTareaBody(payload))
    return parseTarea({ ...((data?.tarea ?? data) as Record<string, unknown>), proyectoId })
  },

  async deleteTarea(proyectoId: number, tareaId: number): Promise<void> {
    await api.delete(`/proyectos/${proyectoId}/tareas/${tareaId}`)
  },

  async cambiarEstadoTarea(proyectoId: number, tareaId: number, estado: TareaEstado): Promise<void> {
    await api.put(`/proyectos/${proyectoId}/tareas/${tareaId}`, { estado })
  },

  async completarTarea(proyectoId: number, tareaId: number): Promise<void> {
    await api.post(`/proyectos/${proyectoId}/tareas/${tareaId}/completar`)
  },

  // Miembros
  async getMiembros(proyectoId: number): Promise<MiembroProyecto[]> {
    const { data } = await api.get(`/proyectos/${proyectoId}/miembros`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map((r) => ({
      id: Number(r['id'] ?? 0),
      proyectoId,
      usuarioId: Number(r['usuarioId'] ?? r['USUARIO_ID'] ?? 0),
      nombre: String(r['nombre'] ?? r['NOMBRE'] ?? r['name'] ?? ''),
      rol: String(r['rol'] ?? r['ROL'] ?? r['role'] ?? 'miembro'),
    }))
  },

  async addMiembro(proyectoId: number, nombre: string, rol: string): Promise<MiembroProyecto> {
    const { data } = await api.post(`/proyectos/${proyectoId}/miembros`, { nombre, rol })
    const r = data?.data ?? data
    return {
      id: Number(r['id'] ?? 0),
      proyectoId,
      usuarioId: 0,
      nombre: String(r['nombre'] ?? nombre),
      rol: String(r['rol'] ?? rol),
    }
  },

  async deleteMiembro(proyectoId: number, miembroId: number): Promise<void> {
    await api.delete(`/proyectos/${proyectoId}/miembros/${miembroId}`)
  },

  // Estatus dinámicos por proyecto
  async getEstatus(proyectoId: number): Promise<EstatusProyecto[]> {
    const { data } = await api.get(`/proyectos/${proyectoId}/estatus`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map((r) => ({
      id: Number(r['id'] ?? 0),
      nombre: String(r['nombre'] ?? ''),
      color: String(r['color'] ?? '#6B7280'),
      orden: Number(r['orden'] ?? 0),
    }))
  },

  async createEstatus(proyectoId: number, nombre: string, color: string): Promise<EstatusProyecto> {
    const { data } = await api.post(`/proyectos/${proyectoId}/estatus`, { nombre, color })
    const r = data?.data ?? data
    return { id: Number(r['id'] ?? 0), nombre, color, orden: Number(r['orden'] ?? 0) }
  },

  async updateEstatus(proyectoId: number, estatusId: number, payload: Partial<EstatusProyecto>): Promise<void> {
    await api.put(`/proyectos/${proyectoId}/estatus/${estatusId}`, payload)
  },

  async deleteEstatus(proyectoId: number, estatusId: number): Promise<void> {
    await api.delete(`/proyectos/${proyectoId}/estatus/${estatusId}`)
  },
}
