import type { CampaniaMasivo } from '@/services/waMasivo.service'

// Etiqueta y color de cada estado de campaña (lista y editor).
export const ESTADO_CAMPANIA: Record<CampaniaMasivo['estado'], { label: string; cls: string }> = {
  borrador: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600' },
  enviando: { label: 'Enviando', cls: 'bg-emerald-50 text-emerald-700' },
  pausada: { label: 'Pausada', cls: 'bg-amber-50 text-amber-700' },
  terminada: { label: 'Terminada', cls: 'bg-violet-50 text-violet-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-50 text-red-600' },
}
