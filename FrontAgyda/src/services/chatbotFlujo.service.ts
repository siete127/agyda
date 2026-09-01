import { api } from '@/lib/axios'
import { parseFlujoCompleto, type FlujoCompleto, type TipoNodoFlujo } from '@/types/chatbotFlujo.types'

export const chatbotFlujoService = {
  async getFlujo(): Promise<FlujoCompleto> {
    const { data } = await api.get('/chatbot/flujo')
    return parseFlujoCompleto((data?.data ?? data) as Record<string, unknown>)
  },

  async updatePosicion(tipo: Exclude<TipoNodoFlujo, 'campania'>, id: number, posX: number, posY: number): Promise<void> {
    await api.put(`/chatbot/flujo/posicion/${tipo}/${id}`, { posX, posY })
  },

  async createConexion(payload: {
    origenTipo: Exclude<TipoNodoFlujo, 'campania'>; origenId: number
    destinoTipo: TipoNodoFlujo; destinoId: number; etiqueta?: string
  }): Promise<{ id: number }> {
    const { data } = await api.post('/chatbot/flujo/conexiones', payload)
    return (data?.data ?? data) as { id: number }
  },

  async deleteConexion(id: number): Promise<void> {
    await api.delete(`/chatbot/flujo/conexiones/${id}`)
  },
}
