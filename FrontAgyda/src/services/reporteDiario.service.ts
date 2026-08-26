import { api } from '@/lib/axios'
import type { ReporteDiario } from '@/types/reporteDiario.types'

export const reporteDiarioService = {
  async get(fecha?: string): Promise<ReporteDiario> {
    const { data } = await api.get('/operaciones/reportes-diarios', { params: fecha ? { fecha } : {} })
    return data?.data as ReporteDiario
  },
}
