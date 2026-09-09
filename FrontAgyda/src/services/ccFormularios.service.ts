import { api, apiPublico } from '@/lib/axios'
import type {
  CCFormulario, CCFormularioDetalle, CCFormVersionCompleta, CCFormAsignacion,
  CCFormCampoInput, CCFormTipoCampo, CCFormTipificacionesDelFormulario, CCFormInteraccionBuscada,
  CCFormBuscadorResultado, CCFormCanalDisponible, CCFormModo, CCFormPublicoDefinicion,
  CCFormAccionPost, CCFormAccionTipo, CCFormRespuestaInput, CCFormGuardarRespuestasResultado,
} from '@/types/ccFormularios.types'

const d = <T>(p: Promise<{ data: { data?: T } }>): Promise<T> => p.then((r) => (r.data.data ?? ([] as unknown as T)))

// Formularios de Atención (Contact Center) — Entrega 1. Ver
// ccFormulariosController.js para el contrato exacto de cada endpoint.
export const ccFormulariosService = {
  listTiposCampo: () => d<CCFormTipoCampo[]>(api.get('/contact-center/formularios/tipos-campo')),

  listFormularios: () => d<CCFormulario[]>(api.get('/contact-center/formularios')),
  getFormulario: (id: number) => d<CCFormularioDetalle>(api.get(`/contact-center/formularios/${id}`)),
  createFormulario: (body: { nombre: string; codigo?: string; descripcion?: string }) =>
    api.post('/contact-center/formularios', body).then((r) => r.data),
  updateFormulario: (id: number, body: { nombre?: string; descripcion?: string }) =>
    api.patch(`/contact-center/formularios/${id}`, body).then((r) => r.data),
  archivarFormulario: (id: number) => api.delete(`/contact-center/formularios/${id}`).then((r) => r.data),
  clonarFormulario: (id: number, versionId?: number) =>
    api.post(`/contact-center/formularios/${id}/clonar`, { versionId }).then((r) => r.data),
  crearVersion: (id: number) => api.post(`/contact-center/formularios/${id}/versiones`).then((r) => r.data),

  getVersionCompleta: (versionId: number) =>
    d<CCFormVersionCompleta>(api.get(`/contact-center/formularios/versiones/${versionId}`)),
  publicarVersion: (versionId: number) =>
    api.post(`/contact-center/formularios/versiones/${versionId}/publicar`).then((r) => r.data),
  inactivarVersion: (versionId: number) =>
    api.post(`/contact-center/formularios/versiones/${versionId}/inactivar`).then((r) => r.data),

  createSeccion: (versionId: number, body: { titulo: string; codigo?: string; descripcion?: string; orden?: number }) =>
    api.post(`/contact-center/formularios/versiones/${versionId}/secciones`, body).then((r) => r.data),
  updateSeccion: (id: number, body: Record<string, unknown>) =>
    api.put(`/contact-center/formularios/secciones/${id}`, body).then((r) => r.data),
  deleteSeccion: (id: number) => api.delete(`/contact-center/formularios/secciones/${id}`).then((r) => r.data),

  createCampo: (seccionId: number, body: CCFormCampoInput) =>
    api.post(`/contact-center/formularios/secciones/${seccionId}/campos`, body).then((r) => r.data),
  updateCampo: (id: number, body: Partial<CCFormCampoInput>) =>
    api.put(`/contact-center/formularios/campos/${id}`, body).then((r) => r.data),
  deleteCampo: (id: number) => api.delete(`/contact-center/formularios/campos/${id}`).then((r) => r.data),

  listAsignaciones: () => d<CCFormAsignacion[]>(api.get('/contact-center/formularios-asignaciones')),
  createAsignacion: (body: { campaniaId: number; canalId?: number | null; formVersionId: number }) =>
    api.post('/contact-center/formularios-asignaciones', body).then((r) => r.data),
  deleteAsignacion: (id: number) => api.delete(`/contact-center/formularios-asignaciones/${id}`).then((r) => r.data),

  // Tipificaciones heredadas de la(s) campaña(s) asignadas al formulario.
  listTipificacionesDelFormulario: (formularioId: number) =>
    d<CCFormTipificacionesDelFormulario>(api.get(`/contact-center/formularios/${formularioId}/tipificaciones`)),
  setTipificacionesDelFormulario: (formularioId: number, tipificacionIds: number[]) =>
    api.put(`/contact-center/formularios/${formularioId}/tipificaciones`, { tipificacionIds }).then((r) => r.data),

  // Buscador de interacciones de las campañas asignadas al formulario (panel
  // administrativo del constructor).
  buscarInteraccionesDelFormulario: (formularioId: number, params: {
    texto?: string; agenteId?: number; tipificacionId?: number; fechaDesde?: string; fechaHasta?: string
  }) => d<CCFormInteraccionBuscada[]>(api.get(`/contact-center/formularios/${formularioId}/interacciones`, { params })),

  // Campo tipo 'buscador' — usado por el agente EN VIVO durante una atención,
  // acotado a las campañas/canales asignados al formulario.
  buscarRegistrosCampoBuscador: (formularioId: number, texto: string) =>
    d<CCFormBuscadorResultado[]>(api.get(`/contact-center/formularios/${formularioId}/buscador`, { params: { texto } })),
  crearRegistroCampoBuscador: (formularioId: number, body: {
    clienteNombre?: string; clienteTelefono?: string; canalId: number; tipificacionId?: number | null; comentario?: string
  }) => api.post(`/contact-center/formularios/${formularioId}/buscador/registrar`, body).then((r) => r.data),
  listCanalesDisponibles: (formularioId: number) =>
    d<CCFormCanalDisponible[]>(api.get(`/contact-center/formularios/${formularioId}/canales-disponibles`)),

  // Interno/externo — la URL pública se arma en el frontend con
  // window.location.origin + esta ruta, el backend solo entrega el token.
  setModoFormulario: (formularioId: number, modo: CCFormModo) =>
    api.put(`/contact-center/formularios/${formularioId}/modo`, { modo }).then((r) => r.data),

  // Guardar/leer respuestas de una atención real.
  guardarRespuestas: (versionId: number, body: {
    interaccionId?: number; respuestas: CCFormRespuestaInput[]
    clienteNombre?: string; clienteTelefono?: string; canalId?: number
  }) => d<CCFormGuardarRespuestasResultado>(api.post(`/contact-center/formularios/versiones/${versionId}/respuestas`, body)),
  getRespuestas: (versionId: number, interaccionId: number) =>
    d<CCFormRespuestaInput[]>(api.get(`/contact-center/formularios/versiones/${versionId}/respuestas/${interaccionId}`)),

  // Acciones sugeridas después de guardar (catálogo por formulario).
  listAccionesPost: (formularioId: number) =>
    d<CCFormAccionPost[]>(api.get(`/contact-center/formularios/${formularioId}/acciones-post`)),
  createAccionPost: (formularioId: number, body: { tipo: CCFormAccionTipo; etiqueta: string; descripcion?: string; orden?: number }) =>
    api.post(`/contact-center/formularios/${formularioId}/acciones-post`, body).then((r) => r.data),
  deleteAccionPost: (id: number) => api.delete(`/contact-center/formularios/acciones-post/${id}`).then((r) => r.data),
  marcarAccionEjecutada: (interaccionId: number, accionId: number) =>
    api.post(`/contact-center/formularios/interacciones/${interaccionId}/acciones-post/${accionId}/marcar`).then((r) => r.data),
}

