import { api } from '@/lib/axios'

// Campañas del sistema de Ventas (BD plata_prospectPRO): alta, edición con sus
// estatus y baja (desactivar). Ver campanaAgenteController.js.
export interface EstatusCampanaVentas { id?: number | null; nombre: string; color: string | null; activo: boolean }
export interface CampanaVentas {
  id: number
  nombre: string
  color: string | null
  activo: boolean
  estatus: (EstatusCampanaVentas & { id: number; orden: number })[]
  ventas: number
}

export const campanasVentasService = {
  // Todas, también las deshabilitadas (activo = false).
  listar: () => api.get('/campanas/ventas').then((r) => r.data.data as { id: number; nombre: string; color: string | null; activo: boolean; ventas: number }[]),
  activar: (id: number) => api.post(`/campanas/ventas/${id}/activar`).then((r) => r.data),
  get: (id: number) => api.get(`/campanas/ventas/${id}`).then((r) => r.data.data as CampanaVentas),
  crear: (body: { nombre: string; color: string | null; estatus?: EstatusCampanaVentas[] }) =>
    api.post('/campanas/ventas', body).then((r) => r.data.data as CampanaVentas | null),
  editar: (id: number, body: { nombre: string; color: string | null; estatus: EstatusCampanaVentas[] }) =>
    api.put(`/campanas/ventas/${id}`, body).then((r) => r.data.data as CampanaVentas | null),
  desactivar: (id: number) => api.delete(`/campanas/ventas/${id}`).then((r) => r.data),
  // Copia sus estatus como tipificaciones de una campaña de AGYDA (una sola lista).
  copiarEstatusACampania: (id: number, campaniaId: number) =>
    api.post(`/campanas/ventas/${id}/tipificaciones-a/${campaniaId}`).then((r) => r.data.data as { agregadas: number; reactivadas: number; desactivadas: number }),
}
