import { api } from '@/lib/axios'

export interface PlantillaRespuesta {
  id: number
  nombre: string
  contenido: string
  activa: boolean
  fechaCreacion: string
}

function parsePlantilla(raw: Record<string, unknown>): PlantillaRespuesta {
  return {
    id: Number(raw['id'] ?? 0),
    nombre: String(raw['nombre'] ?? ''),
    contenido: String(raw['contenido'] ?? ''),
    activa: Boolean(raw['activa'] ?? true),
    fechaCreacion: String(raw['fechaCreacion'] ?? ''),
  }
}

export const plantillasRespuestaService = {
  async getPlantillas(soloActivas = true): Promise<PlantillaRespuesta[]> {
    const { data } = await api.get('/plantillas-respuesta', { params: { activas: soloActivas } })
    const list: Record<string, unknown>[] = data?.data ?? []
    return list.map(parsePlantilla)
  },

  async create(payload: { nombre: string; contenido: string }): Promise<PlantillaRespuesta> {
    const { data } = await api.post('/plantillas-respuesta', payload)
    return parsePlantilla(data?.data ?? {})
  },

  async update(id: number, payload: { nombre: string; contenido: string }): Promise<void> {
    await api.put(`/plantillas-respuesta/${id}`, payload)
  },

  async toggleActiva(id: number): Promise<void> {
    await api.post(`/plantillas-respuesta/${id}/toggle-activa`)
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/plantillas-respuesta/${id}`)
  },
}
