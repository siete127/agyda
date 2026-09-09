// "Caso" unificado (Fase 4 del rediseño de Atención al Cliente) — reemplaza
// gradualmente a Consulta/Aclaración/Queja/Incidencia. Molde de incidencia.types.ts.

export type CasoTipo = 'consulta' | 'aclaracion' | 'queja' | 'incidencia'
export type CasoPrioridad = 'baja' | 'media' | 'alta' | 'critica'
export type CasoEstatus = 'pendiente' | 'en_proceso' | 'en_espera_cliente' | 'resuelto' | 'escalado' | 'cerrado'
export type CasoOrigen = 'manual' | 'encuesta' | 'pago_vencido' | 'portal'
export type AccionCorrectivaEstado = 'pendiente' | 'aplicada' | 'verificada'

export const CASO_TIPO_CONFIG: Record<CasoTipo, { label: string; bg: string; text: string }> = {
  consulta:   { label: 'Consulta',   bg: 'bg-teal-100',   text: 'text-teal-700' },
  aclaracion: { label: 'Aclaración', bg: 'bg-violet-100', text: 'text-violet-700' },
  queja:      { label: 'Queja',      bg: 'bg-orange-100', text: 'text-orange-700' },
  incidencia: { label: 'Incidencia', bg: 'bg-red-100',    text: 'text-red-700' },
}

export const PRIORIDAD_CASO_CONFIG: Record<CasoPrioridad, { label: string; bg: string; text: string }> = {
  baja:    { label: 'Baja',    bg: 'bg-gray-100',  text: 'text-gray-600' },
  media:   { label: 'Media',   bg: 'bg-blue-50',   text: 'text-blue-700' },
  alta:    { label: 'Alta',    bg: 'bg-amber-100', text: 'text-amber-700' },
  critica: { label: 'Crítica', bg: 'bg-red-100',   text: 'text-red-700' },
}

