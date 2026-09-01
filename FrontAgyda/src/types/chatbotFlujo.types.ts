export type TipoNodoFlujo = 'respuesta' | 'etiqueta' | 'nodo_arbol' | 'campania'

export interface FlujoRespuesta {
  id: number
  codigo: string
  texto: string
  botones: string[]
  activa: boolean
  posX: number | null
  posY: number | null
}

export interface FlujoEtiqueta {
  id: number
  texto: string
  tipoAccion: string
  campaniaId: number | null
  activa: boolean
  posX: number | null
  posY: number | null
}

export interface FlujoNodoArbol {
  id: number
  codigo: string
  texto: string
  tipoNodo: string
  activa: boolean
  posX: number | null
  posY: number | null
}

export interface FlujoCampania {
  id: number
  texto: string
  activa: boolean
}

export interface FlujoConexion {
  id: number | string
  origenTipo: TipoNodoFlujo
  origenId: number
  destinoTipo: TipoNodoFlujo
  destinoId: number
  etiqueta: string | null
  esOpcionArbol?: boolean
}

export interface FlujoCompleto {
  respuestas: FlujoRespuesta[]
  etiquetas: FlujoEtiqueta[]
  nodosArbol: FlujoNodoArbol[]
  campanias: FlujoCampania[]
  conexiones: FlujoConexion[]
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  }
  return undefined
}

function parseBool(v: unknown, def = false): boolean {
  if (v === null || v === undefined) return def
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  return def
}

export function parseFlujoCompleto(raw: Record<string, unknown>): FlujoCompleto {
  const respuestas = Array.isArray(raw.respuestas) ? raw.respuestas : []
  const etiquetas = Array.isArray(raw.etiquetas) ? raw.etiquetas : []
  const nodosArbol = Array.isArray(raw.nodosArbol) ? raw.nodosArbol : []
  const campanias = Array.isArray(raw.campanias) ? raw.campanias : []
  const conexiones = Array.isArray(raw.conexiones) ? raw.conexiones : []

  return {
    respuestas: (respuestas as Record<string, unknown>[]).map((r) => ({
      id: Number(pick(r, 'id') ?? 0),
      codigo: String(pick(r, 'codigo') ?? ''),
      texto: String(pick(r, 'texto') ?? ''),
      botones: Array.isArray(r.botones) ? (r.botones as string[]) : [],
      activa: parseBool(pick(r, 'activa'), true),
      posX: pick(r, 'posX') != null ? Number(pick(r, 'posX')) : null,
      posY: pick(r, 'posY') != null ? Number(pick(r, 'posY')) : null,
    })),
    etiquetas: (etiquetas as Record<string, unknown>[]).map((e) => ({
      id: Number(pick(e, 'id') ?? 0),
      texto: String(pick(e, 'texto') ?? ''),
      tipoAccion: String(pick(e, 'tipoAccion') ?? 'respuesta'),
      campaniaId: pick(e, 'campaniaId') != null ? Number(pick(e, 'campaniaId')) : null,
      activa: parseBool(pick(e, 'activa'), true),
      posX: pick(e, 'posX') != null ? Number(pick(e, 'posX')) : null,
      posY: pick(e, 'posY') != null ? Number(pick(e, 'posY')) : null,
    })),
    nodosArbol: (nodosArbol as Record<string, unknown>[]).map((n) => ({
      id: Number(pick(n, 'id') ?? 0),
      codigo: String(pick(n, 'codigo') ?? ''),
      texto: String(pick(n, 'texto') ?? ''),
      tipoNodo: String(pick(n, 'tipoNodo') ?? 'pregunta'),
      activa: parseBool(pick(n, 'activa'), true),
      posX: pick(n, 'posX') != null ? Number(pick(n, 'posX')) : null,
      posY: pick(n, 'posY') != null ? Number(pick(n, 'posY')) : null,
    })),
    campanias: (campanias as Record<string, unknown>[]).map((c) => ({
      id: Number(pick(c, 'id') ?? 0),
      texto: String(pick(c, 'texto') ?? ''),
      activa: parseBool(pick(c, 'activa'), true),
    })),
    conexiones: (conexiones as Record<string, unknown>[]).map((c) => ({
      id: (pick(c, 'id') ?? 0) as number | string,
      origenTipo: String(pick(c, 'origenTipo') ?? 'respuesta') as TipoNodoFlujo,
      origenId: Number(pick(c, 'origenId') ?? 0),
      destinoTipo: String(pick(c, 'destinoTipo') ?? 'respuesta') as TipoNodoFlujo,
      destinoId: Number(pick(c, 'destinoId') ?? 0),
      etiqueta: pick(c, 'etiqueta') ? String(pick(c, 'etiqueta')) : null,
      esOpcionArbol: parseBool(pick(c, 'esOpcionArbol'), false),
    })),
  }
}
