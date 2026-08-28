import type { TicketArea, TicketPrioridad, TicketEstado } from './ticket.types'

export interface FichaUsuarioPerfil {
  id: number
  nombre: string
  correo: string | null
  telefono: string | null
  departamento: string | null
  tipoUsuario: string
  activo: boolean
}

export interface FichaUsuarioTicket {
  id: number
  titulo: string
  area: TicketArea
  prioridad: TicketPrioridad
  estado: TicketEstado
  fechaCreacion: string
  nivelActual: number
}

export interface FichaUsuarioActivo {
  id: number
  nombreEquipo: string | null
  marca: string | null
  modelo: string | null
  numeroSerie: string | null
  sistemaOperativo: string | null
  ubicacion: string | null
  estado: string | null
}

export interface FichaUsuarioStats {
  totalTickets: number
  ticketsAbiertos: number
  ticketsReabiertos: number
  ratingPromedio: number | null
}

export interface FichaUsuario {
  perfil: FichaUsuarioPerfil
  ticketsAbiertos: FichaUsuarioTicket[]
  activos: FichaUsuarioActivo[]
  stats: FichaUsuarioStats
}
