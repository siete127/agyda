import { useRef, useState } from 'react'
import { Minus, X, ExternalLink, Loader2 } from 'lucide-react'
import { useEnlaceFrameStore } from '@/stores/enlaceFrame.store'

/**
 * Panel flotante para los enlaces del encabezado configurados en modo "flotante".
 * El <iframe> vive fuera del <Outlet> (montado en AppLayout), así que NO se
 * desmonta al navegar entre módulos — igual que el reproductor de música o el
 * Webphone. Se puede arrastrar por el header y minimizar a una burbuja; el
 * iframe sigue vivo detrás de la burbuja.
 *
 * A diferencia de WebphoneFrame no usa Picture-in-Picture ni sincroniza con un
 * placeholder: es un overlay `position: fixed` puro y simple.
 */
const W = 420
const H = 620
const MARGIN = 16
const HEADER_H = 34
const BUBBLE = 52
const MIN_W = 300
const MIN_H = 360

export function EnlaceFrame() {
  const abierto = useEnlaceFrameStore((s) => s.abierto)
  const minimizado = useEnlaceFrameStore((s) => s.minimizado)
  const cerrar = useEnlaceFrameStore((s) => s.cerrar)
  const setMinimizado = useEnlaceFrameStore((s) => s.setMinimizado)

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [interacting, setInteracting] = useState(false)
  const [loading, setLoading] = useState(true)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  // Al cambiar de enlace, resetear posición/tamaño/carga durante el render
  // (patrón react.dev "you-might-not-need-an-effect" para estado derivado de props).
  const [enlacePrevio, setEnlacePrevio] = useState<string | null>(null)
  const idActual = abierto?.id ?? null
  if (idActual !== enlacePrevio) {
    setEnlacePrevio(idActual)
    setPos(null)
    setSize(null)
    setLoading(true)
  }

  if (!abierto) return null

  const w = size?.w ?? W
  const h = size?.h ?? H

  const clamp = (x: number, y: number, cw: number, ch: number) => ({
    x: Math.min(Math.max(x, MARGIN), Math.max(window.innerWidth - cw - MARGIN, MARGIN)),
    y: Math.min(Math.max(y, MARGIN), Math.max(window.innerHeight - ch - MARGIN, MARGIN)),
  })

  const curPos = pos ?? { x: window.innerWidth - w - MARGIN, y: window.innerHeight - h - MARGIN }

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    dragRef.current = { dx: e.clientX - box.left, dy: e.clientY - box.top }
    setInteracting(true)
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPos(clamp(ev.clientX - dragRef.current.dx, ev.clientY - dragRef.current.dy, w, h))
    }
    const onUp = () => {
      dragRef.current = null
      setInteracting(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = w
    const startH = h
    setInteracting(true)
    const onMove = (ev: MouseEvent) => {
      const nw = Math.min(Math.max(startW + (ev.clientX - startX), MIN_W), window.innerWidth - MARGIN * 2)
      const nh = Math.min(Math.max(startH + (ev.clientY - startY), MIN_H), window.innerHeight - MARGIN * 2)
      setSize({ w: nw, h: nh })
    }
    const onUp = () => {
      setInteracting(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onBubbleDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - box.left
    const dy = e.clientY - box.top
    const sx = e.clientX
    const sy = e.clientY
    let moved = false
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) { moved = true; setInteracting(true) }
      setPos(clamp(ev.clientX - dx, ev.clientY - dy, BUBBLE, BUBBLE))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setInteracting(false)
      if (!moved) setMinimizado(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const trans = interacting ? '' : ' transition-all duration-200 ease-out'

  if (minimizado) {
    const bp = pos ? clamp(pos.x, pos.y, BUBBLE, BUBBLE) : { x: window.innerWidth - BUBBLE - MARGIN, y: window.innerHeight - BUBBLE - MARGIN }
    return (
      <>
        {/* iframe sigue vivo, oculto */}
        <div className="fixed" style={{ top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}>
          <iframe src={abierto.url} title={abierto.label} className="border-0" style={{ width: 400, height: 400 }} />
        </div>
        <button
          type="button"
          onMouseDown={onBubbleDown}
          title={`${abierto.label} — arrastrar o clic para restaurar`}
          className={'fixed z-40 flex cursor-grab items-center justify-center rounded-full text-white select-none ring-[3px] ring-white/90 hover:scale-110 active:scale-95' + trans}
          style={{ top: bp.y, left: bp.x, width: BUBBLE, height: BUBBLE, background: abierto.color, boxShadow: `0 8px 24px -4px ${abierto.color}88, 0 2px 8px rgba(0,0,0,0.15)` }}
        >
          <ExternalLink className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </>
    )
  }

  return (
    <div
      className={'fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-card shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35),0_4px_16px_rgba(0,0,0,0.12)] ring-1 ring-black/5' + trans}
      style={{ top: curPos.y, left: curPos.x, width: w, height: h }}
    >
      <div
        onMouseDown={onDragStart}
        className="flex flex-shrink-0 cursor-grab items-center justify-between gap-1.5 pl-3 pr-1 text-white select-none active:cursor-grabbing"
        style={{ height: HEADER_H, background: abierto.color }}
      >
        <span className="truncate text-xs font-semibold tracking-wide">{abierto.label}</span>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => window.open(abierto.url, '_blank', 'noopener,noreferrer')}
            title="Abrir en pestaña nueva"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMinimizado(true)}
            title="Minimizar"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={cerrar}
            title="Cerrar"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/80 transition-all hover:bg-red-500/80 hover:text-white active:scale-95"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
          </div>
        )}
        <iframe
          src={abierto.url}
          title={abierto.label}
          className="h-full w-full border-0"
          allow="microphone; autoplay; clipboard-write; encrypted-media"
          onLoad={() => setLoading(false)}
        />
      </div>

      <div onMouseDown={onResizeStart} title="Redimensionar" className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize" />
    </div>
  )
}
