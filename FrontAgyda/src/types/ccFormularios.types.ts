// Formularios de Atención (Contact Center) — Entrega 1: tipos del CRUD de
// administración (constructor). La definición "resuelta" para el agente
// durante una interacción real (FormDefinition DTO) llega en la Entrega 3
// con su propio tipo, más liviano y ya con reglas evaluadas.

export type CCFormEstado = 'borrador' | 'publicado' | 'inactivo' | 'archivado'
export type CCFormAncho = 'completo' | 'medio' | 'tercio'

// Debe reflejar TIPOS_CAMPO_VALIDOS de ccFormulariosController.js — el
// backend es la fuente de verdad (GET /contact-center/formularios/tipos-campo
// la devuelve en vivo), esta lista es solo para tipar sin async en el
// ComponentRegistry del constructor.
export type CCFormTipoCampo =
  | 'texto_corto' | 'texto_largo' | 'numero' | 'telefono' | 'email' | 'fecha' | 'hora'
  | 'fecha_hora' | 'lista' | 'radio' | 'checkbox' | 'si_no' | 'multiseleccion'
  | 'moneda' | 'porcentaje' | 'url' | 'archivo' | 'imagen' | 'firma' | 'catalogo'
  | 'usuario_agente' | 'sucursal' | 'calculado' | 'oculto' | 'titulo' | 'separador'
  | 'buscador'

export interface CCFormCanalDisponible {
  id: number
  nombre: string
  tipo: string
}

// origen distingue de qué tabla salió el resultado — el campo Buscador une
// interacciones cerradas de Contact Center (CCO_INTERACCIONES) con
// postulantes del formulario público de registro (CCO_CAMPANIA_POSTULANTES,
// ej. Postulación Totis): comparten campaña pero son entidades distintas.
export type CCFormBuscadorOrigen = 'interaccion' | 'postulante'

export interface CCFormBuscadorResultado {
  id: number
  origen: CCFormBuscadorOrigen
  clienteNombre: string | null
  clienteTelefono: string | null
  fecha: string | null
  canalId: number | null
  canalNombre: string | null
  tipificacionNombre: string | null
}

export type CCFormModo = 'interno' | 'externo'

export interface CCFormulario {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  estado: CCFormEstado
  activo: boolean
  creadoPorNombre: string | null
  fechaCreacion: string
  fechaActualizacion: string
  versionMaxima: number | null
  versionPublicada: number | null
  modo: CCFormModo
  tokenPublico: string | null
}

export interface CCFormVersionResumen {
  id: number
  numero: number
  estado: CCFormEstado
  fechaCreacion: string
  publicadoPorNombre: string | null
  fechaPublicacion: string | null
}

export interface CCFormularioDetalle extends CCFormulario {
  versiones: CCFormVersionResumen[]
}

export interface CCFormOpcion {
  id?: number
  valor: string
  etiqueta: string
  orden: number
}

export interface CCFormCampo {
  id: number
  seccionId: number
  codigo: string
  tipo: CCFormTipoCampo
  etiqueta: string
  descripcion: string | null
  placeholder: string | null
  ayuda: string | null
  obligatorio: boolean
  soloLectura: boolean
  visible: boolean
  valorPredeterminado: string | null
  orden: number
  ancho: CCFormAncho
  longitudMin: number | null
  longitudMax: number | null
  valorMin: number | null
  valorMax: number | null
  regex: string | null
  catalogoFuente: string | null
  catalogoConfigJson: string | null
  configJson: string | null
  opciones: CCFormOpcion[]
}

export interface CCFormSeccion {
  id: number
  codigo: string | null
  titulo: string
  descripcion: string | null
  orden: number
  visible: boolean
  colapsable: boolean
  estadoInicialColapsado: boolean
  configJson: string | null
  campos: CCFormCampo[]
}

export interface CCFormVersionCompleta {
  id: number
  formularioId: number
  numero: number
  estado: CCFormEstado
  secciones: CCFormSeccion[]
}

export interface CCFormAsignacion {
  id: number
  campaniaId: number
  campaniaNombre: string
  canalId: number | null
  canalNombre: string | null
  canalTipo: string | null
  formVersionId: number
  formularioId: number
  formularioNombre: string
  version: number
  activo: boolean
  fechaCreacion: string
}

export interface CCFormTipificacionOpcion {
  id: number
  campaniaId: number | null
  nombre: string
  descripcion: string | null
  requiereComentario: boolean
  orden: number
}

export interface CCFormTipificacionesDelFormulario {
  campanias: { campaniaId: number; campaniaNombre: string }[]
  tipificaciones: CCFormTipificacionOpcion[]
  seleccionadas: number[]
}

export interface CCFormInteraccionBuscada {
  id: number
  clienteNombre: string | null
  clienteTelefono: string | null
  agenteNombre: string | null
  fechaInicio: string
  fechaCierre: string | null
  estado: string
  canalNombre: string | null
  campaniaNombre: string | null
  tipificacionNombre: string | null
}

export interface CCFormCampoInput {
  codigo: string
  tipo: CCFormTipoCampo
  etiqueta: string
  descripcion?: string | null
  placeholder?: string | null
  ayuda?: string | null
  obligatorio?: boolean
  soloLectura?: boolean
  visible?: boolean
  valorPredeterminado?: string | null
  orden?: number
  ancho?: CCFormAncho
  longitudMin?: number | null
  longitudMax?: number | null
  valorMin?: number | null
  valorMax?: number | null
  regex?: string | null
  catalogoFuente?: string | null
  opciones?: CCFormOpcion[]
}

export type CCFormAccionTipo =
  | 'create_followup' | 'return_to_queue' | 'send_whatsapp' | 'send_sms' | 'send_email'
  | 'call_webhook' | 'change_customer_status' | 'change_stage' | 'custom'

export interface CCFormAccionPost {
  id: number
  tipo: CCFormAccionTipo
  etiqueta: string
  descripcion: string | null
  orden: number
  activo?: boolean
}

export interface CCFormRespuestaInput {
  campoId: number
  valor: string | number | boolean | string[] | null
}

export interface CCFormGuardarRespuestasResultado {
  interaccionId: number
  acciones: CCFormAccionPost[]
}

// ── Formulario público (modo externo, sin login) ──────────────────────────
export interface CCFormPublicoCampo {
  id: number
  seccionId: number
  codigo: string
  tipo: CCFormTipoCampo
  etiqueta: string
  placeholder: string | null
  ayuda: string | null
  obligatorio: boolean
  visible: boolean
  orden: number
  ancho: CCFormAncho
  catalogoFuente: string | null
  configJson: string | null
  opciones: { valor: string; etiqueta: string; orden: number }[]
}

export interface CCFormPublicoSeccion {
  id: number
  titulo: string
  descripcion: string | null
  orden: number
  visible: boolean
  campos: CCFormPublicoCampo[]
}

export interface CCFormPublicoDefinicion {
  formularioId: number
  nombre: string
  versionId: number
  numero: number
  secciones: CCFormPublicoSeccion[]
}
