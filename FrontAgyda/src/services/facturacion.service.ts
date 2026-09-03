import { api } from '@/lib/axios'

export interface EmpresaFiscal {
  rfc: string
  razonSocial: string
  regimenFiscal: string
  cp: string
  csdCargado: boolean
  csdNumCert: string | null
  csdVigenciaHasta: string | null
}

export interface PacConfig {
  habilitado: boolean
  proveedor: string
  modo: 'sandbox' | 'produccion'
  baseUrl: string
  usuario: string
  passwordConfigurado: boolean
  apiKeyConfigurado: boolean
  serie: string
  folioActual: number
  proveedores: string[]
  listoParaTimbrar: boolean
}

export interface Factura {
  id: number
  cotId: number | null
  opoId: number | null
  clienteId: number | null
  uuid: string | null
  pacId: string | null
  serie: string | null
  folio: string | null
  emisorRfc: string | null
  receptorRfc: string | null
  receptorNombre: string | null
  subtotal: number | null
  iva: number | null
  total: number | null
  moneda: string
  usoCfdi: string | null
  formaPago: string | null
  metodoPago: string | null
  estatus: 'pre-factura' | 'timbrada' | 'cancelada' | 'error'
  error: string | null
  fechaTimbrado: string | null
  fechaCancelacion: string | null
  fecha: string
}

export interface ReceptorFiscal {
  rfc: string
  nombre: string
  regimenFiscal: string
  cp: string
  usoCfdi: string
}

export const facturacionService = {
  getEmisor: async (): Promise<EmpresaFiscal> => {
    const { data } = await api.get('/facturacion/emisor')
    return data.data
  },
  updateEmisor: (b: Partial<Pick<EmpresaFiscal, 'rfc' | 'razonSocial' | 'regimenFiscal' | 'cp'>>) =>
    api.put('/facturacion/emisor', b).then((r) => r.data),
  subirCSD: (b: { cerBase64: string; keyBase64: string; passwordCsd: string }) =>
    api.post('/facturacion/emisor/csd', b).then((r) => r.data),
  quitarCSD: () => api.delete('/facturacion/emisor/csd').then((r) => r.data),

  getConfig: async (): Promise<PacConfig> => {
    const { data } = await api.get('/facturacion/config')
    return data.data
  },
  updateConfig: (b: Record<string, unknown>) =>
    api.put('/facturacion/config', b).then((r) => r.data),
  probarConexion: () => api.post('/facturacion/config/probar').then((r) => r.data),

  listByCotizacion: async (cotId: number): Promise<Factura[]> => {
    const { data } = await api.get('/facturas', { params: { cotId } })
    return data.data ?? []
  },
  listByOportunidad: async (opoId: number): Promise<Factura[]> => {
    const { data } = await api.get('/facturas', { params: { opoId } })
    return data.data ?? []
  },
  facturarCotizacion: (cotId: number, body: { receptor?: ReceptorFiscal; formaPago?: string; metodoPago?: string }) =>
    api.post(`/facturas/desde-cotizacion/${cotId}`, body).then((r) => r.data),
  cancelar: (id: number, motivo = '02') =>
    api.post(`/facturas/${id}/cancelar`, { motivo }).then((r) => r.data),
  documentoUrl: (id: number, formato: 'pdf' | 'xml') => `/api/facturas/${id}/documento/${formato}`,
}
