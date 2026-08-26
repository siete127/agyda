import { api } from '@/lib/axios'

export type ModuleActions = Record<string, string[]>

export const accessService = {
  async getSelfModules(): Promise<string[]> {
    try {
      const { data } = await api.get('/accesos/self')
      // Backend devuelve { success, data: { usuarioId, modules: string[] } }
      if (Array.isArray(data?.data?.modules)) return data.data.modules as string[]
      if (Array.isArray(data?.data)) return data.data as string[]
      if (Array.isArray(data?.modulos)) return data.modulos as string[]
      if (Array.isArray(data)) return data as string[]
      return []
    } catch {
      return []
    }
  },

  /** Acciones granulares del usuario logueado, agrupadas por módulo: { asistencia: ['ver', 'marcar-vacaciones'], ... } */
  async getSelfActions(): Promise<ModuleActions> {
    try {
      const { data } = await api.get('/accesos/self-actions')
      return (data?.data?.acciones ?? {}) as ModuleActions
    } catch {
      return {}
    }
  },
}
