export interface Sede {
  id: number
  nombre: string
  direccion: string | null
  activa: boolean
}

export interface Elemento {
  id: number
  nombre: string
  orden: number
  activa: boolean
}

export interface Subcategoria {
  id: number
  nombre: string
  orden: number
  activa: boolean
  elementos: Elemento[]
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

export interface CodigoCierre {
  id: number
  nombre: string
  orden: number
  activa: boolean
}

export interface IntegracionConfig {
  id: number
  clave: string
  valor: string | null
  fechaActualizacion: string
}

export interface Proveedor {
  id: number
  nombre: string
  contacto: string | null
  telefono: string | null
  correo: string | null
  activo: boolean
}

export interface Servicio {
  id: number
  nombre: string
  descripcion: string | null
  proveedorId: number | null
  proveedorNombre: string | null
  activo: boolean
}

export interface DiaFestivo {
  id: number
  fecha: string
  descripcion: string | null
}