export const ESTATUS_CASO_CONFIG: Record<CasoEstatus, { label: string; bg: string; text: string; dot: string }> = {
  pendiente:         { label: 'Pendiente',            bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  en_proceso:        { label: 'En proceso',            bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500' },
  en_espera_cliente: { label: 'En espera del cliente',  bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500' },
  resuelto:          { label: 'Resuelto',              bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  escalado:          { label: 'Escalado',              bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' },
  cerrado:           { label: 'Cerrado',               bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400' },
}

export const ORIGEN_CASO_LABEL: Record<CasoOrigen, string> = {
  manual: 'Manual', encuesta: 'Encuesta', pago_vencido: 'Pago vencido', portal: 'Portal del cliente',
}

export const CATEGORIAS_CASO = ['Servicio', 'Facturación', 'Producto', 'Atención', 'Otro'] as const

export interface Caso {
  id: number
  folio: string
  tipo: CasoTipo
  contactoId: number | null
  contactoNombre: string | null
  clienteNombreLibre: string | null
  titulo: string
  descripcion: string | null
  categoria: string | null
  referencia: string | null
  prioridad: CasoPrioridad
  slaHoras: number | null
  fechaLimiteSla: string | null
  estatus: CasoEstatus
  origen: CasoOrigen
  asignadoA: number | null
  asignadoNombre: string | null
  solucionPropuesta: string | null
  fechaCompromiso: string | null
  creadoPor: number | null
  fechaCreacion: string
  fechaResolucion: string | null
}

export interface CasoComentario {
  id: number
  casoId: number
  comentario: string
  usuarioId: number | null
  usuarioNombre: string | null
  fecha: string
}

export interface CasoEvidencia {
  id: number
  casoId: number
  nombreOriginal: string
  mimeType: string | null
  tamanoBytes: number
  descripcion: string | null
  subidoPor: number | null
  fechaSubida: string
}

export interface CasoAccionCorrectiva {
  id: number
  casoId: number
  redactorId: number
  redactorNombre: string | null
  descripcion: string
  responsable: string
  fechaCompromiso: string
  estado: AccionCorrectivaEstado
  fechaRegistro: string
}

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseCaso(raw: Record<string, unknown>): Caso {
  return {
    id:                Number(pick(raw, 'id')),
    folio:             String(pick(raw, 'folio') ?? ''),
    tipo:              (pick(raw, 'tipo') as CasoTipo) ?? 'consulta',
    contactoId:        pick(raw, 'contactoId') as number | null,
    contactoNombre:    pick(raw, 'contactoNombre') as string | null,
    clienteNombreLibre: pick(raw, 'clienteNombreLibre') as string | null,
    titulo:            String(pick(raw, 'titulo') ?? ''),
    descripcion:       pick(raw, 'descripcion') as string | null,
    categoria:         pick(raw, 'categoria') as string | null,
    referencia:        pick(raw, 'referencia') as string | null,
    prioridad:         (pick(raw, 'prioridad') as CasoPrioridad) ?? 'media',
    slaHoras:          pick(raw, 'slaHoras') as number | null,
    fechaLimiteSla:    pick(raw, 'fechaLimiteSla') as string | null,
    estatus:           (pick(raw, 'estatus') as CasoEstatus) ?? 'pendiente',
    origen:            (pick(raw, 'origen') as CasoOrigen) ?? 'manual',
    asignadoA:         pick(raw, 'asignadoA') as number | null,
    asignadoNombre:    pick(raw, 'asignadoNombre') as string | null,
    solucionPropuesta: pick(raw, 'solucionPropuesta') as string | null,
    fechaCompromiso:   pick(raw, 'fechaCompromiso') as string | null,
    creadoPor:         pick(raw, 'creadoPor') as number | null,
    fechaCreacion:     String(pick(raw, 'fechaCreacion') ?? ''),
    fechaResolucion:   pick(raw, 'fechaResolucion') as string | null,
  }
}

export function parseCasoComentario(raw: Record<string, unknown>): CasoComentario {
  return {
    id:            Number(pick(raw, 'id')),
    casoId:        Number(pick(raw, 'casoId')),
    comentario:    String(pick(raw, 'comentario') ?? ''),
    usuarioId:     pick(raw, 'usuarioId') as number | null,
    usuarioNombre: pick(raw, 'usuarioNombre') as string | null,
    fecha:         String(pick(raw, 'fecha') ?? ''),
  }
}

export function parseCasoEvidencia(raw: Record<string, unknown>): CasoEvidencia {
  return {
    id:             Number(pick(raw, 'id')),
    casoId:         Number(pick(raw, 'casoId')),
    nombreOriginal: String(pick(raw, 'nombreOriginal') ?? ''),
    mimeType:       pick(raw, 'mimeType') as string | null,
    tamanoBytes:    Number(pick(raw, 'tamanoBytes') ?? 0),
    descripcion:    pick(raw, 'descripcion') as string | null,
    subidoPor:      pick(raw, 'subidoPor') as number | null,
    fechaSubida:    String(pick(raw, 'fechaSubida') ?? ''),
  }
}

export function parseCasoAccionCorrectiva(raw: Record<string, unknown>): CasoAccionCorrectiva {
  return {
    id:             Number(pick(raw, 'id')),
    casoId:         Number(pick(raw, 'casoId')),
    redactorId:     Number(pick(raw, 'redactorId') ?? 0),
    redactorNombre: pick(raw, 'redactorNombre') as string | null,
    descripcion:    String(pick(raw, 'descripcion') ?? ''),
    responsable:    String(pick(raw, 'responsable') ?? ''),
    fechaCompromiso: String(pick(raw, 'fechaCompromiso') ?? ''),
    estado:         (pick(raw, 'estado') as AccionCorrectivaEstado) ?? 'pendiente',
    fechaRegistro:  String(pick(raw, 'fechaRegistro') ?? ''),
  }
}
