export type TecnicoEstadoTrabajo = 'disponible' | 'pausa' | 'fuera_horario' | 'ocupado'

export interface TecnicoCargaActual {
  tickets: number
  chats: number
}

export interface TecnicoItem {
  id: number
  nombre: string
}

export interface Tecnico {
  userId: number
  nombre: string
  area: string
  disponible: boolean
  nivel: number
  estadoTrabajo: TecnicoEstadoTrabajo
  maxTickets: number
  maxChats: number
  prioridadesPermitidas: string[] | null
  horarioInicio: string | null
  horarioFin: string | null
  diasSemana: string[] | null
  grupoNombre: string | null
  especialidades: TecnicoItem[]
  categoriasPermitidas: TecnicoItem[]
  sedesPermitidas: TecnicoItem[]
  cargaActual: TecnicoCargaActual
}

export interface ActualizarPerfilTecnicoPayload {
  area: string
  nivel: number
  disponible: boolean
  estadoTrabajo: TecnicoEstadoTrabajo
  maxTickets: number
  maxChats: number
  prioridadesPermitidas: string[]
  horarioInicio?: string | null
  horarioFin?: string | null
  diasSemana: string[]
  especialidadesIds: number[]
  categoriasIds: number[]
  sedesIds: number[]
}
