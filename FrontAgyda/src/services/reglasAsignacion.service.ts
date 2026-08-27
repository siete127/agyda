import { api } from '@/lib/axios'
import type {
  ReglaAsignacion, ReglaAsignacionPayload, SimulacionAsignacionInput, SimulacionAsignacionResultado,
} from '@/types/reglasAsignacion.types'

export const reglasAsignacionService = {
  async getReglas(): Promise<ReglaAsignacion[]> {
    const { data } = await api.get('/reglas-asignacion')
    return data?.data ?? []
  },
  async createRegla(payload: ReglaAsignacionPayload): Promise<{ id: number }> {
    const { data } = await api.post('/reglas-asignacion', payload)
    return data.data
  },
  async updateRegla(id: number, payload: ReglaAsignacionPayload): Promise<void> {
    await api.put(`/reglas-asignacion/${id}`, payload)
  },
  async deleteRegla(id: number): Promise<void> {
    await api.delete(`/reglas-asignacion/${id}`)
  },
  async reordenarReglas(ids: number[]): Promise<void> {
    await api.patch('/reglas-asignacion/reordenar', { ids })
  },
  async simularAsignacion(input: SimulacionAsignacionInput): Promise<SimulacionAsignacionResultado> {
    const { data } = await api.post('/reglas-asignacion/simular', input)
    return data.data
  },
}
