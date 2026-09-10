export interface ReporteDiarioPorCampania {
  campania: string
  count: number
}

export interface ReporteDiarioRankingAgente {
  agenteId: number
  nombre: string
  minutosPausa: number
}

export interface ReporteDiario {
  fecha: string
  totalAsignado: number
  agentesConAsignacion: number
  agentesTrabajaron: number
  porCampania: ReporteDiarioPorCampania[]
  minutosPorTipo: {
    banio: number
    comida: number
    capacitacion: number
    permiso: number
  }
  rankingPausas: ReporteDiarioRankingAgente[]
}

export interface ReportePostulantesPorCampania {
  fecha: string
  campania: string
  total: number
}

export interface ReportePostulantesPorTipificacion {
  tipificacion: string | null
  etiqueta: string
  total: number
}

export interface ReportePostulantesAgente {
  usuarioId: number
  usuarioNombre: string | null
  notas: number
}

export interface ReportePostulantesSinTipificar {
  nombre: string
  telefono: string
  campania: string
  diasEsperando: number
}

export interface ReportePostulantes {
  desde: string
  hasta: string
  porCampania: ReportePostulantesPorCampania[]
  porTipificacion: ReportePostulantesPorTipificacion[]
  productividadAgentes: ReportePostulantesAgente[]
  sinTipificar: { total: number; masAntiguos: ReportePostulantesSinTipificar[] }
}

// ── Reporte Ejecutivo de Reclutamiento — réplica del Excel de control de
// postulantes por campaña, leído de CCO_INTERACCIONES + respuestas del
// Formulario de Atención asignado (Canal de contacto, Fecha de asistencia,
// Horario) y CI_TIPIFICACION_ID (Estatus actual).
export interface ReporteEjecutivoEmbudoItem {
  estatus: string
  cantidad: number
  porcentaje: number
}
export interface ReporteEjecutivoReclutamiento {
  desde: string
  hasta: string
  campaniaId: number
  indicadores: {
    totalPostulantes: number
    conFechaAsistencia: number
    conHorario: number
    conCanalIdentificado: number
  }
  embudo: ReporteEjecutivoEmbudoItem[]
  kpisConversion: {
    citasSobreTotal: number
    confirmadasSobreCitas: number
    asistenciaRegistrada: number
    contratacionSobreTotal: number
    descarteMasNoInteres: number
  }
  graficos: {
    distribucionPorEstatus: { estatus: string; cantidad: number }[]
    origenPorCanal: { canal: string; cantidad: number }[]
    gestionPorAsesor: { agente: string; cantidad: number }[]
    agendaPorFechaAsistencia: { fecha: string; cantidad: number }[]
  }
  // Interacciones sin Canal de contacto identificado (nunca pasaron por el
  // formulario completo) — se listan para poder abrirlas y tipificarlas.
  sinGestionar: { id: number; clienteNombre: string | null; fechaInicio: string }[]
}

// ── Suite de reportes: listado de interacciones cerradas (buscador) ──
export interface InteraccionItem {
  id: number
  clienteNombre: string | null
  clienteTelefono: string | null
  agenteId: number | null
  agenteNombre: string | null
  fechaInicio: string
  fechaCierre: string | null
  estado: string
  canalNombre: string | null
  campaniaNombre: string | null
  tipificacionNombre: string | null
}

export interface InteraccionesFiltro {
  texto?: string
  agenteId?: number
  tipificacionId?: number
  campaniaId?: number
  desde?: string
  hasta?: string
}

// ── Suite de reportes: definiciones .rdl / .rdlc del catálogo ──
import type { RdlDefinition } from '@/lib/rdl'

export type RdlRol = 'AD' | 'TI' | 'CC' | 'ST' | 'VE'

export interface RdlCarpeta {
  id: number
  nombre: string
  fecha: string
  reportes: number
}

export interface RdlReporte {
  id: number
  nombre: string
  descripcion: string
  carpeta: string
  carpetaId: number | null
  archivo: string
  archivoOriginal: string
  tamano: number
  versionRdl: string | null
  compatible: boolean
  metadata: RdlDefinition | null
  roles: RdlRol[]
  usuarios: number[]
  subidoPor: number | null
  subidoNombre: string
  fecha: string
  url: string
}

/* ── Constructor de reportes (variables del sistema, estilo InConcert) ── */

export type RbFormato = 'entero' | 'decimal' | 'minutos' | 'duracion'
export type RbFiltroTipo = 'fecha_rango' | 'texto' | 'id' | 'id_lista' | 'enum'

export interface RbDimension { id: string; label: string; tipo: string }
export interface RbMetrica { id: string; label: string; formato: RbFormato }
export interface RbFiltroDef {
  id: string
  label: string
  tipo: RbFiltroTipo
  valores: string[] | null
  catalogo: string | null
  porDefecto: boolean
}
export interface RbOrigen {
  id: string
  label: string
  descripcion: string
  dimensiones: RbDimension[]
  metricas: RbMetrica[]
  filtros: RbFiltroDef[]
  ordenPorDefecto: string
}
export interface RbCatalogo { origenes: Record<string, RbOrigen> }

export interface RbFiltroValor {
  id: string
  desde?: string
  hasta?: string
  valor?: string
  valores?: (string | number)[]
}
export interface RbDefinicion {
  origen: string
  dimensiones: string[]
  metricas: string[]
  filtros: RbFiltroValor[]
  orden?: { campo: string; dir: 'asc' | 'desc' }
  limite?: number
}
export interface RbColumna {
  id: string
  label: string
  tipo?: string
  formato?: RbFormato
  esDimension: boolean
}
export interface RbResultado {
  columnas: RbColumna[]
  filas: Record<string, unknown>[]
  totales: Record<string, number>
  meta: { limite: number; orden: { campo: string; dir: string }; filasDevueltas: number; truncado: boolean }
  sql?: string
}

export interface RbReporteGuardado {
  id: number
  nombre: string
  descripcion: string
  carpeta: string
  carpetaId: number | null
  origen: string
  definicion: RbDefinicion | null
  roles: RdlRol[]
  usuarios: number[]
  creadoPor: number | null
  creadoNombre: string
  fecha: string
  actualizado: string | null
  tipo: 'construido'
}
