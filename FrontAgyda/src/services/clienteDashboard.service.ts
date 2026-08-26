import { api } from '@/lib/axios'

export interface ClienteDashboardData {
  rango: { desde: string; hasta: string }
  clientesNuevos: number
  clientesTotal: number
  clientesActivos: number
  clientesInactivos: number
  clientesPendienteDocumentacion: number
  tareasPendientes: number
  tareasVencidas: number
  seguimientosPendientes: number
  seguimientosVencidos: number
  pagosProximosVencer: number
  pagosVencidos: number
  pagosRealizados: number
  montoPagadoRango: number
  encuestasEnviadas: number
  encuestasRespondidas: number
  tasaSatisfaccion: number | null
  incidenciasAbiertas: number
  incidenciasResueltas: number
  renovacionesProximas: number
}

export interface ClienteReporteFila {
  id: number
  nombre: string
  empresa: string | null
  estatus: string
  tipoCliente: string | null
  responsable: string | null
  fechaAlta: string
  incidenciasAbiertas: number
  pagosVencidos: number
}

export type RangoDashboard = 'dia' | 'semana' | 'mes'

export const clienteDashboardService = {
  getDashboard: async (params: { rango?: RangoDashboard; desde?: string; hasta?: string }): Promise<ClienteDashboardData> => {
    const { data } = await api.get('/atencion-cliente/clientes/dashboard', { params })
    return data.data
  },
  getReporte: async (params: { rango?: RangoDashboard; desde?: string; hasta?: string }): Promise<{ rango: { desde: string; hasta: string }; filas: ClienteReporteFila[] }> => {
    const { data } = await api.get('/atencion-cliente/clientes/reportes', { params })
    return data.data
  },
}
