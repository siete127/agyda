import { api } from '@/lib/axios'
import { parseNoticia, type Noticia, type NoticiaComentario, type ReaccionTipo } from '@/types/noticia.types'

export const noticiasService = {
  async getAll(): Promise<Noticia[]> {
    const { data } = await api.get('/noticias')
    const list = Array.isArray(data) ? data : (data?.data ?? data?.noticias ?? [])
    return (list as Record<string, unknown>[]).map(parseNoticia)
  },

  async getDestacadas(): Promise<Noticia[]> {
    const { data } = await api.get('/noticias/destacadas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseNoticia)
  },

  async getById(id: number): Promise<Noticia> {
    const { data } = await api.get(`/noticias/${id}`)
    const raw = data?.noticia ?? data?.data ?? data
    return parseNoticia(raw as Record<string, unknown>)
  },

  async create(payload: Partial<Noticia>): Promise<Noticia> {
    const { data } = await api.post('/noticias', payload)
    return parseNoticia((data?.noticia ?? data) as Record<string, unknown>)
  },

  async update(id: number, payload: Partial<Noticia>): Promise<Noticia> {
    const { data } = await api.put(`/noticias/${id}`, payload)
    return parseNoticia((data?.noticia ?? data) as Record<string, unknown>)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/noticias/${id}`)
  },

  async toggleActivo(id: number): Promise<void> {
    await api.patch(`/noticias/${id}/activo`)
  },

  async toggleDestacada(id: number, destacada: boolean): Promise<void> {
    await api.patch(`/noticias/${id}/destacada`, { destacada })
  },

  // Reacciones
  async setReaccion(id: number, tipo: ReaccionTipo): Promise<void> {
    await api.put(`/noticias/${id}/reactions`, { tipo })
  },

  async removeReaccion(id: number): Promise<void> {
    await api.delete(`/noticias/${id}/reactions`)
  },

  async getReacciones(id: number): Promise<{ tipo: string; total: number }[]> {
    const { data } = await api.get(`/noticias/${id}/reactions`)
    return Array.isArray(data) ? data : (data?.data ?? [])
  },

  // Comentarios
  async getComentarios(id: number): Promise<NoticiaComentario[]> {
    const { data } = await api.get(`/noticias/${id}/comments`)
    const list = Array.isArray(data) ? data : (data?.data ?? data?.comentarios ?? [])
    return (list as Record<string, unknown>[]).map((r) => ({
      id: Number(r['id'] ?? r['ID'] ?? 0),
      noticiaId: id,
      autorId: Number(r['autorId'] ?? r['AUTOR_ID'] ?? r['usuarioId'] ?? 0),
      autorNombre: String(r['autorNombre'] ?? r['AUTOR_NOMBRE'] ?? r['usuarioNombre'] ?? r['nombres'] ?? ''),
      contenido: String(r['contenido'] ?? r['CONTENIDO'] ?? r['comentario'] ?? ''),
      fecha: String(r['fecha'] ?? r['FECHA'] ?? r['createdAt'] ?? new Date().toISOString()),
    }))
  },

  async addComentario(id: number, contenido: string, usuarioId: number, usuarioNombre: string): Promise<void> {
    await api.post(`/noticias/${id}/comments`, { contenido, usuarioId, usuarioNombre })
  },
}
