import { api } from '@/lib/axios'

export interface LegalDoc {
  id: number
  titulo: string
  categoria: string | null
  nombreArchivo: string
  fechaSubida: string
}

export interface LegalDashboard {
  documentosActivos: number
  documentosMes: number
}

export const legalService = {
  async getDocumentos(params?: { q?: string; categoria?: string }): Promise<LegalDoc[]> {
    const { data } = await api.get('/legales', { params })
    return Array.isArray(data?.data) ? data.data : []
  },

  async getDashboard(): Promise<LegalDashboard> {
    const { data } = await api.get('/legales/dashboard')
    return data.data
  },

  async subirDocumento(file: File, titulo: string, categoria?: string): Promise<void> {
    const form = new FormData()
    form.append('documento', file)
    form.append('titulo', titulo)
    if (categoria) form.append('categoria', categoria)
    await api.post('/legales/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  async eliminarDocumento(nombreArchivo: string): Promise<void> {
    await api.delete(`/legales/${encodeURIComponent(nombreArchivo)}`)
  },

  viewUrl(nombreArchivo: string): string {
    return `/api/legales/view/${encodeURIComponent(nombreArchivo)}`
  },
}
