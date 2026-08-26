export interface RespuestaChatbot {
  pk: number
  id: string
  keywords: string[]
  textoEs: string
  textoEn: string | null
  botones: string[]
  senalInteres: boolean
  orden: number
  autorId: number | null
  autorNombre: string | null
  fechaCreacion: string
  fechaActualizacion: string | null
  activa: boolean
}

export interface LeadChatbot {
  id: number
  nombre: string
  contactoNombre: string | null
  contactoEmpresa: string | null
  contactoEmail: string | null
  contactoTelefono: string | null
  contactoCargo: string | null
  etapa: string
  valor: number | null
  notas: string | null
  fecha: string
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
  const s = String(v).toLowerCase().trim()
  if (['true', '1', 's', 'si', 'sí', 'active', 'activo'].includes(s)) return true
  if (['false', '0', 'n', 'no', 'inactive', 'inactivo'].includes(s)) return false
  return def
}

function parseStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

export function parseRespuestaChatbot(raw: Record<string, unknown>): RespuestaChatbot {
  return {
    pk: Number(pick(raw, 'pk', 'PK') ?? 0),
    id: String(pick(raw, 'id', 'Id', 'ID') ?? ''),
    keywords: parseStringArray(pick(raw, 'keywords')),
    textoEs: String(pick(raw, 'textoEs', 'texto_es') ?? ''),
    textoEn: pick(raw, 'textoEn', 'texto_en') ? String(pick(raw, 'textoEn', 'texto_en')) : null,
    botones: parseStringArray(pick(raw, 'botones')),
    senalInteres: parseBool(pick(raw, 'senalInteres', 'senal_interes')),
    orden: Number(pick(raw, 'orden') ?? 0),
    autorId: pick(raw, 'autorId', 'autor_id') != null ? Number(pick(raw, 'autorId', 'autor_id')) : null,
    autorNombre: pick(raw, 'autorNombre', 'autor_nombre') ? String(pick(raw, 'autorNombre', 'autor_nombre')) : null,
    fechaCreacion: String(pick(raw, 'fechaCreacion', 'fecha_creacion') ?? new Date().toISOString()),
    fechaActualizacion: pick(raw, 'fechaActualizacion', 'fecha_actualizacion') ? String(pick(raw, 'fechaActualizacion', 'fecha_actualizacion')) : null,
    activa: parseBool(pick(raw, 'activa'), true),
  }
}

export function parseLeadChatbot(raw: Record<string, unknown>): LeadChatbot {
  return {
    id: Number(pick(raw, 'id', 'Id', 'ID') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    contactoNombre: pick(raw, 'contactoNombre', 'contacto_nombre') ? String(pick(raw, 'contactoNombre', 'contacto_nombre')) : null,
    contactoEmpresa: pick(raw, 'contactoEmpresa', 'contacto_empresa') ? String(pick(raw, 'contactoEmpresa', 'contacto_empresa')) : null,
    contactoEmail: pick(raw, 'contactoEmail', 'contacto_email') ? String(pick(raw, 'contactoEmail', 'contacto_email')) : null,
    contactoTelefono: pick(raw, 'contactoTelefono', 'contacto_telefono') ? String(pick(raw, 'contactoTelefono', 'contacto_telefono')) : null,
    contactoCargo: pick(raw, 'contactoCargo', 'contacto_cargo') ? String(pick(raw, 'contactoCargo', 'contacto_cargo')) : null,
    etapa: String(pick(raw, 'etapa') ?? 'prospecto'),
    valor: pick(raw, 'valor') != null ? Number(pick(raw, 'valor')) : null,
    notas: pick(raw, 'notas') ? String(pick(raw, 'notas')) : null,
    fecha: String(pick(raw, 'fecha') ?? new Date().toISOString()),
  }
}
