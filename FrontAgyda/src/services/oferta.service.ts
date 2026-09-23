import { api } from '@/lib/axios'

export interface OfertaSegmento {
  tags?: string[]
  estatus?: string[]
  tipoCliente?: string[]
  soloClientes?: boolean
}

export interface Oferta {
  id: number
  titulo: string
  mensaje: string
  segmento: OfertaSegmento | null
  canales: string
  estatus: 'borrador' | 'enviada'
  fechaCreacion: string
  fechaEnvio: string | null
  creadaPorNombre: string | null
  enviosOk: number
  enviosFallidos: number
}

export interface OfertaEnvio {
  id: number
  canal: string
  resultado: string
  detalle: string | null
  fecha: string
  contactoNombre: string | null
}

const B = '/atencion-cliente/ofertas'

export const ofertaService = {
  getAll: async (): Promise<Oferta[]> => {
    const { data } = await api.get(B)
    const arr = Array.isArray(data) ? data : (data?.data ?? [])
    return arr as Oferta[]
  },
  previewSegmento: (segmento: OfertaSegmento) =>
    api.post(`${B}/preview-segmento`, { segmento }).then((r) => r.data?.data as { total: number; conCorreo: number; conTelefono: number }),
  create: (body: { titulo: string; mensaje: string; segmento: OfertaSegmento; canales: string[] }) =>
    api.post(B, body).then((r) => r.data),
  enviar: (id: number) =>
    api.post(`${B}/${id}/enviar`).then((r) => r.data?.data as { contactos: number; enviados: number; fallidos: number }),
  getEnvios: async (id: number): Promise<OfertaEnvio[]> => {
    const { data } = await api.get(`${B}/${id}/envios`)
    const arr = Array.isArray(data) ? data : (data?.data ?? [])
    return arr as OfertaEnvio[]
  },
}
