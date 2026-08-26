export interface SupervisorAsignacion {
  id: number
  campaniaId: number
  campaniaNombre: string
  supervisorId: number
  supervisorNombre: string
}

export interface AgenteEstado {
  agenteId: number
  nombre: string
  campaniaId: number
  estado: 'disponible' | 'pausa'
  tipoPausa: string | null
  pausaDesde: string | null
}

export interface PanelSupervisor {
  campanias: { id: number; nombre: string }[]
  agentes: AgenteEstado[]
}

export interface ProductividadAgente {
  agenteId: number
  nombre: string
  banio: number
  comida: number
  capacitacion: number
  permiso: number
  totalPausaMin: number
}

export const TIPO_PAUSA_LABELS: Record<string, string> = {
  'baño': 'Baño',
  comida: 'Comida',
  'capacitación': 'Capacitación',
  permiso: 'Permiso',
}
