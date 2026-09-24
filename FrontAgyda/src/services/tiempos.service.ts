import { api } from '@/lib/axios'
import type { TiemposAgente, AgenteOpcion } from '@/types/tiempos.types'
import type { PausaPorTipo } from '@/types/pausaTipos.types'

/* Tiempo de HOY: disponible (jornada − pausas que cuentan en Asistencia) +
   desglose de pausas. Emparejado con el reporte de pausas (mismo
   USUARIO_TIEMPOS, mismo "hoy"). */
export interface TiemposHoy {
  sinEntrada: boolean
  jornadaSeg: number
  disponibleSeg: number
  comidaSeg: number
  banioSeg: number
  capacitacionSeg: number
  permisoSeg: number
  // Todos los tipos de pausa configurados (incluye los que agregue la empresa).
  pausasPorTipo?: PausaPorTipo[]
}

export interface TiemposHoyUsuario extends TiemposHoy {
  usuarioId: number
  nombre: string
  area: string
}

export const tiemposService = {
  async getMisAgentes(): Promise<AgenteOpcion[]> {
    const { data } = await api.get('/operaciones/tiempos/mis-agentes')
    return (data?.data ?? []) as AgenteOpcion[]
  },

  async getTiempos(agenteId: number, fecha?: string): Promise<TiemposAgente> {
    const { data } = await api.get('/operaciones/tiempos', { params: { agenteId, ...(fecha ? { fecha } : {}) } })
    return data?.data as TiemposAgente
  },

  async getTiemposHoy(): Promise<TiemposHoy> {
    const { data } = await api.get('/reports/tiempos/hoy')
    return data?.data as TiemposHoy
  },

  async getTiemposHoyEquipo(area?: string): Promise<TiemposHoyUsuario[]> {
    const { data } = await api.get('/reports/tiempos/hoy/equipo', { params: area ? { area } : {} })
    return (data?.data ?? []) as TiemposHoyUsuario[]
  },
}
