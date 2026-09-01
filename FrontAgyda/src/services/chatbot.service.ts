import { api } from '@/lib/axios'
import {
  parseRespuestaChatbot, parseLeadChatbot, parseEtiquetaMenuChatbot,
  type RespuestaChatbot, type LeadChatbot, type EtiquetaMenuChatbot, type TipoEtiquetaMenu,
} from '@/types/chatbot.types'

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

  // ── Etiquetas del menú inicial del widget ──
  async getEtiquetasMenu(): Promise<EtiquetaMenuChatbot[]> {
    const { data } = await api.get('/chatbot/etiquetas-menu')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseEtiquetaMenuChatbot)
  },

  async createEtiquetaMenu(payload: {
    textoEs: string; textoEn?: string | null; tipo: TipoEtiquetaMenu
    campaniaId?: number | null; grupoId?: number | null; orden?: number
  }): Promise<EtiquetaMenuChatbot> {
    const { data } = await api.post('/chatbot/etiquetas-menu', payload)
    return parseEtiquetaMenuChatbot((data?.data ?? data) as Record<string, unknown>)
  },

  async updateEtiquetaMenu(id: number, payload: Partial<{
    textoEs: string; textoEn: string | null; tipo: TipoEtiquetaMenu
    campaniaId: number | null; grupoId: number | null; orden: number; activa: boolean
  }>): Promise<EtiquetaMenuChatbot> {
    const { data } = await api.put(`/chatbot/etiquetas-menu/${id}`, payload)
    return parseEtiquetaMenuChatbot((data?.data ?? data) as Record<string, unknown>)
  },

  async deleteEtiquetaMenu(id: number): Promise<void> {
    await api.delete(`/chatbot/etiquetas-menu/${id}`)
  },
}
