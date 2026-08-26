export interface AsesorComisiones {
  nombre: string
  neusId: number | null
  asesorId: number | null
  ventasNomina: number
  ventasProvisionales: number
  ventasTotal: number
  montoComision: number
  metaUnidades: number | null
  metaMonto: number | null
  pctCumplimiento: number | null
}

export interface QuincenaCubierta {
  id: number
  fechaInicio: string
  fechaFin: string
}

export interface RangoProvisional {
  desde: string
  hasta: string
}

export interface KpisComisiones {
  periodo: string
  quincenasCubiertas: QuincenaCubierta[]
  rangoProvisional: RangoProvisional | null
  asesores: AsesorComisiones[]
  totales: {
    ventasNomina: number
    ventasProvisionales: number
    montoComision: number
  }
}
