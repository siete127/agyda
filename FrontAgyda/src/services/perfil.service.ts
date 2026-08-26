import { api } from '@/lib/axios'

export const perfilService = {
  async getPerfil(): Promise<Record<string, unknown>> {
    const { data } = await api.get('/perfil')
    return data
  },

  async updatePerfil(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data } = await api.put('/perfil', payload)
    return data
  },
}
