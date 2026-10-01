import { api } from '@/lib/axios'

// Campañas del sistema de Ventas (BD plata_prospectPRO): alta, edición con sus
// estatus y baja (desactivar). Ver campanaAgenteController.js.
// Tipo de campaña: 'ventas' y 'seguimiento' (los del sistema de Ventas, columna
// tieneSeguimiento) o 'c<id>', uno agregado por la empresa (ej. "Mixto") que dice
// si lleva seguimiento.
export type TipoCampanaVentas = string
export interface TipoCampana {
  clave: TipoCampanaVentas
  id: number | null
  nombre: string
  descripcion: string | null
  color: string | null
  seguimiento: boolean
  base: boolean
  activo: boolean
  campanas?: number
}
export interface DatosTipoCampana { nombre: string; descripcion: string | null; color: string | null; seguimiento: boolean; activo?: boolean }
// Mientras cargan los de la empresa (y si falla), los dos de Ventas.
export const TIPOS_BASE: TipoCampana[] = [
  { clave: 'ventas', id: null, nombre: 'Ventas', descripcion: 'Se captura la venta y se tipifica con sus estatus', color: '#f59e0b', seguimiento: false, base: true, activo: true },
  { clave: 'seguimiento', id: null, nombre: 'Seguimiento', descripcion: 'Además lleva seguimiento de cada venta (como AT&T)', color: '#0ea5e9', seguimiento: true, base: true, activo: true },
]
export interface EstatusCampanaVentas { id?: number | null; nombre: string; color: string | null; activo: boolean }
export interface CampanaVentas {
  id: number
  nombre: string
  color: string | null
  activo: boolean
  tipo: TipoCampanaVentas
  tipoNombre: string
  tipoColor: string | null
  estatus: (EstatusCampanaVentas & { id: number; orden: number })[]
  ventas: number
}

export const campanasVentasService = {
  // Todas, también las deshabilitadas (activo = false).
  listar: () => api.get('/campanas/ventas').then((r) => r.data.data as { id: number; nombre: string; color: string | null; activo: boolean; tipo: TipoCampanaVentas; tipoNombre: string; tipoColor: string | null; ventas: number }[]),
  activar: (id: number) => api.post(`/campanas/ventas/${id}/activar`).then((r) => r.data),
  get: (id: number) => api.get(`/campanas/ventas/${id}`).then((r) => r.data.data as CampanaVentas),
  crear: (body: { nombre: string; color: string | null; tipo?: TipoCampanaVentas; estatus?: EstatusCampanaVentas[] }) =>
    api.post('/campanas/ventas', body).then((r) => r.data.data as CampanaVentas | null),
  editar: (id: number, body: { nombre: string; color: string | null; tipo?: TipoCampanaVentas; estatus: EstatusCampanaVentas[] }) =>
    api.put(`/campanas/ventas/${id}`, body).then((r) => r.data.data as CampanaVentas | null),
  desactivar: (id: number) => api.delete(`/campanas/ventas/${id}`).then((r) => r.data),
  // Tipos de campaña: los dos de Ventas y los que agregue la empresa (también deshabilitados).
  tipos: () => api.get('/campanas/ventas/tipos').then((r) => r.data.data as TipoCampana[]),
  crearTipo: (body: DatosTipoCampana) => api.post('/campanas/ventas/tipos', body).then((r) => r.data.data as TipoCampana),
  editarTipo: (id: number, body: DatosTipoCampana) => api.put(`/campanas/ventas/tipos/${id}`, body).then((r) => r.data.data as TipoCampana),
  desactivarTipo: (id: number) => api.delete(`/campanas/ventas/tipos/${id}`).then((r) => r.data),
  // Copia sus estatus como tipificaciones de una campaña de AGYDA (una sola lista).
  copiarEstatusACampania: (id: number, campaniaId: number) =>
    api.post(`/campanas/ventas/${id}/tipificaciones-a/${campaniaId}`).then((r) => r.data.data as { agregadas: number; reactivadas: number; desactivadas: number }),
}

export const tiposCampanaQuery = {
  queryKey: ['campanas-ventas-tipos'] as const,
  queryFn: () => campanasVentasService.tipos(),
  staleTime: 60_000,
  placeholderData: TIPOS_BASE,
}
