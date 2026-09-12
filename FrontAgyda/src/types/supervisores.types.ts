export interface SupervisorAsignacion {
  id: number
  campaniaId: number
  campaniaNombre: string
  supervisorId: number
  supervisorNombre: string
}

export type HistorialAsignacionAccion =
  | 'asignar-supervisor-campania' | 'quitar-supervisor-campania'
  | 'asignar-supervisor-skill' | 'quitar-supervisor-skill'

export interface HistorialAsignacionDetalle {
  campaniaId?: number
  campaniaNombre?: string | null
  grupoId?: number
  grupoNombre?: string | null
  supervisorId?: number
  supervisorNombre?: string | null
}

export interface HistorialAsignacion {
  id: number
  usuarioNombre: string | null
  accion: HistorialAsignacionAccion
  detalle: HistorialAsignacionDetalle | null
  fecha: string
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

export type AlarmaTipo = 'agente_pausa' | 'skill_cola'
export type AlarmaEstado = 'en_alarma' | 'atendida' | 'fin_alarma'
export type AlarmaObjetoTipo = 'agente' | 'skill'

export const ALARMA_TIPO_LABELS: Record<AlarmaTipo, string> = {
  agente_pausa: 'Agente en pausa prolongada',
  skill_cola: 'Chats en cola sin asignar',
}

export interface AlarmaInstancia {
  id: number
  alarmaId: number
  alarmaNombre: string
  tipo: AlarmaTipo
  objetoTipo: AlarmaObjetoTipo
  objetoId: number
  objetoNombre: string | null
  estado: AlarmaEstado
  fechaInicio: string
  fechaAtendida: string | null
  atendidaPor: number | null
  comentario: string | null
}

export type NotificacionTipo = 'informativa' | 'obligatoria'
export type NotificacionAlcance = 'agente' | 'skill' | 'campania' | 'todos'

export const NOTIFICACION_ALCANCE_LABELS: Record<NotificacionAlcance, string> = {
  agente: 'Un agente',
  skill: 'Un skill',
  campania: 'Una campaña',
  todos: 'Todos',
}

export interface NotificacionPendiente {
  id: number
  tipo: NotificacionTipo
  mensaje: string
  autorNombre: string | null
  fecha: string
}

export interface NotificacionEnviada extends NotificacionPendiente {
  alcance: NotificacionAlcance
  alcanceId: number | null
}

export interface ComparadorAgente {
  agenteId: number
  nombre: string
  pausaMin: number
  chatsCerrados: number
  tiempoRespuestaProm: number | null
}

export interface ComparadorCampania {
  campaniaId: number
  nombre: string
  agentes: number
  pausaMin: number
  chatsCerrados: number
}

export interface ComparadorData {
  agentes: ComparadorAgente[]
  campanias: ComparadorCampania[]
}
