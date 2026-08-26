export type EmailCampaniaEstado = 'borrador' | 'programada' | 'enviando' | 'pausada' | 'completada' | 'cancelada'
export type EmailCampaniaFiltro = 'todos' | 'tag' | 'manual'
export type EmailEnvioEstado = 'pendiente' | 'enviado' | 'fallido' | 'omitido_baja'

export interface EmailPlantilla {
  id: number
  nombre: string
  asunto: string
  cuerpoHtml: string
  cuerpoTexto: string | null
  variables: string | null
  activo: boolean
  fecha: string
}

export interface EmailCampania {
  id: number
  nombre: string
  plantillaId: number
  plantillaNombre: string
  estado: EmailCampaniaEstado
  filtro: EmailCampaniaFiltro
  filtroTag: string | null
  contactosIds: string | null
  emailsPorHora: number
  fechaProgramada: string | null
  fechaInicio: string | null
  fechaFin: string | null
  fechaCreacion: string
}

export interface EmailEnvio {
  id: number
  correo: string
  estado: EmailEnvioEstado
  intentos: number
  error: string | null
  fechaEnvio: string | null
}

export interface EmailReporte {
  pendiente: number
  enviado: number
  fallido: number
  omitido_baja: number
  total: number
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

export function parseEmailPlantilla(raw: Record<string, unknown>): EmailPlantilla {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    asunto: String(pick(raw, 'asunto') ?? ''),
    cuerpoHtml: String(pick(raw, 'cuerpoHtml') ?? ''),
    cuerpoTexto: pick(raw, 'cuerpoTexto') ? String(pick(raw, 'cuerpoTexto')) : null,
    variables: pick(raw, 'variables') ? String(pick(raw, 'variables')) : null,
    activo: parseBool(pick(raw, 'activo'), true),
    fecha: String(pick(raw, 'fecha') ?? new Date().toISOString()),
  }
}

export function parseEmailCampania(raw: Record<string, unknown>): EmailCampania {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    plantillaId: Number(pick(raw, 'plantillaId') ?? 0),
    plantillaNombre: String(pick(raw, 'plantillaNombre') ?? ''),
    estado: (pick(raw, 'estado') as EmailCampaniaEstado) ?? 'borrador',
    filtro: (pick(raw, 'filtro') as EmailCampaniaFiltro) ?? 'todos',
    filtroTag: pick(raw, 'filtroTag') ? String(pick(raw, 'filtroTag')) : null,
    contactosIds: pick(raw, 'contactosIds') ? String(pick(raw, 'contactosIds')) : null,
    emailsPorHora: Number(pick(raw, 'emailsPorHora') ?? 200),
    fechaProgramada: pick(raw, 'fechaProgramada') ? String(pick(raw, 'fechaProgramada')) : null,
    fechaInicio: pick(raw, 'fechaInicio') ? String(pick(raw, 'fechaInicio')) : null,
    fechaFin: pick(raw, 'fechaFin') ? String(pick(raw, 'fechaFin')) : null,
    fechaCreacion: String(pick(raw, 'fechaCreacion') ?? new Date().toISOString()),
  }
}

export function parseEmailEnvio(raw: Record<string, unknown>): EmailEnvio {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    correo: String(pick(raw, 'correo') ?? ''),
    estado: (pick(raw, 'estado') as EmailEnvioEstado) ?? 'pendiente',
    intentos: Number(pick(raw, 'intentos') ?? 0),
    error: pick(raw, 'error') ? String(pick(raw, 'error')) : null,
    fechaEnvio: pick(raw, 'fechaEnvio') ? String(pick(raw, 'fechaEnvio')) : null,
  }
}
