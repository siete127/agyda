import { api } from '@/lib/axios'
import {
  parseEmailPlantilla,
  parseEmailCampania,
  parseEmailEnvio,
  type EmailPlantilla,
  type EmailCampania,
  type EmailEnvio,
  type EmailReporte,
  type EmailCampaniaFiltro,
} from '@/types/emailMarketing.types'

export const emailMarketingService = {
  // ── Plantillas ──
  async getPlantillas(): Promise<EmailPlantilla[]> {
    const { data } = await api.get('/email-marketing/plantillas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseEmailPlantilla)
  },
  async createPlantilla(payload: { nombre: string; asunto: string; cuerpoHtml: string; cuerpoTexto?: string }): Promise<EmailPlantilla> {
    const { data } = await api.post('/email-marketing/plantillas', payload)
    return parseEmailPlantilla((data?.data ?? data) as Record<string, unknown>)
  },
  async updatePlantilla(id: number, payload: Partial<{ nombre: string; asunto: string; cuerpoHtml: string; cuerpoTexto: string; activo: boolean }>): Promise<EmailPlantilla> {
    const { data } = await api.put(`/email-marketing/plantillas/${id}`, payload)
    return parseEmailPlantilla((data?.data ?? data) as Record<string, unknown>)
  },
  async deletePlantilla(id: number): Promise<void> {
    await api.delete(`/email-marketing/plantillas/${id}`)
  },
  async previewPlantilla(cuerpoHtml: string, asunto: string): Promise<{ asunto: string; html: string }> {
    const { data } = await api.post('/email-marketing/plantillas/preview', { cuerpoHtml, asunto })
    return (data?.data ?? data) as { asunto: string; html: string }
  },

  // ── Campañas ──
  async getCampanias(): Promise<EmailCampania[]> {
    const { data } = await api.get('/email-marketing/campanias')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseEmailCampania)
  },
  async getCampania(id: number): Promise<EmailCampania> {
    const { data } = await api.get(`/email-marketing/campanias/${id}`)
    return parseEmailCampania((data?.data ?? data) as Record<string, unknown>)
  },
  async createCampania(payload: {
    nombre: string; plantillaId: number; filtro: EmailCampaniaFiltro;
    filtroTag?: string; contactosIds?: number[]; emailsPorHora?: number;
  }): Promise<EmailCampania> {
    const { data } = await api.post('/email-marketing/campanias', payload)
    return parseEmailCampania((data?.data ?? data) as Record<string, unknown>)
  },
  async contarDestinatarios(payload: { filtro: EmailCampaniaFiltro; filtroTag?: string; contactosIds?: number[] }): Promise<number> {
    const { data } = await api.post('/email-marketing/campanias/contar-destinatarios', payload)
    return Number((data?.data ?? data)?.total ?? 0)
  },
  async iniciarCampania(id: number): Promise<{ destinatarios: number }> {
    const { data } = await api.post(`/email-marketing/campanias/${id}/iniciar`)
    return (data?.data ?? { destinatarios: 0 }) as { destinatarios: number }
  },
  async pausarCampania(id: number): Promise<void> {
    await api.post(`/email-marketing/campanias/${id}/pausar`)
  },
  async reanudarCampania(id: number): Promise<void> {
    await api.post(`/email-marketing/campanias/${id}/reanudar`)
  },
  async cancelarCampania(id: number): Promise<void> {
    await api.post(`/email-marketing/campanias/${id}/cancelar`)
  },
  async getEnvios(id: number): Promise<EmailEnvio[]> {
    const { data } = await api.get(`/email-marketing/campanias/${id}/envios`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseEmailEnvio)
  },
  async getReporte(id: number): Promise<EmailReporte> {
    const { data } = await api.get(`/email-marketing/campanias/${id}/reporte`)
    return (data?.data ?? data) as EmailReporte
  },
}
