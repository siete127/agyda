import { api } from '@/lib/axios'

export type KbTipo = 'articulo' | 'faq'

export const KB_TIPO_LABELS: Record<KbTipo, string> = {
  articulo: 'Artículo',
  faq: 'FAQ',
}

export interface KbArticulo {
  id: number
  titulo: string
  contenido: string
  categoria: string | null
  tipo: KbTipo
  autorNombre: string | null
  fechaCreacion: string
  fechaActualizacion: string | null
  publico: boolean
}

function parseArticulo(raw: Record<string, unknown>): KbArticulo {
  return {
    id: Number(raw['id'] ?? 0),
    titulo: String(raw['titulo'] ?? ''),
    contenido: String(raw['contenido'] ?? ''),
    categoria: (raw['categoria'] as string | null) ?? null,
    tipo: (raw['tipo'] as KbTipo) ?? 'articulo',
    autorNombre: (raw['autorNombre'] as string | null) ?? null,
    fechaCreacion: String(raw['fechaCreacion'] ?? ''),
    fechaActualizacion: (raw['fechaActualizacion'] as string | null) ?? null,
    publico: raw['publico'] === undefined ? true : Boolean(raw['publico']),
  }
}

export const kbService = {
  async getArticulos(params?: { q?: string; categoria?: string; tipo?: KbTipo }): Promise<KbArticulo[]> {
    const { data } = await api.get('/kb/articulos', { params })
    const list: Record<string, unknown>[] = data?.data ?? []
    return list.map(parseArticulo)
  },

  async getById(id: number): Promise<KbArticulo> {
    const { data } = await api.get(`/kb/articulos/${id}`)
    return parseArticulo(data?.data ?? {})
  },

  async create(payload: { titulo: string; contenido: string; categoria?: string; tipo?: KbTipo }): Promise<KbArticulo> {
    const { data } = await api.post('/kb/articulos', payload)
    return parseArticulo(data?.data ?? {})
  },

  async update(id: number, payload: { titulo: string; contenido: string; categoria?: string; tipo?: KbTipo }): Promise<void> {
    await api.put(`/kb/articulos/${id}`, payload)
  },

  async toggleActivo(id: number): Promise<void> {
    await api.post(`/kb/articulos/${id}/toggle-activo`)
  },

  async togglePublico(id: number): Promise<void> {
    await api.post(`/kb/articulos/${id}/toggle-publico`)
  },
}
