import { api } from '@/lib/axios'
import type { MiResumenAsesor } from '@/types/asesores.types'

export const asesoresService = {
  async getMiResumen(fecha?: string): Promise<MiResumenAsesor> {
    const { data } = await api.get('/operaciones/asesores/mi-resumen', { params: fecha ? { fecha } : {} })
    return data?.data as MiResumenAsesor
  },
}
