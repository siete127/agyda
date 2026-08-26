import { api } from '@/lib/axios'
import type { PerfilAsesor } from '@/types/perfilAsesor.types'
import type { PeriodoReporte } from '@/types/reporteResultados.types'

export const perfilAsesorService = {
  async get(asesorId: number, periodo: PeriodoReporte, fecha?: string): Promise<PerfilAsesor> {
    const { data } = await api.get(`/ventas-area/asesores/${asesorId}/perfil`, { params: { periodo, ...(fecha ? { fecha } : {}) } })
    return data?.data as PerfilAsesor
  },
}
