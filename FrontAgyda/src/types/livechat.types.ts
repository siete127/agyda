export type LivechatEstado = 'esperando' | 'activa' | 'pendiente_rating' | 'cerrada'
export type LivechatEmisor = 'visitante' | 'agente' | 'sistema'

export interface LivechatConversacion {
  id: number
  visitanteNombre: string | null
  visitanteEmail: string | null
  visitanteTelefono: string | null
  motivo: string | null
  agenteId: number | null
  agenteNombre: string | null
  estado: LivechatEstado
  origen: string
  fechaInicio: string
  fechaCierre: string | null
  rating: number | null
  comentarioCierre: string | null
  motivoCierre: string | null
  // Solo presentes cuando se listan conversaciones en estado 'esperando' —
  // ver livechatController.getMisConversaciones.
  posicionCola?: number | null
  totalCola?: number | null
  // Presentes solo si la conversación vino de una campaña con campaignToken —
  // null en el flujo actual del chatbot público, que no manda campaña.
  campaniaId: number | null
  grupoId: number | null
  motivoCierreId: number | null
}

export interface LivechatCampania {
  id: number
  nombre: string
  descripcion: string | null
  token: string
  activo: boolean
  fechaInicio: string | null
  fechaFin: string | null
  fechaCreacion: string
  maxChatsPorAgente: number | null
}

export interface LivechatGrupo {
  id: number
  campaniaId: number
  nombre: string
  descripcion: string | null
  icono: string | null
  activo: boolean
}

export interface LivechatGrupoAgente {
  id: number
  usuarioId: number
  nombre: string
  activo: boolean
}

export interface LivechatPlantilla {
  id: number
  grupoId: number
  nombre: string
  contenido: string
  tipo: string
  visibilidad: 'publica' | 'privada'
  usuarioId: number | null
  activo: boolean
}

export interface LivechatMotivoCierre {
  id: number
  grupoId: number
  motivo: string
  descripcion: string | null
  requiereComentario: boolean
  orden: number
  activo: boolean
}

export interface LivechatMensaje {
  id: number
  conversacionId: number
  emisor: LivechatEmisor
  agenteId: number | null
  contenido: string
  archivoUrl: string | null
  fecha: string
  leido: boolean
}

export interface LivechatMiEstado {
  online: boolean
  disponible: boolean
  conversacionesActivas: number
}

export interface LivechatConfig {
  id: number
  horarioInicio: string | null
  horarioFin: string | null
  sabadoHorarioInicio: string | null
  sabadoHorarioFin: string | null
  diasSemana: string | null
  mensajeBienvenida: string | null
  mensajeFueraHorario: string | null
  mensajeSinAgentes: string | null
  mensajeEnCola: string | null
  maxChatsPorAgente: number
  timeoutColaMinutos: number
}

export interface LivechatAgenteTransferible {
  usuarioId: number
  nombre: string
  online: boolean
  conversacionesActivas: number
  disponible: boolean
}

export interface LivechatAgenteEstado {
  usuarioId: number
  nombre: string
  online: boolean
  disponible: boolean
  conversacionesActivas: number
  modoAutomatico: boolean
  ultimaConexion: string | null
}

export interface LivechatHistorialFiltros {
  agenteId?: number
  fechaDesde?: string
  fechaHasta?: string
  texto?: string
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k]
    const lk = k.toLowerCase()
    const found = Object.keys(raw).find((rk) => rk.toLowerCase() === lk)
    if (found !== undefined) return raw[found]
  }
  return undefined
}

function parseBool(v: unknown, def = false): boolean {
  if (v === null || v === undefined) return def
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  return def
}

