export type CCEstado = 'en_cola' | 'activa' | 'pendiente_tipificacion' | 'cerrada'
export type CCEmisor = 'cliente' | 'agente' | 'sistema'
export type CCCanalTipo = 'whatsapp' | 'messenger' | 'instagram' | 'test'

export interface CCInteraccion {
  id: number
  canalId: number
  canalNombre: string | null
  tipo: CCCanalTipo
  clienteExtId: string | null
  clienteNombre: string | null
  clienteTelefono: string | null
  contactoId: number | null
  campaniaId: number | null
  grupoId: number | null
  grupoNombre: string | null
  agenteId: number | null
  agenteNombre: string | null
  estado: CCEstado
  motivoCierreId: number | null
  comentarioCierre: string | null
  tipificacionId: number | null
  fechaInicio: string
  fechaPrimerRespuesta: string | null
  fechaUltimoMsjCliente: string | null
  fechaCierre: string | null
  ticket: number | null
  mensajes?: CCMensaje[]
}

export interface CCMensaje {
  id: number
  emisor: CCEmisor
  agenteId: number | null
  contenido: string | null
  mediaId: number | null
  mediaMime: string | null
  mediaNombre: string | null
  estadoEntrega: string | null
  fecha: string
}

export interface CCCanal {
  id: number
  tipo: CCCanalTipo
  nombre: string
  habilitado: boolean
  grupoId: number | null
  campaniaId: number | null
  metaPageId: string | null
  metaBusinessId: string | null
  verifyToken: string | null
  webhookSuscrito: boolean
  accessTokenConfigurado: boolean
  appSecretConfigurado: boolean
  webhookUrl: string
}

export interface CCCampania {
  id: number
  nombre: string
  descripcion: string | null
  maxChatsPorAgente: number | null
}

export interface CCGrupo {
  id: number
  campaniaId: number
  nombre: string
  descripcion: string | null
  icono: string | null
}

export interface CCTipificacion {
  id: number
  campaniaId: number | null
  nombre: string
  descripcion?: string | null
  requiereComentario: boolean
  orden?: number
}

export interface CCMotivoCierre {
  id: number
  motivo: string
  descripcion?: string | null
  requiereComentario: boolean
  orden?: number
}

export interface CCPlantilla {
  id: number
  nombre: string
  contenido: string
  visibilidad: 'publica' | 'privada'
  usuarioId?: number | null
}

export interface CCAgenteEstado {
  usuarioId: number
  nombre: string
  online: boolean
  disponible: boolean
  activas: number
  acwHasta: string | null
  ultimaConexion: string | null
  enPausa: boolean
}

export interface CCMiEstado {
  online: boolean
  disponible: boolean
  activas: number
  acwHasta: string | null
  enPausa: boolean
  enAcw: boolean
}

export interface CCConfig {
  slaPrimeraRespuestaSeg: number
  slaRespuestaSeg: number
  acwSeg: number
  maxInteraccionesPorAgente: number
  autocierreInactividadMin: number
  msgBienvenida: string
  msgFueraHorario: string
  horarioInicio: string
  horarioFin: string
  diasSemana: string
}

export interface CCMetricas {
  enCola: number
  activas: number
  agentesDisponibles: number
  cerradasHoy: number
  porCanal: { nombre: string; tipo: string; total: number }[]
}

export const CANAL_ICONO: Record<CCCanalTipo, string> = {
  whatsapp: '🟢', messenger: '💬', instagram: '📷', test: '🧪',
}
export const CANAL_LABEL: Record<CCCanalTipo, string> = {
  whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', test: 'Prueba',
}
