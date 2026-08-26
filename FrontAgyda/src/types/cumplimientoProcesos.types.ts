export interface Proceso {
  id: number
  nombre: string
  descripcion: string | null
  pasos: string[]
  activo: boolean
}

export interface CrearProcesoPayload {
  nombre: string
  descripcion?: string
  pasos: string[]
}

export interface PasoRegistro {
  nombre: string
  cumplido: boolean
}

export interface RegistroProceso {
  id: number
  procesoId: number
  procesoNombre: string
  agenteId: number
  agenteNombre: string | null
  evaluadorId: number | null
  pasos: PasoRegistro[]
  pctCumplimiento: number
  notas: string | null
  fecha: string
}

export interface CrearRegistroProcesoPayload {
  procesoId: number
  agenteId: number
  pasos: PasoRegistro[]
  notas?: string
}
