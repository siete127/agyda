export interface ProspeccionPorCampania {
  campaniaId: number
  campaniaNombre: string
  totalProspectos: number
  gestionados: number
  sinGestionar: number
  pctGestionado: number
}

export interface ProspeccionPorTipoGestion {
  tipo: string
  total: number
}

export interface ResumenProspeccion {
  totales: {
    totalProspectos: number
    gestionados: number
    sinGestionar: number
    gestiones30d: number
  }
  porCampania: ProspeccionPorCampania[]
  porTipoGestion: ProspeccionPorTipoGestion[]
}
