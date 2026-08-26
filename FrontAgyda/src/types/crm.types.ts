export type CRMEtapa = 'prospecto' | 'contactado' | 'propuesta' | 'negociacion' | 'ganado' | 'perdido'

export type ClienteEstatusColor = 'verde' | 'azul' | 'amarillo' | 'naranja' | 'rojo' | 'negro' | 'morado'

export const CLIENTE_ESTATUS_COLORES: { key: ClienteEstatusColor; label: string; dot: string; bg: string; text: string }[] = [
  { key: 'verde',    label: 'En seguimiento',            dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { key: 'azul',     label: 'Activo',                     dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700' },
  { key: 'amarillo', label: 'Pendiente de documentación',  dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700' },
  { key: 'naranja',  label: 'Pendiente de pago',           dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700' },
  { key: 'rojo',     label: 'Incidencia',                  dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700' },
  { key: 'negro',    label: 'Inactivo',                    dot: 'bg-gray-700',    bg: 'bg-gray-100',   text: 'text-gray-700' },
  { key: 'morado',   label: 'Finalizado',                  dot: 'bg-purple-500',  bg: 'bg-purple-50',  text: 'text-purple-700' },
]

export interface CRMContacto {
  id: number
  nombre: string
  empresa: string | null
  correo: string | null
  telefono: string | null
  cargo: string | null
  notas: string | null
  fecha: string
  activo: boolean
  tipoCliente: string | null
  direccion: string | null
  productoServicio: string | null
  responsableId: number | null
  estatusCliente: ClienteEstatusColor
  medioContacto: string | null
  observacionesIniciales: string | null
  esCliente: boolean
}

export interface CRMOportunidad {
  id: number
  nombre: string
  contactoId: number | null
  contactoNombre: string | null
  contactoEmpresa: string | null
  etapa: CRMEtapa
  valor: number | null
  fechaCierre: string | null
  asignadoA: number | null
  asignadoNombre: string | null
  creadoPor: number | null
  fecha: string
  notas: string | null
  orden: number
  actividadesPendientes: number
  tags: string[]
  prioridad: 0|1|2|3
  proyectoId: number | null
}

export interface CRMActividad {
  id: number
  opoId: number
  opoNombre?: string
  tipo: 'llamada' | 'email' | 'reunion' | 'nota' | 'tarea'
  descripcion: string | null
  fechaDue: string | null
  asignadoA: number | null
  completada: boolean
  fechaComp: string | null
  fecha: string
}

export interface CRMInteraccion {
  id: number
  opoId: number
  tipo: 'nota' | 'llamada' | 'email' | 'reunion' | 'cambio_etapa' | 'creacion'
  contenido: string | null
  usuarioId: number | null
  usuarioNombre: string | null
  fecha: string
}

export const CRM_ETAPAS: { key: CRMEtapa; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: 'prospecto',   label: 'Prospecto',   color: 'text-gray-600',   bgColor: 'bg-gray-100',    borderColor: 'border-gray-400' },
  { key: 'contactado',  label: 'Contactado',  color: 'text-blue-600',   bgColor: 'bg-blue-50',     borderColor: 'border-blue-500' },
  { key: 'propuesta',   label: 'Propuesta',   color: 'text-purple-600', bgColor: 'bg-purple-50',   borderColor: 'border-purple-500' },
  { key: 'negociacion', label: 'Negociación', color: 'text-amber-600',  bgColor: 'bg-amber-50',    borderColor: 'border-amber-500' },
  { key: 'ganado',      label: 'Ganado',      color: 'text-emerald-600',bgColor: 'bg-emerald-50',  borderColor: 'border-emerald-500' },
  { key: 'perdido',     label: 'Perdido',     color: 'text-red-500',    bgColor: 'bg-red-50',      borderColor: 'border-red-400' },
]

export const CRM_ACTIVIDAD_TIPOS = [
  { key: 'llamada', label: 'Llamada' },
  { key: 'email',   label: 'Email' },
  { key: 'reunion', label: 'Reunión' },
  { key: 'nota',    label: 'Nota' },
  { key: 'tarea',   label: 'Tarea' },
] as const

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseCRMContacto(raw: Record<string, unknown>): CRMContacto {
  return {
    id:       Number(pick(raw, 'id', 'CONT_ID')),
    nombre:   String(pick(raw, 'nombre', 'CONT_NOMBRE') ?? ''),
    empresa:  pick(raw, 'empresa', 'CONT_EMPRESA') as string | null,
    correo:   pick(raw, 'correo', 'CONT_CORREO') as string | null,
    telefono: pick(raw, 'telefono', 'CONT_TELEFONO') as string | null,
    cargo:    pick(raw, 'cargo', 'CONT_CARGO') as string | null,
    notas:    pick(raw, 'notas', 'CONT_NOTAS') as string | null,
    fecha:    String(pick(raw, 'fecha', 'CONT_FECHA') ?? ''),
    activo:   Boolean(pick(raw, 'activo', 'CONT_ACTIVO') ?? true),
    tipoCliente:             pick(raw, 'tipoCliente', 'CONT_TIPO_CLIENTE') as string | null,
    direccion:               pick(raw, 'direccion', 'CONT_DIRECCION') as string | null,
    productoServicio:        pick(raw, 'productoServicio', 'CONT_PRODUCTO_SERVICIO') as string | null,
    responsableId:           pick(raw, 'responsableId', 'CONT_RESPONSABLE_ID') as number | null,
    estatusCliente:          (pick(raw, 'estatusCliente', 'CONT_ESTATUS_CLIENTE') as ClienteEstatusColor) ?? 'verde',
    medioContacto:           pick(raw, 'medioContacto', 'CONT_MEDIO_CONTACTO') as string | null,
    observacionesIniciales:  pick(raw, 'observacionesIniciales', 'CONT_OBSERVACIONES_INICIALES') as string | null,
    esCliente:               Boolean(pick(raw, 'esCliente', 'CONT_ES_CLIENTE') ?? false),
  }
}

export function parseCRMOportunidad(raw: Record<string, unknown>): CRMOportunidad {
  return {
    id:                   Number(pick(raw, 'id', 'OPO_ID')),
    nombre:               String(pick(raw, 'nombre', 'OPO_NOMBRE') ?? ''),
    contactoId:           pick(raw, 'contactoId', 'OPO_CONTACTO_ID') as number | null,
    contactoNombre:       pick(raw, 'contactoNombre', 'CONT_NOMBRE') as string | null,
    contactoEmpresa:      pick(raw, 'contactoEmpresa', 'CONT_EMPRESA') as string | null,
    etapa:                (pick(raw, 'etapa', 'OPO_ETAPA') as CRMEtapa) ?? 'prospecto',
    valor:                pick(raw, 'valor', 'OPO_VALOR') as number | null,
    fechaCierre:          pick(raw, 'fechaCierre', 'OPO_FECHA_CIERRE') as string | null,
    asignadoA:            pick(raw, 'asignadoA', 'OPO_ASIGNADO_A') as number | null,
    asignadoNombre:       pick(raw, 'asignadoNombre') as string | null,
    creadoPor:            pick(raw, 'creadoPor', 'OPO_CREADO_POR') as number | null,
    fecha:                String(pick(raw, 'fecha', 'OPO_FECHA') ?? ''),
    notas:                pick(raw, 'notas', 'OPO_NOTAS') as string | null,
    orden:                Number(pick(raw, 'orden', 'OPO_ORDEN') ?? 0),
    actividadesPendientes:Number(pick(raw, 'actividadesPendientes') ?? 0),
    tags:                 String(pick(raw,'tags','OPO_TAGS') ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
    prioridad:            (Number(pick(raw,'prioridad','OPO_PRIORIDAD')) || 0) as 0|1|2|3,
    proyectoId:           pick(raw, 'proyectoId', 'OPO_PROYECTO_ID') as number | null,
  }
}

export function parseCRMActividad(raw: Record<string, unknown>): CRMActividad {
  return {
    id:          Number(pick(raw, 'id', 'ACT_ID')),
    opoId:       Number(pick(raw, 'opoId', 'ACT_OPO_ID')),
    opoNombre:   pick(raw, 'opoNombre', 'OPO_NOMBRE') as string | undefined,
    tipo:        (pick(raw, 'tipo', 'ACT_TIPO') as CRMActividad['tipo']) ?? 'tarea',
    descripcion: pick(raw, 'descripcion', 'ACT_DESCRIPCION') as string | null,
    fechaDue:    pick(raw, 'fechaDue', 'ACT_FECHA_DUE') as string | null,
    asignadoA:   pick(raw, 'asignadoA', 'ACT_ASIGNADO_A') as number | null,
    completada:  Boolean(pick(raw, 'completada', 'ACT_COMPLETADA')),
    fechaComp:   pick(raw, 'fechaComp', 'ACT_FECHA_COMP') as string | null,
    fecha:       String(pick(raw, 'fecha', 'ACT_FECHA') ?? ''),
  }
}

export interface CRMCuota {
  id: number
  usuarioId: number
  nombre: string
  anio: number
  mes: number
  meta: number
  logrado: number
}

export interface CRMEmail {
  id: number
  para: string
  asunto: string
  usuarioNombre: string | null
  fecha: string
  ok: boolean
}

export interface CRMKpis {
  totalOpos: number
  valorPipeline: number
  valorGanado: number
  totalGanadas: number
  totalPerdidas: number
  totalActivas: number
  vencidas: number
}

export function parseCRMInteraccion(raw: Record<string, unknown>): CRMInteraccion {
  return {
    id:            Number(pick(raw, 'id', 'INT_ID')),
    opoId:         Number(pick(raw, 'opoId', 'INT_OPO_ID')),
    tipo:          (pick(raw, 'tipo', 'INT_TIPO') as CRMInteraccion['tipo']) ?? 'nota',
    contenido:     pick(raw, 'contenido', 'INT_CONTENIDO') as string | null,
    usuarioId:     pick(raw, 'usuarioId', 'INT_USUARIO_ID') as number | null,
    usuarioNombre: pick(raw, 'usuarioNombre', 'INT_USUARIO_NOMBRE') as string | null,
    fecha:         String(pick(raw, 'fecha', 'INT_FECHA') ?? ''),
  }
}

export interface CRMCotizacionItem {
  id?: number
  esSeccion: boolean
  descripcion: string
  cantidad: number
  precioUnit: number
  descuento: number
  subtotal?: number
}

export interface CRMCotizacion {
  id: number
  opoId: number
  folio: string
  titulo: string
  fecha: string
  fechaVto: string | null
  estatus: 'borrador' | 'enviada' | 'aprobada' | 'rechazada'
  notas: string | null
  total: number
  items: CRMCotizacionItem[]
}

// ── Seguimiento a Clientes ──────────────────────────────

// REC_ESTATUS = workflow real (persistido); estatusVisual añade los 3 estados
// derivados de fecha que pide el flujo (proximo_vencer/vence_hoy/vencido) sin
// que existan como columna aparte — ver calcularEstatusVisual en el backend.
export type CRMPagoEstatusVisual = 'pagado' | 'parcial' | 'cancelado' | 'proximo_vencer' | 'vence_hoy' | 'vencido'

export interface CRMRecordatorioPago {
  id: number
  contactoId: number
  opoId: number | null
  concepto: string
  monto: number
  fechaLimite: string
  estatus: 'pendiente' | 'enviado' | 'pagado' | 'parcial' | 'cancelado'
  estatusVisual: CRMPagoEstatusVisual
  notas: string | null
  creadoPor: number | null
  fechaCreacion: string
  fechaEnvio: string | null
  fechaPago: string | null
  metodoPago: string | null
  comprobanteDocId: number | null
  confirmadoPor: number | null
  montoPagado: number | null
}

export interface CRMDocumentoCliente {
  id: number
  contactoId: number
  nombreOriginal: string
  mimeType: string | null
  tamanoBytes: number
  descripcion: string | null
  categoria: string | null
  visiblePortal: boolean
  subidoPor: number | null
  fechaSubida: string
}

export interface CRMEncuestaDisponible {
  id: number
  titulo: string
  slugPublico: string
}

export interface CRMEncuestaRespuesta {
  pregunta: string
  respuesta: string | null
}

export type EncuestaClasificacion = 'satisfecho' | 'regular' | 'necesita_mejora'

export interface CRMEncuestaEnviada {
  id: number
  contactoId: number
  encuestaId: number
  encuestaTitulo: string | null
  enviadoPor: number | null
  fechaEnvio: string
  canal: string
  respondio: boolean
  respuestas: CRMEncuestaRespuesta[]
  clasificacion: EncuestaClasificacion | null
  incidenciaId: number | null
}

export function parseCRMRecordatorioPago(raw: Record<string, unknown>): CRMRecordatorioPago {
  return {
    id:            Number(pick(raw, 'id', 'REC_ID')),
    contactoId:    Number(pick(raw, 'contactoId', 'REC_CONTACTO_ID')),
    opoId:         pick(raw, 'opoId', 'REC_OPO_ID') as number | null,
    concepto:      String(pick(raw, 'concepto', 'REC_CONCEPTO') ?? ''),
    monto:         Number(pick(raw, 'monto', 'REC_MONTO') ?? 0),
    fechaLimite:   String(pick(raw, 'fechaLimite', 'REC_FECHA_LIMITE') ?? ''),
    estatus:       (pick(raw, 'estatus', 'REC_ESTATUS') as CRMRecordatorioPago['estatus']) ?? 'pendiente',
    estatusVisual: (pick(raw, 'estatusVisual') as CRMPagoEstatusVisual) ?? 'proximo_vencer',
    notas:         pick(raw, 'notas', 'REC_NOTAS') as string | null,
    creadoPor:     pick(raw, 'creadoPor', 'REC_CREADO_POR') as number | null,
    fechaCreacion: String(pick(raw, 'fechaCreacion', 'REC_FECHA_CREACION') ?? ''),
    fechaEnvio:    pick(raw, 'fechaEnvio', 'REC_FECHA_ENVIO') as string | null,
    fechaPago:        pick(raw, 'fechaPago', 'REC_FECHA_PAGO') as string | null,
    metodoPago:       pick(raw, 'metodoPago', 'REC_METODO_PAGO') as string | null,
    comprobanteDocId: pick(raw, 'comprobanteDocId', 'REC_COMPROBANTE_DOC_ID') as number | null,
    confirmadoPor:    pick(raw, 'confirmadoPor', 'REC_CONFIRMADO_POR') as number | null,
    montoPagado:      pick(raw, 'montoPagado', 'REC_MONTO_PAGADO') as number | null,
  }
}

export function parseCRMDocumentoCliente(raw: Record<string, unknown>): CRMDocumentoCliente {
  return {
    id:             Number(pick(raw, 'id', 'DOC_ID')),
    contactoId:     Number(pick(raw, 'contactoId', 'DOC_CONTACTO_ID')),
    nombreOriginal: String(pick(raw, 'nombreOriginal', 'DOC_NOMBRE_ORIGINAL') ?? ''),
    mimeType:       pick(raw, 'mimeType', 'DOC_MIME_TYPE') as string | null,
    tamanoBytes:    Number(pick(raw, 'tamanoBytes', 'DOC_TAMANO_BYTES') ?? 0),
    descripcion:    pick(raw, 'descripcion', 'DOC_DESCRIPCION') as string | null,
    categoria:      pick(raw, 'categoria', 'DOC_CATEGORIA') as string | null,
    visiblePortal:  Boolean(pick(raw, 'visiblePortal', 'DOC_VISIBLE_PORTAL') ?? true),
    subidoPor:      pick(raw, 'subidoPor', 'DOC_SUBIDO_POR') as number | null,
    fechaSubida:    String(pick(raw, 'fechaSubida', 'DOC_FECHA_SUBIDA') ?? ''),
  }
}

export function parseCRMEncuestaEnviada(raw: Record<string, unknown>): CRMEncuestaEnviada {
  return {
    id:             Number(pick(raw, 'id', 'CES_ID')),
    contactoId:     Number(pick(raw, 'contactoId', 'CES_CONTACTO_ID')),
    encuestaId:     Number(pick(raw, 'encuestaId', 'CES_ENC_ID')),
    encuestaTitulo: pick(raw, 'encuestaTitulo') as string | null,
    enviadoPor:     pick(raw, 'enviadoPor', 'CES_ENVIADO_POR') as number | null,
    fechaEnvio:     String(pick(raw, 'fechaEnvio', 'CES_FECHA_ENVIO') ?? ''),
    canal:          String(pick(raw, 'canal', 'CES_CANAL') ?? 'correo'),
    respondio:      Boolean(pick(raw, 'respondio') ?? false),
    respuestas:     (pick(raw, 'respuestas') as CRMEncuestaRespuesta[]) ?? [],
    clasificacion:  pick(raw, 'clasificacion', 'CES_CLASIFICACION') as EncuestaClasificacion | null,
    incidenciaId:   pick(raw, 'incidenciaId', 'CES_INCIDENCIA_ID') as number | null,
  }
}
