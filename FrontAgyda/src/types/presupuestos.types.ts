import type { AreaKey } from '@/config/areas'

export interface Presupuesto {
  id: number
  areaKey: AreaKey
  periodo: string
  montoAsignado: number
  montoEjercido: number
}

export interface GuardarPresupuestoPayload {
  areaKey: AreaKey
  periodo: string
  montoAsignado?: number
  montoEjercido?: number
}
