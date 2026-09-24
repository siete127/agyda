// Módulos donde un tipo de pausa puede contar (backend: pausaTiposService.USOS).
export type UsoPausa = 'asistencia' | 'nomina' | 'contact_center'

export const USOS_PAUSA: { key: UsoPausa; label: string; impacto: string }[] = [
  { key: 'asistencia', label: 'Asistencia', impacto: 'Se descuenta del tiempo disponible de la jornada.' },
  { key: 'nomina', label: 'Nómina', impacto: 'Cuenta para el exceso de minutos de pausa que se descuenta en nómina.' },
  { key: 'contact_center', label: 'Contact Center', impacto: 'El agente deja de recibir interacciones, aparece "en pausa" al supervisor y cuenta para la alarma de pausa larga.' },
]

export interface PausaTipo {
  statusId: number
  clave: string
  etiqueta: string
  emoji: string
  color: string // hex, p. ej. '#3B82F6'
  orden: number
  activo: boolean
  esSistema: boolean // vino por default: no se puede eliminar
  controlOcupacion: boolean // semáforo de ocupación por espacios (el baño)
  limiteMin: number | null
  limiteModo: 'visita' | 'diario' | null // por pausa, o acumulado en el día
  limitesArea: Record<string, number> // p. ej. { TI: 60, AD: 60 }
  // Límite propio de un módulo; en ese módulo reemplaza al general y a los de área.
  limitesModulo: Partial<Record<ModuloLimite, number>>
  espacios?: EspacioPausa[] // solo el tipo con ocupación (los baños)
  usos: Record<UsoPausa, boolean>
}

// Un lugar físico de un tipo con ocupación (p. ej. "Baño piso 2"): quién lo
// puede usar (género y áreas) y cuántas personas a la vez.
export interface EspacioPausa {
  id?: number // sin id = nuevo
  nombre: string
  genero: 'M' | 'F' | null // null = mixto
  capacidad: number
  areas: string[] | null // null = todas las áreas
}

// ¿Puede usar este espacio alguien de ese género y área? (backend: pausaTiposService.aplicaEspacio)
export function aplicaEspacio(e: Pick<EspacioPausa, 'genero' | 'areas'>, genero: 'M' | 'F', area: string): boolean {
  return (!e.genero || e.genero === genero) && (!e.areas || e.areas.includes(area.toUpperCase()))
}

// Área (rol base, NEUS_TIPOUSUARIO) con cuántos usuarios activos tiene.
export interface AreaPausa {
  area: string
  label: string
  hombres: number
  mujeres: number
}

// Estado en vivo de los baños (socket banio:status).
export interface BanioOcupante { userId: string; nombre: string }
export interface BanioEspacioEstado extends Required<Omit<EspacioPausa, 'id'>> {
  id: number
  ocupantes: BanioOcupante[]
}
export interface BanioEstado {
  espacios: BanioEspacioEstado[]
  sinEspacio: BanioOcupante[] // adentro sin semáforo (su área no tiene baño)
}

export interface PausaTipoPayload {
  etiqueta?: string
  emoji?: string | null
  color?: string | null
  orden?: number
  activo?: boolean
  limiteMin?: number | null
  limiteModo?: 'visita' | 'diario' | null
  limitesArea?: Record<string, number>
  limitesModulo?: Partial<Record<ModuloLimite, number | null>>
  usos?: Record<UsoPausa, boolean>
}

// Desglose por tipo que ahora devuelven los endpoints de tiempos.
export interface PausaPorTipo {
  statusId: number
  etiqueta: string
  emoji: string
  color: string
  seg: number
}

// Llave fija de los 4 tipos por default, por su `clave` (el status_id cambia
// entre empresas). null = tipo agregado por la empresa.
export type LlaveLegacy = 'banio' | 'comida' | 'capacitacion' | 'permiso'
const LLAVE_POR_CLAVE: Record<string, LlaveLegacy> = { sanitario: 'banio', comida: 'comida', capacitacion: 'capacitacion', permiso: 'permiso' }
export function llaveLegacy(tipo: Pick<PausaTipo, 'clave'> | undefined): LlaveLegacy | null {
  return (tipo && LLAVE_POR_CLAVE[tipo.clave]) || null
}

// Los 4 tipos por default (mismos valores que siembra el backend). Se usan
// mientras carga la lista real, para que el menú de estado no quede vacío.
const TODOS: Record<UsoPausa, boolean> = { asistencia: true, nomina: true, contact_center: true }
export const PAUSA_TIPOS_DEFAULT: PausaTipo[] = [
  { statusId: 3, clave: 'sanitario', etiqueta: 'Baño', emoji: '🚻', color: '#3B82F6', orden: 1, activo: true, esSistema: true, controlOcupacion: true, limiteMin: 20, limiteModo: 'diario', limitesArea: {}, limitesModulo: {}, usos: TODOS },
  { statusId: 2, clave: 'comida', etiqueta: 'Comida', emoji: '🍽️', color: '#F97316', orden: 2, activo: true, esSistema: true, controlOcupacion: false, limiteMin: 40, limiteModo: 'visita', limitesArea: { TI: 60, AD: 60 }, limitesModulo: {}, usos: TODOS },
  { statusId: 5, clave: 'capacitacion', etiqueta: 'Capacitación', emoji: '📚', color: '#8B5CF6', orden: 3, activo: true, esSistema: true, controlOcupacion: false, limiteMin: null, limiteModo: null, limitesArea: {}, limitesModulo: {}, usos: TODOS },
  { statusId: 6, clave: 'permiso', etiqueta: 'Permiso', emoji: '✋', color: '#10B981', orden: 4, activo: true, esSistema: true, controlOcupacion: false, limiteMin: null, limiteModo: null, limitesArea: {}, limitesModulo: {}, usos: TODOS },
]

// Módulos que usan el límite de una pausa, y dónde se ve (backend:
// pausaTiposService.LIMITE_MODULOS). Nómina no usa el límite por tipo: descuenta
// con sus propios "minutos de pausa libres" diarios.
export type ModuloLimite = 'asistencia' | 'contact_center'
export const MODULOS_LIMITE: { key: ModuloLimite; label: string; donde: string }[] = [
  { key: 'asistencia', label: 'Asistencia', donde: 'Cronómetro del menú de estado de cada colaborador' },
  { key: 'contact_center', label: 'Contact Center', donde: 'Panel en vivo y productividad del supervisor' },
]

// Límite en minutos de un tipo. Prioridad: el del módulo (si se indica y tiene
// uno propio) → el del área → el general. Sin límite general no hay límite.
export function limitePausa(
  tipo: Pick<PausaTipo, 'limiteMin' | 'limitesArea' | 'limitesModulo'> | undefined,
  area: string,
  modulo?: ModuloLimite,
): number | null {
  if (!tipo || !tipo.limiteMin) return null
  return (modulo && tipo.limitesModulo?.[modulo]) || tipo.limitesArea[area] || tipo.limiteMin
}
