import type { LucideIcon } from 'lucide-react'
import { Home, Ticket, Users, TrendingUp, Minimize2 } from 'lucide-react'
import type { DashboardCard } from '@/services/personalizacion.service'

/* ════════════════════════════════════════════════════════════════════════
   PLANTILLAS DE DISTRIBUCIÓN DEL INICIO
   ────────────────────────────────────────────────────────────────────────
   Cada plantilla es un layout completo (qué cards + x/y/w/h). Al aplicarla se
   reemplaza `dashboard.cards` de la empresa. Grilla de 12 columnas, fila=64px.
   Solo se colocan cards del catálogo; las de módulos inactivos las filtra
   DashboardGrid al render, así que una plantilla puede listar de más sin romper.
   ════════════════════════════════════════════════════════════════════════ */

export interface LayoutPreset {
  key: string
  nombre: string
  descripcion: string
  Icon: LucideIcon
  cards: DashboardCard[]
}

const v = (id: string, x: number, y: number, w: number, h: number): DashboardCard =>
  ({ id, x, y, w, h, visible: true })

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    key: 'clasico',
    nombre: 'Clásico',
    descripcion: 'La portada de siempre: bienvenida, marca, noticias, eventos y cumpleaños.',
    Icon: Home,
    cards: [
      v('bienvenida', 0, 0, 5, 3),
      v('marca', 5, 0, 4, 5),
      v('lo-importante', 9, 0, 3, 4),
      v('legales', 0, 3, 5, 2),
      v('cita', 9, 4, 3, 1),
      v('ultimas-noticias', 0, 5, 8, 5),
      v('proximos-eventos', 8, 5, 4, 3),
      v('cumpleanos', 8, 8, 4, 3),
      v('soporte', 8, 11, 4, 2),
      v('accesos-rapidos', 0, 13, 12, 3),
    ],
  },
  {
    key: 'operacion',
    nombre: 'Operación',
    descripcion: 'Enfocado en el trabajo del día: tickets, proyectos, quejas, chat y pausas.',
    Icon: Ticket,
    cards: [
      v('bienvenida', 0, 0, 6, 3),
      v('lo-importante', 6, 0, 3, 3),
      v('r-pausas', 9, 0, 3, 4),
      v('r-tickets', 0, 3, 3, 3),
      v('r-proyectos', 3, 3, 3, 3),
      v('r-quejas', 6, 3, 3, 3),
      v('r-livechat', 9, 4, 3, 3),
      v('proximos-eventos', 0, 6, 6, 3),
      v('accesos-rapidos', 0, 9, 12, 3),
    ],
  },
  {
    key: 'comercial',
    nombre: 'Comercial',
    descripcion: 'Para equipos de ventas: ventas del día, metas, encuestas y noticias.',
    Icon: TrendingUp,
    cards: [
      v('bienvenida', 0, 0, 6, 3),
      v('r-ventas', 6, 0, 3, 4),
      v('lo-importante', 9, 0, 3, 4),
      v('r-encuestas', 0, 3, 4, 4),
      v('r-tickets', 4, 4, 4, 3),
      v('r-proyectos', 8, 4, 4, 3),
      v('ultimas-noticias', 0, 7, 8, 5),
      v('proximos-eventos', 8, 7, 4, 3),
      v('accesos-rapidos', 0, 12, 12, 3),
    ],
  },
  {
    key: 'personas',
    nombre: 'Personas / RH',
    descripcion: 'Cumpleaños, vacaciones, capacitación, reglamento e incapacidades al frente.',
    Icon: Users,
    cards: [
      v('bienvenida', 0, 0, 6, 3),
      v('cumpleanos', 6, 0, 3, 4),
      v('proximos-eventos', 9, 0, 3, 4),
      v('r-vacaciones', 0, 3, 3, 3),
      v('r-capacitacion', 3, 3, 3, 3),
      v('r-reglamento', 6, 4, 3, 3),
      v('r-incapacidades', 9, 4, 3, 3),
      v('r-vacantes', 0, 6, 4, 3),
      v('legales', 4, 6, 4, 2),
      v('ultimas-noticias', 0, 9, 8, 5),
      v('accesos-rapidos', 8, 9, 4, 3),
    ],
  },
  {
    key: 'minimo',
    nombre: 'Mínimo',
    descripcion: 'Solo lo esencial: bienvenida, lo importante y accesos rápidos.',
    Icon: Minimize2,
    cards: [
      v('bienvenida', 0, 0, 8, 3),
      v('lo-importante', 8, 0, 4, 4),
      v('accesos-rapidos', 0, 3, 8, 3),
    ],
  },
]

/** ¿El layout guardado coincide (ids + geometría) con esta plantilla? */
export function layoutMatchesPreset(preset: LayoutPreset, cards: DashboardCard[]): boolean {
  const vis = cards.filter((c) => c.visible)
  if (vis.length !== preset.cards.length) return false
  const key = (c: DashboardCard) => `${c.id}:${c.x},${c.y},${c.w},${c.h}`
  const a = new Set(vis.map(key))
  return preset.cards.every((c) => a.has(key(c)))
}
