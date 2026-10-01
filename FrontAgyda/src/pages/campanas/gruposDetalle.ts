import { api } from '@/lib/axios'

// Grupos de Contact Center con todo lo que tienen enlazado (GET /campanas/grupos).
export interface Ref { id: number; nombre: string }
export interface GrupoDetalle {
  id: number
  nombre: string
  descripcion: string | null
  modalidad: 'omnicanal' | 'marcador' | 'ambos'
  atiendeClientes: boolean
  creadoEn: string | null
  marcador: string | null
  ventas: Ref | null
  campanias: Ref[]
  skills: Ref[]
  canales: (Ref & { tipo: string; habilitado: boolean })[]
  formularios: Ref[]
  tipificaciones: string[]
  supervisores: Ref[]
  agentes: Ref[]
  clientes: number
}

export const gruposDetalleQuery = {
  queryKey: ['campanas-grupos'],
  queryFn: () => api.get('/campanas/grupos').then((r) => (r.data?.data ?? []) as GrupoDetalle[]),
  staleTime: 30_000,
}

