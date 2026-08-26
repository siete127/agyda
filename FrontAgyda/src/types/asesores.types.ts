export interface SesionAsesor {
  id: number
  statusId: number
  statusClave: string
  fechaInicio: string
  fechaFin: string | null
  minutos: number
}

export interface MiResumenAsesor {
  agenteId: number
  fecha: string
  primeraEntrada: string | null
  estado: 'disponible' | 'pausa'
  tipoPausaActual: 'banio' | 'comida' | 'capacitacion' | 'permiso' | null
  minutosEnPausa: number
  minutosPorTipo: {
    banio: number
    comida: number
    capacitacion: number
    permiso: number
  }
  sesiones: SesionAsesor[]
}

export const TIPO_PAUSA_LABELS: Record<string, string> = {
  banio: 'Baño',
  comida: 'Comida',
  capacitacion: 'Capacitación',
  permiso: 'Permiso',
}
