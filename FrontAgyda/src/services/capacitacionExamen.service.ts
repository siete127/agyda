import { api } from '@/lib/axios'
import { publicApi } from '@/lib/axios-public'
import {
  parseExamen, parseExamenDetalle, parseExamenIntento,
  type Examen, type ExamenDetalle, type ExamenIntento, type ExamenResultado,
  type PreguntaExamenTipo, type RespuestaExamenItem, type TipoAccesoExamen,
} from '@/types/capacitacionExamen.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown })?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export interface PreguntaExamenDraft {
  texto: string
  tipo: PreguntaExamenTipo
  puntos: number
  opciones: { texto: string; esCorrecta: boolean }[]
}

export const capacitacionExamenService = {
  listByCurso: async (cursoId: number): Promise<Examen[]> => {
    const { data } = await api.get(`/capacitacion/cursos/${cursoId}/examenes`)
    return norm(data?.data ?? data, parseExamen)
  },
  getById: async (id: number): Promise<ExamenDetalle> => {
    const { data } = await api.get(`/capacitacion/examenes/${id}`)
    return parseExamenDetalle((data?.data ?? data) as Record<string, unknown>)
  },
  create: (cursoId: number, payload: { titulo: string; descripcion?: string; tipoAcceso: TipoAccesoExamen; puntajeMinimo: number; preguntas: PreguntaExamenDraft[] }) =>
    api.post(`/capacitacion/cursos/${cursoId}/examenes`, payload).then((r) => r.data?.data as { id: number; slugPublico: string | null }),
  delete: (id: number) => api.delete(`/capacitacion/examenes/${id}`),
  responder: async (id: number, respuestas: RespuestaExamenItem[]): Promise<ExamenResultado> => {
    const { data } = await api.post(`/capacitacion/examenes/${id}/responder`, { respuestas })
    return data?.data as ExamenResultado
  },
  listIntentos: async (id: number): Promise<ExamenIntento[]> => {
    const { data } = await api.get(`/capacitacion/examenes/${id}/intentos`)
    return norm(data?.data ?? data, parseExamenIntento)
  },
  descargarPdf: async (id: number, titulo: string): Promise<void> => {
    const { data } = await api.get(`/capacitacion/examenes/${id}/pdf`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `Examen - ${titulo}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}

export const capacitacionExamenPublicService = {
  getBySlug: async (slug: string): Promise<ExamenDetalle> => {
    const { data } = await publicApi.get(`/capacitacion/examenes/publico/${slug}`)
    return parseExamenDetalle((data?.data ?? data) as Record<string, unknown>)
  },
  responder: async (slug: string, payload: { nombre: string; email: string; respuestas: RespuestaExamenItem[] }): Promise<ExamenResultado> => {
    const { data } = await publicApi.post(`/capacitacion/examenes/publico/${slug}/responder`, payload)
    return data?.data as ExamenResultado
  },
}
