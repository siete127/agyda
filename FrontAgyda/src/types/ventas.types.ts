export type VentaEstado =
  | 'Pendiente'
  | 'Aprobada'
  | 'Rechazada'
  | 'Agendada'
  | 'Formalizada'
  | 'Garantizada'
  | 'Declinado'
  | 'Formalizado'
  | 'Cancelada'

export interface Venta {
  id: number
  nombreCliente: string
  telefonoCliente: string
  estatus: VentaEstado
  evidencia: string | null
  fecha: string
  campaignId: number
  nombreAgente: string
  agentId: number
  fechaAgendada?: string | null
  horaAgendada?: string | null
}

export interface VentaAgendada extends Venta {
  fechaAgendada: string
  horaAgendada: string
}

export interface AgenteVentas {
  id: number
  nombreAgente: string
  username: string
  role: 'agente' | 'supervisor' | 'admin' | 'superadmin'
  campaignId: number
  campaignNombre?: string
  campaignIds?: number[]
  activo: boolean
  color?: string
}

export interface Campana {
  id: number
  nombre: string
  activo?: boolean
  color?: string
}

export interface CampanaStatus {
  id: number
  campaignId: number
  nombreEstado: string
  orden: number
  activo: boolean
  color: string | null
}

export interface VentaStats {
  nombreAgente: string
  agentId: number
  campaignId: number
  campaignNombre: string
  aprobadas: number
  rechazadas: number
  pendientes: number
  formalizadas: number
  garantizadas: number
  total: number
  color?: string
}

export interface StatsResponse {
  ventas: Venta[]
  stats: VentaStats[]
  totales: {
    aprobadas: number
    rechazadas: number
    pendientes: number
    total: number
  }
}

export interface StatsDynamicAgent {
  agentId: number
  nombreAgente: string
  campaignId: number
  campaignNombre: string
  estatusCounts: Record<string, number>
  total: number
}

export interface StatsDynamicResponse {
  stats: StatsDynamicAgent[]
  statuses: { id: number; nombreEstado: string; color: string | null }[]
  totalesPorEstatus: Record<string, number>
  ventas: []
}

export const VENTA_ESTADO_COLORS: Record<VentaEstado, string> = {
  Pendiente:    'bg-yellow-100 text-yellow-700',
  Aprobada:     'bg-emerald-100 text-emerald-700',
  Rechazada:    'bg-red-100 text-red-600',
  Agendada:     'bg-blue-100 text-blue-700',
  Formalizada:  'bg-purple-100 text-purple-700',
  Garantizada:  'bg-teal-100 text-teal-700',
  Declinado:    'bg-gray-100 text-gray-500',
  Formalizado:  'bg-indigo-100 text-indigo-700',
  Cancelada:    'bg-orange-100 text-orange-600',
}

export const VENTA_ESTADOS: VentaEstado[] = [
  'Pendiente', 'Aprobada', 'Rechazada', 'Agendada', 'Formalizada', 'Garantizada', 'Declinado', 'Formalizado', 'Cancelada',
]

export function parseVenta(raw: Record<string, unknown>): Venta {
  const p = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null) return raw[k]
    }
    return undefined
  }
  return {
    id:             Number(p('idVenta', 'id', 'ID') ?? 0),
    nombreCliente:  String(p('nombreCliente', 'nombre_cliente', 'cliente') ?? ''),
    telefonoCliente:String(p('telefonoCliente', 'telefono', 'phone') ?? ''),
    estatus:        String(p('estatus', 'estado', 'status') ?? 'Pendiente') as VentaEstado,
    evidencia:      resolveEvidencia(p('evidencia', 'evidence') ? String(p('evidencia', 'evidence')) : null),
    fecha:          String(p('fecha', 'fechaCreacion', 'createdAt', 'date') ?? ''),
    campaignId:     Number(p('campaignId', 'campaign_id', 'campana') ?? 0),
    nombreAgente:   String(p('nombreAgente', 'nombre_agente', 'agente') ?? ''),
    agentId:        Number(p('idUser', 'agentId', 'userId') ?? 0),
    fechaAgendada:  p('fechaAgendada') ? String(p('fechaAgendada')) : null,
    horaAgendada:   p('horaAgendada') ? String(p('horaAgendada')) : null,
  }
}

