export interface SesionTiempo {
  id: number
  statusId: number
  statusClave: string
  fechaInicio: string
  fechaFin: string | null
  minutos: number
}

export interface TiemposAgente {
  agenteId: number
  fecha: string
  primeraEntrada: string | null
  minutosEnPausa: number
  sesiones: SesionTiempo[]
}

export interface AgenteOpcion {
  id: number
  nombre: string
}

export const STATUS_LABELS: Record<string, string> = {
  online: 'Disponible',
  sanitario: 'Baño',
  comida: 'Comida',
  capacitacion: 'Capacitación',
  'capacitación': 'Capacitación',
  permiso: 'Permiso',
  desconocido: 'Desconocido',
}
