import { api } from '@/lib/axios'
import type { KpisComisiones } from '@/types/comisiones.types'

export const comisionesService = {
  async get(periodo: string): Promise<KpisComisiones> {
    const { data } = await api.get('/ventas-area/comisiones', { params: { periodo } })
    return data?.data as KpisComisiones
  },
}
