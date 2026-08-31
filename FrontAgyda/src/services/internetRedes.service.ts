import { api } from '@/lib/axios'
import type {
  Enlace, IncidenteRed, MedicionRed, DispositivoRed, EstadoActualRed,
} from '@/types/internetRedes.types'

export const internetRedesService = {
  async getEnlaces(): Promise<Enlace[]> {
    const { data } = await api.get('/tecnologia/enlaces')
    return (data?.data ?? []) as Enlace[]
  },

  async crearEnlace(payload: { nombre: string; proveedor?: string; ubicacion?: string; velocidad?: string; notas?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/tecnologia/enlaces', payload)
    return data?.data
  },

  async actualizarEnlace(id: number, payload: { nombre: string; proveedor?: string; ubicacion?: string; velocidad?: string; estado?: string; notas?: string }): Promise<void> {
    await api.put(`/tecnologia/enlaces/${id}`, payload)
  },

  async eliminarEnlace(id: number): Promise<void> {
    await api.delete(`/tecnologia/enlaces/${id}`)
  },

  async getIncidentes(): Promise<IncidenteRed[]> {
    const { data } = await api.get('/tecnologia/incidentes-red')
    return (data?.data ?? []) as IncidenteRed[]
  },

  async crearIncidente(payload: { enlaceId?: number; tipo?: string; descripcion?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/tecnologia/incidentes-red', payload)
    return data?.data
  },

  async resolverIncidente(id: number): Promise<void> {
    await api.patch(`/tecnologia/incidentes-red/${id}/resolver`)
  },

  async getDashboard(): Promise<{ porEstado: { estado: string; total: number }[]; incidentesAbiertos: number }> {
    const { data } = await api.get('/tecnologia/dashboard-red')
    return data?.data
  },

  /* ── Monitoreo en vivo ── */
  async getEstadoActual(): Promise<EstadoActualRed> {
    const { data } = await api.get('/tecnologia/red/estado-actual')
    return data?.data as EstadoActualRed
  },

  async getMediciones(params: { enlaceId?: number; horas?: number } = {}): Promise<MedicionRed[]> {
    const { data } = await api.get('/tecnologia/red/mediciones', { params })
    return (data?.data ?? []) as MedicionRed[]
  },

  async getDispositivos(): Promise<DispositivoRed[]> {
    const { data } = await api.get('/tecnologia/red/dispositivos')
    return (data?.data ?? []) as DispositivoRed[]
  },

  async actualizarDispositivo(id: number, payload: { alias?: string; bloqueado?: boolean }): Promise<void> {
    await api.patch(`/tecnologia/red/dispositivos/${id}`, payload)
  },

  // Descarga el instalador del agente ya preconfigurado para la empresa actual.
  async descargarAgente(opts: { enlaceId?: number; formato?: 'ps1' | 'bat' } = {}): Promise<void> {
    const res = await api.get('/tecnologia/red/agente/instalador', {
      params: opts,
      responseType: 'blob',
      timeout: 60_000,
    })
    const dispo = String(res.headers['content-disposition'] || '')
    const m = dispo.match(/filename="?([^"]+)"?/)
    const nombre = m ? m[1] : (opts.formato === 'bat' ? 'Instalar-Agente-Red.bat' : 'install-agente-red.ps1')
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
