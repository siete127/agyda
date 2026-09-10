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

  // ── Crear / editar / borrar cajas desde el canvas (Camino A) ──
  async createNodo(payload: {
    tipo: 'respuesta' | 'etiqueta' | 'nodo_arbol'
    texto: string; textoEn?: string | null
    keywords?: string[]
    tipoAccion?: string; campaniaId?: number | null
    tipoNodo?: string
    posX: number; posY: number
  }): Promise<{ tipo: string; id: number }> {
    const { data } = await api.post('/chatbot/flujo/nodos', payload)
    return (data?.data ?? data) as { tipo: string; id: number }
  },

  async updateNodo(tipo: 'respuesta' | 'etiqueta' | 'nodo_arbol', id: number, cambios: {
    texto?: string; textoEn?: string | null
    keywords?: string[]
    tipoAccion?: string; campaniaId?: number | null
    tipoNodo?: string; activa?: boolean
  }): Promise<void> {
    await api.patch(`/chatbot/flujo/nodos/${tipo}/${id}`, cambios)
  },

  async deleteNodo(tipo: 'respuesta' | 'etiqueta' | 'nodo_arbol', id: number): Promise<void> {
    await api.delete(`/chatbot/flujo/nodos/${tipo}/${id}`)
  },
}
