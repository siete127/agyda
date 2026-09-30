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

  /** Sube el CV (PDF) y devuelve su URL. */
  async subirCv(file: File): Promise<string> {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('No se pudo leer el archivo'))
      r.readAsDataURL(file)
    })
    const { data } = await api.post('/uploads/vacante-cv', { base64, filename: file.name })
    return String(data?.url ?? '')
  },

  /** Prospecto capturado por RH (sin CV obligatorio, en la etapa que se elija). */
  async crearProspecto(vacanteId: number, payload: { nombre: string; email?: string; telefono?: string; mensaje?: string; etapa?: PostulanteEtapa; cvUrl?: string }): Promise<Postulante> {
    const { data } = await api.post(`/vacantes/${vacanteId}/postulantes/manual`, payload)
    return parsePostulante((data?.data ?? data) as Record<string, unknown>)
  },

  /** Abre el ticket a TI para crear el usuario y las credenciales de un contratado. */
  async solicitarCredenciales(vacanteId: number, postId: number, payload: { puesto?: string; area?: string; fechaIngreso?: string; accesos?: string; notas?: string }): Promise<{ ticketId: number }> {
    const { data } = await api.post(`/vacantes/${vacanteId}/postulantes/${postId}/credenciales`, payload)
    return data?.data as { ticketId: number }
  },

  /** Usuario del sistema de un contratado (por correo o nombre), para su expediente. */
  async usuarioDePostulante(vacanteId: number, postId: number): Promise<{ id: number; nombres: string; puesto: string | null; tipoUsuario: string } | null> {
    const { data } = await api.get(`/vacantes/${vacanteId}/postulantes/${postId}/usuario`)
    return data?.data ?? null
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const { data } = await api.get('/vacantes/dashboard/stats')
    return data?.data as DashboardStats
  },
}
