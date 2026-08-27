import { api } from '@/lib/axios'

export interface Rol {
  ROL_ID: number
  NOMBRE: string
  DESCRIPCION: string | null
  ROL_BASE: string
  ES_SISTEMA: boolean
  ACTIVO: boolean
  MODULOS_COUNT?: number
}

export interface RolDetalle extends Rol {
  modulos: string[]
  acciones: Record<string, string[]>
}

export interface RolPayload {
  nombre: string
  descripcion?: string
  modulos: string[]
  acciones: Record<string, string[]>
}

export const roleService = {
  async list(): Promise<Rol[]> {
    const { data } = await api.get('/roles')
    return (data?.data ?? []) as Rol[]
  },
  async get(id: number): Promise<RolDetalle> {
    const { data } = await api.get(`/roles/${id}`)
    return data.data as RolDetalle
  },
  async create(payload: RolPayload): Promise<number> {
    const { data } = await api.post('/roles', payload)
    return data?.data?.rolId as number
  },
  async update(id: number, payload: Partial<RolPayload>): Promise<void> {
    await api.put(`/roles/${id}`, payload)
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/roles/${id}`)
  },
  /** Cambia el rol de un usuario existente. reaplicar=true copia los permisos del rol nuevo. */
  async cambiarRolUsuario(usuarioId: number, rolId: number, reaplicarPermisos: boolean): Promise<void> {
    await api.put(`/usuarios/${usuarioId}/rol`, { rolId, reaplicarPermisos })
  },
}
