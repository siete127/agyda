import { api } from '@/lib/axios'
import type { Tecnico, ActualizarPerfilTecnicoPayload } from '@/types/tecnico.types'

export const tecnicosService = {
  async getTecnicos(): Promise<Tecnico[]> {
    const { data } = await api.get('/tecnicos')
    return data?.data ?? []
  },
  async getTecnicoById(userId: number): Promise<Tecnico> {
    const { data } = await api.get(`/tecnicos/${userId}`)
    return data.data
  },
  async actualizarPerfilTecnico(userId: number, payload: ActualizarPerfilTecnicoPayload): Promise<void> {
    await api.put(`/tecnicos/${userId}`, payload)
  },
}
