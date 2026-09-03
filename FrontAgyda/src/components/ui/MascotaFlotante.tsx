import { useRef, useState } from 'react'
import { Minus, X, Sparkles } from 'lucide-react'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { useMascotaStore } from '@/stores/mascota.store'
import { MascotaTablero } from './MascotaTablero'

const MARGIN = 16
const W = 190
const H = 250
const BUBBLE = 56

/**
 * Mascota como widget flotante — vive en AppLayout (fuera del <Outlet>), sigue
 * visible al navegar. Se arrastra y se minimiza a una burbuja. Solo aparece si
 * el admin puso `modo` en 'flotante' o 'ambas' Y el usuario no la ocultó.
 */
export function MascotaFlotante() {
  const { mascota } = usePersonalizacion()
  const visiblePorUsuario = useMascotaStore((s) => s.flotanteVisible)
  const setVisible = useMascotaStore((s) => s.setFlotanteVisible)

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [minimizado, setMinimizado] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  const activo = (mascota.modo === 'flotante' || mascota.modo === 'ambas') && visiblePorUsuario
  if (!activo) return null

  const w = minimizado ? BUBBLE : W
  const h = minimizado ? BUBBLE : H
  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(x, MARGIN), Math.max(window.innerWidth - w - MARGIN, MARGIN)),
    y: Math.min(Math.max(y, MARGIN), Math.max(window.innerHeight - h - MARGIN, MARGIN)),
  })
  const cur = pos ?? { x: window.innerWidth - w - MARGIN, y: window.innerHeight - h - MARGIN }

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragRef.current = { dx: e.clientX - box.left, dy: e.clientY - box.top }
    const sx = e.clientX
    const sy = e.clientY
    let moved = false
    setInteracting(true)
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true
      if (!dragRef.current) return
      setPos(clamp(ev.clientX - dragRef.current.dx, ev.clientY - dragRef.current.dy))
    }
    const onUp = () => {
      dragRef.current = null
      setInteracting(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!moved && minimizado) setMinimizado(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const trans = interacting ? '' : ' transition-all duration-200 ease-out'

  if (minimizado) {
    return (
      <button
        type="button"
        onMouseDown={onDown}
        title="Mostrar la mascota"
        className={'fixed z-40 flex cursor-grab items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg ring-2 ring-white/90 hover:scale-105 active:scale-95' + trans}
        style={{ top: cur.y, left: cur.x, width: BUBBLE, height: BUBBLE }}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    )
  }

  return (
    <div
      className={'group fixed z-40' + trans}
      style={{ top: cur.y, left: cur.x, width: W, height: H }}
    >
      {/* Controles — solo al hover */}
      <div className="absolute -top-2 right-0 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setMinimizado(true)}
          title="Minimizar"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-400 shadow ring-1 ring-black/5 hover:text-gray-700"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setVisible(false)}
          title="Ocultar en este equipo"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-400 shadow ring-1 ring-black/5 hover:text-red-500"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div onMouseDown={onDown} className="h-full w-full cursor-grab active:cursor-grabbing">
        <MascotaTablero mascota={mascota} className="drop-shadow-xl" />
      </div>
    </div>
  )
}
