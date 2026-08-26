import { api } from '@/lib/axios'
import { parseCiclo, parseEvaluacion, type Ciclo, type Evaluacion, type Criterio, type CriterioCalificado, type Meta } from '@/types/evaluacionDesempeno.types'

export const evaluacionDesempenoService = {
  async getCriterios(): Promise<Criterio[]> {
    const { data } = await api.get('/evaluacion-desempeno/criterios')
    return (data?.data ?? []) as Criterio[]
  },

  async getMisEvaluaciones(): Promise<Evaluacion[]> {
    const { data } = await api.get('/evaluacion-desempeno/mis')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseEvaluacion)
  },

  async getCiclos(): Promise<Ciclo[]> {
    const { data } = await api.get('/evaluacion-desempeno/ciclos')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseCiclo)
  },

  async crearCiclo(payload: { nombre: string; fechaInicio: string; fechaFin: string }): Promise<Ciclo> {
    const { data } = await api.post('/evaluacion-desempeno/ciclos', payload)
    return parseCiclo((data?.data ?? data) as Record<string, unknown>)
  },

  async toggleCicloActivo(id: number, activo: boolean): Promise<void> {
    await api.patch(`/evaluacion-desempeno/ciclos/${id}/activo`, { activo })
  },

  async getAll(params?: { cicloId?: number; estado?: string }): Promise<Evaluacion[]> {
    const { data } = await api.get('/evaluacion-desempeno', { params })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseEvaluacion)
  },

  async crear(cicloId: number, empleadoId: number): Promise<Evaluacion> {
    const { data } = await api.post('/evaluacion-desempeno', { cicloId, empleadoId })
    return parseEvaluacion((data?.data ?? data) as Record<string, unknown>)
  },

  async actualizar(id: number, payload: { criterios?: CriterioCalificado[]; metas?: Meta[]; fortalezas?: string; areasMejora?: string; planAccion?: string }): Promise<Evaluacion> {
    const { data } = await api.put(`/evaluacion-desempeno/${id}`, payload)
    return parseEvaluacion((data?.data ?? data) as Record<string, unknown>)
  },

  async finalizar(id: number): Promise<Evaluacion> {
    const { data } = await api.patch(`/evaluacion-desempeno/${id}/finalizar`)
    return parseEvaluacion((data?.data ?? data) as Record<string, unknown>)
  },
}
