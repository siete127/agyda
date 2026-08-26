export interface ReglaIncentivo {
  id: number
  nombre: string
  formula: string
  orden: number
  activa: boolean
}

export interface CrearReglaIncentivoPayload {
  nombre: string
  formula: string
}

export interface ActualizarReglaIncentivoPayload {
  nombre: string
  formula: string
  activa: boolean
}

export interface DesgloseIncentivo {
  nombre: string
  monto: number
}

export interface AsesorIncentivo {
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
  montoIncentivo: number
  desglose: DesgloseIncentivo[]
}

export interface KpisIncentivos {
  periodo: string
  reglas: ReglaIncentivo[]
  asesores: AsesorIncentivo[]
  totales: {
    montoIncentivoTotal: number
  }
}
