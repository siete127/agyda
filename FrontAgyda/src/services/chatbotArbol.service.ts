import { api } from '@/lib/axios'
import type { ChatbotNodo, ChatbotNodoTipo } from '@/types/chatbotArbol.types'

export const chatbotArbolService = {
  async getNodos(): Promise<ChatbotNodo[]> {
    const { data } = await api.get('/chatbot/arbol/nodos')
    return data?.data ?? []
  },
  async createNodo(payload: { codigo: string; texto: string; tipo: ChatbotNodoTipo; categoriaId?: number }): Promise<{ id: number }> {
    const { data } = await api.post('/chatbot/arbol/nodos', payload)
    return data.data
  },
  async updateNodo(id: number, payload: { texto: string; tipo: ChatbotNodoTipo; categoriaId?: number; activo?: boolean }): Promise<void> {
    await api.put(`/chatbot/arbol/nodos/${id}`, payload)
  },
  async deleteNodo(id: number): Promise<void> {
    await api.delete(`/chatbot/arbol/nodos/${id}`)
  },
  async createOpcion(payload: { nodoId: number; texto: string; nodoDestinoId?: number; orden?: number }): Promise<{ id: number }> {
    const { data } = await api.post('/chatbot/arbol/opciones', payload)
    return data.data
  },
  async updateOpcion(id: number, payload: { texto: string; nodoDestinoId?: number; orden?: number }): Promise<void> {
    await api.put(`/chatbot/arbol/opciones/${id}`, payload)
  },
  async deleteOpcion(id: number): Promise<void> {
    await api.delete(`/chatbot/arbol/opciones/${id}`)
  },
}
