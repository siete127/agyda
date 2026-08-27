import * as Icons from 'lucide-react'
import { ROUTES } from '@/router/routes.config'

// Ícono + tono de color por módulo. El ícono se toma de routes.config.ts (misma
// identidad que el sidebar); el tono se asigna de forma estable por hash del key.
const TONES = [
  { soft: 'bg-purple-50',  text: 'text-purple-500' },
  { soft: 'bg-blue-50',    text: 'text-blue-500' },
  { soft: 'bg-emerald-50', text: 'text-emerald-500' },
  { soft: 'bg-amber-50',   text: 'text-amber-500' },
  { soft: 'bg-rose-50',    text: 'text-rose-500' },
  { soft: 'bg-cyan-50',    text: 'text-cyan-500' },
  { soft: 'bg-indigo-50',  text: 'text-indigo-500' },
  { soft: 'bg-teal-50',    text: 'text-teal-500' },
]

// Primer ícono conocido por moduleKey a partir de las rutas.
const ICON_BY_MODULE: Record<string, string> = {}
for (const r of ROUTES) {
  if (r.moduleKey && r.moduleKey !== '*' && !ICON_BY_MODULE[r.moduleKey]) {
    ICON_BY_MODULE[r.moduleKey] = r.icon
  }
}
// Overrides para módulos sin ruta directa o con ícono poco representativo.
const OVERRIDES: Record<string, string> = {
  'asistencia-personal': 'Clock',
  'vacaciones-admin': 'Umbrella',
  'mi-area': 'UsersRound',
  accesos: 'KeyRound',
  reports: 'BarChart2',
  evaluacion: 'ClipboardCheck',
  'ventas-area': 'Target',
  operaciones: 'Headset',
  tecnologia: 'Cpu',
  'atencion-cliente': 'Headphones',
  'rh-area': 'UserPlus',
  capacitacion: 'GraduationCap',
  incapacidades: 'HeartPulse',
  'evaluacion-desempeno': 'TrendingUp',
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

type IconComp = React.ComponentType<{ className?: string }>
const IconMap = Icons as unknown as Record<string, IconComp>

export function moduleVisual(key: string): { Icon: IconComp; soft: string; text: string } {
  const iconName = OVERRIDES[key] ?? ICON_BY_MODULE[key] ?? 'Boxes'
  const Icon = IconMap[iconName] ?? IconMap.Boxes
  const tone = TONES[hash(key) % TONES.length]
  return { Icon, ...tone }
}
