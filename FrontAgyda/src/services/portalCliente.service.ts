import { api } from '@/lib/axios'
import type {
  PortalResumen, PortalProyecto, PortalCotizacion, PortalFactura, PortalDocumento, PortalCita, PortalIncidencia,
  PortalProductoServicio, PortalCatalogoItem,
} from '@/types/portalCliente.types'

export interface PortalUsuario {
  id: number
  neusId: number
  esAncla: boolean
  activo: boolean
  creadoEn: string
  nombre: string
  usuario: string
  loginActivo: boolean
  subrolId: number
  subrolNombre: string
}

export const portalClienteService = {
  async getMisAcciones(): Promise<string[]> {
    const { data } = await api.get('/portal-cliente/mis-acciones')
    return (data?.data ?? []) as string[]
  },
  async getSubrolesDisponibles(): Promise<{ id: number; nombre: string }[]> {
    const { data } = await api.get('/portal-cliente/subroles-disponibles')
    return (data?.data ?? []) as { id: number; nombre: string }[]
  },
  async getUsuarios(): Promise<PortalUsuario[]> {
    const { data } = await api.get('/portal-cliente/usuarios')
    return (data?.data ?? []) as PortalUsuario[]
  },
  async crearUsuario(body: { nombre: string; correo: string; password?: string; subrolId: number }): Promise<{ neusId: number }> {
    const { data } = await api.post('/portal-cliente/usuarios', body)
    return data?.data
  },
  async actualizarUsuario(id: number, body: { subrolId?: number; activo?: boolean }): Promise<void> {
    await api.put(`/portal-cliente/usuarios/${id}`, body)
  },
  async eliminarUsuario(id: number): Promise<void> {
    await api.delete(`/portal-cliente/usuarios/${id}`)
  },
  async getProductosServicios(): Promise<PortalProductoServicio[]> {
    const { data } = await api.get('/portal-cliente/productos-servicios')
    return (data?.data ?? []) as PortalProductoServicio[]
  },
  async getCatalogoProductosServicios(): Promise<PortalCatalogoItem[]> {
    const { data } = await api.get('/portal-cliente/catalogo-productos-servicios')
    return (data?.data ?? []) as PortalCatalogoItem[]
  },
  async solicitarCotizacion(
    items: { psId: number; cantidad: number; requerimientos?: string }[],
    fechaContactacion?: string | null
  ): Promise<{ id: number; folio: string; citaId: number | null }> {
    const { data } = await api.post('/portal-cliente/solicitar-cotizacion', { items, fechaContactacion })
    return data?.data
  },
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
  // Blob + link temporal (no un <a href> plano) porque el JWT vive en
  // localStorage y solo se adjunta vía el interceptor de axios — un <a href>
  // normal no lo llevaría y la descarga fallaría con 401.
  async descargarFacturaDocumento(id: number, formato: 'pdf' | 'xml', nombreArchivo: string): Promise<void> {
    const { data } = await api.get(`/portal-cliente/facturas/${id}/documento/${formato}`, { responseType: 'blob' })
    const url = URL.createObjectURL(data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  async getDocumentos(): Promise<PortalDocumento[]> {
    const { data } = await api.get('/portal-cliente/documentos')
    return (data?.data ?? []) as PortalDocumento[]
  },
  // Blob + link temporal (no un <a href> plano) porque el JWT vive en
  // localStorage y solo se adjunta vía el interceptor de axios.
  async descargarDocumento(id: number, nombreArchivo: string): Promise<void> {
    const { data } = await api.get(`/portal-cliente/documentos/${id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
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
