import { api } from '@/lib/axios'

export interface ActivoGeneral {
  id: number
  nombreEquipo: string | null
  numeroSerie: string | null
  departamento: string | null
  asignadoId: number | null
  asignadoNombre: string | null
}

function parseActivo(raw: Record<string, unknown>): ActivoGeneral {
  const asignadoA = raw['asignadoA']
  return {
    id: Number(raw['id'] ?? 0),
    nombreEquipo: (raw['nombreEquipo'] as string | null) ?? null,
    numeroSerie: (raw['numeroSerie'] as string | null) ?? null,
    departamento: (raw['departamento'] as string | null) ?? null,
    asignadoId: asignadoA != null ? Number(asignadoA) : null,
    asignadoNombre: (raw['asignadoNombre'] as string | null) ?? null,
  }
}

export const activosGeneralesService = {
  async getActivosGenerales(): Promise<ActivoGeneral[]> {
    const { data } = await api.get('/activos/generales')
    const list: Record<string, unknown>[] = data?.data ?? []
    return list.map(parseActivo)
  },
}