// Formulario en modo EXTERNO (sin sesión) — pensado para que VICIdial abra
// la URL directo, con apiPublico (sin interceptores de auth). Se exporta
// aparte de ccFormulariosService porque conceptualmente es una superficie
// distinta (consumida por FormularioPublicoPage, nunca por el panel admin).
export const ccFormularioPublicoService = {
  getDefinicion: (token: string) =>
    d<CCFormPublicoDefinicion>(apiPublico.get(`/contact-center/formularios-publico/${token}`)),
  listCanalesDisponibles: (token: string) =>
    d<CCFormCanalDisponible[]>(apiPublico.get(`/contact-center/formularios-publico/${token}/canales-disponibles`)),
  buscar: (token: string, texto: string) =>
    d<CCFormBuscadorResultado[]>(apiPublico.get(`/contact-center/formularios-publico/${token}/buscador`, { params: { texto } })),
  registrar: (token: string, body: {
    clienteNombre?: string; clienteTelefono?: string; canalId: number; agenteId?: number | null; agenteNombre?: string | null; comentario?: string
  }) => apiPublico.post(`/contact-center/formularios-publico/${token}/buscador/registrar`, body).then((r) => r.data),

  guardarRespuestas: (token: string, versionId: number, body: {
    respuestas: CCFormRespuestaInput[]; clienteNombre?: string; clienteTelefono?: string; canalId?: number
    agenteId?: number | null; agenteNombre?: string | null
  }) => d<CCFormGuardarRespuestasResultado>(apiPublico.post(`/contact-center/formularios-publico/${token}/versiones/${versionId}/respuestas`, body)),
}
