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
  evidenciaUrl: string | null
}

// El contenido se guarda como un solo texto en la base de datos (KB_ARTICULOS
// no tiene columnas separadas para problema/solución), con este formato fijo
// para poder separarlo de nuevo al editar un artículo ya guardado.
const PROBLEMA_PREFIJO = 'Problema:\n'
const SOLUCION_PREFIJO = '\n\nSolución:\n'

export function separarContenidoKb(contenido: string): { problema: string; solucion: string } {
  const idx = contenido.indexOf(SOLUCION_PREFIJO)
  if (contenido.startsWith(PROBLEMA_PREFIJO) && idx !== -1) {
    return {
      problema: contenido.slice(PROBLEMA_PREFIJO.length, idx),
      solucion: contenido.slice(idx + SOLUCION_PREFIJO.length),
    }
  }
  // Artículo previo al cambio (un solo bloque de texto libre): se trata todo como solución.
  return { problema: '', solucion: contenido }
}

export function combinarContenidoKb(problema: string, solucion: string): string {
  return `${PROBLEMA_PREFIJO}${problema.trim()}${SOLUCION_PREFIJO}${solucion.trim()}`
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
    evidenciaUrl: (raw['evidenciaUrl'] as string | null) ?? null,
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

  async create(payload: { titulo: string; contenido: string; categoria?: string; tipo?: KbTipo; evidenciaUrl?: string | null }): Promise<KbArticulo> {
    const { data } = await api.post('/kb/articulos', payload)
    return parseArticulo(data?.data ?? {})
  },

  async update(id: number, payload: { titulo: string; contenido: string; categoria?: string; tipo?: KbTipo; evidenciaUrl?: string | null }): Promise<void> {
    await api.put(`/kb/articulos/${id}`, payload)
  },

  async toggleActivo(id: number): Promise<void> {
    await api.post(`/kb/articulos/${id}/toggle-activo`)
  },

  async togglePublico(id: number): Promise<void> {
    await api.post(`/kb/articulos/${id}/toggle-publico`)
  },

  async uploadImagen(file: File): Promise<{ url: string; filename: string }> {
    const fd = new FormData()
    fd.append('imagen', file)
    const { data } = await api.post('/kb/imagenes', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },
}