export function parseLivechatConversacion(raw: Record<string, unknown>): LivechatConversacion {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    visitanteNombre: pick(raw, 'visitanteNombre') ? String(pick(raw, 'visitanteNombre')) : null,
    visitanteEmail: pick(raw, 'visitanteEmail') ? String(pick(raw, 'visitanteEmail')) : null,
    visitanteTelefono: pick(raw, 'visitanteTelefono') ? String(pick(raw, 'visitanteTelefono')) : null,
    motivo: pick(raw, 'motivo') ? String(pick(raw, 'motivo')) : null,
    agenteId: pick(raw, 'agenteId') != null ? Number(pick(raw, 'agenteId')) : null,
    agenteNombre: pick(raw, 'agenteNombre') ? String(pick(raw, 'agenteNombre')) : null,
    estado: (pick(raw, 'estado') as LivechatEstado) ?? 'esperando',
    origen: String(pick(raw, 'origen') ?? 'directo'),
    fechaInicio: String(pick(raw, 'fechaInicio') ?? new Date().toISOString()),
    fechaCierre: pick(raw, 'fechaCierre') ? String(pick(raw, 'fechaCierre')) : null,
    rating: pick(raw, 'rating') != null ? Number(pick(raw, 'rating')) : null,
    comentarioCierre: pick(raw, 'comentarioCierre') ? String(pick(raw, 'comentarioCierre')) : null,
    motivoCierre: pick(raw, 'motivoCierre') ? String(pick(raw, 'motivoCierre')) : null,
    posicionCola: pick(raw, 'posicionCola') != null ? Number(pick(raw, 'posicionCola')) : null,
    totalCola: pick(raw, 'totalCola') != null ? Number(pick(raw, 'totalCola')) : null,
    campaniaId: pick(raw, 'campaniaId') != null ? Number(pick(raw, 'campaniaId')) : null,
    grupoId: pick(raw, 'grupoId') != null ? Number(pick(raw, 'grupoId')) : null,
    motivoCierreId: pick(raw, 'motivoCierreId') != null ? Number(pick(raw, 'motivoCierreId')) : null,
  }
}

export function parseLivechatCampania(raw: Record<string, unknown>): LivechatCampania {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    descripcion: pick(raw, 'descripcion') ? String(pick(raw, 'descripcion')) : null,
    token: String(pick(raw, 'token') ?? ''),
    activo: parseBool(pick(raw, 'activo'), true),
    fechaInicio: pick(raw, 'fechaInicio') ? String(pick(raw, 'fechaInicio')) : null,
    fechaFin: pick(raw, 'fechaFin') ? String(pick(raw, 'fechaFin')) : null,
    fechaCreacion: String(pick(raw, 'fechaCreacion') ?? new Date().toISOString()),
    maxChatsPorAgente: pick(raw, 'maxChatsPorAgente') != null ? Number(pick(raw, 'maxChatsPorAgente')) : null,
  }
}

