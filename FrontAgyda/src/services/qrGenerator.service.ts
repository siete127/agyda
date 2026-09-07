import { api } from '@/lib/axios'
import type { QrCode, QrEntorno } from '@/types/qrGenerator.types'

export const qrGeneratorService = {
  async listar(): Promise<QrCode[]> {
    const { data } = await api.get('/qr-generator')
    return data.data
  },
  async generar(payload: { nombre: string; url: string; entorno: QrEntorno }): Promise<QrCode> {
    const { data } = await api.post('/qr-generator', payload)
    return data.data
  },
  async eliminar(id: number): Promise<void> {
    await api.delete(`/qr-generator/${id}`)
  },
}
