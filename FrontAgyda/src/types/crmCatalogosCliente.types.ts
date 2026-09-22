export interface CatalogoClienteItem {
  id: number
  clave: string
  nombre: string
  orden: number
  activa: boolean
}

export interface CrearCatalogoClienteItemPayload {
  clave: string
  nombre: string
  orden?: number
}

export interface ActualizarCatalogoClienteItemPayload {
  nombre: string
  orden?: number
}
