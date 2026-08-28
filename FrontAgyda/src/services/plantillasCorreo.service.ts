import { api } from '@/lib/axios'

export interface PlantillaCorreo {
  id: number
  nombre: string
  asunto: string | null
  contenido: string
  activa: boolean
  fechaCreacion: string
}

function parsePlantilla(raw: Record<string, unknown>): PlantillaCorreo {
  return {
    id: Number(raw['id'] ?? 0),
    nombre: String(raw['nombre'] ?? ''),
    asunto: (raw['asunto'] as string | null) ?? null,
    contenido: String(raw['contenido'] ?? ''),
    activa: Boolean(raw['activa'] ?? true),
    fechaCreacion: String(raw['fechaCreacion'] ?? ''),
  }
}

export const plantillasCorreoService = {
  async getPlantillas(soloActivas = true): Promise<PlantillaCorreo[]> {
    const { data } = await api.get('/plantillas-correo', { params: { activas: soloActivas } })
    const list: Record<string, unknown>[] = data?.data ?? []
    return list.map(parsePlantilla)
  },

  async create(payload: { nombre: string; asunto?: string; contenido: string }): Promise<PlantillaCorreo> {
    const { data } = await api.post('/plantillas-correo', payload)
    return parsePlantilla(data?.data ?? {})
  },

  async update(id: number, payload: { nombre: string; asunto?: string; contenido: string }): Promise<void> {
    await api.put(`/plantillas-correo/${id}`, payload)
  },

  async toggleActiva(id: number): Promise<void> {
    await api.post(`/plantillas-correo/${id}/toggle-activa`)
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/plantillas-correo/${id}`)
  },
}
