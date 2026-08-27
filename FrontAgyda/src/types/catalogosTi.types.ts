export interface Sede {
  id: number
  nombre: string
  direccion: string | null
  activa: boolean
}

export interface Subcategoria {
  id: number
  nombre: string
  orden: number
  activa: boolean
}

export interface CategoriaConSubcategorias {
  id: number
  nombre: string
  orden: number
  activa: boolean
  subcategorias: Subcategoria[]
}

export interface Especialidad {
  id: number
  nombre: string
  activa: boolean
}

export interface IntegracionConfig {
  id: number
  clave: string
  valor: string | null
  fechaActualizacion: string
}
