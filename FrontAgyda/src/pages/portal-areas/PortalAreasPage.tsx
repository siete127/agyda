import { Link } from 'react-router-dom'
import {
  LayoutDashboard, UsersRound, Wallet, Target, Headset,
  ShieldCheck, Megaphone, Cpu, Headphones, Scale, ChevronRight,
} from 'lucide-react'
import { AREA_KEYS, AREA_LABELS, type AreaKey } from '@/config/areas'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

const AREA_ICONS: Record<AreaKey, React.ElementType> = {
  'direccion-general': LayoutDashboard,
  rh: UsersRound,
  finanzas: Wallet,
  ventas: Target,
  operaciones: Headset,
  calidad: ShieldCheck,
  marketing: Megaphone,
  ti: Cpu,
  'atencion-cliente': Headphones,
  legal: Scale,
}

const AREA_PATHS: Record<AreaKey, string> = {
  'direccion-general': '/direccion-general',
  rh: '/rh',
  finanzas: '/finanzas',
  ventas: '/ventas-area',
  operaciones: '/operaciones',
  calidad: '/calidad',
  marketing: '/marketing',
  ti: '/tecnologia',
  'atencion-cliente': '/atencion-cliente',
  legal: '/legal',
}

export function PortalAreasPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <h1 className="text-lg font-bold">Áreas de la Empresa</h1>
        <p className="text-xs text-blue-200/70">Flujo entre áreas — de la planeación a la mejora continua</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AREA_KEYS.map((areaKey) => {
          const Icon = AREA_ICONS[areaKey]
          const subItems = AREA_SUB_ITEMS[areaKey] ?? []
          return (
            <Link
              key={areaKey}
              to={AREA_PATHS[areaKey]}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-card p-5 shadow-card transition-all hover:shadow-card-lg hover:border-brand/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10">
                  <Icon className="h-5 w-5 text-brand" />
                </div>
                <ChevronRight className="h-4 w-4 text-ink-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-ink">{AREA_LABELS[areaKey]}</h2>
                <p className="mt-0.5 text-xs text-ink-tertiary">{subItems.length + 1} módulos</p>
              </div>
              <ul className="space-y-1 border-t border-gray-50 pt-3">
                {subItems.slice(0, 4).map((item) => (
                  <li key={item.slug} className="truncate text-xs text-ink-secondary">{item.label}</li>
                ))}
                {subItems.length > 4 && (
                  <li className="text-xs text-ink-tertiary">+{subItems.length - 4} más</li>
                )}
              </ul>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
