export type CampoPersonalizadoTipo = 'texto' | 'numero' | 'lista' | 'fecha'

export const TIPO_LABELS: Record<CampoPersonalizadoTipo, string> = {
  texto: 'Texto',
  numero: 'Número',
  lista: 'Lista desplegable',
  fecha: 'Fecha',
}

export interface CampoCategoriaRef {
  id: number
  nombre: string
}

export interface CampoPersonalizado {
  id: number
  nombre: string
  tipo: CampoPersonalizadoTipo
  opciones: string[]
  requerido: boolean
  orden: number
  activo: boolean
  categorias: CampoCategoriaRef[]
}

export interface CampoPersonalizadoPayload {
  nombre: string
  tipo: CampoPersonalizadoTipo
  opciones?: string[]
  requerido?: boolean
  orden?: number
  categoriasIds: number[]
}

export interface CampoPersonalizadoAplicable {
  id: number
  nombre: string
  tipo: CampoPersonalizadoTipo
  opciones: string[]
  requerido: boolean
}

export interface CampoPersonalizadoValor {
  campoId: number
  nombre: string
  tipo: CampoPersonalizadoTipo
  valor: string | null
}
