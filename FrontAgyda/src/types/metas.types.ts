export type MetaTipo = 'campania' | 'agente'

export interface MetaOperaciones {
  id: number
  tipo: MetaTipo
  campaniaId: number | null
  agenteId: number | null
  periodo: string
  metaRegistros: number
  campaniaNombre: string | null
  agenteNombre: string | null
  avance: number
}

export interface CrearMetaPayload {
  tipo: MetaTipo
  campaniaId?: number
  agenteId?: number
  periodo: string
  metaRegistros: number
}
