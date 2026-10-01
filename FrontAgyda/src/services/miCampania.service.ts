import { api } from '@/lib/axios'

// Campaña activa del propio usuario (menú del perfil): las campañas en las que
// está por sus grupos, skills o porque las supervisa. Ver campanaAgenteController.js.
export interface OpcionCampaniaActiva {
  clave: string // 'cc:<id>' | 'ventas:<id>'
  tipo: 'cc' | 'ventas'
  id: number
  nombre: string
  rol: 'agente' | 'supervisor'
  grupos: string[]
  ventasId: number | null
  ventasNombre: string | null
}
export interface MiCampaniaActiva { opciones: OpcionCampaniaActiva[]; activa: string | null; sugerida: string | null }

export const miCampaniaService = {
  get: () => api.get('/campanas/mi-campania').then((r) => r.data.data as MiCampaniaActiva),
  set: (clave: string) => api.put('/campanas/mi-campania', { clave })
    .then((r) => r.data.data as { activa: string; ventas: { id: number; nombre: string } | null }),
}
