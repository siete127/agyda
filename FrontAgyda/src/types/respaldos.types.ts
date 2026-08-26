export interface RespaldoConfig {
  id: number
  nombre: string
  descripcion: string | null
  periodicidadDias: number
  activo: boolean
  ultimoRespaldoFecha: string | null
  ultimoRespaldoExito: boolean | null
}

export interface RespaldoRegistro {
  id: number
  configId: number
  configNombre: string
  fecha: string
  exito: boolean
  notas: string | null
  registradoPor: number | null
}

export type RespaldoAtraso = 'ok' | 'proximo' | 'atrasado' | 'sin-registro'

export function calcularAtraso(config: RespaldoConfig): RespaldoAtraso {
  if (!config.ultimoRespaldoFecha) return 'sin-registro'
  const ultima = new Date(config.ultimoRespaldoFecha)
  const dias = (Date.now() - ultima.getTime()) / (1000 * 60 * 60 * 24)
  if (dias > config.periodicidadDias) return 'atrasado'
  if (dias > config.periodicidadDias * 0.8) return 'proximo'
  return 'ok'
}
