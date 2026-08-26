import { api } from '@/lib/axios'
import { parseVacante, parsePostulante, type Vacante, type Postulante, type PostulanteEstado, type PostulanteEtapa, type DashboardStats } from '@/types/vacante.types'

export const vacantesService = {
  async getAll(includeInactive = false): Promise<Vacante[]> {
    const { data } = await api.get('/vacantes', { params: includeInactive ? { includeInactive: 1 } : {} })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseVacante)
  },

  async getById(id: number): Promise<Vacante> {
    const { data } = await api.get(`/vacantes/${id}`)
    return parseVacante((data?.data ?? data) as Record<string, unknown>)
  },

  async create(payload: Partial<Vacante>): Promise<Vacante> {
    const { data } = await api.post('/vacantes', payload)
    return parseVacante((data?.data ?? data) as Record<string, unknown>)
  },

  async update(id: number, payload: Partial<Vacante>): Promise<Vacante> {
    const { data } = await api.put(`/vacantes/${id}`, payload)
    return parseVacante((data?.data ?? data) as Record<string, unknown>)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/vacantes/${id}`)
  },

  async toggleActivo(id: number, activo: boolean): Promise<void> {
    await api.patch(`/vacantes/${id}/activo`, { activo })
  },

  async getPostulantes(vacanteId: number): Promise<Postulante[]> {
    const { data } = await api.get(`/vacantes/${vacanteId}/postulantes`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parsePostulante)
  },

  async updateEstadoPostulante(vacanteId: number, postId: number, estado: PostulanteEstado): Promise<void> {
    await api.patch(`/vacantes/${vacanteId}/postulantes/${postId}/estado`, { estado })
  },

  async updateEtapaPostulante(vacanteId: number, postId: number, etapa: PostulanteEtapa, orden = 0): Promise<void> {
    await api.patch(`/vacantes/${vacanteId}/postulantes/${postId}/etapa`, { etapa, orden })
  },

  async getAllPostulantes(): Promise<Postulante[]> {
    const { data } = await api.get('/vacantes/postulantes')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parsePostulante)
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const { data } = await api.get('/vacantes/dashboard/stats')
    return data?.data as DashboardStats
  },
}
