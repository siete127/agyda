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
  tecnicoId: number | null
  tecnicoNombre: string | null
  horarioInicio: string | null
  horarioFin: string | null
  diasSemana: string | null
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
  tecnicoId?: number | null
  horarioInicio?: string | null
  horarioFin?: string | null
  diasSemana?: string[]
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
  enrutamiento: {
    reglaAplicada: number | null
    nivel: number
    especialidadId: number | null
    tecnicoForzadoId: number | null
    grupoId: number | null
    grupoNombre: string | null
  }
  asignacion: {
    tecnicoId: number | null
    tecnicoNombre: string | null
  }
}
