import type { LucideIcon } from 'lucide-react'
import {
  Hand, Scale, Clapperboard, ListChecks, Quote, Newspaper, CalendarDays,
  Gift, LifeBuoy, LayoutGrid,
} from 'lucide-react'
import { RESUMEN_CARDS } from './resumenCards'

/* ════════════════════════════════════════════════════════════════════════
   CATÁLOGO ÚNICO DE CARDS DEL INICIO
   ────────────────────────────────────────────────────────────────────────
   Fusiona las cards "de portada" (definidas inline en DashboardPage) con las
   cards de resumen de módulos (resumenCards.tsx). Es la fuente que consume:
   - la pantalla Configuración → Diseño del inicio (galería para agregar/quitar)
   - DashboardGrid (para saber qué existe y su tamaño por defecto)
   El backend valida contra CARD_IDS (abajo, replicado en personalizacionController).
   ════════════════════════════════════════════════════════════════════════ */

export interface CatalogEntry {
  id: string
  titulo: string
  descripcion: string
  categoria: 'Portada' | 'Operación' | 'Personas' | 'Comercial' | 'Contenido'
  /** Si la card resume un módulo: solo se ofrece si la empresa lo tiene activo. */
  moduleKey?: string
  size: { w: number; h: number }
  Icon: LucideIcon
}

/* Cards de portada — viven inline en DashboardPage.CARDS. Aquí solo su metadata. */
export const PORTADA_CARDS: CatalogEntry[] = [
  { id: 'bienvenida', titulo: 'Bienvenida', descripcion: 'Saludo, fecha y estado de conexión.', categoria: 'Portada', size: { w: 5, h: 3 }, Icon: Hand },
  { id: 'marca', titulo: 'Marca / mascota', descripcion: 'Video o imagen de identidad de la empresa.', categoria: 'Portada', size: { w: 4, h: 5 }, Icon: Clapperboard },
  { id: 'lo-importante', titulo: 'Lo importante, al día', descripcion: 'Contadores rápidos de noticias, tickets y proyectos.', categoria: 'Portada', size: { w: 3, h: 4 }, Icon: ListChecks },
  { id: 'legales', titulo: 'Misión / Visión / Valores / Legales', descripcion: 'Accesos a los documentos institucionales.', categoria: 'Portada', size: { w: 5, h: 2 }, Icon: Scale },
  { id: 'cita', titulo: 'Frase del día', descripcion: 'Mensaje inspirador de la empresa.', categoria: 'Portada', size: { w: 3, h: 1 }, Icon: Quote },
  { id: 'ultimas-noticias', titulo: 'Últimas noticias', descripcion: 'Las publicaciones más recientes.', categoria: 'Contenido', moduleKey: 'noticias', size: { w: 8, h: 5 }, Icon: Newspaper },
  { id: 'proximos-eventos', titulo: 'Próximos eventos', descripcion: 'Eventos del calendario en los próximos días.', categoria: 'Contenido', moduleKey: 'calendario', size: { w: 4, h: 3 }, Icon: CalendarDays },
  { id: 'cumpleanos', titulo: 'Cumpleaños del mes', descripcion: 'Quién cumple años este mes.', categoria: 'Personas', size: { w: 4, h: 3 }, Icon: Gift },
  { id: 'soporte', titulo: 'Soporte y sugerencias', descripcion: 'Acceso rápido para pedir ayuda o sugerir.', categoria: 'Portada', size: { w: 4, h: 2 }, Icon: LifeBuoy },
  { id: 'accesos-rapidos', titulo: 'Accesos rápidos', descripcion: 'Atajos a los módulos más usados.', categoria: 'Portada', size: { w: 12, h: 3 }, Icon: LayoutGrid },
]

export const CARD_CATALOG: CatalogEntry[] = [
  ...PORTADA_CARDS,
  ...RESUMEN_CARDS.map((c): CatalogEntry => ({
    id: c.id, titulo: c.titulo, descripcion: c.descripcion,
    categoria: c.categoria, moduleKey: c.moduleKey, size: c.size, Icon: c.Icon,
  })),
]

export const CARD_CATALOG_INDEX: Record<string, CatalogEntry> =
  Object.fromEntries(CARD_CATALOG.map((c) => [c.id, c]))

/** Todos los ids válidos — debe coincidir con DASHBOARD_CARD_IDS del backend. */
export const CARD_IDS = CARD_CATALOG.map((c) => c.id)

export const CATEGORIAS: CatalogEntry['categoria'][] =
  ['Portada', 'Operación', 'Comercial', 'Personas', 'Contenido']
