import { api } from '@/lib/axios'

export interface FinanzasDashboard {
  ingresosMes: number
  egresosMes: number
  cxcPendiente: number
  cxpPendiente: number
  cxcVencidas: number
}

export interface Ingreso {
  id: number
  concepto: string
  monto: number
  fecha: string
  categoria: string | null
}

export interface CrearIngresoPayload {
  concepto: string
  monto: number
  fecha?: string
  categoria?: string
}

export interface Egreso {
  id: number
  concepto: string
  monto: number
  fecha: string
  categoria: string | null
}

export interface CrearEgresoPayload {
  concepto: string
  monto: number
  fecha?: string
  categoria?: string
}

export type EstatusCxc = 'pendiente' | 'pagada'

export interface CuentaPorCobrar {
  id: number
  cliente: string
  monto: number
  fechaVencimiento: string | null
  estatus: EstatusCxc
}

export interface CrearCxcPayload {
  cliente: string
  monto: number
  fechaVencimiento?: string
}

export interface CuentaPorPagar {
  id: number
  proveedor: string
  monto: number
  fechaVencimiento: string | null
  estatus: EstatusCxc
}

export interface CrearCxpPayload {
  proveedor: string
  monto: number
  fechaVencimiento?: string
}

export const finanzasService = {
  async getDashboard(): Promise<FinanzasDashboard> {
    const { data } = await api.get('/finanzas/dashboard')
    return data.data
  },

  async getIngresos(): Promise<Ingreso[]> {
    const { data } = await api.get('/finanzas/ingresos')
    return data.data
  },

  async createIngreso(payload: CrearIngresoPayload): Promise<void> {
    await api.post('/finanzas/ingresos', payload)
  },

  async deleteIngreso(id: number): Promise<void> {
    await api.delete(`/finanzas/ingresos/${id}`)
  },

  async getEgresos(): Promise<Egreso[]> {
    const { data } = await api.get('/finanzas/egresos')
    return data.data
  },

  async createEgreso(payload: CrearEgresoPayload): Promise<void> {
    await api.post('/finanzas/egresos', payload)
  },

  async deleteEgreso(id: number): Promise<void> {
    await api.delete(`/finanzas/egresos/${id}`)
  },

  async getCxc(): Promise<CuentaPorCobrar[]> {
    const { data } = await api.get('/finanzas/cxc')
    return data.data
  },

  async createCxc(payload: CrearCxcPayload): Promise<void> {
    await api.post('/finanzas/cxc', payload)
  },

  async actualizarEstatusCxc(id: number, estatus: EstatusCxc): Promise<void> {
    await api.patch(`/finanzas/cxc/${id}/estatus`, { estatus })
  },

  async deleteCxc(id: number): Promise<void> {
    await api.delete(`/finanzas/cxc/${id}`)
  },

  async getCxp(): Promise<CuentaPorPagar[]> {
    const { data } = await api.get('/finanzas/cxp')
    return data.data
  },

  async createCxp(payload: CrearCxpPayload): Promise<void> {
    await api.post('/finanzas/cxp', payload)
  },

  async actualizarEstatusCxp(id: number, estatus: EstatusCxc): Promise<void> {
    await api.patch(`/finanzas/cxp/${id}/estatus`, { estatus })
  },

  async deleteCxp(id: number): Promise<void> {
    await api.delete(`/finanzas/cxp/${id}`)
  },
}
