import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import type {
  CCInteraccion, CCCanal, CCCampania, CCGrupo, CCTipificacion, CCMotivoCierre,
  CCPlantilla, CCAgenteEstado, CCMiEstado, CCConfig, CCMetricas,
} from '@/types/cc.types'

const d = <T>(p: Promise<{ data: { data?: T } }>): Promise<T> => p.then((r) => (r.data.data ?? ([] as unknown as T)))

export const ccService = {
  // ── Bandeja ──
  getInteracciones: (estado?: string) =>
    d<CCInteraccion[]>(api.get('/contact-center/interacciones', { params: estado ? { estado } : {} })),
  getInteraccion: (id: number) => d<CCInteraccion>(api.get(`/contact-center/interacciones/${id}`)),
  tomar: (id: number) => api.post(`/contact-center/interacciones/${id}/tomar`).then((r) => r.data),
  enviarMensaje: (id: number, contenido: string) =>
    api.post(`/contact-center/interacciones/${id}/mensajes`, { contenido }).then((r) => r.data),
  subirMedia: (id: number, file: File) => {
    const form = new FormData()
    form.append('archivo', file)
    return api.post(`/contact-center/interacciones/${id}/media`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  cerrar: (id: number, body: { motivoCierreId?: number; tipificacionId?: number; comentario?: string }) =>
    api.post(`/contact-center/interacciones/${id}/cerrar`, body).then((r) => r.data),
  transferir: (id: number, body: { nuevoAgenteId?: number; nuevoGrupoId?: number }) =>
    api.post(`/contact-center/interacciones/${id}/transferir`, body).then((r) => r.data),
  agentesTransferibles: (id: number) => d<CCAgenteEstado[]>(api.get(`/contact-center/interacciones/${id}/agentes-transferibles`)),
  mediaUrl: (mediaId: number) => {
    const token = useAuthStore.getState().token
    return `/api/contact-center/media/${mediaId}${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  // ── Estado agente ──
  setDisponible: (disponible: boolean) => api.post('/contact-center/mi-estado', { disponible }).then((r) => r.data),
  getMiEstado: () => d<CCMiEstado>(api.get('/contact-center/mi-estado')),
  getAgentesEstado: () => d<CCAgenteEstado[]>(api.get('/contact-center/agentes-estado')),

  // ── Catálogos chat ──
  getPlantillas: (grupoId: number) => d<CCPlantilla[]>(api.get('/contact-center/plantillas', { params: { grupoId } })),
  getTipificaciones: (campaniaId?: number | null) => d<CCTipificacion[]>(api.get('/contact-center/tipificaciones', { params: campaniaId ? { campaniaId } : {} })),
  getMotivosCierre: (grupoId: number) => d<CCMotivoCierre[]>(api.get('/contact-center/motivos-cierre', { params: { grupoId } })),

  // ── Supervisión ──
  supervisionActivas: () => d<CCInteraccion[]>(api.get('/contact-center/supervision/activas')),
  historial: (filtros: Record<string, string | number>) => d<CCInteraccion[]>(api.get('/contact-center/historial', { params: filtros })),
  metricas: () => d<CCMetricas>(api.get('/contact-center/metricas')),
  runCron: () => api.post('/contact-center/cron/run').then((r) => r.data),

  // ── Config: canales ──
  getCanales: () => d<CCCanal[]>(api.get('/contact-center/canales')),
  createCanal: (body: { tipo: string; nombre: string }) => api.post('/contact-center/canales', body).then((r) => r.data),
  updateCanal: (id: number, body: Record<string, unknown>) => api.put(`/contact-center/canales/${id}`, body).then((r) => r.data),
  deleteCanal: (id: number) => api.delete(`/contact-center/canales/${id}`).then((r) => r.data),
  probarCanal: (id: number) => api.post(`/contact-center/canales/${id}/probar`).then((r) => r.data),
  suscribirCanal: (id: number) => api.post(`/contact-center/canales/${id}/suscribir`).then((r) => r.data),

  // ── Config global ──
  getConfig: () => d<CCConfig>(api.get('/contact-center/config')),
  updateConfig: (body: Partial<CCConfig>) => api.put('/contact-center/config', body).then((r) => r.data),

  // ── Campañas / skills ──
  getCampanias: () => d<CCCampania[]>(api.get('/contact-center/campanias')),
  createCampania: (body: { nombre: string; descripcion?: string; maxChatsPorAgente?: number }) => api.post('/contact-center/campanias', body).then((r) => r.data),
  updateCampania: (id: number, body: Record<string, unknown>) => api.put(`/contact-center/campanias/${id}`, body).then((r) => r.data),
  deleteCampania: (id: number) => api.delete(`/contact-center/campanias/${id}`).then((r) => r.data),

  getGrupos: (campaniaId?: number) => d<CCGrupo[]>(api.get('/contact-center/grupos', { params: campaniaId ? { campaniaId } : {} })),
  createGrupo: (body: { campaniaId: number; nombre: string; descripcion?: string; icono?: string }) => api.post('/contact-center/grupos', body).then((r) => r.data),
  updateGrupo: (id: number, body: Record<string, unknown>) => api.put(`/contact-center/grupos/${id}`, body).then((r) => r.data),
  deleteGrupo: (id: number) => api.delete(`/contact-center/grupos/${id}`).then((r) => r.data),
  getAgentesDeGrupo: (grupoId: number) => d<{ usuarioId: number; nombre: string }[]>(api.get(`/contact-center/grupos/${grupoId}/agentes`)),
  asignarAgente: (grupoId: number, usuarioId: number) => api.post(`/contact-center/grupos/${grupoId}/agentes`, { usuarioId }).then((r) => r.data),
  quitarAgente: (grupoId: number, usuarioId: number) => api.delete(`/contact-center/grupos/${grupoId}/agentes/${usuarioId}`).then((r) => r.data),
  getMatrizAgentes: () => d<{ grupos: CCGrupo[]; asignaciones: { usuarioId: number; grupoId: number }[] }>(api.get('/contact-center/agentes-matriz')),

  getPlantillasDeGrupo: (grupoId: number) => d<CCPlantilla[]>(api.get(`/contact-center/grupos/${grupoId}/plantillas`)),
  createPlantilla: (grupoId: number, body: { nombre: string; contenido: string; visibilidad?: string }) => api.post(`/contact-center/grupos/${grupoId}/plantillas`, body).then((r) => r.data),
  updatePlantilla: (id: number, body: Record<string, unknown>) => api.put(`/contact-center/plantillas/${id}`, body).then((r) => r.data),
  deletePlantilla: (id: number) => api.delete(`/contact-center/plantillas/${id}`).then((r) => r.data),

  getMotivosDeGrupo: (grupoId: number) => d<CCMotivoCierre[]>(api.get(`/contact-center/grupos/${grupoId}/motivos-cierre`)),
  createMotivo: (grupoId: number, body: Record<string, unknown>) => api.post(`/contact-center/grupos/${grupoId}/motivos-cierre`, body).then((r) => r.data),
  updateMotivo: (id: number, body: Record<string, unknown>) => api.put(`/contact-center/motivos-cierre/${id}`, body).then((r) => r.data),
  deleteMotivo: (id: number) => api.delete(`/contact-center/motivos-cierre/${id}`).then((r) => r.data),

  getTipificacionesCatalogo: () => d<CCTipificacion[]>(api.get('/contact-center/tipificaciones-catalogo')),
  createTipificacion: (body: Record<string, unknown>) => api.post('/contact-center/tipificaciones-catalogo', body).then((r) => r.data),
  updateTipificacion: (id: number, body: Record<string, unknown>) => api.put(`/contact-center/tipificaciones-catalogo/${id}`, body).then((r) => r.data),
  deleteTipificacion: (id: number) => api.delete(`/contact-center/tipificaciones-catalogo/${id}`).then((r) => r.data),

  // ── Simulador ──
  simCrear: (body: { canalId: number; clienteNombre?: string; clienteTelefono?: string; mensaje: string }) =>
    api.post('/contact-center/sim/interacciones', body).then((r) => r.data as { success: boolean; data: { interaccionId: number; simToken: string } }),
}
