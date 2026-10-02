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

  async getReactores(id: number): Promise<{ usuarioId: number; nombre: string; fotoUrl: string | null; tipo: ReaccionTipo; fecha: string }[]> {
    const { data } = await api.get(`/noticias/${id}/reactions/users`)
    const list = data?.data?.items ?? []
    return (list as Record<string, unknown>[]).map((r) => ({
      usuarioId: Number(r['usuarioId'] ?? 0),
      nombre: String(r['nombre'] ?? 'Usuario'),
      fotoUrl: r['fotoUrl'] ? String(r['fotoUrl']) : null,
      tipo: String(r['tipo'] ?? '') as ReaccionTipo,
      fecha: String(r['fecha'] ?? ''),
    }))
  },

  async registrarVista(id: number): Promise<void> {
    await api.post(`/noticias/${id}/vista`)
  },

  async getMasLeidas(): Promise<{ id: number; titulo: string; fechaCreacion: string; vistas: number }[]> {
    const { data } = await api.get('/noticias/mas-leidas')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map((r) => ({
      id: Number(r['id'] ?? 0),
      titulo: String(r['titulo'] ?? ''),
      fechaCreacion: String(r['fechaCreacion'] ?? ''),
      vistas: Number(r['vistas'] ?? 0),
    }))
  },

  async getReaccionesResumen(): Promise<{ tipo: ReaccionTipo; total: number }[]> {
    const { data } = await api.get('/noticias/reacciones-resumen')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map((r) => ({
      tipo: String(r['tipo'] ?? '') as ReaccionTipo,
      total: Number(r['total'] ?? 0),
    }))
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
