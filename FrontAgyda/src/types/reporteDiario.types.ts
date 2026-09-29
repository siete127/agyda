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

/** Opción de un parámetro del RDL (lista fija o salida de un dataset). */
export interface RdlOpcion { value: string; label: string }

/** Resultado de ejecutar un RDL en AGYDA. */
export interface RdlResultado {
  columnas: string[]
  filas: Record<string, unknown>[]
  total: number
  truncado: boolean
  avisos: string[]
  dataSet: string
  ms: number
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

export type RbFormato = 'entero' | 'decimal' | 'minutos' | 'duracion' | 'porcentaje'
export type RbFiltroTipo = 'fecha_rango' | 'hora_rango' | 'texto' | 'id' | 'id_lista' | 'enum' | 'grupo'

export interface RbDimension { id: string; label: string; tipo: string; tiempo?: boolean }
export interface RbMetrica { id: string; label: string; formato: RbFormato }
export interface RbFiltroDef {
  id: string
  label: string
  tipo: RbFiltroTipo
  valores: string[] | null
  etiquetas?: string[] | null
  catalogo: string | null
  porDefecto: boolean
}
export type RbModalidadGrupo = 'omnicanal' | 'marcador' | 'ambos'
export interface RbOrigen {
  id: string
  label: string
  descripcion: string
  // Modalidades de grupo con las que aplica (null = siempre)
  requiere?: RbModalidadGrupo[] | null
  dimensiones: RbDimension[]
  metricas: RbMetrica[]
  filtros: RbFiltroDef[]
  ordenPorDefecto: string
}
export interface RbGrupo { id: number; nombre: string; modalidad: RbModalidadGrupo }
export interface RbCatalogo {
  origenes: Record<string, RbOrigen>
  // 'todos' = administrador; 'supervisor' = solo sus grupos
  acceso?: 'todos' | 'supervisor'
  grupos?: RbGrupo[]
  presetsFecha?: string[]
}

export type RbPresetFecha =
  | 'hoy' | 'ayer' | 'ult7' | 'ult30' | 'ult90'
  | 'semana_actual' | 'semana_pasada' | 'mes_actual' | 'mes_pasado' | 'anio_actual'

export interface RbFiltroValor {
  id: string
  desde?: string | number
  hasta?: string | number
  preset?: RbPresetFecha
  valor?: string
  valores?: (string | number)[]
  excluir?: boolean
}
export type RbOperador = '>' | '>=' | '<' | '<=' | '=' | '<>'
export interface RbCondicion { metrica: string; op: RbOperador; valor: number }

export type RbTipoVisual =
  | 'auto' | 'tabla' | 'kpi' | 'barras' | 'barras_h' | 'apiladas' | 'lineas' | 'area' | 'pastel' | 'calor'
export interface RbVisual {
  tipo: RbTipoVisual
  // Métrica que se grafica cuando la forma solo admite una (apiladas, pastel, calor)
  metrica?: string
  // Columnas extra de la tabla
  pct?: boolean
  acumulado?: boolean
}

export interface RbDefinicion {
  origen: string
  dimensiones: string[]
  metricas: string[]
  filtros: RbFiltroValor[]
  orden?: { campo: string; dir: 'asc' | 'desc' }
  limite?: number
  // Grupo de Configuración al que pertenece el reporte (acota los datos)
  grupoId?: number | null
  condiciones?: RbCondicion[]
  comparar?: 'periodo_anterior' | 'anio_anterior' | null
  visual?: RbVisual
}
export interface RbColumna {
  id: string
  label: string
  tipo?: string
  tiempo?: boolean
  formato?: RbFormato
  esDimension: boolean
}
export interface RbResultado {
  columnas: RbColumna[]
  filas: Record<string, unknown>[]
  totales: Record<string, number | null>
  comparacion?: {
    modo: 'periodo_anterior' | 'anio_anterior'
    desde: string
    hasta: string
    totales: Record<string, number | null>
  } | null
  meta: {
    limite: number
    orden: { campo: string; dir: string }
    rango?: { desde: string; hasta: string } | null
    filasDevueltas: number
    truncado: boolean
  }
  sql?: string
}

// Plantilla del sistema: definición lista, sin ids de agentes/campañas/grupos
export interface RbPlantilla {
  id: string
  categoria: string
  nombre: string
  descripcion: string
  origen: string
  origenLabel: string
  requiere: RbModalidadGrupo[] | null
  definicion: RbDefinicion
}
// Copia de una definición ajustada a un grupo (lo que se quitó, o por qué no aplica)
export interface RbAdaptado {
  definicion: RbDefinicion
  quitados: string[]
  aplica: boolean
  motivo: string | null
}
// Nombre/descr. propuestos al guardar algo que salió de una plantilla o copia
export interface RbSugerencia { nombre: string; descripcion?: string }

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
