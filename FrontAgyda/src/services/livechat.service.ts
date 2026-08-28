import { api } from '@/lib/axios'
import {
  parseLivechatConversacion,
  parseLivechatMensaje,
  parseLivechatMiEstado,
  parseLivechatConfig,
  parseLivechatAgenteTransferible,
  parseLivechatAgenteEstado,
  parseLivechatCampania,
  parseLivechatGrupo,
  parseLivechatGrupoAgente,
  parseLivechatPlantilla,
  parseLivechatMotivoCierre,
  type LivechatConversacion,
  type LivechatMensaje,
  type LivechatMiEstado,
  type LivechatConfig,
  type LivechatAgenteTransferible,
  type LivechatAgenteEstado,
  type LivechatHistorialFiltros,
  type LivechatCampania,
  type LivechatGrupo,
  type LivechatGrupoAgente,
  type LivechatPlantilla,
  type LivechatMotivoCierre,
} from '@/types/livechat.types'

export const livechatService = {
  async getMisConversaciones(estado?: string): Promise<LivechatConversacion[]> {
    const { data } = await api.get('/livechat/mis-conversaciones', { params: estado ? { estado } : undefined })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatConversacion)
  },

  async getConversacion(conversacionId: number): Promise<LivechatConversacion & { mensajes: LivechatMensaje[] }> {
    const { data } = await api.get(`/livechat/conversaciones/${conversacionId}`)
    const raw = (data?.data ?? data) as Record<string, unknown>
    const mensajes = Array.isArray(raw.mensajes) ? (raw.mensajes as Record<string, unknown>[]).map(parseLivechatMensaje) : []
    return { ...parseLivechatConversacion(raw), mensajes }
  },

  // Supervisión: todas las conversaciones activas/en espera de todos los agentes.
  async getConversacionesActivasSupervision(): Promise<LivechatConversacion[]> {
    const { data } = await api.get('/livechat/supervision/conversaciones-activas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatConversacion)
  },

  async enviarMensaje(conversacionId: number, contenido: string): Promise<LivechatMensaje> {
    const { data } = await api.post(`/livechat/conversaciones/${conversacionId}/mensajes`, {
      contenido,
      emisor: 'agente',
    })
    return parseLivechatMensaje((data?.data ?? data) as Record<string, unknown>)
  },

  async tomarConversacion(conversacionId: number): Promise<void> {
    await api.post(`/livechat/conversaciones/${conversacionId}/tomar`)
  },

  // motivoCierreId: obligatorio cuando la conversación pertenece a un grupo
  // (tiene motivos configurados); motivoCierre (texto libre) sigue siendo
  // válido para conversaciones sin campaña, igual que antes de esta migración.
  async cerrarConversacion(conversacionId: number, opts: { motivoCierreId?: number; motivoCierre?: string; comentarioCierre?: string }): Promise<void> {
    await api.post(`/livechat/conversaciones/${conversacionId}/cerrar`, opts)
  },

  async calificarConversacion(conversacionId: number, rating: number, comentario?: string): Promise<void> {
    await api.post(`/livechat/conversaciones/${conversacionId}/calificar`, { rating, comentario })
  },

  async getMiEstado(): Promise<LivechatMiEstado> {
    const { data } = await api.get('/livechat/mi-estado')
    return parseLivechatMiEstado((data?.data ?? data) as Record<string, unknown>)
  },

  async setDisponible(disponible: boolean): Promise<void> {
    await api.post('/livechat/mi-estado', { disponible })
  },

  async getAgentesEstado(): Promise<LivechatAgenteEstado[]> {
    const { data } = await api.get('/livechat/agentes-estado')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatAgenteEstado)
  },

  async getConfig(): Promise<LivechatConfig> {
    const { data } = await api.get('/livechat/config')
    return parseLivechatConfig((data?.data ?? data) as Record<string, unknown>)
  },

  async updateConfig(payload: Partial<Omit<LivechatConfig, 'id'>>): Promise<void> {
    await api.put('/livechat/config', payload)
  },

  async getAgentesTransferibles(conversacionId: number): Promise<LivechatAgenteTransferible[]> {
    const { data } = await api.get(`/livechat/conversaciones/${conversacionId}/agentes-transferibles`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatAgenteTransferible)
  },

  async transferirConversacion(conversacionId: number, nuevoAgenteId: number): Promise<void> {
    await api.post(`/livechat/conversaciones/${conversacionId}/transferir`, { nuevoAgenteId })
  },

  async getHistorial(filtros: LivechatHistorialFiltros = {}): Promise<LivechatConversacion[]> {
    const { data } = await api.get('/livechat/historial', { params: filtros })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatConversacion)
  },

  async exportHistorialCsv(filtros: LivechatHistorialFiltros = {}): Promise<void> {
    const { data } = await api.get('/livechat/historial/export', { params: filtros, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([data]))
    const link = document.createElement('a')
    link.href = url
    link.download = `livechat-historial-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  // ── Campañas ──
  async getCampanias(): Promise<LivechatCampania[]> {
    const { data } = await api.get('/livechat/campanias')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatCampania)
  },
  async createCampania(payload: { nombre: string; descripcion?: string; fechaInicio?: string; fechaFin?: string; maxChatsPorAgente?: number }): Promise<LivechatCampania> {
    const { data } = await api.post('/livechat/campanias', payload)
    return parseLivechatCampania((data?.data ?? data) as Record<string, unknown>)
  },
  async updateCampania(id: number, payload: Partial<{ nombre: string; descripcion: string; activo: boolean; fechaInicio: string; fechaFin: string; maxChatsPorAgente: number }>): Promise<LivechatCampania> {
    const { data } = await api.put(`/livechat/campanias/${id}`, payload)
    return parseLivechatCampania((data?.data ?? data) as Record<string, unknown>)
  },
  async deleteCampania(id: number): Promise<void> {
    await api.delete(`/livechat/campanias/${id}`)
  },

  // ── Grupos ──
  async getGrupos(campaniaId: number): Promise<LivechatGrupo[]> {
    const { data } = await api.get(`/livechat/campanias/${campaniaId}/grupos`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatGrupo)
  },
  async createGrupo(campaniaId: number, payload: { nombre: string; descripcion?: string; icono?: string }): Promise<LivechatGrupo> {
    const { data } = await api.post(`/livechat/campanias/${campaniaId}/grupos`, payload)
    return parseLivechatGrupo((data?.data ?? data) as Record<string, unknown>)
  },
  async updateGrupo(grupoId: number, payload: Partial<{ nombre: string; descripcion: string; icono: string; activo: boolean }>): Promise<LivechatGrupo> {
    const { data } = await api.put(`/livechat/grupos/${grupoId}`, payload)
    return parseLivechatGrupo((data?.data ?? data) as Record<string, unknown>)
  },
  async deleteGrupo(grupoId: number): Promise<void> {
    await api.delete(`/livechat/grupos/${grupoId}`)
  },

  // ── Agentes por grupo ──
  async getAgentesDeGrupo(grupoId: number): Promise<LivechatGrupoAgente[]> {
    const { data } = await api.get(`/livechat/grupos/${grupoId}/agentes`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatGrupoAgente)
  },
  async asignarAgenteAGrupo(grupoId: number, usuarioId: number): Promise<void> {
    await api.post(`/livechat/grupos/${grupoId}/agentes`, { usuarioId })
  },
  async quitarAgenteDeGrupo(grupoId: number, usuarioId: number): Promise<void> {
    await api.delete(`/livechat/grupos/${grupoId}/agentes/${usuarioId}`)
  },

  // ── Plantillas ──
  async getPlantillas(grupoId: number): Promise<LivechatPlantilla[]> {
    const { data } = await api.get(`/livechat/grupos/${grupoId}/plantillas`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatPlantilla)
  },
  async createPlantilla(grupoId: number, payload: { nombre: string; contenido: string; tipo?: string; visibilidad?: 'publica' | 'privada' }): Promise<LivechatPlantilla> {
    const { data } = await api.post(`/livechat/grupos/${grupoId}/plantillas`, payload)
    return parseLivechatPlantilla((data?.data ?? data) as Record<string, unknown>)
  },
  async updatePlantilla(id: number, payload: Partial<{ nombre: string; contenido: string; tipo: string; visibilidad: 'publica' | 'privada'; activo: boolean }>): Promise<LivechatPlantilla> {
    const { data } = await api.put(`/livechat/plantillas/${id}`, payload)
    return parseLivechatPlantilla((data?.data ?? data) as Record<string, unknown>)
  },
  async deletePlantilla(id: number): Promise<void> {
    await api.delete(`/livechat/plantillas/${id}`)
  },

  // ── Motivos de cierre ──
  async getMotivosCierre(grupoId: number): Promise<LivechatMotivoCierre[]> {
    const { data } = await api.get(`/livechat/grupos/${grupoId}/motivos-cierre`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseLivechatMotivoCierre)
  },
  async createMotivoCierre(grupoId: number, payload: { motivo: string; descripcion?: string; requiereComentario?: boolean; orden?: number }): Promise<LivechatMotivoCierre> {
    const { data } = await api.post(`/livechat/grupos/${grupoId}/motivos-cierre`, payload)
    return parseLivechatMotivoCierre((data?.data ?? data) as Record<string, unknown>)
  },
  async updateMotivoCierre(id: number, payload: Partial<{ motivo: string; descripcion: string; requiereComentario: boolean; orden: number; activo: boolean }>): Promise<LivechatMotivoCierre> {
    const { data } = await api.put(`/livechat/motivos-cierre/${id}`, payload)
    return parseLivechatMotivoCierre((data?.data ?? data) as Record<string, unknown>)
  },
  async deleteMotivoCierre(id: number): Promise<void> {
    await api.delete(`/livechat/motivos-cierre/${id}`)
  },
  async reorderMotivosCierre(grupoId: number, orders: { id: number; orden: number }[]): Promise<void> {
    await api.put(`/livechat/grupos/${grupoId}/motivos-cierre/reorder`, { orders })
  },
}
