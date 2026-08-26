import { api } from '@/lib/axios'
import type { ReporteResultados, PeriodoReporte } from '@/types/reporteResultados.types'

export const reporteResultadosService = {
  async get(periodo: PeriodoReporte, fecha?: string): Promise<ReporteResultados> {
    const { data } = await api.get('/ventas-area/reportes-resultados', { params: { periodo, ...(fecha ? { fecha } : {}) } })
    return data?.data as ReporteResultados
  },
}
