import { api } from '@/lib/axios'

// WhatsApp masivo (solo envío) — /api/contact-center/wa-masivo. Varias cuentas
// de WhatsApp se turnan para mandar una cadena de mensajes a una lista de
// números; cada número sigue siempre con la cuenta que le escribió primero.
const B = '/contact-center/wa-masivo'

export type EstadoCuentaMasivo = 'conectado' | 'esperando_qr' | 'desconectado'
export interface CuentaMasivo {
  id: number
  alias: string
  numero: string | null
  estado: EstadoCuentaMasivo
  activa: boolean
  topeDiario: number
  topeHoy: number
  calentamiento: boolean
  pausaMotivo: string | null
  enviadosHoy: number
  numerosAsignados: number
  fechaConexion: string | null
}

export type EstadoCampaniaMasivo = 'borrador' | 'enviando' | 'pausada' | 'terminada' | 'cancelada'
export interface CampaniaMasivoResumen {
  id: number
  nombre: string
  estado: EstadoCampaniaMasivo
  fecha: string
  fechaInicio: string | null
  fechaFin: string | null
  pasos: number
  total: number
  completados: number
  noEnviados: number
}

export type TipoPasoMasivo = 'texto' | 'imagen' | 'video' | 'documento'
export interface ArchivoMasivo { id: number; nombre: string; mime: string | null; tamano: number | null; url: string }
export interface PasoMasivo {
  tipo: TipoPasoMasivo
  textos: string[]
  archivoId: number | null
  esperaSeg: number
  archivo?: ArchivoMasivo | null
}
export type EstadoDestinatarioMasivo = 'pendiente' | 'en_cadena' | 'completado' | 'excluido' | 'fallido'
export interface CampaniaMasivo {
  id: number
  nombre: string
  estado: EstadoCampaniaMasivo
  pasos: PasoMasivo[]
  pausaMin: number
  pausaMax: number
  horaInicio: string
  horaFin: string
  dias: number[]
  enHorario: boolean
  fechaInicio: string | null
  fechaFin: string | null
  conteo: Record<EstadoDestinatarioMasivo, number>
  total: number
  porCuenta: { cuentaId: number; alias: string | null; numeros: number; completados: number; mensajes: number }[]
}
export interface DestinatarioMasivo {
  id: number
  telefono: string
  nombre: string | null
  estado: EstadoDestinatarioMasivo
  paso: number
  proximo: string | null
  error: string | null
  fechaUltimo: string | null
  cuenta: string | null
}
export interface FilaDestinatario { telefono: string; nombre?: string; variables?: Record<string, string> }
export type DatosCampania = Pick<CampaniaMasivo, 'nombre' | 'pausaMin' | 'pausaMax' | 'horaInicio' | 'horaFin' | 'dias'> & { pasos: PasoMasivo[] }

export const waMasivoService = {
  resumen: () => api.get(`${B}/resumen`).then((r) => r.data.data as { cuentas: CuentaMasivo[]; campanias: CampaniaMasivoResumen[] }),

  crearCuenta: (body: { alias: string; topeDiario: number; calentamiento: boolean }) => api.post(`${B}/cuentas`, body).then((r) => r.data.data as { id: number }),
  editarCuenta: (id: number, body: { alias: string; topeDiario: number; calentamiento: boolean; activa?: boolean; reanudar?: boolean }) =>
    api.put(`${B}/cuentas/${id}`, body).then((r) => r.data),
  conectar: (id: number) => api.post(`${B}/cuentas/${id}/conectar`).then((r) => r.data.data as { estado: EstadoCuentaMasivo; qrDataUrl: string | null; numero: string | null }),
  estadoCuenta: (id: number) => api.get(`${B}/cuentas/${id}/estado`).then((r) => r.data.data as { estado: EstadoCuentaMasivo; qrDataUrl: string | null; numero: string | null }),
  desconectar: (id: number) => api.post(`${B}/cuentas/${id}/desconectar`).then((r) => r.data),
  eliminarCuenta: (id: number) => api.delete(`${B}/cuentas/${id}`).then((r) => r.data.data as { liberados: number }),

  subirArchivo: (archivo: File) => {
    const fd = new FormData()
    fd.append('archivo', archivo)
    return api.post(`${B}/archivos`, fd, { timeout: 300_000 }).then((r) => r.data.data as ArchivoMasivo)
  },

  crearCampania: (nombre: string) => api.post(`${B}/campanias`, { nombre }).then((r) => r.data.data as { id: number }),
  getCampania: (id: number) => api.get(`${B}/campanias/${id}`).then((r) => r.data.data as CampaniaMasivo),
  guardarCampania: (id: number, body: DatosCampania) =>
    api.put(`${B}/campanias/${id}`, {
      ...body,
      // El archivo va por su id; los datos de vista previa no viajan.
      pasos: body.pasos.map((p) => ({ tipo: p.tipo, textos: p.textos, archivoId: p.archivoId, esperaSeg: p.esperaSeg })),
    }).then((r) => r.data.data as CampaniaMasivo),
  eliminarCampania: (id: number) => api.delete(`${B}/campanias/${id}`).then((r) => r.data),
  cambiarEstado: (id: number, accion: 'iniciar' | 'pausar' | 'reanudar' | 'cancelar') =>
    api.post(`${B}/campanias/${id}/estado`, { accion }).then((r) => r.data.data as CampaniaMasivo),
  destinatarios: (id: number, q: { estado?: string; buscar?: string; pagina?: number }) =>
    api.get(`${B}/campanias/${id}/destinatarios`, { params: q }).then((r) => r.data.data as { filas: DestinatarioMasivo[]; total: number }),
  agregarDestinatarios: (id: number, filas: FilaDestinatario[]) =>
    api.post(`${B}/campanias/${id}/destinatarios`, { filas }, { timeout: 120_000 })
      .then((r) => r.data.data as { recibidos: number; agregados: number; repetidos: number; invalidos: number }),
  quitarPendientes: (id: number) => api.delete(`${B}/campanias/${id}/destinatarios`).then((r) => r.data.data as { quitados: number }),
}
