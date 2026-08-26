export interface GastoCategoria {
  id: number
  codigo: string
  nombre: string
  tipo: 'monto' | 'kilometraje'
  tarifaKm: number | null
  descripcion: string | null
  activo?: boolean
  orden?: number
}

export interface Gasto {
  id: number
  categoriaId: number
  categoriaNombre: string
  categoriaCodigo: string
  descripcion: string
  fecha: string
  monto: number
  cantidad: number | null
  pagadoPor: 'empleado' | 'empresa'
  reciboUrl: string | null
  reporteId: number | null
  notas: string | null
  estatus: 'borrador' | 'en_reporte' | 'aprobado' | 'rechazado'
  fechaReg?: string
}

export interface GastoReporte {
  id: number
  titulo: string
  usuarioId: number
  usuarioNombre: string
  managerId: number | null
  managerNombre: string | null
  total: number
  estatus: 'borrador' | 'enviado' | 'aprobado' | 'rechazado' | 'pagado'
  metodoPago: string | null
  notas: string | null
  fechaReg: string
  fechaEnvio: string | null
  fechaPago: string | null
  numGastos?: number
  gastos?: Gasto[]
  comentarios?: GastoComentario[]
}

export interface GastoComentario {
  id: number
  usuarioId: number
  usuarioNombre: string
  texto: string
  fecha: string
}
