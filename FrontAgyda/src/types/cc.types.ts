export type CCEstado = 'en_cola' | 'activa' | 'pendiente_tipificacion' | 'cerrada'
export type CCEmisor = 'cliente' | 'agente' | 'sistema'
export type CCCanalTipo = 'whatsapp' | 'messenger' | 'instagram' | 'whatsapp_baileys' | 'messenger_fca' | 'instagram_privado' | 'web_publica' | 'test'

// Estado de la sesión Baileys (solo aplica a canales tipo whatsapp_baileys).
export type CCBaileysEstado = 'desconectado' | 'esperando_qr' | 'conectado'

// Estado de la sesión FCA (solo aplica a canales tipo messenger_fca). Sin
// 'esperando_qr': aquí se conecta en cuanto se guarda un appstate.json válido.
export type CCFcaEstado = 'desconectado' | 'conectado' | 'error'

// Estado de la sesión de Instagram vía API privada (solo aplica a canales
// tipo instagram_privado). Igual que FCA: sin QR, se conecta con usuario+password.
export type CCIgpEstado = 'desconectado' | 'conectado' | 'error'

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

// Modo de sesión de un canal no oficial (Baileys/FCA/IGP): 'compartido' es
// una sola cuenta para toda la campaña (comportamiento original); 'individual'
// es una cuenta POR AGENTE del skill, cada quien vincula la suya — ver
// CCSesionAgenteCanal y ccService.listSesionesAgentesCanal.
export type CCModoSesion = 'compartido' | 'individual'

// Cómo se reparten las conversaciones que entran por este nivel.
// Canal: 'campania' hereda de su campaña. Campaña: 'global' hereda del CCO_CONFIG.
// 'auto' = el sistema asigna; 'manual' = queda en cola y los agentes la jalan.
export type CCModoAsignacionCanal = 'campania' | 'auto' | 'manual'
export type CCModoAsignacionCampania = 'global' | 'auto' | 'manual'
export type CCModoAsignacionGlobal = 'auto' | 'manual'

export interface CCCanal {
  id: number
  tipo: CCCanalTipo
  nombre: string
  habilitado: boolean
  grupoId: number | null
  campaniaId: number | null
  modoSesion: CCModoSesion
  modoAsignacion?: CCModoAsignacionCanal
  esCanalCrm?: boolean
  metaPageId: string | null
  metaBusinessId: string | null
  verifyToken: string | null
  webhookSuscrito: boolean
  accessTokenConfigurado: boolean
  appSecretConfigurado: boolean
  webhookUrl: string
  // Solo presentes/relevantes cuando tipo === 'whatsapp_baileys' y modoSesion === 'compartido'.
  baileysEstado?: CCBaileysEstado
  baileysNumero?: string | null
  // Solo presentes/relevantes cuando tipo === 'messenger_fca' y modoSesion === 'compartido'.
  fcaEstado?: CCFcaEstado
  fcaUsuario?: string | null
  fcaAppStateConfigurado?: boolean
  // Solo presentes/relevantes cuando tipo === 'instagram_privado' y modoSesion === 'compartido'.
  igpEstado?: CCIgpEstado
  igpUsuario?: string | null
}

// Una fila por agente del skill, cuando el canal está en modoSesion === 'individual'.
export interface CCSesionAgenteCanal {
  usuarioId: number
  nombre: string
  baileysEstado: CCBaileysEstado
  baileysNumero: string | null
  fcaEstado: CCFcaEstado
  fcaUsuario: string | null
  igpEstado: CCIgpEstado
  igpUsuario: string | null
}

export interface CCCampania {
  id: number
  nombre: string
  descripcion: string | null
  maxChatsPorAgente: number | null
  // Siempre true hoy: listCampanias solo devuelve activas (eliminar = ocultar).
  activo: boolean
  canalesCount: number
  skillsCount: number
  agentesCount: number
  // Identificador público de la campaña para páginas externas (ej.
  // contacto.html de Totis) — GET /api/contact-center/publico/campanias/:slug/contacto.
  slug: string | null
  // Contacto "de respaldo" mostrado en esas páginas externas: teléfono para
  // llamadas en horario, y URLs de Facebook/Instagram capturadas a mano
  // (Messenger/Instagram no oficiales son cuentas personales sin perfil
  // público al que enlazar, así que esto no sale de ningún canal).
  contactoTelefono: string | null
  contactoFacebookUrl: string | null
  contactoInstagramUrl: string | null
  modoAsignacion?: CCModoAsignacionCampania
}

// Registrado desde la página pública de postulación (ej. registro.html de
// Totis) — sin login, cualquiera con el link/QR puede enviar el formulario.
export interface CCPostulante {
  id: number
  nombre: string
  telefono: string
  correo: string | null
  redesSociales: string | null
  fechaRegistro: string
}

// Fila del listado transversal de "Gestión de postulantes" — el mismo
// postulante pero con la campaña a la que pertenece y su tipificación más
// reciente (si alguna vez se le registró una llamada tipificada).
export interface CCPostulanteGestion {
  id: number
  nombre: string
  telefono: string
  correo: string | null
  fechaRegistro: string
  campaniaId: number
  campaniaNombre: string
  tipificacion: string | null
  observaciones: string | null
  tipificacionFecha: string | null
}

export interface CCPostulanteNota {
  id: number
  usuarioId: number
  usuarioNombre: string | null
  nota: string
  fecha: string
}

export interface CCCampaniaSimple {
  id: number
  nombre: string
}

export interface CCGrupo {
  id: number
  campaniaId: number
  nombre: string
  descripcion: string | null
  icono: string | null
  // Siempre true hoy: listGrupos solo devuelve activos (eliminar = ocultar).
  activo: boolean
  agentesCount: number
  // El skill con menor CG_ID entre los activos de su campaña (el primero creado).
  esPrincipal: boolean
}

// Un skill al que está asignado el agente actual, con el nombre de su
// campaña ya incluido — reverso de CCGrupo (que es "un skill, cuántos
// agentes"), este es "el agente, en qué skills/campañas está".
export interface CCMiSkill {
  id: number
  nombre: string
  icono: string | null
  campaniaId: number
  campaniaNombre: string
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
  modoAsignacion: CCModoAsignacionGlobal
}

export interface CCMetricas {
  enCola: number
  activas: number
  agentesDisponibles: number
  cerradasHoy: number
  porCanal: { nombre: string; tipo: string; total: number }[]
}

export const CANAL_ICONO: Record<CCCanalTipo, string> = {
  whatsapp: '🟢', messenger: '💬', instagram: '📷',
  whatsapp_baileys: '🟢', messenger_fca: '💬', instagram_privado: '📷', web_publica: '🌐', test: '🧪',
}
export const CANAL_LABEL: Record<CCCanalTipo, string> = {
  whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram',
  whatsapp_baileys: 'WhatsApp (QR, no oficial)', messenger_fca: 'Messenger (appstate, no oficial)',
  instagram_privado: 'Instagram (usuario/password, no oficial)', web_publica: 'Web (widget público)', test: 'Prueba',
}
