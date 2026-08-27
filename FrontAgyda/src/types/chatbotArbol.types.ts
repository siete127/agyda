export type ChatbotNodoTipo = 'pregunta' | 'resolucion' | 'escalar_chat' | 'crear_ticket'

export interface ChatbotNodoOpcion {
  id: number
  nodoId: number
  texto: string
  nodoDestinoId: number | null
  orden: number
}

export interface ChatbotNodo {
  id: number
  codigo: string
  texto: string
  tipo: ChatbotNodoTipo
  categoriaId: number | null
  activo: boolean
  opciones: ChatbotNodoOpcion[]
}

export const NODO_TIPO_LABELS: Record<ChatbotNodoTipo, string> = {
  pregunta: 'Pregunta (con opciones)',
  resolucion: 'Resolución (mensaje final)',
  escalar_chat: 'Escalar a chat en vivo',
  crear_ticket: 'Crear ticket automáticamente',
}
