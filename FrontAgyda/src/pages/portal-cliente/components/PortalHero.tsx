import type { ComponentType } from 'react'
import heroImg from '@/assets/hero.png'

// Mismo patrón que HeaderReuniones/HeaderAtencion: imagen de fondo + overlay
// azul degradado + ícono en cuadrado con el degradado de marca del portal.
export function PortalHero({ icon: Icon, titulo, descripcion }: { icon: ComponentType<{ className?: string }>; titulo: string; descripcion: string }) {
  return (
    <div
      className="relative flex h-[170px] flex-shrink-0 items-center overflow-hidden rounded-3xl bg-cover bg-center px-6 shadow-md sm:px-8"
      style={{ backgroundImage: `url(${heroImg})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/70 to-[#0a2f71]/30" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">{titulo}</h1>
          <p className="mt-0.5 text-sm text-white/80">{descripcion}</p>
        </div>
      </div>
    </div>
  )
}
