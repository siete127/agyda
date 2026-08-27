import {
  Building2, ShieldCheck, Landmark, Users, Headset, Wrench, Plug, BookOpen,
  BellRing, ClipboardList, SlidersHorizontal, LayoutGrid,
} from 'lucide-react'

export interface CategoryStyle {
  icon: typeof Building2
  gradient: string
  soft: string
  text: string
}

// Icono + paleta por categoría raíz de Configuración — una identidad visual
// propia por sección para que el mapa completo sea fácil de escanear.
export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  'modulos-empresa': { icon: LayoutGrid, gradient: 'from-fuchsia-500 to-fuchsia-600', soft: 'bg-fuchsia-50', text: 'text-fuchsia-600' },
  organizacion: { icon: Building2, gradient: 'from-indigo-500 to-indigo-600', soft: 'bg-indigo-50', text: 'text-indigo-600' },
  'usuarios-seguridad': { icon: ShieldCheck, gradient: 'from-emerald-500 to-emerald-600', soft: 'bg-emerald-50', text: 'text-emerald-600' },
  erp: { icon: Landmark, gradient: 'from-blue-500 to-blue-600', soft: 'bg-blue-50', text: 'text-blue-600' },
  crm: { icon: Users, gradient: 'from-pink-500 to-pink-600', soft: 'bg-pink-50', text: 'text-pink-600' },
  'contact-center': { icon: Headset, gradient: 'from-purple-500 to-purple-600', soft: 'bg-purple-50', text: 'text-purple-600' },
  ti: { icon: Wrench, gradient: 'from-slate-500 to-slate-600', soft: 'bg-slate-50', text: 'text-slate-600' },
  integraciones: { icon: Plug, gradient: 'from-cyan-500 to-cyan-600', soft: 'bg-cyan-50', text: 'text-cyan-600' },
  catalogos: { icon: BookOpen, gradient: 'from-teal-500 to-teal-600', soft: 'bg-teal-50', text: 'text-teal-600' },
  'notificaciones-root': { icon: BellRing, gradient: 'from-rose-500 to-rose-600', soft: 'bg-rose-50', text: 'text-rose-600' },
  auditoria: { icon: ClipboardList, gradient: 'from-amber-500 to-amber-600', soft: 'bg-amber-50', text: 'text-amber-600' },
  sistema: { icon: SlidersHorizontal, gradient: 'from-violet-500 to-violet-600', soft: 'bg-violet-50', text: 'text-violet-600' },
}

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  icon: Building2, gradient: 'from-gray-400 to-gray-500', soft: 'bg-gray-50', text: 'text-gray-500',
}

// Cuenta recursiva de nodos hoja (sin hijos) dentro de un nodo — usado para
// mostrar "N secciones" en las tarjetas de categoría.
export function countLeaves(node: { children?: unknown[] }): number {
  if (!node.children || node.children.length === 0) return 1
  return (node.children as { children?: unknown[] }[]).reduce((sum, c) => sum + countLeaves(c), 0)
}
