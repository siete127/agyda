import { api } from '@/lib/axios'
import type {
  SupervisorAsignacion, PanelSupervisor, ProductividadAgente, HistorialAsignacion, AlarmaInstancia,
  NotificacionTipo, NotificacionAlcance, NotificacionPendiente, NotificacionEnviada, ComparadorData,
} from '@/types/supervisores.types'

export const supervisoresService = {
  async getAsignaciones(): Promise<SupervisorAsignacion[]> {
    const { data } = await api.get('/operaciones/supervisores')
    return (data?.data ?? []) as SupervisorAsignacion[]
  },

  async asignar(campaniaId: number, supervisorId: number): Promise<void> {
    await api.post('/operaciones/supervisores', { campaniaId, supervisorId })
  },

  async quitar(id: number): Promise<void> {
    await api.delete(`/operaciones/supervisores/${id}`)
  },

  async getMiPanel(): Promise<PanelSupervisor> {
    const { data } = await api.get('/operaciones/supervisores/mi-panel')
    return data?.data ?? { campanias: [], agentes: [] }
  },

  async getProductividad(fecha?: string): Promise<ProductividadAgente[]> {
    const { data } = await api.get('/operaciones/supervisores/productividad', { params: fecha ? { fecha } : {} })
    return (data?.data ?? []) as ProductividadAgente[]
  },

  async getHistorialAsignaciones(): Promise<HistorialAsignacion[]> {
    const { data } = await api.get('/operaciones/supervisores/historial-asignaciones')
    return (data?.data ?? []) as HistorialAsignacion[]
  },

  async getAlarmas(): Promise<AlarmaInstancia[]> {
    const { data } = await api.get('/operaciones/supervisores/alarmas')
    return (data?.data ?? []) as AlarmaInstancia[]
  },

  async atenderAlarma(id: number, comentario?: string): Promise<void> {
    await api.post(`/operaciones/supervisores/alarmas/${id}/atender`, { comentario })
  },

  async crearNotificacion(body: { tipo: NotificacionTipo; alcance: NotificacionAlcance; alcanceId?: number; mensaje: string }): Promise<void> {
    await api.post('/operaciones/supervisores/notificaciones', body)
  },

  async getNotificacionesEnviadas(): Promise<NotificacionEnviada[]> {
    const { data } = await api.get('/operaciones/supervisores/notificaciones')
    return (data?.data ?? []) as NotificacionEnviada[]
  },

  async getNotificacionesPendientes(): Promise<NotificacionPendiente[]> {
    const { data } = await api.get('/operaciones/supervisores/notificaciones/pendientes')
    return (data?.data ?? []) as NotificacionPendiente[]
  },

  async cerrarNotificacion(id: number): Promise<void> {
    await api.post(`/operaciones/supervisores/notificaciones/${id}/cerrar`)
  },

  async getComparador(fecha?: string): Promise<ComparadorData> {
    const { data } = await api.get('/operaciones/supervisores/comparador', { params: fecha ? { fecha } : {} })
    return data?.data ?? { agentes: [], campanias: [] }
  },

  async desconectarAgente(agenteId: number): Promise<void> {
    await api.post(`/operaciones/supervisores/agentes/${agenteId}/desconectar`)
  },

  async refrescarAgente(agenteId: number): Promise<void> {
    await api.post(`/operaciones/supervisores/agentes/${agenteId}/refrescar`)
  },

  async getVistaColumnas(tabla: string): Promise<string[] | null> {
    const { data } = await api.get(`/operaciones/supervisores/vistas/${tabla}`)
    return data?.data?.columnas ?? null
  },

  async guardarVistaColumnas(tabla: string, columnas: string[]): Promise<void> {
    await api.put(`/operaciones/supervisores/vistas/${tabla}`, { columnas })
  },
}
