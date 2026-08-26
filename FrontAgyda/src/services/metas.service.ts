import { api } from '@/lib/axios'
import type { MetaOperaciones, CrearMetaPayload } from '@/types/metas.types'

export const metasService = {
  async list(periodo?: string): Promise<MetaOperaciones[]> {
    const { data } = await api.get('/operaciones/metas', { params: periodo ? { periodo } : {} })
    return (data?.data ?? []) as MetaOperaciones[]
  },

  async crear(payload: CrearMetaPayload): Promise<void> {
    await api.post('/operaciones/metas', payload)
  },

  async eliminar(id: number): Promise<void> {
    await api.delete(`/operaciones/metas/${id}`)
  },
}
