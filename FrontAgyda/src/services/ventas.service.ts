import { ventasApi, ventasPublicApi } from '@/lib/axios-ventas'
import {
  parseVenta, parseAgente, parseCampana,
  type Venta, type VentaAgendada, type AgenteVentas, type Campana, type CampanaStatus, type StatsResponse, type StatsDynamicResponse,
  type CRMInteraccion, type CRMGestion, type CRMCampoConfig,
  type BaseMadreStats, type BaseMadreRow, type VentaTrazada, type TrazabilidadMesStat,
  type CRMImportacion, type CRMRegistro, type CRMTrazabilidad, type CRMAcceso,
} from '@/types/ventas.types'

export const ventasService = {
  async login(username: string, password: string) {
    const { data } = await ventasApi.post('/auth/login', { username, password })
    return {
      token:     String(data.accessToken ?? data.token ?? ''),
      userId:    String(data.id ?? data.userId ?? ''),
      role:      String(data.role ?? 'agente'),
      campaigns: (data.campaigns ?? []).map(parseCampana),
    }
  },

  async getVentasHoy(campaignId?: number, nombreAgente?: string): Promise<Venta[]> {
    const params: Record<string, unknown> = {}
    if (campaignId) params['campaignId'] = campaignId
    if (nombreAgente) params['nombreAgente'] = nombreAgente
    const { data } = await ventasApi.get('/agent/sales', { params })
    const list = Array.isArray(data) ? data : (data?.data ?? data?.ventas ?? [])
    return list.map((r: Record<string, unknown>) => parseVenta(r))
  },

  async createVenta(payload: {
    nombreCliente: string
    telefonoCliente: string
    estatus: string
    campaignId: number
    nombreAgente?: string
    evidencia?: string
    fechaAgendada?: string
    horaAgendada?: string
  }): Promise<Venta> {
    const { data } = await ventasApi.post('/agent/sales', payload)
    return parseVenta(data?.venta ?? data?.sale ?? data)
  },

  async uploadEvidencia(file: File): Promise<string> {
    const form = new FormData()
    form.append('evidence', file)
    const { data } = await ventasApi.post('/agent/upload-evidence', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return String(data?.filePath ?? data?.url ?? data?.evidencia ?? '')
  },

  async checkPhone(telefono: string): Promise<boolean> {
    try {
      const { data } = await ventasApi.get('/agent/check-phone', { params: { telefonoCliente: telefono } })
      return Boolean(data?.exists ?? data?.duplicate ?? false)
    } catch {
      return false
    }
  },

  async getCampaigns(): Promise<Campana[]> {
    const { data } = await ventasApi.get('/agent/campaigns')
    const list = Array.isArray(data) ? data : (data?.campaigns ?? data?.data ?? [])
    return list.map((r: Record<string, unknown>) => parseCampana(r))
  },

  async getAllCampaigns(): Promise<Campana[]> {
    const { data } = await ventasApi.get('/agent/campaigns/all')
    const list = Array.isArray(data) ? data : (data?.campaigns ?? data?.data ?? [])
    return list.map((r: Record<string, unknown>) => parseCampana(r))
  },

  async getScheduled(): Promise<VentaAgendada[]> {
    const { data } = await ventasApi.get('/agent/sales/scheduled')
    const list = Array.isArray(data) ? data : (data?.data ?? data?.ventas ?? [])
    return list.map((r: Record<string, unknown>) => parseVenta(r)) as VentaAgendada[]
  },

  async completeScheduled(id: number): Promise<void> {
    await ventasApi.put(`/agent/sales/scheduled/complete/${id}`)
  },

  async deleteScheduled(id: number): Promise<void> {
    await ventasApi.delete(`/agent/sales/scheduled/${id}`)
  },

  async getStatsDay(campaignId?: number, date?: string, isBanamex = false): Promise<StatsResponse> {
    return fetchStatsPeriod('day', campaignId, date, isBanamex)
  },

  async getStatsWeek(campaignId?: number, date?: string, isBanamex = false): Promise<StatsResponse> {
    return fetchStatsPeriod('week', campaignId, date, isBanamex)
  },

  async getStatsMonth(campaignId?: number, date?: string, isBanamex = false): Promise<StatsResponse> {
    return fetchStatsPeriod('month', campaignId, date, isBanamex)
  },

  async getStatsDynamicDay(campaignId?: number, date?: string): Promise<StatsDynamicResponse> {
    return fetchStatsDynamic('day', campaignId, date)
  },

  async getStatsDynamicWeek(campaignId?: number, date?: string): Promise<StatsDynamicResponse> {
    return fetchStatsDynamic('week', campaignId, date)
  },

  async getStatsDynamicMonth(campaignId?: number, date?: string): Promise<StatsDynamicResponse> {
    return fetchStatsDynamic('month', campaignId, date)
  },

  async getAllSales(params?: { campaignId?: number; dateFrom?: string; dateTo?: string }): Promise<Venta[]> {
    const query: Record<string, unknown> = {}
    if (params?.campaignId) query['campaign'] = params.campaignId
    if (params?.dateFrom)   query['dateFrom']  = params.dateFrom
    if (params?.dateTo)     query['dateTo']    = params.dateTo
    const { data } = await ventasApi.get('/admin/sales/all', { params: query })
    const list = Array.isArray(data) ? data : (data?.ventas ?? data?.data ?? [])
    return list.map((r: Record<string, unknown>) => parseVenta(r))
  },

  async exportExcel(period: 'day' | 'week' | 'month', campaignId?: number, date?: string): Promise<void> {
    const token = (await import('@/stores/ventas.store')).useVentasStore.getState().ventasToken
    const qs = new URLSearchParams({ status: 'total' })
    if (campaignId) qs.set('campaign', String(campaignId))
    if (date) qs.set('date', date)
    const res = await fetch(`https://ventas.ardabytec.vip:8443/api/admin/export-excel/${period}?${qs}`, {
      headers: { 'x-access-token': token ?? '' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const periodLabel = period === 'day' ? 'diarias' : period === 'week' ? 'semanales' : 'mensuales'
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `ventas_${periodLabel}_${dateStr}.xlsx`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },

  async exportExcelByIds(ids: number[]): Promise<void> {
    const token = (await import('@/stores/ventas.store')).useVentasStore.getState().ventasToken
    const qs = new URLSearchParams({ ids: ids.join(',') })
    const res = await fetch(`https://ventas.ardabytec.vip:8443/api/admin/export-excel/ids?${qs}`, {
      headers: { 'x-access-token': token ?? '' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `ventas_registros_${dateStr}.xlsx`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },

  async updateVenta(id: number, payload: Partial<Venta>): Promise<void> {
    await ventasApi.put(`/admin/sales/${id}`, payload)
  },

  async deleteVenta(id: number): Promise<void> {
    await ventasApi.delete(`/admin/sales/${id}`)
  },

  async getAdminCampaigns(): Promise<Campana[]> {
    const { data } = await ventasApi.get('/admin/campaigns')
    const list = Array.isArray(data) ? data : (data?.campaigns ?? data?.data ?? [])
    return list.map((r: Record<string, unknown>) => parseCampana(r))
  },

  async getAgentes(campaignId?: number): Promise<AgenteVentas[]> {
    const { data } = await ventasApi.get('/admin/agents', { params: campaignId ? { campaignId } : {} })
    const list = Array.isArray(data) ? data : (data?.agents ?? data?.data ?? [])
    return list.map((r: Record<string, unknown>) => parseAgente(r))
  },

  async createAgente(payload: {
    nombreAgente: string; username: string; password: string; role: string; campaignId: number
  }): Promise<AgenteVentas> {
    const { data } = await ventasApi.post('/admin/agents', payload)
    return parseAgente(data?.agent ?? data)
  },

  async updateAgente(id: number, payload: Partial<AgenteVentas & { password?: string; campaigns?: number[] }>): Promise<void> {
    await ventasApi.put(`/admin/agents/${id}`, payload)
  },

  async toggleAgente(id: number): Promise<void> {
    await ventasApi.put(`/admin/toggle/${id}`)
  },

  async deleteAgente(id: number): Promise<void> {
    await ventasApi.delete(`/admin/agents/${id}`)
  },

  async getCampanas(): Promise<Campana[]> {
    const { data } = await ventasApi.get('/admin/campaigns')
    const list = Array.isArray(data) ? data : (data?.campaigns ?? data?.data ?? [])
    return list.map((r: Record<string, unknown>) => parseCampana(r))
  },

  async createCampana(nombre: string): Promise<Campana> {
    const { data } = await ventasApi.post('/admin/campaigns', { nombre })
    return parseCampana(data?.campaign ?? data)
  },

  async toggleCampana(id: number): Promise<boolean> {
    const { data } = await ventasApi.put(`/admin/campaigns/toggle/${id}`)
    return Boolean(data?.activo)
  },

  async updateCampana(id: number, nombre: string, color?: string): Promise<void> {
    await ventasApi.put(`/admin/campaigns/${id}`, { nombre, color })
  },

  async getCampanaStatuses(id: number): Promise<CampanaStatus[]> {
    const { data } = await ventasApi.get(`/admin/campaigns/${id}/statuses`)
    const list = Array.isArray(data) ? data : []
    return list.map((r: Record<string, unknown>) => ({
      id:           Number(r['id'] ?? 0),
      campaignId:   id,
      nombreEstado: String(r['nombreEstado'] ?? ''),
      orden:        Number(r['orden'] ?? 0),
      activo:       Boolean(r['activo'] ?? true),
      color:        r['color'] ? String(r['color']) : null,
    }))
  },

  async addCampanaStatus(campaignId: number, nombreEstado: string, color?: string): Promise<void> {
    await ventasApi.post(`/admin/campaigns/${campaignId}/statuses`, { nombreEstado, color })
  },

  async updateCampanaStatus(campaignId: number, statusId: number, data: { nombreEstado?: string; color?: string }): Promise<void> {
    await ventasApi.put(`/admin/campaigns/${campaignId}/statuses/${statusId}`, data)
  },

  async toggleCampanaStatus(campaignId: number, statusId: number): Promise<boolean> {
    const { data } = await ventasApi.put(`/admin/campaigns/${campaignId}/statuses/${statusId}/toggle`)
    return Boolean(data?.activo)
  },

  async deleteCampanaStatus(campaignId: number, statusId: number): Promise<void> {
    await ventasApi.delete(`/admin/campaigns/${campaignId}/statuses/${statusId}`)
  },

  async getScheduledAdmin(): Promise<VentaAgendada[]> {
    const { data } = await ventasApi.get('/admin/scheduled-sales')
    const list = Array.isArray(data) ? data : (data?.data ?? data?.ventas ?? [])
    return list.map((r: Record<string, unknown>) => parseVenta(r)) as VentaAgendada[]
  },

  async getCRMCliente(telefono: string, agente?: string): Promise<{
    found: boolean; telefono: string; nombreAgente?: string | null; agenteId?: number;
    interacciones: CRMInteraccion[]; gestiones: CRMGestion[]; camposConfig: CRMCampoConfig[];
    enBaseMadreVicidial?: boolean; vicidialLead?: Record<string, unknown>
  }> {
    const params: Record<string, string> = { cliente: telefono }
    if (agente) params['agente'] = agente
    const { data } = await ventasPublicApi.get('/public/crm/cliente', { params })
    return {
      found:               Boolean(data?.found),
      telefono:            String(data?.telefono ?? telefono),
      nombreAgente:        data?.nombreAgente ?? null,
      agenteId:            data?.agenteId ? Number(data.agenteId) : undefined,
      interacciones:       Array.isArray(data?.interacciones) ? data.interacciones : [],
      gestiones:           Array.isArray(data?.gestiones) ? data.gestiones : [],
      camposConfig:        Array.isArray(data?.camposConfig) ? data.camposConfig : [],
      enBaseMadreVicidial: Boolean(data?.enBaseMadreVicidial),
      vicidialLead:        data?.vicidialLead ?? undefined,
    }
  },

  async registrarGestionCRMPublica(payload: {
    telefono: string; campaignId: number; agente: string; agenteId?: number
  }): Promise<void> {
    await ventasPublicApi.post('/public/crm/gestion', payload)
  },

  async updateCRMInteraccion(telefono: string, campaignId: number, datos: Record<string, string>): Promise<void> {
    await ventasApi.put('/admin/crm/interaccion', { telefono, campaignId, datos })
  },

  async tipificarCRMPublico(payload: {
    telefono: string; campaignId: number; agente: string; agenteId?: number; resultado: string; notas: string
  }): Promise<void> {
    await ventasPublicApi.post('/public/crm/tipificacion', payload)
  },

  // ── Base Madre ────────────────────────────────────────────
  async getBaseMadreStats(campanaId = 1): Promise<BaseMadreStats> {
    const { data } = await ventasApi.get('/admin/basemadre/stats', { params: { campanaId } })
    // backend returns { success, data: { totales: {...}, desglose: [...] } }
    const d = data?.data ?? data
    const t = d?.totales ?? d
    return {
      totalMadreRaw:  Number(t?.totalMadreRaw  ?? 0),
      totalMadre:     Number(t?.totalMadre     ?? 0),
      totalLote1:     Number(t?.totalLote1     ?? 0),
      totalLote2:     Number(t?.totalLote2     ?? 0),
      totalHistorico: Number(t?.totalHistorico ?? 0),
      totalRepetidos: Number(t?.totalRepetidos ?? 0),
      totalCola:      Number(t?.totalCola      ?? 0),
      totalCola1:     Number(t?.totalCola1     ?? 0),
      totalCola2:     Number(t?.totalCola2     ?? 0),
      desglose:       Array.isArray(d?.desglose) ? d.desglose : [],
    }
  },

  async getBaseMadreMadre(campanaId = 1, page = 1, limit = 50, search = '', status = '', desde = '', hasta = ''): Promise<{ data: BaseMadreRow[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { campanaId, page, limit }
    if (search) params['search'] = search
    if (status) params['status'] = status
    if (desde)  params['desde']  = desde
    if (hasta)  params['hasta']  = hasta
    const { data } = await ventasApi.get('/admin/basemadre/madre', { params })
    const d = data?.data ?? data
    const rows = Array.isArray(d) ? d : (Array.isArray(data?.data) ? data.data : [])
    return { data: rows, total: Number(data?.total ?? rows.length), page: Number(data?.page ?? page), limit: Number(data?.limit ?? limit) }
  },

  async getBaseMadreStatuses(campanaId = 1): Promise<string[]> {
    const { data } = await ventasApi.get('/admin/basemadre/statuses', { params: { campanaId } })
    const d = data?.data ?? data
    return Array.isArray(d) ? d : []
  },

  async getBaseMadreLote1(campanaId = 1, page = 1, limit = 50, search = ''): Promise<{ data: BaseMadreRow[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { campanaId, page, limit }
    if (search) params['search'] = search
    const { data } = await ventasApi.get('/admin/basemadre/lote1', { params })
    const d = data?.data ?? data
    const rows = Array.isArray(d) ? d : []
    return { data: rows, total: Number(data?.total ?? rows.length), page: Number(data?.page ?? page), limit: Number(data?.limit ?? limit) }
  },

  async getBaseMadreLote1ChartStats(campanaId = 1): Promise<{ totalLote: number; byResultado: { resultado: string; total: number }[]; byAgente: { agente: string; total: number }[] }> {
    const { data } = await ventasApi.get('/admin/basemadre/lote1/chart-stats', { params: { campanaId } })
    return {
      totalLote:   Number(data?.totalLote ?? 0),
      byResultado: Array.isArray(data?.byResultado) ? data.byResultado : [],
      byAgente:    Array.isArray(data?.byAgente) ? data.byAgente : [],
    }
  },

  async getBaseMadreHistorico(campanaId = 1, page = 1, limit = 50, search = ''): Promise<{ data: BaseMadreRow[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { campanaId, page, limit }
    if (search) params['search'] = search
    const { data } = await ventasApi.get('/admin/basemadre/historico', { params })
    const d = data?.data ?? data
    const rows = Array.isArray(d) ? d : []
    return { data: rows, total: Number(data?.total ?? rows.length), page: Number(data?.page ?? page), limit: Number(data?.limit ?? limit) }
  },

  async getBaseMadreCola(campanaId = 1, page = 1, limit = 50, search = ''): Promise<{ data: BaseMadreRow[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { campanaId, page, limit }
    if (search) params['search'] = search
    const { data } = await ventasApi.get('/admin/basemadre/cola', { params })
    const d = data?.data ?? data
    const rows = Array.isArray(d) ? d : []
    return { data: rows, total: Number(data?.total ?? rows.length), page: Number(data?.page ?? page), limit: Number(data?.limit ?? limit) }
  },

  async getBaseMadreRepetidos(campanaId = 1, page = 1, limit = 50): Promise<{ data: BaseMadreRow[]; total: number; page: number; limit: number }> {
    const { data } = await ventasApi.get('/admin/basemadre/repetidos', { params: { campanaId, page, limit } })
    const d = data?.data ?? data
    const rows = Array.isArray(d) ? d : []
    return { data: rows, total: Number(data?.total ?? rows.length), page: Number(data?.page ?? page), limit: Number(data?.limit ?? limit) }
  },

  async getVentasTrazadas(campanaId?: number, opts?: { page?: number; limit?: number; search?: string; estatus?: string; tipCRM?: string; agente?: string; dateFrom?: string; dateTo?: string }): Promise<{ data: VentaTrazada[]; total: number; page: number; limit: number }> {
    const params: Record<string, unknown> = { campanaId: campanaId ?? 1, page: opts?.page ?? 1, limit: opts?.limit ?? 100 }
    if (opts?.search)   params['search']   = opts.search
    if (opts?.estatus)  params['estatus']  = opts.estatus
    if (opts?.tipCRM)   params['tipCRM']   = opts.tipCRM
    if (opts?.agente)   params['agente']   = opts.agente
    if (opts?.dateFrom) params['dateFrom'] = opts.dateFrom
    if (opts?.dateTo)   params['dateTo']   = opts.dateTo
    const { data } = await ventasApi.get('/admin/basemadre/ventas-trazadas', { params })
    const d = data?.data ?? data
    const list = Array.isArray(d) ? d : (d?.records ?? d?.data ?? [])
    return { data: list as VentaTrazada[], total: Number(data?.total ?? list.length), page: Number(data?.page ?? params['page']), limit: Number(data?.limit ?? params['limit']) }
  },

  async getVentasTrazadasStats(campanaId?: number): Promise<TrazabilidadMesStat[]> {
    const { data } = await ventasApi.get('/admin/basemadre/ventas-trazadas/stats', { params: campanaId ? { campanaId } : {} })
    const d = data?.data ?? data
    const list = Array.isArray(d) ? d : []
    return list.map((r: Record<string, unknown>) => ({
      mes:          String(r['mes'] ?? ''),
      total:        Number(r['total'] ?? 0),
      aprobadas:    Number(r['aprobadas'] ?? 0),
      pendientes:   Number(r['pendientes'] ?? 0),
      rechazadas:   Number(r['rechazadas'] ?? 0),
      agendadas:    Number(r['agendadas'] ?? 0),
      formalizadas: Number(r['formalizadas'] ?? 0),
    })) as TrazabilidadMesStat[]
  },

  async migrarLote1(campanaId: number, cantidad: number, statusFiltro?: string, mesAnio?: string): Promise<{ insertadosLote1: number; insertadosRepetidos: number }> {
    const { data } = await ventasApi.post('/admin/basemadre/migrar-lote1', { campanaId, cantidad, ...(statusFiltro ? { statusFiltro } : {}), ...(mesAnio ? { mesAnio } : {}) })
    const d = data?.data ?? data
    return { insertadosLote1: Number(d?.insertadosLote1 ?? 0), insertadosRepetidos: Number(d?.insertadosRepetidos ?? 0) }
  },

  async avanzarCola(campanaId: number): Promise<{ regresadosAMadre: number; avanzadosAVuelta2: number }> {
    const { data } = await ventasApi.post('/admin/basemadre/avanzar-cola', { campanaId })
    const d = data?.data ?? data
    return { regresadosAMadre: Number(d?.regresadosAMadre ?? 0), avanzadosAVuelta2: Number(d?.avanzadosAVuelta2 ?? 0) }
  },

  async rotarLotes(campanaId: number): Promise<{ aCola: number; regresadosAMadre: number }> {
    const { data } = await ventasApi.post('/admin/basemadre/rotar', { campanaId })
    const d = data?.data ?? data
    return { aCola: Number(d?.aCola ?? 0), regresadosAMadre: Number(d?.regresadosAMadre ?? 0) }
  },

  async descartarLote(campanaId: number, lote: 'lote1' | 'lote2' | 'ambos'): Promise<{ descartadosLote1: number; descartadosLote2: number }> {
    const { data } = await ventasApi.post('/admin/basemadre/descartar', { campanaId, lote })
    const d = data?.data ?? data
    return { descartadosLote1: Number(d?.descartadosLote1 ?? 0), descartadosLote2: Number(d?.descartadosLote2 ?? 0) }
  },

  async syncBaseMadreStatus(campanaId = 1): Promise<{ updated: number }> {
    const { data } = await ventasApi.post('/admin/basemadre/sync-status', { campanaId })
    const d = data?.data ?? data
    return { updated: Number(d?.updated ?? 0) }
  },

  async publicarAlCRM(campanaId = 1): Promise<{ inserted: number }> {
    const { data } = await ventasApi.post('/admin/basemadre/publicar-crm', { campanaId })
    const d = data?.data ?? data
    return { inserted: Number(d?.inserted ?? 0) }
  },

  // ── CRM Admin: Importaciones ──────────────────────────────
  async getCRMImportaciones(): Promise<CRMImportacion[]> {
    const { data } = await ventasApi.get('/admin/crm/importaciones')
    const list = Array.isArray(data) ? data : (data?.importaciones ?? [])
    return list.map((r: Record<string, unknown>) => ({
      id:              Number(r['id'] ?? 0),
      nombre:          String(r['nombre'] ?? ''),
      campaignId:      Number(r['campaignId'] ?? 0),
      totalRegistros:  Number(r['totalRegistros'] ?? 0),
      confirmada:      Boolean(r['confirmada']),
      activa:          Boolean(r['activa'] ?? r['confirmada']),
      creadoEn:        String(r['creadoEn'] ?? ''),
    }))
  },

  async createCRMImportacion(nombre: string, campaignId: number): Promise<CRMImportacion> {
    const { data } = await ventasApi.post('/admin/crm/importaciones', { nombre, campaignId })
    return {
      id:             Number(data?.id ?? data?.importacion?.id ?? 0),
      nombre:         String(data?.nombre ?? nombre),
      campaignId:     Number(data?.campaignId ?? campaignId),
      totalRegistros: 0,
      confirmada:     false,
      activa:         false,
      creadoEn:       new Date().toISOString(),
    }
  },

  async deleteCRMImportacion(id: number): Promise<void> {
    await ventasApi.delete(`/admin/crm/importaciones/${id}`)
  },

  async getCRMTipificaciones(importacionId: number, opts?: { dias?: number; fechaDesde?: string; fechaHasta?: string }): Promise<{ resultado: string; total: number }[]> {
    const { data } = await ventasApi.get(`/admin/crm/importaciones/${importacionId}/tipificaciones`, { params: opts ?? {} })
    const list = Array.isArray(data) ? data : []
    return list.map((r: Record<string, unknown>) => ({ resultado: String(r['resultado'] ?? ''), total: Number(r['total'] ?? 0) }))
  },

  async toggleCRMImportacionActiva(id: number): Promise<void> {
    await ventasApi.patch(`/admin/crm/importaciones/${id}/activa`)
  },

  async getCRMRegistros(importacionId: number): Promise<CRMRegistro[]> {
    const { data } = await ventasApi.get(`/admin/crm/importaciones/${importacionId}/registros`)
    const list = Array.isArray(data) ? data : (data?.registros ?? [])
    return list.map((r: Record<string, unknown>) => ({
      id:           Number(r['id'] ?? 0),
      importacionId,
      telefono:     String(r['telefono'] ?? ''),
      nombre:       String(r['nombre'] ?? ''),
      datos:        (r['datos'] && typeof r['datos'] === 'object') ? r['datos'] as Record<string, string> :
                    (typeof r['datos'] === 'string' ? (() => { try { return JSON.parse(r['datos'] as string) } catch { return {} } })() : {}),
    }))
  },

  async getCRMTrazabilidad(importacionId: number, opts?: { dias?: number; fechaDesde?: string; fechaHasta?: string }): Promise<{
    resumen: { tipificacion: string; estatus: string; total: number }[]
    detalle: { telefono: string; nombreCliente: string; tipificacion: string; notas: string; agenteGestion: string; fechaTip: string; estatusVenta: string; agenteVenta: string; fechaVenta: string }[]
  }> {
    const { data } = await ventasApi.get(`/admin/crm/importaciones/${importacionId}/trazabilidad`, { params: opts ?? {} })
    return {
      resumen: Array.isArray(data?.resumen) ? data.resumen : [],
      detalle: Array.isArray(data?.detalle) ? data.detalle : [],
    }
  },

  async getCRMAccesos(importacionId: number): Promise<CRMAcceso[]> {
    const { data } = await ventasApi.get(`/admin/crm/importaciones/${importacionId}/accesos`)
    return Array.isArray(data) ? data : (data?.accesos ?? [])
  },

  async setCRMAccesos(importacionId: number, agentIds: number[]): Promise<void> {
    await ventasApi.post(`/admin/crm/importaciones/${importacionId}/accesos`, { agentIds })
  },

  async confirmarCRMImportacion(importacionId: number): Promise<void> {
    await ventasApi.post(`/admin/crm/importaciones/${importacionId}/confirmar`)
  },

  async getCRMCamposConfig(importacionId: number): Promise<CRMCampoConfig[]> {
    const { data } = await ventasApi.get(`/admin/crm/importaciones/${importacionId}/campos`)
    return Array.isArray(data) ? data : (data?.campos ?? [])
  },

  async saveCRMCamposConfig(importacionId: number, campos: CRMCampoConfig[]): Promise<void> {
    await ventasApi.post(`/admin/crm/importaciones/${importacionId}/campos`, { campos })
  },

  async addCRMRegistros(importacionId: number, registros: { telefono: string; nombre: string; datos: Record<string, string> }[]): Promise<{ inserted: number }> {
    const { data } = await ventasApi.post(`/admin/crm/importaciones/${importacionId}/registros`, { registros })
    return { inserted: Number(data?.inserted ?? registros.length) }
  },

  async exportBaseMadreLote1(campanaId = 1): Promise<void> {
    const token = (await import('@/stores/ventas.store')).useVentasStore.getState().ventasToken
    const res = await fetch(`https://ventas.ardabytec.vip:8443/api/admin/basemadre/lote1/export?campanaId=${campanaId}`, {
      headers: { 'x-access-token': token ?? '' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `lote1_campana${campanaId}_${new Date().toISOString().slice(0,10)}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  },

  // ── Notas personales del agente ───────────────────────────
  async getNotasAgente(): Promise<{ id: number; titulo: string; contenido: string; fecha: string }[]> {
    const { data } = await ventasApi.get('/agent/notas')
    return Array.isArray(data) ? data : []
  },

  async createNotaAgente(titulo: string, contenido: string): Promise<{ id: number; titulo: string; contenido: string; fecha: string }> {
    const { data } = await ventasApi.post('/agent/notas', { titulo, contenido })
    return data
  },

  async updateNotaAgente(id: number, titulo: string, contenido: string): Promise<void> {
    await ventasApi.put(`/agent/notas/${id}`, { titulo, contenido })
  },

  async deleteNotaAgente(id: number): Promise<void> {
    await ventasApi.delete(`/agent/notas/${id}`)
  },

  async exportCRMReporte(tipo: 'gestiones' | 'ventas' | 'base-completa' | 'resubir'): Promise<void> {
    const token = (await import('@/stores/ventas.store')).useVentasStore.getState().ventasToken
    const res = await fetch(`https://ventas.ardabytec.vip:8443/api/admin/crm/reportes/${tipo}`, {
      headers: { 'x-access-token': token ?? '' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `crm_${tipo}_${new Date().toISOString().slice(0,10)}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  },
}

async function fetchStatsPeriod(
  period: 'day' | 'week' | 'month',
  campaignId: number | undefined,
  date: string | undefined,
  isBanamex: boolean,
): Promise<StatsResponse> {
  const base: Record<string, unknown> = {}
  if (campaignId) base['campaign'] = campaignId
  if (date) base['date'] = date

  // Igual que Flutter: 3 llamadas paralelas por status
  const [s1, s2, s3] = isBanamex
    ? ['declined', 'formalized_banamex', 'approved_banamex']
    : ['approved', 'pending', 'rejected']

  // El backend de intranet ya calcula aprobadas/rechazadas/pendientes en una sola query.
  // No necesita 3 llamadas paralelas — una sola basta.
  const { data } = await ventasApi.get(`/admin/stats/${period}`, { params: base })

  // Estructura: { stats: [{agentId, nombreAgente, aprobadas, rechazadas, pendientes, ...}], totales: {...} }
  if (data?.stats && data?.totales) {
    const stats = (data.stats as import('@/types/ventas.types').VentaStats[]).map((s) =>
      isBanamex
        ? {
            ...s,
            // Para Banamex: rechazadas=Declinadas, pendientes=Formalizadas, aprobadas=Aprobadas
            aprobadas:  s.aprobadas,
            pendientes: s.formalizadas ?? 0,
            rechazadas: s.rechazadas,
          }
        : s
    )
    const totales = stats.reduce(
      (acc, s) => ({
        aprobadas:  acc.aprobadas  + (Number(s.aprobadas)  || 0),
        pendientes: acc.pendientes + (Number(s.pendientes) || 0),
        rechazadas: acc.rechazadas + (Number(s.rechazadas) || 0),
        total:      acc.total      + (Number(s.total)      || 0),
      }),
      { aprobadas: 0, pendientes: 0, rechazadas: 0, total: 0 },
    )
    return { ventas: [], stats, totales }
  }

  return { ventas: [], stats: [], totales: { aprobadas: 0, pendientes: 0, rechazadas: 0, total: 0 } }
}

type RawAgent = { nombreAgente: string; ventas: number }

function mergeStats(raw1: RawAgent[], raw2: RawAgent[], raw3: RawAgent[], isBanamex: boolean): StatsResponse {
  const byAgent: Record<string, { col1: number; col2: number; col3: number }> = {}

  const add = (list: RawAgent[], key: 'col1' | 'col2' | 'col3') => {
    const arr = Array.isArray(list) ? list : []
    for (const a of arr) {
      if (!byAgent[a.nombreAgente]) byAgent[a.nombreAgente] = { col1: 0, col2: 0, col3: 0 }
      byAgent[a.nombreAgente][key] = Number(a.ventas) || 0
    }
  }
  add(raw1, 'col1')
  add(raw2, 'col2')
  add(raw3, 'col3')

  const stats = Object.entries(byAgent)
    .map(([nombreAgente, v]) => ({
      nombreAgente,
      agentId: 0,
      campaignId: 0,
      campaignNombre: '',
      // Banamex: col1=Declinadas col2=Formalizadas col3=Aprobadas
      // Otras:   col1=Aprobadas  col2=Pendientes   col3=Rechazadas
      aprobadas:   isBanamex ? v.col3 : v.col1,
      pendientes:  v.col2,
      rechazadas:  isBanamex ? v.col1 : v.col3,
      formalizadas: 0,
      garantizadas: 0,
      total: v.col1 + v.col2 + v.col3,
      color: undefined as string | undefined,
    }))
    .sort((a, b) => b.total - a.total)

  const totales = stats.reduce(
    (acc, s) => ({
      aprobadas:  acc.aprobadas  + s.aprobadas,
      pendientes: acc.pendientes + s.pendientes,
      rechazadas: acc.rechazadas + s.rechazadas,
      total:      acc.total      + s.total,
    }),
    { aprobadas: 0, pendientes: 0, rechazadas: 0, total: 0 },
  )

  return { ventas: [], stats, totales }
}

async function fetchStatsDynamic(
  period: 'day' | 'week' | 'month',
  campaignId: number | undefined,
  date: string | undefined,
): Promise<StatsDynamicResponse> {
  const params: Record<string, unknown> = {}
  if (campaignId) params['campaign'] = campaignId
  if (date) params['date'] = date
  const { data } = await ventasApi.get(`/admin/stats/dynamic/${period}`, { params })
  return {
    stats:            data?.stats ?? [],
    statuses:         data?.statuses ?? [],
    totalesPorEstatus: data?.totalesPorEstatus ?? {},
    ventas:           [],
  }
}
