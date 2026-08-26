import { api } from '@/lib/axios'

export interface ActivoPendiente {
  id: number
  tipo: 'laptop' | 'cpu' | 'monitor' | 'teclado' | 'mouse'
  marca: string
  modelo: string
  numeroSerie: string
  fechaAsignacion: string | null
}

export const activoService = {
  async getPendiente(): Promise<ActivoPendiente | null> {
    const { data } = await api.get('/activos/pendiente')
    return data.data ?? null
  },

  async aceptarTerminos(activoId: number): Promise<void> {
    await api.post(`/activos/${activoId}/aceptar-terminos`)
  },
}
