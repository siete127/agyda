import type { LivechatConversacion } from '@/types/livechat.types'
import type { CCInteraccion } from '@/types/cc.types'

// Une las dos fuentes de conversaciones que un asesor puede atender:
//  - 'livechat': el motor original (tablas LIVECHAT_*), chatbot/widget web
//    de captación con su propio ciclo de calificación del visitante.
//  - 'cc': Contact Center omnicanal (tablas CCO_*) — WhatsApp/Messenger/
//    Instagram/web pública, con tipificación y ticket al cerrar.
// El resto de la pantalla (listas, selección, panel de chat) opera sobre
// este tipo unificado y solo se ramifica por 'origen' donde de verdad hace
// falta (acciones, campos propios de cada motor).
export type ItemBandeja =
  | { origen: 'livechat'; data: LivechatConversacion }
  | { origen: 'cc'; data: CCInteraccion }

export function idUnificado(item: ItemBandeja): string {
  return `${item.origen}-${item.data.id}`
}

export function nombreUnificado(item: ItemBandeja): string {
  if (item.origen === 'livechat') return item.data.visitanteNombre || 'Visitante anónimo'
  return item.data.clienteNombre || item.data.clienteTelefono || 'Sin nombre'
}

export function subtituloUnificado(item: ItemBandeja): string {
  if (item.origen === 'livechat') {
    return item.data.visitanteEmail || item.data.visitanteTelefono || 'Sin contacto'
  }
  return item.data.clienteTelefono || item.data.clienteExtId || ''
}

export function fechaInicioUnificado(item: ItemBandeja): string {
  return item.origen === 'livechat' ? item.data.fechaInicio : item.data.fechaInicio
}

export function estaEsperandoUnificado(item: ItemBandeja): boolean {
  return item.origen === 'livechat' ? item.data.estado === 'esperando' : item.data.estado === 'en_cola'
}

export function posicionColaUnificado(item: ItemBandeja): { pos: number | null; total: number | null } {
  if (item.origen === 'livechat') return { pos: item.data.posicionCola ?? null, total: item.data.totalCola ?? null }
  return { pos: null, total: null }
}
