import { api } from '@/lib/axios'
import type { ReporteFinancieroConsolidado } from '@/types/reporteFinanciero.types'

export const reporteFinancieroService = {
  async get(meses = 6): Promise<ReporteFinancieroConsolidado> {
    const { data } = await api.get('/finanzas/reportes', { params: { meses } })
    return data?.data as ReporteFinancieroConsolidado
  },
}
