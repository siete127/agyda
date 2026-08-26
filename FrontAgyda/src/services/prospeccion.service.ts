import { api } from '@/lib/axios'
import type { ResumenProspeccion } from '@/types/prospeccion.types'

export const prospeccionService = {
  async get(): Promise<ResumenProspeccion> {
    const { data } = await api.get('/ventas-area/prospeccion')
    return data?.data as ResumenProspeccion
  },
}
