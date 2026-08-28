import { api } from '@/lib/axios'
import type {
  CampoPersonalizado, CampoPersonalizadoPayload, CampoPersonalizadoAplicable, CampoPersonalizadoValor,
} from '@/types/camposPersonalizados.types'

export const camposPersonalizadosService = {
  async getCampos(incluirInactivos = false): Promise<CampoPersonalizado[]> {
    const { data } = await api.get('/campos-personalizados', { params: incluirInactivos ? { incluirInactivos: '1' } : {} })
    return data?.data ?? []
  },
  async createCampo(payload: CampoPersonalizadoPayload): Promise<CampoPersonalizado> {
    const { data } = await api.post('/campos-personalizados', payload)
    return data.data
  },
  async updateCampo(id: number, payload: CampoPersonalizadoPayload): Promise<void> {
    await api.put(`/campos-personalizados/${id}`, payload)
  },
  async toggleCampoActivo(id: number): Promise<void> {
    await api.patch(`/campos-personalizados/${id}/activo`)
  },
  async deleteCampo(id: number): Promise<void> {
    await api.delete(`/campos-personalizados/${id}`)
  },
  async getCamposPorCategoria(catId: number): Promise<CampoPersonalizadoAplicable[]> {
    const { data } = await api.get(`/campos-personalizados/por-categoria/${catId}`)
    return data?.data ?? []
  },
  async getValoresDeTicket(ticketId: number): Promise<CampoPersonalizadoValor[]> {
    const { data } = await api.get(`/campos-personalizados/valores/${ticketId}`)
    return data?.data ?? []
  },
}
