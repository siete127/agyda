import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type TipoContrato = 'arrendamiento' | 'servicios' | 'confidencialidad' | 'laboral' | 'proveedor' | 'otro'
export type EstatusContrato = 'vigente' | 'por_vencer' | 'vencido' | 'renovado' | 'cancelado'
export type TipoAdjuntoContrato = 'firmado' | 'anexo' | 'addendum'

export interface Contrato {
  id: number
  titulo: string
  tipo: TipoContrato
  contraparte: string | null
  fechaInicio: string | null
  fechaVencimiento: string | null
  renovacionAutomatica: boolean
  monto: number | null
  moneda: string | null
  estatus: EstatusContrato
  responsableId: number | null
  responsableNombre: string | null
  notas: string | null
  createdAt: string
  updatedAt: string
}

export interface ResumenContratos {
  vigentes: number
  porVencer: number
  vencidos: number
  activos: number
}

export interface AdjuntoContrato {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  tipo: TipoAdjuntoContrato
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface FiltrosContratos {
  tipo?: TipoContrato
  estatus?: EstatusContrato
}

export interface ContratoInput {
  titulo: string
  tipo: TipoContrato
  contraparte?: string
  fechaInicio?: string
  fechaVencimiento?: string
  renovacionAutomatica?: boolean
  monto?: number
  moneda?: string
  responsableId?: number
  notas?: string
}

export const contratosService = {
  async listContratos(filtros?: FiltrosContratos): Promise<Contrato[]> {
    const { data } = await api.get('/contratos', { params: filtros })
    return data.data
  },

  async getResumen(): Promise<ResumenContratos> {
    const { data } = await api.get('/contratos/resumen')
    return data.data
  },

  async crearContrato(input: ContratoInput): Promise<{ id: number }> {
    const { data } = await api.post('/contratos', input)
    return data.data
  },

  async actualizarContrato(id: number, input: ContratoInput): Promise<void> {
    await api.put(`/contratos/${id}`, input)
  },

  async marcarRenovado(id: number, nuevaFechaVencimiento: string): Promise<void> {
    await api.put(`/contratos/${id}/renovar`, { nuevaFechaVencimiento })
  },

  async cancelarContrato(id: number): Promise<void> {
    await api.put(`/contratos/${id}/cancelar`)
  },

  async eliminarContrato(id: number): Promise<void> {
    await api.delete(`/contratos/${id}`)
  },

  async listAdjuntos(contratoId: number): Promise<AdjuntoContrato[]> {
    const { data } = await api.get(`/contratos/${contratoId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(contratoId: number, files: File[], tipo: TipoAdjuntoContrato): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('adjuntos', f))
    form.append('tipo', tipo)
    const { data } = await api.post(`/contratos/${contratoId}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/contratos/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/contratos/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
}
