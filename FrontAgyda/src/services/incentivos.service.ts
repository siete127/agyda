import { api } from '@/lib/axios'
import type { ReglaIncentivo, CrearReglaIncentivoPayload, ActualizarReglaIncentivoPayload, KpisIncentivos } from '@/types/incentivos.types'

export const incentivosService = {
  async listReglas(): Promise<ReglaIncentivo[]> {
    const { data } = await api.get('/ventas-area/incentivos/reglas')
    return (data?.data ?? []) as ReglaIncentivo[]
  },

  async crearRegla(payload: CrearReglaIncentivoPayload): Promise<void> {
    await api.post('/ventas-area/incentivos/reglas', payload)
  },

  async actualizarRegla(id: number, payload: ActualizarReglaIncentivoPayload): Promise<void> {
    await api.patch(`/ventas-area/incentivos/reglas/${id}`, payload)
  },

  async eliminarRegla(id: number): Promise<void> {
    await api.delete(`/ventas-area/incentivos/reglas/${id}`)
  },

  async probarFormula(formula: string, valores: { ventas: number; meta: number; pctCumplimiento: number; montoComision: number }): Promise<number> {
    const { data } = await api.post('/ventas-area/incentivos/reglas/probar', { formula, ...valores })
    return data?.data?.resultado as number
  },

  async get(periodo: string): Promise<KpisIncentivos> {
    const { data } = await api.get('/ventas-area/incentivos', { params: { periodo } })
    return data?.data as KpisIncentivos
  },
}
