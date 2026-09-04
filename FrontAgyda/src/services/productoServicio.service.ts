import { api } from '@/lib/axios'

export type ProductoServicioTipo = 'PRODUCTO' | 'SERVICIO'
export type ProductoServicioRecurrencia = 'MENSUAL' | 'ANUAL' | 'UNICO'

export interface ProductoServicio {
  id: number
  tipo: ProductoServicioTipo
  nombre: string
  descripcion: string
  precio: number
  recurrencia: ProductoServicioRecurrencia
  activo: boolean
  costo: number | null
  claveProdServ: string | null
  claveUnidad: string | null
  unidadNombre: string | null
  ivaTasa: number
  fechaRegistro: string
}

export interface ProductoServicioInput {
  tipo?: ProductoServicioTipo
  nombre?: string
  descripcion?: string
  precio?: number
  recurrencia?: ProductoServicioRecurrencia
  activo?: boolean
  costo?: number | null
  claveProdServ?: string | null
  claveUnidad?: string | null
  unidadNombre?: string | null
  ivaTasa?: number
}

export interface ClienteProductoServicio {
  id: number
  productoServicioId: number
  tipo: ProductoServicioTipo
  nombre: string
  descripcion: string
  precio: number
  recurrencia: ProductoServicioRecurrencia
  fechaAlta: string
}

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown })?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

function parseProductoServicio(r: Record<string, unknown>): ProductoServicio {
  return {
    id: Number(r.id ?? 0),
    tipo: (r.tipo as ProductoServicioTipo) ?? 'PRODUCTO',
    nombre: String(r.nombre ?? ''),
    descripcion: String(r.descripcion ?? ''),
    precio: Number(r.precio ?? 0),
    recurrencia: (r.recurrencia as ProductoServicioRecurrencia) ?? 'UNICO',
    activo: Boolean(r.activo ?? true),
    costo: r.costo == null ? null : Number(r.costo),
    claveProdServ: r.claveProdServ ? String(r.claveProdServ) : null,
    claveUnidad: r.claveUnidad ? String(r.claveUnidad) : null,
    unidadNombre: r.unidadNombre ? String(r.unidadNombre) : null,
    ivaTasa: r.ivaTasa == null ? 0.16 : Number(r.ivaTasa),
    fechaRegistro: String(r.fechaRegistro ?? ''),
  }
}

function parseClienteProductoServicio(r: Record<string, unknown>): ClienteProductoServicio {
  return {
    id: Number(r.id ?? 0),
    productoServicioId: Number(r.productoServicioId ?? 0),
    tipo: (r.tipo as ProductoServicioTipo) ?? 'PRODUCTO',
    nombre: String(r.nombre ?? ''),
    descripcion: String(r.descripcion ?? ''),
    precio: Number(r.precio ?? 0),
    recurrencia: (r.recurrencia as ProductoServicioRecurrencia) ?? 'UNICO',
    fechaAlta: String(r.fechaAlta ?? ''),
  }
}

export const productoServicioService = {
  getAll: async (): Promise<ProductoServicio[]> => {
    const { data } = await api.get('/productos-servicios')
    return norm(data, parseProductoServicio)
  },
  create: (body: ProductoServicioInput & { nombre: string }) =>
    api.post('/productos-servicios', body).then((r) => r.data),
  update: (id: number, body: ProductoServicioInput) =>
    api.put(`/productos-servicios/${id}`, body).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/productos-servicios/${id}`).then((r) => r.data),

  getByCliente: async (clienteId: number): Promise<ClienteProductoServicio[]> => {
    const { data } = await api.get(`/clientes/${clienteId}/productos-servicios`)
    return norm(data, parseClienteProductoServicio)
  },
  asignarACliente: (clienteId: number, productoServicioId: number) =>
    api.post(`/clientes/${clienteId}/productos-servicios`, { productoServicioId }).then((r) => r.data),
  quitarDeCliente: (clienteId: number, productoServicioId: number) =>
    api.delete(`/clientes/${clienteId}/productos-servicios/${productoServicioId}`).then((r) => r.data),
}
