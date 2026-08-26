import { api } from '@/lib/axios'
import { parseRespuestaChatbot, parseLeadChatbot, type RespuestaChatbot, type LeadChatbot } from '@/types/chatbot.types'

export const chatbotService = {
  async getAll(): Promise<RespuestaChatbot[]> {
    const { data } = await api.get('/chatbot/respuestas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseRespuestaChatbot)
  },

  async create(payload: Partial<RespuestaChatbot>): Promise<RespuestaChatbot> {
    const { data } = await api.post('/chatbot/respuestas', payload)
    return parseRespuestaChatbot((data?.data ?? data) as Record<string, unknown>)
  },

  async update(pk: number, payload: Partial<RespuestaChatbot>): Promise<RespuestaChatbot> {
    const { data } = await api.put(`/chatbot/respuestas/${pk}`, payload)
    return parseRespuestaChatbot((data?.data ?? data) as Record<string, unknown>)
  },

  async delete(pk: number): Promise<void> {
    await api.delete(`/chatbot/respuestas/${pk}`)
  },

  async toggleActiva(pk: number, activa: boolean): Promise<void> {
    await api.patch(`/chatbot/respuestas/${pk}/activa`, { activa })
  },

  async getLeads(): Promise<LeadChatbot[]> {
    const { data } = await api.get('/chatbot/leads')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLeadChatbot)
  },
}
