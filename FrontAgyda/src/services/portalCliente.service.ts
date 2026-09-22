import { api } from '@/lib/axios'
import type {
  PortalResumen, PortalProyecto, PortalCotizacion, PortalFactura, PortalDocumento, PortalCita, PortalIncidencia,
} from '@/types/portalCliente.types'

export const portalClienteService = {
  async getResumen(): Promise<PortalResumen> {
    const { data } = await api.get('/portal-cliente/resumen')
    return data?.data as PortalResumen
  },
  async getProyectos(): Promise<PortalProyecto[]> {
    const { data } = await api.get('/portal-cliente/proyectos')
    return (data?.data ?? []) as PortalProyecto[]
  },
  async getCotizaciones(): Promise<PortalCotizacion[]> {
    const { data } = await api.get('/portal-cliente/cotizaciones')
    return (data?.data ?? []) as PortalCotizacion[]
  },
  async getFacturas(): Promise<PortalFactura[]> {
    const { data } = await api.get('/portal-cliente/facturas')
    return (data?.data ?? []) as PortalFactura[]
  },
  async getDocumentos(): Promise<PortalDocumento[]> {
    const { data } = await api.get('/portal-cliente/documentos')
    return (data?.data ?? []) as PortalDocumento[]
  },
  documentoDownloadUrl(id: number): string {
    return `/api/portal-cliente/documentos/${id}/download`
  },
  async getCitas(): Promise<PortalCita[]> {
    const { data } = await api.get('/portal-cliente/citas')
    return (data?.data ?? []) as PortalCita[]
  },
  async getCitasHistorial(): Promise<PortalCita[]> {
    const { data } = await api.get('/portal-cliente/citas/historial')
    return (data?.data ?? []) as PortalCita[]
  },
  async confirmarCita(id: number): Promise<void> {
    await api.post(`/portal-cliente/citas/${id}/confirmar`)
  },
  async solicitarCambioCita(id: number, body: { tipo: 'reprogramar' | 'cancelar'; fechaPropuesta?: string; motivo?: string }): Promise<void> {
    await api.post(`/portal-cliente/citas/${id}/solicitar-cambio`, body)
  },
  async getIncidencias(): Promise<PortalIncidencia[]> {
    const { data } = await api.get('/portal-cliente/incidencias')
    return (data?.data ?? []) as PortalIncidencia[]
  },
  async crearIncidencia(body: { titulo: string; descripcion: string; categoria?: string }): Promise<{ folio: string }> {
    const { data } = await api.post('/portal-cliente/incidencias', body)
    return { folio: data?.folio }
  },
}
