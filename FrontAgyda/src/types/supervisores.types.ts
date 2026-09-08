export interface SupervisorAsignacion {
  id: number
  campaniaId: number
  campaniaNombre: string
  supervisorId: number
  supervisorNombre: string
}

export type EstadoAgente = 'disponible' | 'pausa' | 'no_disponible' | 'desconectado'

export interface AgenteEstado {
  agenteId: number
  nombre: string
  campaniaId: number
  grupoId: number
  grupoNombre: string
  estado: EstadoAgente
  tipoPausa: string | null
  pausaDesde: string | null
  ultimaConexion: string | null
}

export interface SkillPanel {
  id: number
  campaniaId: number
  nombre: string
  icono: string | null
}

export interface PanelSupervisor {
  campanias: { id: number; nombre: string }[]
  grupos: SkillPanel[]
  agentes: AgenteEstado[]
}

export interface ProductividadAgente {
  agenteId: number
  nombre: string
  banio: number
  comida: number
  capacitacion: number
  permiso: number
  totalPausaMin: number
  estado: EstadoAgente
  tipoPausa: string | null
  ultimaConexion: string | null
  // Promedio de minutos en pausa por día de los 7 días previos a la fecha
  // consultada (sin incluirla) — null si no hay historial suficiente.
  avgSemanalMin: number | null
}

export const TIPO_PAUSA_LABELS: Record<string, string> = {
  'baño': 'Baño',
  comida: 'Comida',
  'capacitación': 'Capacitación',
  permiso: 'Permiso',
}

export const ESTADO_AGENTE_LABELS: Record<EstadoAgente, string> = {
  disponible: 'Disponible',
  pausa: 'En pausa',
  no_disponible: 'No disponible',
  desconectado: 'Desconectado',
}
