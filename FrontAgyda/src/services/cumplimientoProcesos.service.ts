import { api } from '@/lib/axios'
import type { Proceso, CrearProcesoPayload, RegistroProceso, CrearRegistroProcesoPayload } from '@/types/cumplimientoProcesos.types'

export const cumplimientoProcesosService = {
  async listProcesos(): Promise<Proceso[]> {
    const { data } = await api.get('/calidad/procesos')
    return (data?.data ?? []) as Proceso[]
  },

  async crearProceso(payload: CrearProcesoPayload): Promise<void> {
    await api.post('/calidad/procesos', payload)
  },

  async eliminarProceso(id: number): Promise<void> {
    await api.delete(`/calidad/procesos/${id}`)
  },

  async listRegistros(filtros?: { procesoId?: number; agenteId?: number }): Promise<RegistroProceso[]> {
    const { data } = await api.get('/calidad/procesos/registros', { params: filtros })
    return (data?.data ?? []) as RegistroProceso[]
  },

  async crearRegistro(payload: CrearRegistroProcesoPayload): Promise<{ pctCumplimiento: number }> {
    const { data } = await api.post('/calidad/procesos/registros', payload)
    return data?.data
  },

  async eliminarRegistro(id: number): Promise<void> {
    await api.delete(`/calidad/procesos/registros/${id}`)
  },
}
