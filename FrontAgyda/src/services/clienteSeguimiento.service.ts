import { api } from '@/lib/axios'
import {
  type CliSeguimiento, type CliTarea, type Prioridad, type EstatusTarea, type TipoContacto, type TipoTarea, type HistorialEvento,
  parseCliSeguimiento, parseCliTarea, parseHistorialEvento,
} from '@/types/clienteSeguimiento.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as any)?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export const clienteSeguimientoService = {
  // ── Historial de comunicaciones ──
  getHistorial: async (contactoId: number): Promise<HistorialEvento[]> => {
    const { data } = await api.get(`/atencion-cliente/clientes/${contactoId}/historial`)
    return norm(data?.data ?? data, parseHistorialEvento)
  },

  // ── Seguimientos ──
  getSeguimientos: async (contactoId: number): Promise<CliSeguimiento[]> => {
    const { data } = await api.get(`/atencion-cliente/clientes/${contactoId}/seguimientos`)
    return norm(data?.data ?? data, parseCliSeguimiento)
  },
  createSeguimiento: (contactoId: number, body: { tipoContacto: TipoContacto; estatusColor: string; motivo?: string; nota?: string; acuerdos?: string; proximaFecha?: string }) =>
    api.post(`/atencion-cliente/clientes/${contactoId}/seguimientos`, body).then((r) => r.data),

  // ── Tareas ──
  getTareasByContacto: async (contactoId: number): Promise<CliTarea[]> => {
    const { data } = await api.get(`/atencion-cliente/clientes/${contactoId}/tareas`)
    return norm(data?.data ?? data, parseCliTarea)
  },
  getTareasMias: async (): Promise<CliTarea[]> => {
    const { data } = await api.get('/atencion-cliente/tareas/mias')
    return norm(data?.data ?? data, parseCliTarea)
  },
  createTarea: (contactoId: number, body: { tipo?: TipoTarea; titulo: string; descripcion?: string; prioridad?: Prioridad; asignadoA?: number; fechaVencimiento?: string }) =>
    api.post(`/atencion-cliente/clientes/${contactoId}/tareas`, body).then((r) => r.data),
  updateTareaEstatus: (id: number, estatus: EstatusTarea) =>
    api.patch(`/atencion-cliente/tareas/${id}/estatus`, { estatus }).then((r) => r.data),
  deleteTarea: (id: number) =>
    api.delete(`/atencion-cliente/tareas/${id}`).then((r) => r.data),
}
