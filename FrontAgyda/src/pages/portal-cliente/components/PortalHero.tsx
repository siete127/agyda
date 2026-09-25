import type { ComponentType } from 'react'
import heroImg from '@/assets/hero.png'

// Mismo patrón que HeaderReuniones/HeaderAtencion: imagen de fondo + overlay
// azul degradado + ícono en cuadrado con el degradado de marca del portal.
// `fondoNegro`: para ilustraciones con base negra sólida (como cotizaciones-hero)
// en vez de una foto — el overlay se invierte para fundir ese negro con el
// degradado azul en vez de taparlo con una franja oscura de más.
export function PortalHero({
  icon: Icon, titulo, descripcion, imagen, fondoNegro, posicion,
}: {
  icon: ComponentType<{ className?: string }>
  titulo: string
  descripcion: string
  imagen?: string
  fondoNegro?: boolean
  posicion?: string
}) {
  return (
    <div
      className={
        fondoNegro
          ? 'relative flex h-[170px] flex-shrink-0 items-center overflow-hidden rounded-3xl bg-[length:auto_85%] bg-[right_1rem_center] bg-no-repeat px-6 shadow-md sm:px-8'
          : 'relative flex h-[170px] flex-shrink-0 items-center overflow-hidden rounded-3xl bg-cover px-6 shadow-md sm:px-8'
      }
      style={{ backgroundImage: `url(${imagen ?? heroImg})`, backgroundColor: fondoNegro ? '#0a2f71' : undefined, backgroundPosition: fondoNegro ? undefined : (posicion ?? 'center') }}
    >
      <div
        className={
          fondoNegro
            ? 'pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71] via-[#0a2f71]/70 to-[#0a2f71]/40'
            : 'pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/70 to-[#0a2f71]/30'
        }
      />
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
