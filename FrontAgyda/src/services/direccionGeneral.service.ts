import { api } from '@/lib/axios'
import type { AreaKey } from '@/config/areas'

export interface AreaKpi {
  areaKey: AreaKey
  kpiKey: string
  label: string
  valor: number
  meta: number | null
  unidad: string | null
  tono: string | null
}

export interface AreaResumen {
  areaKey: AreaKey
  label: string
  reportando: boolean
  kpiCount: number
  ultimaActualizacion: string | null
  kpis: AreaKpi[]
}

export interface ResumenEjecutivo {
  periodo: string
  areas: AreaResumen[]
  areasReportando: number
  totalAreas: number
}

export interface KpiIndicador extends AreaKpi {
  progreso: number | null
  fechaCorte: string
  responsable: string | null
  formula: string | null
  origen: string | null
  comentariosCount: number
  periodo?: string
}

export interface AreaIndicadores {
  areaKey: AreaKey
  label: string
  reportando: boolean
  ultimaActualizacion: string | null
  kpis: KpiIndicador[]
}

export interface TotalesIndicadores {
  onMeta: number
  enRiesgo: number
  critico: number
  totalKpis: number
}

export interface IndicadoresConsolidados {
  periodo: string
  areas: AreaIndicadores[]
  totales: TotalesIndicadores
  areasReportando: number
  totalAreas: number
}

export interface KpiHistoricoPunto {
  periodo: string
  valor: number
  meta: number | null
  fechaCorte: string
  variacionPct: number | null
}

export interface ActualizarGobernanzaInput {
  periodo?: string
  responsableId?: number | null
  formula?: string | null
  origen?: string | null
}

export interface ComentarioKpi {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  texto: string
  createdAt: string
}

export interface KpiPublico {
  kpiKey: string
  label: string
  valor: number
  meta: number | null
  unidad: string | null
  tono: string | null
  progreso: number | null
}

export interface AreaPublica {
  areaKey: AreaKey
  label: string
  kpis: KpiPublico[]
}

export interface IndicadoresPublico {
  periodo: string
  areas: AreaPublica[]
  totales: TotalesIndicadores
}

export type Semaforo = 'critical' | 'warn' | 'success' | null

export interface AreaSupervision {
  areaKey: AreaKey
  label: string
  semaforo: Semaforo
  kpiCount: number
  ultimaActualizacion: string | null
}

export interface SupervisionGeneral {
  periodo: string
  areas: AreaSupervision[]
}

export const direccionGeneralService = {
  async getResumen(periodo?: string): Promise<ResumenEjecutivo> {
    const { data } = await api.get('/direccion-general/resumen', { params: { periodo } })
    return data.data
  },

  async getSupervisionGeneral(periodo?: string): Promise<SupervisionGeneral> {
    const { data } = await api.get('/direccion-general/supervision', { params: { periodo } })
    return data.data
  },

  async getIndicadores(periodo?: string): Promise<IndicadoresConsolidados> {
    const { data } = await api.get('/direccion-general/indicadores', { params: { periodo } })
    return data.data
  },

  async getKpiHistorico(areaKey: string, kpiKey: string, meses = 12): Promise<KpiHistoricoPunto[]> {
    const { data } = await api.get(`/direccion-general/indicadores/${areaKey}/${kpiKey}/historico`, { params: { meses } })
    return data.data
  },

  async actualizarGobernanzaKpi(areaKey: string, kpiKey: string, input: ActualizarGobernanzaInput): Promise<void> {
    await api.put(`/areas/${areaKey}/kpis/${encodeURIComponent(kpiKey)}/gobernanza`, input)
  },

  async getComentariosKpi(areaKey: string, kpiKey: string, periodo?: string): Promise<ComentarioKpi[]> {
    const { data } = await api.get(`/direccion-general/indicadores/${areaKey}/${kpiKey}/comentarios`, { params: { periodo } })
    return data.data
  },

  async crearComentarioKpi(areaKey: string, kpiKey: string, texto: string, periodo?: string): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/indicadores/${areaKey}/${kpiKey}/comentarios`, { texto, periodo })
    return data.data
  },

  async eliminarComentarioKpi(id: number): Promise<void> {
    await api.delete(`/direccion-general/indicadores/comentarios/${id}`)
  },

  async exportarIndicadoresPdf(periodo?: string): Promise<Blob> {
    const { data } = await api.get('/direccion-general/indicadores/export/pdf', {
      params: { periodo },
      responseType: 'blob',
    })
    return data
  },

  async generarLinkIndicadores(periodo?: string): Promise<{ token: string }> {
    const { data } = await api.post('/direccion-general/indicadores/compartir', { periodo })
    return data.data
  },

  async getIndicadoresPublico(token: string): Promise<IndicadoresPublico> {
    const { data } = await api.get(`/direccion-general/indicadores/publico/${token}`)
    return data.data
  },
}
