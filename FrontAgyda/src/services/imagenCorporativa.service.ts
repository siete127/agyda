import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type CategoriaAsset = 'logo' | 'paleta' | 'tipografia' | 'plantilla' | 'manual' | 'otro'

export interface AssetMarca {
  id: number
  titulo: string
  categoria: CategoriaAsset
  descripcion: string | null
  nombreArchivo: string
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  subidoPor: number | null
  subidoPorNombre: string | null
  createdAt: string
}

export interface FiltrosAssets {
  categoria?: CategoriaAsset
  q?: string
}

export interface ActualizarAssetInput {
  titulo: string
  categoria: CategoriaAsset
  descripcion?: string
}

export const imagenCorporativaService = {
  async listAssets(filtros?: FiltrosAssets): Promise<AssetMarca[]> {
    const { data } = await api.get('/marketing/imagen-corporativa/assets', { params: filtros })
    return data.data
  },

  async subirAsset(titulo: string, categoria: CategoriaAsset, descripcion: string | undefined, file: File): Promise<{ id: number }> {
    const form = new FormData()
    form.append('archivo', file)
    form.append('titulo', titulo)
    form.append('categoria', categoria)
    if (descripcion) form.append('descripcion', descripcion)
    const { data } = await api.post('/marketing/imagen-corporativa/assets', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async actualizarAsset(id: number, input: ActualizarAssetInput): Promise<void> {
    await api.put(`/marketing/imagen-corporativa/assets/${id}`, input)
  },

  async eliminarAsset(id: number): Promise<void> {
    await api.delete(`/marketing/imagen-corporativa/assets/${id}`)
  },

  getUrlVerAsset(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/marketing/imagen-corporativa/assets/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
}
