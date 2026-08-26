import { api } from '@/lib/axios'
import { type CliFechaImportante, type FechaTipo, type FechaEstatus, parseCliFechaImportante } from '@/types/clienteFecha.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as any)?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export const clienteFechaService = {
  getByContacto: async (contactoId: number): Promise<CliFechaImportante[]> => {
    const { data } = await api.get(`/atencion-cliente/clientes/${contactoId}/fechas-importantes`)
    return norm(data?.data ?? data, parseCliFechaImportante)
  },
  create: (contactoId: number, body: { tipo: FechaTipo; descripcion: string; fecha: string; recurrenteAnual?: boolean; diasAlerta?: string }) =>
    api.post(`/atencion-cliente/clientes/${contactoId}/fechas-importantes`, body).then((r) => r.data),
  update: (id: number, body: { tipo: FechaTipo; descripcion: string; fecha: string; recurrenteAnual?: boolean; diasAlerta?: string; estatus?: FechaEstatus }) =>
    api.put(`/atencion-cliente/fechas-importantes/${id}`, body).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/atencion-cliente/fechas-importantes/${id}`).then((r) => r.data),
}
