export interface ReglaAsignacion {
  id: number
  nombre: string
  activa: boolean
  orden: number
  area: string | null
  categoriaId: number | null
  categoriaNombre: string | null
  subcategoriaId: number | null
  subcategoriaNombre: string | null
  sedeId: number | null
  sedeNombre: string | null
  prioridad: string | null
  nivelRequerido: number | null
  especialidadId: number | null
  especialidadNombre: string | null
}

export interface ReglaAsignacionPayload {
  nombre: string
  activa?: boolean
  orden?: number
  area?: string | null
  categoriaId?: number | null
  subcategoriaId?: number | null
  sedeId?: number | null
  prioridad?: string | null
  nivelRequerido?: number | null
  especialidadId?: number | null
}

export interface SimulacionAsignacionInput {
  area: string
  nivel?: number
  categoriaId?: number | null
  subcategoriaId?: number | null
  sedeId?: number | null
  prioridad?: string | null
  tipoCarga?: 'ticket' | 'chat'
}

export interface SimulacionAsignacionResultado {
  reglaAplicada: { id: number; nivelRequerido: number | null } | null
  tecnicoId: number | null
  tecnicoNombre: string | null
}
