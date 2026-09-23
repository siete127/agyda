export interface ReglaComision {
  id: number
  nombre: string
  formula: string
  orden: number
  activa: boolean
}

export interface CrearReglaComisionPayload {
  nombre: string
  formula: string
}

export interface ActualizarReglaComisionPayload {
  nombre: string
  formula: string
  activa: boolean
}

export interface DesgloseComision {
  nombre: string
  monto: number
}

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
  desglose: DesgloseComision[]
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
  reglas: ReglaComision[]
  asesores: AsesorComisiones[]
  totales: {
    ventasNomina: number
    ventasProvisionales: number
    montoComision: number
  }
}