export function parseAgente(raw: Record<string, unknown>): AgenteVentas {
  const p = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null) return raw[k]
    }
    return undefined
  }
  const rawIds = p('campaignIds')
  return {
    id:            Number(p('idUser', 'id', 'ID') ?? 0),
    nombreAgente:  String(p('nombreAgente', 'nombre', 'name') ?? ''),
    username:      String(p('username', 'usuario') ?? ''),
    role:          String(p('role', 'rol') ?? 'agente') as AgenteVentas['role'],
    campaignId:    Number(p('campaign', 'campaignId', 'campaign_id') ?? 0),
    campaignNombre:p('campaignNombre', 'campaignName') ? String(p('campaignNombre', 'campaignName')) : undefined,
    campaignIds:   Array.isArray(rawIds) ? rawIds.map(Number) : undefined,
    activo:        Boolean(p('Activo', 'activo', 'active') ?? true),
    color:         p('color') ? String(p('color')) : undefined,
  }
}

export function resolveEvidencia(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  const path = url.startsWith('/') ? url : `/${url}`
  // /uploads/evidencias/ → backend antiguo, archivos ya no disponibles en el servidor
  if (path.startsWith('/uploads/')) return null
  // /evidencia/ → backend v2.8, servido por ventas.ardabytec.vip
  return `https://ventas.ardabytec.vip${path}`
}

export interface CRMInteraccion {
  id: number
  telefono: string
  campaignId: number
  nombre: string
  datos: Record<string, string>
  fecha: string
  ultimaGestion?: string | null
  importacionNombre?: string | null
}

export interface CRMGestion {
  id: number
  telefono: string
  campaignId: number
  idUser?: number
  nombreAgente: string
  tipo: string
  datos: string
  fecha: string
}

export interface CRMCampoConfig {
  campo: string
  label: string
  etiqueta: string
  visible: boolean
  editable: boolean
  orden: number
}

export function parseCampana(raw: Record<string, unknown>): Campana {
  return {
    id:     Number(raw['ID'] ?? raw['id'] ?? 0),
    nombre: String(raw['nombre'] ?? raw['name'] ?? ''),
    activo: raw['activo'] !== undefined ? Boolean(raw['activo']) : true,
    color:  raw['color'] ? String(raw['color']) : undefined,
  }
}

// ── Base Madre ────────────────────────────────────────────
export interface BaseMadreStats {
  totalMadreRaw: number
  totalMadre: number
  totalLote1: number
  totalLote2: number
  totalHistorico: number
  totalRepetidos: number
  totalCola: number
  totalCola1: number
  totalCola2: number
  desglose: { StatusDetalle: string; total: number }[]
}

export interface BaseMadreRow {
  PhoneNumber: string
  FirstName?: string
  LastName?: string
  StatusDetalle?: string
  CampanaId?: number
  [key: string]: unknown
}

export interface VentaTrazada {
  PhoneNumber: string
  FirstName?: string
  TipCRM?: string
  AgenteGestion?: string
  AgenteVenta?: string
  EstatusVenta?: string
  FechaVenta?: string
  FechaArchivado?: string
  VecesContactado?: number
  CampanaId?: number
  ListID?: string
}

export interface TrazabilidadMesStat {
  mes: string
  total: number
  aprobadas: number
  pendientes: number
  rechazadas: number
  agendadas: number
  formalizadas: number
}

// ── CRM Admin ─────────────────────────────────────────────
export interface CRMImportacion {
  id: number
  nombre: string
  campaignId: number
  totalRegistros: number
  confirmada: boolean
  activa: boolean
  creadoEn: string
}

export interface CRMRegistro {
  id: number
  importacionId: number
  telefono: string
  nombre: string
  datos: Record<string, string>
}

export interface CRMTrazabilidad {
  telefono: string
  nombre: string
  ultimaGestion: string | null
  gestiones: number
  ventas: number
  importacionNombre: string
}

export interface CRMAcceso {
  agentId: number
  nombreAgente: string
  username: string
  tieneAcceso: boolean
}
