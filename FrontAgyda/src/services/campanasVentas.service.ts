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
  get: (id: number) => api.get(`/campanas/ventas/${id}`).then((r) => r.data.data as CampanaVentas),
  crear: (body: { nombre: string; color: string | null; estatus?: EstatusCampanaVentas[] }) =>
    api.post('/campanas/ventas', body).then((r) => r.data.data as CampanaVentas | null),
  editar: (id: number, body: { nombre: string; color: string | null; estatus: EstatusCampanaVentas[] }) =>
    api.put(`/campanas/ventas/${id}`, body).then((r) => r.data.data as CampanaVentas | null),
  desactivar: (id: number) => api.delete(`/campanas/ventas/${id}`).then((r) => r.data),
}
