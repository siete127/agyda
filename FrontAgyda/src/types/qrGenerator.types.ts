export type QrEntorno = 'publico' | 'privado'

export interface QrCode {
  id: number
  nombre: string
  url: string
  entorno: QrEntorno
  imagenDataUrl: string
  autorNombre: string | null
  fechaCreacion: string
}
