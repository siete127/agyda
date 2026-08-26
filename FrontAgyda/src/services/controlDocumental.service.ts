import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type CategoriaDocumento = 'politica' | 'contrato_tipo' | 'formato' | 'plantilla' | 'manual' | 'otro'
export type EstadoVigenciaDocumento = 'vigente' | 'en_revision' | 'obsoleto'

export interface DocumentoControl {
  id: number
  titulo: string
  categoria: CategoriaDocumento
  descripcion: string | null
  estadoVigencia: EstadoVigenciaDocumento
  responsableId: number | null
  responsableNombre: string | null
  versionVigente: number | null
  totalVersiones: number
  createdAt: string
  updatedAt: string
}

export interface ResumenControlDocumental {
  total: number
  vigentes: number
  enRevision: number
  obsoletos: number
  porCategoria: Record<string, number>
}

export interface VersionDocumento {
  id: number
  numeroVersion: number
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  usuarioId: number | null
  usuarioNombre: string | null
  notaCambio: string | null
  createdAt: string
  esVigente: boolean
}

export interface FiltrosControlDocumental {
  categoria?: CategoriaDocumento
  estadoVigencia?: EstadoVigenciaDocumento
  busqueda?: string
}

export interface CrearDocumentoInput {
  titulo: string
  categoria: CategoriaDocumento
  descripcion?: string
  responsableId?: number
  notaCambio?: string
  archivo: File
}

export interface ActualizarMetadataInput {
  titulo: string
  categoria: CategoriaDocumento
  descripcion?: string
  responsableId?: number
}

export const controlDocumentalService = {
  async listDocumentos(filtros?: FiltrosControlDocumental): Promise<DocumentoControl[]> {
    const { data } = await api.get('/control-documental', { params: filtros })
    return data.data
  },

  async getResumen(): Promise<ResumenControlDocumental> {
    const { data } = await api.get('/control-documental/resumen')
    return data.data
  },

  async getDocumento(id: number): Promise<DocumentoControl> {
    const { data } = await api.get(`/control-documental/${id}`)
    return data.data
  },

  async crearDocumento(input: CrearDocumentoInput): Promise<{ id: number }> {
    const form = new FormData()
    form.append('titulo', input.titulo)
    form.append('categoria', input.categoria)
    if (input.descripcion) form.append('descripcion', input.descripcion)
    if (input.responsableId) form.append('responsableId', String(input.responsableId))
    if (input.notaCambio) form.append('notaCambio', input.notaCambio)
    form.append('archivo', input.archivo)
    const { data } = await api.post('/control-documental', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async actualizarMetadata(id: number, input: ActualizarMetadataInput): Promise<void> {
    await api.put(`/control-documental/${id}/metadata`, input)
  },

  async cambiarEstadoVigencia(id: number, estadoVigencia: EstadoVigenciaDocumento): Promise<void> {
    await api.put(`/control-documental/${id}/estado`, { estadoVigencia })
  },

  async eliminarDocumento(id: number): Promise<void> {
    await api.delete(`/control-documental/${id}`)
  },

  async subirNuevaVersion(id: number, archivo: File, notaCambio: string): Promise<{ numeroVersion: number }> {
    const form = new FormData()
    form.append('archivo', archivo)
    form.append('notaCambio', notaCambio)
    const { data } = await api.post(`/control-documental/${id}/versiones`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async listVersiones(id: number): Promise<VersionDocumento[]> {
    const { data } = await api.get(`/control-documental/${id}/versiones`)
    return data.data
  },

  getUrlVerVersion(versionId: number): string {
    const token = useAuthStore.getState().token
    return `/api/control-documental/versiones/${versionId}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async exportarPdf(): Promise<Blob> {
    const { data } = await api.get('/control-documental/export/pdf', { responseType: 'blob' })
    return data
  },
}
