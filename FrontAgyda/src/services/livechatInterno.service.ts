import { api } from '@/lib/axios'

export interface MensajeLivechat {
  id: number
  conversacionId: number
  emisor: 'visitante' | 'agente' | 'sistema'
  agenteId: number | null
  contenido: string
  archivoUrl: string | null
  fecha: string
  leido: boolean
}

export interface ConversacionInterna {
  id: number
  motivo: string | null
  agenteId: number | null
  agenteNombre: string | null
  estado: 'esperando' | 'activa' | 'pendiente_rating' | 'cerrada'
  ticketId: number | null
}

export const livechatInternoService = {
  async iniciar(motivo: string): Promise<{ conversacionId: number; ticketId: number | null; estado: string; agenteAsignado: boolean }> {
    const { data } = await api.post('/livechat/interno/conversaciones', { motivo })
    return data.data
  },

  async getConversacion(id: number): Promise<{ conversacion: ConversacionInterna; mensajes: MensajeLivechat[] }> {
    const { data } = await api.get(`/livechat/conversaciones/${id}`)
    const raw = data?.data ?? data
    return { conversacion: raw, mensajes: raw?.mensajes ?? [] }
  },

  async enviarMensaje(id: number, contenido: string): Promise<void> {
    await api.post(`/livechat/conversaciones/${id}/mensajes`, { contenido, emisor: 'visitante' })
  },
}
