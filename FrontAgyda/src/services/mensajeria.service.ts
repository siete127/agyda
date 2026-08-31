import { api } from '@/lib/axios'
import {
  parseMensajeriaCanal,
  parseMensajeriaMensaje,
  parseMensajeriaCanalDetalle,
  parseMensajeriaMiembro,
  parseMensajeriaConfig,
  parseMensajeriaReaccion,
  type MensajeriaCanal,
  type MensajeriaMensaje,
  type MensajeriaCanalDetalle,
  type MensajeriaMiembro,
  type MensajeriaConfig,
  type MensajeriaReaccion,
} from '@/types/mensajeria.types'

export const mensajeriaService = {
  async getMisCanales(): Promise<MensajeriaCanal[]> {
    const { data } = await api.get('/mensajeria/canales')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseMensajeriaCanal)
  },

  async crearOReusarDM(usuarioId: number): Promise<MensajeriaCanal> {
    const { data } = await api.post('/mensajeria/dm', { usuarioId })
    return parseMensajeriaCanal((data?.data ?? data) as Record<string, unknown>)
  },

  async crearGrupo(nombre: string, miembros: number[], descripcion?: string): Promise<MensajeriaCanal> {
    const { data } = await api.post('/mensajeria/grupos', { nombre, descripcion, miembros })
    return parseMensajeriaCanal((data?.data ?? data) as Record<string, unknown>)
  },

  async getCanal(canalId: number): Promise<MensajeriaCanalDetalle> {
    const { data } = await api.get(`/mensajeria/canales/${canalId}`)
    return parseMensajeriaCanalDetalle((data?.data ?? data) as Record<string, unknown>)
  },

  async actualizarGrupo(canalId: number, payload: { nombre?: string; descripcion?: string }): Promise<void> {
    await api.put(`/mensajeria/canales/${canalId}`, payload)
  },

  async getMensajes(canalId: number, antesDe?: number, limite = 30): Promise<MensajeriaMensaje[]> {
    const { data } = await api.get(`/mensajeria/canales/${canalId}/mensajes`, {
      params: { antesDe, limite },
    })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseMensajeriaMensaje)
  },

  async enviarMensaje(canalId: number, contenido: string, archivoUrl?: string): Promise<MensajeriaMensaje> {
    const { data } = await api.post(`/mensajeria/canales/${canalId}/mensajes`, { contenido, archivoUrl })
    return parseMensajeriaMensaje((data?.data ?? data) as Record<string, unknown>)
  },

  async marcarLeido(canalId: number, mensajeId?: number): Promise<void> {
    await api.post(`/mensajeria/canales/${canalId}/leido`, { mensajeId })
  },

  async agregarMiembros(canalId: number, usuarios: number[]): Promise<MensajeriaMiembro[]> {
    const { data } = await api.post(`/mensajeria/canales/${canalId}/miembros`, { usuarios })
    const list = Array.isArray(data?.data) ? data.data : []
    return (list as Record<string, unknown>[]).map(parseMensajeriaMiembro)
  },

  async quitarMiembro(canalId: number, usuarioId: number): Promise<void> {
    await api.delete(`/mensajeria/canales/${canalId}/miembros/${usuarioId}`)
  },

  async salirDeGrupo(canalId: number): Promise<void> {
    await api.post(`/mensajeria/canales/${canalId}/salir`)
  },

  async getMiConfig(): Promise<MensajeriaConfig> {
    const { data } = await api.get('/mensajeria/mi-config')
    return parseMensajeriaConfig((data?.data ?? data) as Record<string, unknown>)
  },

  async actualizarMiConfig(payload: Partial<MensajeriaConfig>): Promise<MensajeriaConfig> {
    const { data } = await api.put('/mensajeria/mi-config', payload)
    return parseMensajeriaConfig((data?.data ?? data) as Record<string, unknown>)
  },

  async subirArchivo(canalId: number, file: File): Promise<{ url: string; nombreOriginal: string; tamano: number }> {
    const form = new FormData()
    form.append('archivo', file)
    const { data } = await api.post(`/mensajeria/canales/${canalId}/archivo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async adjuntarDesdeDrive(canalId: number, archivoId: number): Promise<{ url: string; nombreOriginal: string; tamano: number }> {
    const { data } = await api.post(`/mensajeria/canales/${canalId}/archivo-drive`, { archivoId })
    return data.data
  },

  async reaccionarMensaje(mensajeId: number, emoji: string): Promise<MensajeriaReaccion[]> {
    const { data } = await api.post(`/mensajeria/mensajes/${mensajeId}/reacciones`, { emoji })
    const list = Array.isArray(data?.data) ? data.data : []
    return (list as Record<string, unknown>[]).map(parseMensajeriaReaccion)
  },

  async quitarReaccion(mensajeId: number): Promise<MensajeriaReaccion[]> {
    const { data } = await api.delete(`/mensajeria/mensajes/${mensajeId}/reacciones`)
    const list = Array.isArray(data?.data) ? data.data : []
    return (list as Record<string, unknown>[]).map(parseMensajeriaReaccion)
  },

  async editarMensaje(mensajeId: number, contenido: string): Promise<MensajeriaMensaje> {
    const { data } = await api.put(`/mensajeria/mensajes/${mensajeId}`, { contenido })
    return parseMensajeriaMensaje((data?.data ?? data) as Record<string, unknown>)
  },

  async eliminarMensaje(mensajeId: number): Promise<void> {
    await api.delete(`/mensajeria/mensajes/${mensajeId}`)
  },
}
