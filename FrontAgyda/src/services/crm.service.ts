import { api } from '@/lib/axios'
import {
  type CRMContacto, type CRMOportunidad, type CRMActividad, type CRMInteraccion,
  type CRMCuota, type CRMEmail, type CRMKpis,
  type CRMRecordatorioPago, type CRMDocumentoCliente, type CRMEncuestaDisponible, type CRMEncuestaEnviada,
  parseCRMContacto, parseCRMOportunidad, parseCRMActividad, parseCRMInteraccion,
  parseCRMRecordatorioPago, parseCRMDocumentoCliente, parseCRMEncuestaEnviada,
} from '@/types/crm.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as any)?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export const crmService = {
  // ── Contactos ──
  getContactos: async (q?: string): Promise<CRMContacto[]> => {
    const { data } = await api.get('/crm/contactos', { params: q ? { q } : undefined })
    return norm(data?.data ?? data, parseCRMContacto)
  },
  createContacto: async (body: Partial<CRMContacto> & { creadoPor?: number }) => {
    const { data } = await api.post('/crm/contactos', body)
    return data
  },
  updateContacto: async (id: number, body: Partial<CRMContacto>) => {
    const { data } = await api.put(`/crm/contactos/${id}`, body)
    return data
  },
  deleteContacto: async (id: number) => {
    const { data } = await api.delete(`/crm/contactos/${id}`)
    return data
  },

  // ── Clientes (Atención al Cliente, sobre CRM_CONTACTOS) ──
  // Sin filtro esCliente: muestra TODOS los contactos del CRM compartido con
  // Ventas — los que aún no tienen alta formal se distinguen en la UI y se
  // completan al editar su ficha (crmContactosController.altaCliente).
  getClientes: async (q?: string): Promise<CRMContacto[]> => {
    const { data } = await api.get('/crm/contactos', { params: { ...(q ? { q } : {}) } })
    return norm(data?.data ?? data, parseCRMContacto)
  },
  altaCliente: async (id: number, body: {
    tipoCliente?: string; direccion?: string; productoServicio?: string; responsableId?: number
    estatusCliente?: string; medioContacto?: string; observacionesIniciales?: string
  }) => {
    const { data } = await api.put(`/crm/contactos/${id}/alta-cliente`, body)
    return data
  },
  getExpediente: async (id: number): Promise<CRMContacto & { conteos: { documentos: number; pagos: number; encuestas: number } }> => {
    const { data } = await api.get(`/crm/contactos/${id}/expediente`)
    const raw = data?.data ?? data
    return { ...parseCRMContacto(raw), conteos: raw.conteos }
  },

  // ── Oportunidades ──
  getOportunidades: async (): Promise<CRMOportunidad[]> => {
    const { data } = await api.get('/crm/oportunidades')
    return norm(data?.data ?? data, parseCRMOportunidad)
  },
  createOportunidad: async (body: Record<string, unknown>) => {
    const { data } = await api.post('/crm/oportunidades', body)
    return data
  },
  updateOportunidad: async (id: number, body: Record<string, unknown>) => {
    const { data } = await api.put(`/crm/oportunidades/${id}`, body)
    return data
  },
  deleteOportunidad: async (id: number) => {
    const { data } = await api.delete(`/crm/oportunidades/${id}`)
    return data
  },
  generarProyecto: (opoId: number, nombreProyecto: string, miembros: { nombre: string; rol: 'lider' | 'miembro' | 'revisor' }[]) =>
    api.post(`/crm/oportunidades/${opoId}/generar-proyecto`, { nombreProyecto, miembros }).then(r => r.data as { success: boolean; proyectoId: number }),
  getActividades: async (opoId: number): Promise<CRMActividad[]> => {
    const { data } = await api.get(`/crm/oportunidades/${opoId}/actividades`)
    return norm(data?.data ?? data, parseCRMActividad)
  },
  getInteracciones: async (opoId: number): Promise<CRMInteraccion[]> => {
    const { data } = await api.get(`/crm/oportunidades/${opoId}/interacciones`)
    return norm(data?.data ?? data, parseCRMInteraccion)
  },
  getAllActividades: async (): Promise<CRMActividad[]> => {
    const { data } = await api.get('/crm/actividades')
    return norm(data?.data ?? data, parseCRMActividad)
  },

  // ── Actividades ──
  createActividad: async (body: Record<string, unknown>) => {
    const { data } = await api.post('/crm/actividades', body)
    return data
  },
  updateActividad: async (id: number, body: Record<string, unknown>) => {
    const { data } = await api.put(`/crm/actividades/${id}`, body)
    return data
  },
  deleteActividad: async (id: number) => {
    const { data } = await api.delete(`/crm/actividades/${id}`)
    return data
  },

  // ── Interacciones ──
  createInteraccion: async (body: Record<string, unknown>) => {
    const { data } = await api.post('/crm/interacciones', body)
    return data
  },
  updateInteraccion: async (id: number, contenido: string) => {
    const { data } = await api.put(`/crm/interacciones/${id}`, { contenido })
    return data
  },
  deleteInteraccion: async (id: number) => {
    const { data } = await api.delete(`/crm/interacciones/${id}`)
    return data
  },

  // ── Reportes ──
  getKpis: async (): Promise<CRMKpis> => {
    const { data } = await api.get('/crm/reportes/kpis')
    return data.data
  },
  getEmbudo: async () => {
    const { data } = await api.get('/crm/reportes/embudo')
    return (data.data ?? []) as { etapa: string; total: number; valor: number }[]
  },
  getForecast: async () => {
    const { data } = await api.get('/crm/reportes/forecast')
    return (data.data ?? []) as { anio: number; mes: number; etapa: string; total: number; valor: number }[]
  },
  getPorResponsable: async () => {
    const { data } = await api.get('/crm/reportes/por-responsable')
    return (data.data ?? []) as { nombre: string; usuarioId: number; total: number; valorGanado: number; valorPipeline: number; ganadas: number; perdidas: number }[]
  },

  // ── Cuotas ──
  getCuotas: async (anio: number, mes: number): Promise<CRMCuota[]> => {
    const { data } = await api.get('/crm/cuotas', { params: { anio, mes } })
    return data.data ?? []
  },
  upsertCuota: async (body: { usuarioId: number; anio: number; mes: number; meta: number }) => {
    const { data } = await api.post('/crm/cuotas', body)
    return data
  },
  deleteCuota: async (id: number) => {
    const { data } = await api.delete(`/crm/cuotas/${id}`)
    return data
  },

  // ── Emails ──
  sendEmail: async (body: { opoId?: number; contactoId?: number; para: string; asunto: string; cuerpo: string }) => {
    const { data } = await api.post('/crm/emails/send', body)
    return data
  },
  getEmailsByOpo: async (opoId: number): Promise<CRMEmail[]> => {
    const { data } = await api.get(`/crm/oportunidades/${opoId}/emails`)
    return data.data ?? []
  },

  // ── Portal ──
  invitarPortal: async (contactoId: number) => {
    const { data } = await api.post('/crm/portal/invitar', { contactoId })
    return data
  },

  // ── Automatizaciones ──
  runAutomatizaciones: async () => {
    const { data } = await api.post('/crm/automatizaciones/run')
    return data
  },

  // ── Automatizaciones Reglas ──
  getAutomatizacionesReglas: () => api.get('/crm/automatizaciones/reglas').then(r => r.data.data ?? []),
  createAutomatizacionRegla: (data: { etapaTrigger: string; tipoActividad: string; descripcion: string; diasOffset: number }) =>
    api.post('/crm/automatizaciones/reglas', data).then(r => r.data),
  updateAutomatizacionRegla: (id: number, data: Partial<{ etapaTrigger: string; tipoActividad: string; descripcion: string; diasOffset: number; activo: boolean }>) =>
    api.put(`/crm/automatizaciones/reglas/${id}`, data).then(r => r.data),
  deleteAutomatizacionRegla: (id: number) =>
    api.delete(`/crm/automatizaciones/reglas/${id}`).then(r => r.data),

  // ── Cotizaciones ──
  getCotizaciones: (opoId: number) =>
    api.get(`/crm/oportunidades/${opoId}/cotizaciones`).then(r => r.data.data ?? []),
  getCotizacionDetalle: (id: number) =>
    api.get(`/crm/cotizaciones/${id}`).then(r => r.data.data),
  createCotizacion: (data: { opoId: number; titulo: string; fechaVto?: string; notas?: string; items: any[] }) =>
    api.post('/crm/cotizaciones', data).then(r => r.data),
  updateCotizacion: (id: number, data: { titulo?: string; fechaVto?: string; notas?: string; items: any[] }) =>
    api.put(`/crm/cotizaciones/${id}`, data).then(r => r.data),
  deleteCotizacion: (id: number) =>
    api.delete(`/crm/cotizaciones/${id}`).then(r => r.data),
  enviarCotizacion: (id: number) =>
    api.post(`/crm/cotizaciones/${id}/enviar`).then(r => r.data),
  aprobarCotizacion: (id: number, portalToken?: string) =>
    api.post(`/crm/cotizaciones/${id}/aprobar`, { portalToken }).then(r => r.data),
  rechazarCotizacion: (id: number, portalToken?: string) =>
    api.post(`/crm/cotizaciones/${id}/rechazar`, { portalToken }).then(r => r.data),
  getCotizacionPdfUrl: (id: number) => `/api/crm/cotizaciones/${id}/pdf`,

  // ── Accesos CRM ──
  getAccesosCRM: () => api.get('/crm-accesos/').then(r => r.data.data ?? r.data ?? []),
  updateAccesoCRM: (id: number, data: { activo: boolean }) =>
    api.put(`/crm-accesos/${id}`, data).then(r => r.data),
  addAccesoCRM: (userId: number) =>
    api.post('/crm-accesos/', { userId }).then(r => r.data),
  deleteAccesoCRM: (id: number) =>
    api.delete(`/crm-accesos/${id}`).then(r => r.data),

  // ── Seguimiento: Recordatorios de pago ──
  getRecordatorios: async (contactoId: number): Promise<CRMRecordatorioPago[]> => {
    const { data } = await api.get('/crm/recordatorios', { params: { contactoId } })
    return norm(data?.data ?? data, parseCRMRecordatorioPago)
  },
  createRecordatorio: (body: { contactoId: number; opoId?: number; concepto: string; monto: number; fechaLimite: string; notas?: string }) =>
    api.post('/crm/recordatorios', body).then(r => r.data),
  cancelarRecordatorio: (id: number) =>
    api.post(`/crm/recordatorios/${id}/cancelar`).then(r => r.data),
  confirmarPagoRecordatorio: (id: number, body: { metodoPago?: string; comprobanteDocId?: number; fechaPago?: string; montoPagado?: number }) =>
    api.post(`/crm/recordatorios/${id}/confirmar-pago`, body).then(r => r.data),
  deleteRecordatorio: (id: number) =>
    api.delete(`/crm/recordatorios/${id}`).then(r => r.data),
  runRecordatoriosCron: () =>
    api.post('/crm/recordatorios/run-cron').then(r => r.data),

  // ── Seguimiento: Documentos de cliente ──
  getDocumentosCliente: async (contactoId: number): Promise<CRMDocumentoCliente[]> => {
    const { data } = await api.get(`/crm/contactos/${contactoId}/documentos`)
    return norm(data?.data ?? data, parseCRMDocumentoCliente)
  },
  uploadDocumentoCliente: (contactoId: number, file: File, opts?: { descripcion?: string; categoria?: string; visiblePortal?: boolean }) => {
    const form = new FormData()
    form.append('file', file)
    if (opts?.descripcion) form.append('descripcion', opts.descripcion)
    if (opts?.categoria) form.append('categoria', opts.categoria)
    if (opts?.visiblePortal === false) form.append('visiblePortal', 'false')
    return api.post(`/crm/contactos/${contactoId}/documentos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  downloadDocumentoCliente: async (docId: number, filename: string) => {
    const { data } = await api.get(`/crm/documentos/${docId}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  toggleDocumentoPortal: (docId: number, visible: boolean) =>
    api.patch(`/crm/documentos/${docId}/portal`, { visible }).then(r => r.data),
  deleteDocumentoCliente: (docId: number) =>
    api.delete(`/crm/documentos/${docId}`).then(r => r.data),

  // ── Seguimiento: Encuestas enviadas ──
  getEncuestasDisponibles: async (): Promise<CRMEncuestaDisponible[]> => {
    const { data } = await api.get('/crm/encuestas-disponibles')
    return (data.data ?? []) as CRMEncuestaDisponible[]
  },
  enviarEncuestaContacto: (contactoId: number, encuestaId: number) =>
    api.post(`/crm/contactos/${contactoId}/encuestas/enviar`, { encuestaId }).then(r => r.data),
  getEncuestasEnviadas: async (contactoId: number): Promise<CRMEncuestaEnviada[]> => {
    const { data } = await api.get(`/crm/contactos/${contactoId}/encuestas-enviadas`)
    return norm(data?.data ?? data, parseCRMEncuestaEnviada)
  },
}
