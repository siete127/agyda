import { publicApi } from '@/lib/axios-public'
import { parseEncuesta, type Encuesta, type ResponderPayload } from '@/types/encuesta.types'

export interface EncuestaPublicaResponderPayload extends ResponderPayload {
  nombre: string
  email: string
}

export const encuestasPublicService = {
  async getBySlug(slug: string): Promise<Encuesta> {
    const { data } = await publicApi.get(`/encuestas/publica/${slug}`)
    return parseEncuesta((data?.data ?? data) as Record<string, unknown>)
  },

  async responder(slug: string, payload: EncuestaPublicaResponderPayload) {
    const { data } = await publicApi.post(`/encuestas/publica/${slug}/responder`, payload)
    return data as { success: boolean; message?: string }
  },
}
