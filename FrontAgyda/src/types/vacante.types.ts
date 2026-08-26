export type Modalidad = 'remoto' | 'presencial' | 'hibrido'
export type PostulanteEstado = 'nuevo' | 'revisado' | 'descartado' | 'contactado'

// Pipeline de Reclutamiento y selección (kanban por etapas, tipo Odoo).
// Coexiste con PostulanteEstado (que sigue usando /vacantes sin cambios).
export type PostulanteEtapa = 'nuevo' | 'revision_cv' | 'entrevista' | 'oferta' | 'contratado' | 'descartado'

export const POSTULANTE_ETAPAS: { key: PostulanteEtapa; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: 'nuevo',       label: 'Nuevo',       color: 'text-gray-600',    bgColor: 'bg-gray-100',   borderColor: 'border-gray-400' },
  { key: 'revision_cv', label: 'Revisión CV', color: 'text-blue-600',    bgColor: 'bg-blue-50',    borderColor: 'border-blue-500' },
  { key: 'entrevista',  label: 'Entrevista',  color: 'text-purple-600',  bgColor: 'bg-purple-50',  borderColor: 'border-purple-500' },
  { key: 'oferta',      label: 'Oferta',      color: 'text-amber-600',   bgColor: 'bg-amber-50',   borderColor: 'border-amber-500' },
  { key: 'contratado',  label: 'Contratado',  color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-500' },
  { key: 'descartado',  label: 'Descartado',  color: 'text-red-500',     bgColor: 'bg-red-50',     borderColor: 'border-red-400' },
]

export interface Vacante {
  id: number
  titulo: string
  descripcion: string
  requisitos: string | null
  ubicacion: string | null
  modalidad: Modalidad | null
  tipoContrato: string | null
  salario: string | null
  autorId: number | null
  autorNombre: string | null
  fechaCreacion: string
  fechaActualizacion: string | null
  fechaLimite: string | null
  activo: boolean
}

export interface Postulante {
  id: number
  vacanteId: number
  vacanteTitulo: string | null
  nombre: string
  email: string
  telefono: string | null
  cvUrl: string
  mensaje: string | null
  fecha: string
  estado: PostulanteEstado
  etapa: PostulanteEtapa
  orden: number
}

export interface DashboardStatsPorVacante {
  vacanteId: number
  vacanteTitulo: string
  vacanteActiva: boolean
  totalPostulantes: number
}

export interface DashboardStatsPorEstado {
  estado: PostulanteEstado
  total: number
}

export interface DashboardStats {
  vacantesTotal: number
  vacantesActivas: number
  postulacionesTotal: number
  porEstado: DashboardStatsPorEstado[]
  porVacante: DashboardStatsPorVacante[]
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

export function parseVacante(raw: Record<string, unknown>): Vacante {
  const modalidadRaw = pick(raw, 'modalidad', 'MODALIDAD')
  const modalidad = ['remoto', 'presencial', 'hibrido'].includes(String(modalidadRaw))
    ? (modalidadRaw as Modalidad)
    : null

  return {
    id: Number(pick(raw, 'id', 'Id', 'ID') ?? 0),
    titulo: String(pick(raw, 'titulo', 'Titulo', 'TITULO') ?? ''),
    descripcion: String(pick(raw, 'descripcion', 'Descripcion', 'DESCRIPCION') ?? ''),
    requisitos: pick(raw, 'requisitos') ? String(pick(raw, 'requisitos')) : null,
    ubicacion: pick(raw, 'ubicacion') ? String(pick(raw, 'ubicacion')) : null,
    modalidad,
    tipoContrato: pick(raw, 'tipoContrato', 'tipo_contrato') ? String(pick(raw, 'tipoContrato', 'tipo_contrato')) : null,
    salario: pick(raw, 'salario') ? String(pick(raw, 'salario')) : null,
    autorId: pick(raw, 'autorId', 'autor_id') != null ? Number(pick(raw, 'autorId', 'autor_id')) : null,
    autorNombre: pick(raw, 'autorNombre', 'autor_nombre') ? String(pick(raw, 'autorNombre', 'autor_nombre')) : null,
    fechaCreacion: String(pick(raw, 'fechaCreacion', 'fecha_creacion') ?? new Date().toISOString()),
    fechaActualizacion: pick(raw, 'fechaActualizacion', 'fecha_actualizacion') ? String(pick(raw, 'fechaActualizacion', 'fecha_actualizacion')) : null,
    fechaLimite: pick(raw, 'fechaLimite', 'fecha_limite') ? String(pick(raw, 'fechaLimite', 'fecha_limite')) : null,
    activo: parseBool(pick(raw, 'activo'), true),
  }
}

export function parsePostulante(raw: Record<string, unknown>): Postulante {
  const estadoRaw = String(pick(raw, 'estado', 'ESTADO') ?? 'nuevo').toLowerCase()
  const estado = (['nuevo', 'revisado', 'descartado', 'contactado'].includes(estadoRaw)
    ? estadoRaw
    : 'nuevo') as PostulanteEstado

  const etapaRaw = String(pick(raw, 'etapa', 'ETAPA') ?? 'nuevo').toLowerCase()
  const etapa = (POSTULANTE_ETAPAS.some((e) => e.key === etapaRaw)
    ? etapaRaw
    : 'nuevo') as PostulanteEtapa

  return {
    id: Number(pick(raw, 'id', 'Id', 'ID') ?? 0),
    vacanteId: Number(pick(raw, 'vacanteId', 'vacante_id') ?? 0),
    vacanteTitulo: pick(raw, 'vacanteTitulo', 'vacante_titulo') ? String(pick(raw, 'vacanteTitulo', 'vacante_titulo')) : null,
    nombre: String(pick(raw, 'nombre', 'Nombre', 'NOMBRE') ?? ''),
    email: String(pick(raw, 'email', 'Email', 'EMAIL') ?? ''),
    telefono: pick(raw, 'telefono') ? String(pick(raw, 'telefono')) : null,
    cvUrl: String(pick(raw, 'cvUrl', 'cv_url') ?? ''),
    mensaje: pick(raw, 'mensaje') ? String(pick(raw, 'mensaje')) : null,
    fecha: String(pick(raw, 'fecha') ?? new Date().toISOString()),
    estado,
    etapa,
    orden: Number(pick(raw, 'orden', 'ORDEN') ?? 0),
  }
}
