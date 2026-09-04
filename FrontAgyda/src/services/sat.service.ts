import { api } from '@/lib/axios'

export interface SatClave {
  clave: string
  descripcion: string
}

export interface SatCatalogoItem {
  c: string
  d: string
}

export const satService = {
  buscarProdServ: async (q: string): Promise<SatClave[]> => {
    if (q.trim().length < 2) return []
    const { data } = await api.get('/sat/prod-serv', { params: { q } })
    return data.data ?? []
  },
  buscarUnidades: async (q: string): Promise<SatClave[]> => {
    if (q.trim().length < 2) return []
    const { data } = await api.get('/sat/unidades', { params: { q } })
    return data.data ?? []
  },
  regimenFiscal: async (): Promise<SatCatalogoItem[]> => {
    const { data } = await api.get('/sat/regimen-fiscal')
    return data.data ?? []
  },
  usoCfdi: async (): Promise<SatCatalogoItem[]> => {
    const { data } = await api.get('/sat/uso-cfdi')
    return data.data ?? []
  },
  formaPago: async (): Promise<SatCatalogoItem[]> => {
    const { data } = await api.get('/sat/forma-pago')
    return data.data ?? []
  },
  metodoPago: async (): Promise<SatCatalogoItem[]> => {
    const { data } = await api.get('/sat/metodo-pago')
    return data.data ?? []
  },
}
