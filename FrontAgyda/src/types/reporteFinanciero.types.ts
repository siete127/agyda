export interface SerieMensualFinanzas {
  mes: string
  ingresos: number
  egresos: number
  balance: number
}

export interface ReporteFinancieroConsolidado {
  meses: number
  serieMensual: SerieMensualFinanzas[]
  totales: {
    ingresos: number
    egresos: number
    balance: number
  }
  cxcPendiente: number
  cxcCobrado: number
  cxpPendiente: number
  saldoBancos: number
}
