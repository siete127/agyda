export type CursoEstado = 'inscrito' | 'completado'

export interface Material {
  id: number
  cursoId: number
  nombre: string
  url: string
  tipo: string | null
  fecha: string
}

export interface Curso {
  id: number
  titulo: string
  descripcion: string
  categoria: string | null
  duracionMin: number | null
  autorId: number | null
  autorNombre: string | null
  fechaCreacion: string
  fechaActualizacion: string | null
  activo: boolean
  materiales: Material[]
  miEstado: CursoEstado | null
  timerCorriendo: boolean
  timerSegundos: number
}

export interface MiCurso {
  cursoId: number
  titulo: string
  categoria: string | null
  estado: CursoEstado
  fechaInscripcion: string
  fechaCompletado: string | null
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

export function parseMaterial(raw: Record<string, unknown>): Material {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    cursoId: Number(pick(raw, 'cursoId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    url: String(pick(raw, 'url') ?? ''),
    tipo: pick(raw, 'tipo') ? String(pick(raw, 'tipo')) : null,
    fecha: String(pick(raw, 'fecha') ?? ''),
  }
}

export function parseCurso(raw: Record<string, unknown>): Curso {
  const estadoRaw = pick(raw, 'miEstado')
  const miEstado = estadoRaw === 'inscrito' || estadoRaw === 'completado' ? estadoRaw : null

  return {
    id: Number(pick(raw, 'id') ?? 0),
    titulo: String(pick(raw, 'titulo') ?? ''),
    descripcion: String(pick(raw, 'descripcion') ?? ''),
    categoria: pick(raw, 'categoria') ? String(pick(raw, 'categoria')) : null,
    duracionMin: pick(raw, 'duracionMin') != null ? Number(pick(raw, 'duracionMin')) : null,
    autorId: pick(raw, 'autorId') != null ? Number(pick(raw, 'autorId')) : null,
    autorNombre: pick(raw, 'autorNombre') ? String(pick(raw, 'autorNombre')) : null,
    fechaCreacion: String(pick(raw, 'fechaCreacion') ?? new Date().toISOString()),
    fechaActualizacion: pick(raw, 'fechaActualizacion') ? String(pick(raw, 'fechaActualizacion')) : null,
    activo: Boolean(pick(raw, 'activo') ?? true),
    materiales: Array.isArray(raw['materiales']) ? (raw['materiales'] as Record<string, unknown>[]).map(parseMaterial) : [],
    miEstado,
    timerCorriendo: Boolean(pick(raw, 'timerCorriendo')),
    timerSegundos: Number(pick(raw, 'timerSegundos') ?? 0),
  }
}

export function parseMiCurso(raw: Record<string, unknown>): MiCurso {
  const estadoRaw = pick(raw, 'estado')
  return {
    cursoId: Number(pick(raw, 'cursoId') ?? 0),
    titulo: String(pick(raw, 'titulo') ?? ''),
    categoria: pick(raw, 'categoria') ? String(pick(raw, 'categoria')) : null,
    estado: (estadoRaw === 'completado' ? 'completado' : 'inscrito') as CursoEstado,
    fechaInscripcion: String(pick(raw, 'fechaInscripcion') ?? ''),
    fechaCompletado: pick(raw, 'fechaCompletado') ? String(pick(raw, 'fechaCompletado')) : null,
  }
}