export function parseLivechatGrupo(raw: Record<string, unknown>): LivechatGrupo {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    campaniaId: Number(pick(raw, 'campaniaId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    descripcion: pick(raw, 'descripcion') ? String(pick(raw, 'descripcion')) : null,
    icono: pick(raw, 'icono') ? String(pick(raw, 'icono')) : null,
    activo: parseBool(pick(raw, 'activo'), true),
  }
}

export function parseLivechatGrupoAgente(raw: Record<string, unknown>): LivechatGrupoAgente {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    usuarioId: Number(pick(raw, 'usuarioId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    activo: parseBool(pick(raw, 'activo'), true),
  }
}

export function parseLivechatPlantilla(raw: Record<string, unknown>): LivechatPlantilla {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    grupoId: Number(pick(raw, 'grupoId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    contenido: String(pick(raw, 'contenido') ?? ''),
    tipo: String(pick(raw, 'tipo') ?? 'general'),
    visibilidad: pick(raw, 'visibilidad') === 'privada' ? 'privada' : 'publica',
    usuarioId: pick(raw, 'usuarioId') != null ? Number(pick(raw, 'usuarioId')) : null,
    activo: parseBool(pick(raw, 'activo'), true),
  }
}

export function parseLivechatMotivoCierre(raw: Record<string, unknown>): LivechatMotivoCierre {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    grupoId: Number(pick(raw, 'grupoId') ?? 0),
    motivo: String(pick(raw, 'motivo') ?? ''),
    descripcion: pick(raw, 'descripcion') ? String(pick(raw, 'descripcion')) : null,
    requiereComentario: parseBool(pick(raw, 'requiereComentario'), false),
    orden: Number(pick(raw, 'orden') ?? 0),
    activo: parseBool(pick(raw, 'activo'), true),
  }
}

export function parseLivechatMensaje(raw: Record<string, unknown>): LivechatMensaje {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    conversacionId: Number(pick(raw, 'conversacionId') ?? 0),
    emisor: (pick(raw, 'emisor') as LivechatEmisor) ?? 'sistema',
    agenteId: pick(raw, 'agenteId') != null ? Number(pick(raw, 'agenteId')) : null,
    contenido: String(pick(raw, 'contenido') ?? ''),
    archivoUrl: pick(raw, 'archivoUrl') ? String(pick(raw, 'archivoUrl')) : null,
    fecha: String(pick(raw, 'fecha') ?? new Date().toISOString()),
    leido: parseBool(pick(raw, 'leido')),
  }
}

export function parseLivechatMiEstado(raw: Record<string, unknown>): LivechatMiEstado {
  return {
    online: parseBool(pick(raw, 'online')),
    disponible: parseBool(pick(raw, 'disponible')),
    conversacionesActivas: Number(pick(raw, 'conversacionesActivas') ?? 0),
  }
}

export function parseLivechatAgenteTransferible(raw: Record<string, unknown>): LivechatAgenteTransferible {
  return {
    usuarioId: Number(pick(raw, 'usuarioId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    online: parseBool(pick(raw, 'online'), false),
    conversacionesActivas: Number(pick(raw, 'conversacionesActivas') ?? 0),
    disponible: parseBool(pick(raw, 'disponible'), true),
  }
}

export function parseLivechatAgenteEstado(raw: Record<string, unknown>): LivechatAgenteEstado {
  return {
    usuarioId: Number(pick(raw, 'usuarioId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    online: parseBool(pick(raw, 'online'), false),
    disponible: parseBool(pick(raw, 'disponible'), false),
    conversacionesActivas: Number(pick(raw, 'conversacionesActivas') ?? 0),
    modoAutomatico: parseBool(pick(raw, 'modoAutomatico'), false),
    ultimaConexion: (pick(raw, 'ultimaConexion') as string | null) ?? null,
  }
}

export function parseLivechatConfig(raw: Record<string, unknown>): LivechatConfig {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    horarioInicio: pick(raw, 'horarioInicio') ? String(pick(raw, 'horarioInicio')) : null,
    horarioFin: pick(raw, 'horarioFin') ? String(pick(raw, 'horarioFin')) : null,
    sabadoHorarioInicio: pick(raw, 'sabadoHorarioInicio') ? String(pick(raw, 'sabadoHorarioInicio')) : null,
    sabadoHorarioFin: pick(raw, 'sabadoHorarioFin') ? String(pick(raw, 'sabadoHorarioFin')) : null,
    diasSemana: pick(raw, 'diasSemana') ? String(pick(raw, 'diasSemana')) : null,
    mensajeBienvenida: pick(raw, 'mensajeBienvenida') ? String(pick(raw, 'mensajeBienvenida')) : null,
    mensajeFueraHorario: pick(raw, 'mensajeFueraHorario') ? String(pick(raw, 'mensajeFueraHorario')) : null,
    mensajeSinAgentes: pick(raw, 'mensajeSinAgentes') ? String(pick(raw, 'mensajeSinAgentes')) : null,
    mensajeEnCola: pick(raw, 'mensajeEnCola') ? String(pick(raw, 'mensajeEnCola')) : null,
    maxChatsPorAgente: Number(pick(raw, 'maxChatsPorAgente') ?? 5),
    timeoutColaMinutos: Number(pick(raw, 'timeoutColaMinutos') ?? 15),
  }
}
