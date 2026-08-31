export type MensajeriaTipoCanal = 'directo' | 'grupo'
export type MensajeriaRolMiembro = 'admin' | 'miembro'

export interface MensajeriaCanal {
  id: number
  tipo: MensajeriaTipoCanal
  nombre: string | null
  descripcion: string | null
  creadoPor: number
  fechaCreacion: string
  ultimoMensajeFecha: string | null
  ultimoMensajePreview: string | null
  noLeidos: number
  otroUsuarioId: number | null
}

export interface MensajeriaReaccion {
  id: number
  usuarioId: number
  usuarioNombre: string
  emoji: string
}

export interface MensajeriaMensaje {
  id: number
  canalId: number
  emisorId: number
  emisorNombre: string
  contenido: string
  archivoUrl: string | null
  fecha: string
  editado: boolean
  reacciones: MensajeriaReaccion[]
}

export interface MensajeriaMiembro {
  usuarioId: number
  nombre: string
  rol: MensajeriaRolMiembro
  fechaIngreso: string
}

export interface MensajeriaCanalDetalle extends MensajeriaCanal {
  miembros: MensajeriaMiembro[]
}

export type MensajeriaTema = 'claro' | 'oscuro'

export interface MensajeriaConfig {
  burbujaActiva: boolean
  burbujaAutoocultar: boolean
  burbujaDuracionSeg: number
  permitirAdjuntos: boolean
  tema: MensajeriaTema
  colorMensajePropio: string
  colorMensajeAjeno: string
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

export function parseMensajeriaCanal(raw: Record<string, unknown>): MensajeriaCanal {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    tipo: (pick(raw, 'tipo') as MensajeriaTipoCanal) ?? 'directo',
    nombre: pick(raw, 'nombre') ? String(pick(raw, 'nombre')) : null,
    descripcion: pick(raw, 'descripcion') ? String(pick(raw, 'descripcion')) : null,
    creadoPor: Number(pick(raw, 'creadoPor') ?? 0),
    fechaCreacion: String(pick(raw, 'fechaCreacion') ?? new Date().toISOString()),
    ultimoMensajeFecha: pick(raw, 'ultimoMensajeFecha') ? String(pick(raw, 'ultimoMensajeFecha')) : null,
    ultimoMensajePreview: pick(raw, 'ultimoMensajePreview') ? String(pick(raw, 'ultimoMensajePreview')) : null,
    noLeidos: Number(pick(raw, 'noLeidos') ?? 0),
    otroUsuarioId: pick(raw, 'otroUsuarioId') != null ? Number(pick(raw, 'otroUsuarioId')) : null,
  }
}

export function parseMensajeriaReaccion(raw: Record<string, unknown>): MensajeriaReaccion {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    usuarioId: Number(pick(raw, 'usuarioId') ?? 0),
    usuarioNombre: String(pick(raw, 'usuarioNombre') ?? ''),
    emoji: String(pick(raw, 'emoji') ?? ''),
  }
}

export function parseMensajeriaMensaje(raw: Record<string, unknown>): MensajeriaMensaje {
  const reaccionesRaw = pick(raw, 'reacciones')
  return {
    id: Number(pick(raw, 'id') ?? 0),
    canalId: Number(pick(raw, 'canalId') ?? 0),
    emisorId: Number(pick(raw, 'emisorId') ?? 0),
    emisorNombre: String(pick(raw, 'emisorNombre') ?? ''),
    contenido: String(pick(raw, 'contenido') ?? ''),
    archivoUrl: pick(raw, 'archivoUrl') ? String(pick(raw, 'archivoUrl')) : null,
    fecha: String(pick(raw, 'fecha') ?? new Date().toISOString()),
    editado: parseBool(pick(raw, 'editado')),
    reacciones: Array.isArray(reaccionesRaw) ? (reaccionesRaw as Record<string, unknown>[]).map(parseMensajeriaReaccion) : [],
  }
}

export function parseMensajeriaMiembro(raw: Record<string, unknown>): MensajeriaMiembro {
  return {
    usuarioId: Number(pick(raw, 'usuarioId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    rol: (pick(raw, 'rol') as MensajeriaRolMiembro) ?? 'miembro',
    fechaIngreso: String(pick(raw, 'fechaIngreso') ?? new Date().toISOString()),
  }
}

export function parseMensajeriaCanalDetalle(raw: Record<string, unknown>): MensajeriaCanalDetalle {
  const miembros = Array.isArray(raw.miembros) ? (raw.miembros as Record<string, unknown>[]).map(parseMensajeriaMiembro) : []
  return { ...parseMensajeriaCanal(raw), miembros }
}

export function parseMensajeriaConfig(raw: Record<string, unknown>): MensajeriaConfig {
  return {
    burbujaActiva: parseBool(pick(raw, 'burbujaActiva'), true),
    burbujaAutoocultar: parseBool(pick(raw, 'burbujaAutoocultar'), true),
    burbujaDuracionSeg: Number(pick(raw, 'burbujaDuracionSeg') ?? 15),
    permitirAdjuntos: parseBool(pick(raw, 'permitirAdjuntos'), true),
    tema: (pick(raw, 'tema') as MensajeriaTema) ?? 'claro',
    colorMensajePropio: String(pick(raw, 'colorMensajePropio') ?? '#2563EB'),
    colorMensajeAjeno: String(pick(raw, 'colorMensajeAjeno') ?? '#FFFFFF'),
  }
}
