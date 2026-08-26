import { api } from '@/lib/axios'
import type { RespaldoConfig, RespaldoRegistro } from '@/types/respaldos.types'

export const respaldosService = {
  async getConfig(): Promise<RespaldoConfig[]> {
    const { data } = await api.get('/tecnologia/respaldos/config')
    return (data?.data ?? []) as RespaldoConfig[]
  },

  async crearConfig(payload: { nombre: string; descripcion?: string; periodicidadDias: number }): Promise<{ id: number }> {
    const { data } = await api.post('/tecnologia/respaldos/config', payload)
    return data?.data
  },

  async actualizarConfig(id: number, payload: { nombre: string; descripcion?: string; periodicidadDias: number; activo?: boolean }): Promise<void> {
    await api.put(`/tecnologia/respaldos/config/${id}`, payload)
  },

  async eliminarConfig(id: number): Promise<void> {
    await api.delete(`/tecnologia/respaldos/config/${id}`)
  },

  async getRegistros(configId?: number): Promise<RespaldoRegistro[]> {
    const { data } = await api.get('/tecnologia/respaldos/registros', { params: configId ? { configId } : {} })
    return (data?.data ?? []) as RespaldoRegistro[]
  },

  async registrar(payload: { configId: number; exito: boolean; notas?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/tecnologia/respaldos/registros', payload)
    return data?.data
  },
}
