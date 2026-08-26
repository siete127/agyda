import { api } from '@/lib/axios'
import type { Presupuesto, GuardarPresupuestoPayload } from '@/types/presupuestos.types'

export const presupuestosService = {
  async list(periodo?: string): Promise<Presupuesto[]> {
    const { data } = await api.get('/finanzas/presupuestos', { params: periodo ? { periodo } : {} })
    return (data?.data ?? []) as Presupuesto[]
  },

  async guardar(payload: GuardarPresupuestoPayload): Promise<void> {
    await api.post('/finanzas/presupuestos', payload)
  },

  async eliminar(id: number): Promise<void> {
    await api.delete(`/finanzas/presupuestos/${id}`)
  },
}
