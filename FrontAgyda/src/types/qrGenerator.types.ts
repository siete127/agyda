export type QrEntorno = 'publico' | 'privado'

// 'url' (default, comportamiento original): el QR codifica la URL tal cual.
// 'llamada_directa': el QR codifica "tel:{did}" — al escanear, el teléfono
// ofrece marcar directo, sin pasar por ningún servidor.
// 'llamada_medible': el QR apunta a una landing pública que registra el
// recorrido del visitante (vio → abrió el marcador → confirmó si llamó)
// antes de ofrecer el tel: — portado de un sistema de campañas QR para call
// center (ver app/qr_campaign_service.py en el proyecto "Gestionador MIS").
export type QrModo = 'url' | 'llamada_directa' | 'llamada_medible'

export interface QrCode {
  id: number
  nombre: string
  url: string
  entorno: QrEntorno
  modo: QrModo
  did: string | null
  publicToken: string | null
  landingUrl: string | null
  imagenDataUrl: string
  autorNombre: string | null
  fechaCreacion: string
}

export interface QrAnalytics {
  visitantesUnicos: number
  intentosLlamada: number
  llamadasConfirmadas: number
  soloVieron: number
  noCompletadas: number
  tasaIntento: number
  tasaConfirmacion: number
}
