import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import type { ReporteDiario, ReportePostulantes } from '@/types/reporteDiario.types'

export const reporteDiarioService = {
  async get(fecha?: string): Promise<ReporteDiario> {
    const { data } = await api.get('/operaciones/reportes-diarios', { params: fecha ? { fecha } : {} })
    return data?.data as ReporteDiario
  },

  async getPostulantes(params: { desde?: string; hasta?: string }): Promise<ReportePostulantes> {
    const { data } = await api.get('/operaciones/reportes-postulantes', { params })
    return data?.data as ReportePostulantes
  },

  // Descarga directa (no JSON) — mismo patrón que ccService.tipificacionesExcelUrl:
  // el token va por querystring porque es un <a href> de navegador, no axios.
  excelPostulantesUrl(params: { desde?: string; hasta?: string }): string {
    const token = useAuthStore.getState().token
    const qs = new URLSearchParams()
    if (params.desde) qs.set('desde', params.desde)
    if (params.hasta) qs.set('hasta', params.hasta)
    if (token) qs.set('token', token)
    return `/api/operaciones/reportes-postulantes/excel?${qs.toString()}`
  },
}
