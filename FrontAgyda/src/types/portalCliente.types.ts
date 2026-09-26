export interface PortalResumen {
  stats: { incidenciasAbiertas: number; citasProximas: number }
  proximaCita: { id: number; titulo: string; fechaHora: string; modalidad: string } | null
  actividad: { tipo: 'interaccion' | 'cita' | 'incidencia'; subtipo: string; texto: string; fecha: string }[]
}

export interface PortalProyectoMiembro {
  nombre: string
  rol: string
}

export interface PortalProyecto {
  id: number
  nombre: string
  estatus: string
  fechaInicio: string | null
  fechaFin: string | null
  equipo: PortalProyectoMiembro[]
  avance: number
}

export interface PortalCotizacion {
  id: number
  folio: string
  titulo: string
  estatus: string
  total: number
  fecha: string
}

export interface PortalFactura {
  id: number
  serie: string | null
  folio: string | null
  total: number
  moneda: string
  estatus: string
  fecha: string
  fechaTimbrado: string | null
}

export interface PortalDocumento {
  id: number
  nombreOriginal: string
  mimeType: string
  tamanoBytes: number
  fechaSubida: string
  descripcion?: string | null
  // true = lo envió alguien del portal de la empresa; false = lo publicó su asesor.
  subidoPorCliente?: boolean
  subidoPorNombre?: string | null
}

// Asesor asignado al cliente (responsable del contacto en el CRM).
export interface PortalAsesor {
  id: number
  nombre: string
  puesto: string | null
  fotoUrl: string | null
}

export interface PortalCita {
  id: number
  titulo: string
  modalidad: string
  fechaHora: string
  duracionMin: number | null
  enlace: string | null
  telefono: string | null
  estatus: string
  confirmadaPorCliente: boolean
  tratamientoNombre: string | null
  numeroSesion: number | null
  tratamientoTotalSesiones: number | null
  solicitudPendienteTipo: 'reprogramar' | 'cancelar' | null
}

export interface PortalProductoServicio {
  id: number
  productoServicioId: number
  tipo: 'PRODUCTO' | 'SERVICIO'
  nombre: string
  descripcion: string | null
  precio: number
  recurrencia: 'MENSUAL' | 'ANUAL' | 'UNICO'
  caracteristicas: string | null
  beneficios: string | null
  integraciones: string | null
  aplicaciones: string | null
  fechaAlta: string
}

export interface PortalCatalogoItem {
  id: number
  tipo: 'PRODUCTO' | 'SERVICIO'
  nombre: string
  descripcion: string | null
  precio: number
  recurrencia: 'MENSUAL' | 'ANUAL' | 'UNICO'
  caracteristicas: string | null
  beneficios: string | null
  integraciones: string | null
  aplicaciones: string | null
}

export interface PortalIncidencia {
  id: number
  folio: string
  titulo: string
  categoria: string | null
  prioridad: string
  estatus: string
  fechaCreacion: string
  fechaLimiteSla: string | null
  solucionPropuesta: string | null
  fechaCompromiso: string | null
  fechaResolucion: string | null
}
