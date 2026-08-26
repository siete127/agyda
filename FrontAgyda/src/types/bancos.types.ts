export interface CuentaBancaria {
  id: number
  banco: string
  alias: string
  numero: string | null
  saldoInicial: number
  activa: boolean
  saldoActual: number
}

export interface CrearCuentaPayload {
  banco: string
  alias: string
  numero?: string
  saldoInicial?: number
}

export type TipoMovimiento = 'deposito' | 'retiro'

export interface MovimientoBancario {
  id: number
  tipo: TipoMovimiento
  concepto: string
  monto: number
  fecha: string
}

export interface CrearMovimientoPayload {
  tipo: TipoMovimiento
  concepto: string
  monto: number
  fecha?: string
}
