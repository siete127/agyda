export type TareaPersonalPrioridad = 'baja' | 'media' | 'alta'

export interface TareaPersonal {
  id: number
  titulo: string
  descripcion: string | null
  asignadoA: number
  asignadoPor: number
  asignadoPorNombre: string | null
  asignadoANombre?: string | null
  prioridad: TareaPersonalPrioridad
  fechaLimite: string | null
  completada: boolean
  fechaCreacion: string
  fechaCompletada: string | null
}

/** Ítem de la lista combinada (personales + de Proyectos) para "Mis tareas" del Inicio. */
export interface MiTareaCombinada {
  id: number
  titulo: string
  fechaLimite: string | null
  completada: boolean
  origen: 'personal' | 'proyecto'
  asignadoPorNombre?: string | null
  proyectoId?: number
  proyectoNombre?: string
}

function p(raw: Record<string, unknown>, a: string, b?: string): unknown {
  return raw[a] ?? (b ? raw[b] : undefined)
}

export function parseTareaPersonal(raw: Record<string, unknown>): TareaPersonal {
  return {
    id: Number(p(raw, 'id') ?? 0),
    titulo: String(p(raw, 'titulo') ?? ''),
    descripcion: (p(raw, 'descripcion') as string | null) ?? null,
    asignadoA: Number(p(raw, 'asignadoA') ?? 0),
    asignadoPor: Number(p(raw, 'asignadoPor') ?? 0),
    asignadoPorNombre: (p(raw, 'asignadoPorNombre') as string | null) ?? null,
    asignadoANombre: (p(raw, 'asignadoANombre') as string | null) ?? null,
    prioridad: (p(raw, 'prioridad') as TareaPersonalPrioridad) ?? 'media',
    fechaLimite: (p(raw, 'fechaLimite') as string | null) ?? null,
    completada: Boolean(p(raw, 'completada')),
    fechaCreacion: String(p(raw, 'fechaCreacion') ?? ''),
    fechaCompletada: (p(raw, 'fechaCompletada') as string | null) ?? null,
  }
}

export function parseMiTareaCombinada(raw: Record<string, unknown>): MiTareaCombinada {
  return {
    id: Number(p(raw, 'id') ?? 0),
    titulo: String(p(raw, 'titulo') ?? ''),
    fechaLimite: (p(raw, 'fechaLimite') as string | null) ?? null,
    completada: Boolean(p(raw, 'completada')),
    origen: (p(raw, 'origen') as 'personal' | 'proyecto') ?? 'personal',
    asignadoPorNombre: (p(raw, 'asignadoPorNombre') as string | null) ?? null,
    proyectoId: raw['proyectoId'] !== undefined ? Number(raw['proyectoId']) : undefined,
    proyectoNombre: raw['proyectoNombre'] !== undefined ? String(raw['proyectoNombre']) : undefined,
  }
}
