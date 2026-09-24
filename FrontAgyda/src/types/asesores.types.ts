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
  // 'banio' | 'comida' | 'capacitacion' | 'permiso', o la etiqueta de un tipo de pausa agregado por la empresa
  tipoPausaActual: string | null
  minutosEnPausa: number
  minutosPorTipo: {
    banio: number
    comida: number
    capacitacion: number
    permiso: number
  }
  // Minutos por status_id y los tipos de pausa que cuentan en Contact Center
  // (incluye los que agregue la empresa).
  minutosPorStatus?: Record<number, number>
  tiposPausa?: { statusId: number; etiqueta: string; emoji: string; color: string }[]
  sesiones: SesionAsesor[]
}

export const TIPO_PAUSA_LABELS: Record<string, string> = {
  banio: 'Baño',
  comida: 'Comida',
  capacitacion: 'Capacitación',
  permiso: 'Permiso',
}
