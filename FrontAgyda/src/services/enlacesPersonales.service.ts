import { api } from '@/lib/axios'
import type { EnlaceTopbar } from '@/services/personalizacion.service'

// Enlaces externos personales del usuario autenticado (tarjeta "Mis enlaces"
// del inicio). Mismo formato que los enlaces del encabezado de la empresa.
export const enlacesPersonalesService = {
  async getMios(): Promise<EnlaceTopbar[]> {
    const { data } = await api.get('/enlaces-personales')
    return (data?.data ?? []) as EnlaceTopbar[]
  },

  async guardarMios(enlaces: EnlaceTopbar[]): Promise<EnlaceTopbar[]> {
    const { data } = await api.put('/enlaces-personales', { enlaces })
    return (data?.data ?? []) as EnlaceTopbar[]
  },
}
