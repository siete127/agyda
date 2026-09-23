import {
  Building2, ShieldCheck, Landmark, Users, Headset, SlidersHorizontal, Home,
  LayoutDashboard, UserPlus, Megaphone, Cpu, Headphones, Scale, Briefcase,
} from 'lucide-react'

export interface CategoryStyle {
  icon: typeof Building2
  gradient: string
  soft: string
  text: string
}

// Icono + paleta por sección de Configuración (mismas secciones del sidebar,
// ver configTree.ts) — una identidad visual propia por sección para que el
// mapa completo sea fácil de escanear.
export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  'sec-general': { icon: SlidersHorizontal, gradient: 'from-violet-500 to-violet-600', soft: 'bg-violet-50', text: 'text-violet-600' },
  'sec-principal': { icon: Home, gradient: 'from-sky-500 to-sky-600', soft: 'bg-sky-50', text: 'text-sky-600' },
  'sec-direccion-general': { icon: LayoutDashboard, gradient: 'from-indigo-500 to-indigo-600', soft: 'bg-indigo-50', text: 'text-indigo-600' },
  'sec-recursos-humanos': { icon: UserPlus, gradient: 'from-emerald-500 to-emerald-600', soft: 'bg-emerald-50', text: 'text-emerald-600' },
  'sec-finanzas-administracion': { icon: Landmark, gradient: 'from-blue-500 to-blue-600', soft: 'bg-blue-50', text: 'text-blue-600' },
  'sec-crm': { icon: Users, gradient: 'from-pink-500 to-pink-600', soft: 'bg-pink-50', text: 'text-pink-600' },
  'sec-contact-center': { icon: Headset, gradient: 'from-purple-500 to-purple-600', soft: 'bg-purple-50', text: 'text-purple-600' },
  'sec-calidad': { icon: ShieldCheck, gradient: 'from-amber-500 to-amber-600', soft: 'bg-amber-50', text: 'text-amber-600' },
  'sec-marketing': { icon: Megaphone, gradient: 'from-orange-500 to-orange-600', soft: 'bg-orange-50', text: 'text-orange-600' },
  'sec-tecnologia-ti': { icon: Cpu, gradient: 'from-slate-500 to-slate-600', soft: 'bg-slate-50', text: 'text-slate-600' },
  'sec-atencion-cliente': { icon: Headphones, gradient: 'from-teal-500 to-teal-600', soft: 'bg-teal-50', text: 'text-teal-600' },
  'sec-legal-cumplimiento': { icon: Scale, gradient: 'from-rose-500 to-rose-600', soft: 'bg-rose-50', text: 'text-rose-600' },
  'sec-otros': { icon: Briefcase, gradient: 'from-cyan-500 to-cyan-600', soft: 'bg-cyan-50', text: 'text-cyan-600' },
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
