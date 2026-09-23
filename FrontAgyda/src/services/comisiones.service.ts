import { api } from '@/lib/axios'
import type { KpisComisiones, ReglaComision, CrearReglaComisionPayload, ActualizarReglaComisionPayload } from '@/types/comisiones.types'

export const comisionesService = {
  async get(periodo: string): Promise<KpisComisiones> {
    const { data } = await api.get('/ventas-area/comisiones', { params: { periodo } })
    return data?.data as KpisComisiones
  },

  async listReglas(): Promise<ReglaComision[]> {
    const { data } = await api.get('/ventas-area/comisiones/reglas')
    return (data?.data ?? []) as ReglaComision[]
  },

  async crearRegla(payload: CrearReglaComisionPayload): Promise<void> {
    await api.post('/ventas-area/comisiones/reglas', payload)
  },

  async actualizarRegla(id: number, payload: ActualizarReglaComisionPayload): Promise<void> {
    await api.patch(`/ventas-area/comisiones/reglas/${id}`, payload)
  },

  async eliminarRegla(id: number): Promise<void> {
    await api.delete(`/ventas-area/comisiones/reglas/${id}`)
  },

  async probarFormula(formula: string, valores: { ventas: number; meta: number; pctCumplimiento: number }): Promise<number> {
    const { data } = await api.post('/ventas-area/comisiones/reglas/probar', { formula, ...valores })
    return data?.data?.resultado as number
  },
}
