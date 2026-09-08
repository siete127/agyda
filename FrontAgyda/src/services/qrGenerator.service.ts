import { api } from '@/lib/axios'
import type { QrCode, QrEntorno, QrModo, QrAnalytics } from '@/types/qrGenerator.types'

export const qrGeneratorService = {
  async listar(): Promise<QrCode[]> {
    const { data } = await api.get('/qr-generator')
    return data.data
  },
  async generar(payload: { nombre: string; entorno: QrEntorno; modo: QrModo; url?: string; did?: string }): Promise<QrCode> {
    const { data } = await api.post('/qr-generator', payload)
    return data.data
  },
  async eliminar(id: number): Promise<void> {
    await api.delete(`/qr-generator/${id}`)
  },
  async analytics(id: number): Promise<QrAnalytics> {
    const { data } = await api.get(`/qr-generator/${id}/analytics`)
    return data.data
  },
}
