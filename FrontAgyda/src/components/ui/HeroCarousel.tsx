import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { type Noticia } from '@/types/noticia.types'

const CAT_COLORS: Record<string, string> = {
  Comunicado:  'bg-blue-500',
  Evento:      'bg-purple-500',
  Noticia:     'bg-emerald-500',
  Urgente:     'bg-red-500',
  Bienestar:   'bg-teal-500',
  Salud:       'bg-rose-500',
  Cultura:     'bg-amber-500',
  Deportes:    'bg-orange-500',
}
const catColor = (c: string) => CAT_COLORS[c] ?? 'bg-indigo-500'

interface HeroCarouselProps {
  items: Noticia[]
  onOpen: (n: Noticia) => void
  size?: 'compact' | 'large'
}

export function HeroCarousel({ items, onOpen, size = 'compact' }: HeroCarouselProps) {
  const [index, setIndex]     = useState(0)
  const [prev,  setPrev]      = useState<number | null>(null)
  const [paused, setPaused]   = useState(false)
  const [animDir, setAnimDir] = useState<'left' | 'right'>('right')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const go = useCallback((next: number, dir: 'left' | 'right' = 'right') => {
    const clamped = ((next % items.length) + items.length) % items.length
    setAnimDir(dir)
    setPrev(index)
    setIndex(clamped)
  }, [index, items.length])

  useEffect(() => {
    if (paused || items.length < 2) return
    timerRef.current = setTimeout(() => go(index + 1, 'right'), 5500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [index, paused, go, items.length])

  // Limpia el "prev" tras la transición
  useEffect(() => {
    if (prev === null) return
    const t = setTimeout(() => setPrev(null), 700)
    return () => clearTimeout(t)
  }, [prev])

  if (items.length === 0) return null

  const item = items[index]

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-surface-border bg-[#0B1730]"
      style={{ height: size === 'large' ? 'clamp(280px, 34vw, 420px)' : 'clamp(200px, 22vw, 280px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Slides ── */}
      {items.map((n, i) => {
        const isActive = i === index
        const isPrev   = i === prev
        return (
          <div
            key={n.id}
            className={clsx(
              'absolute inset-0 transition-all duration-700 ease-in-out',
              isActive ? 'opacity-100 scale-100' : isPrev ? 'opacity-0 scale-105' : 'opacity-0 scale-100',
            )}
          >
            {n.imagenPortada ? (
              <img
                src={n.imagenPortada}
                alt={n.titulo}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[#0B1730] via-brand/40 to-[#0B1730]" />
            )}
          </div>
        )
      })}

      {/* Overlay multicapa: oscurece toda la imagen + gradiente izq. fuerte */}
      <div className="pointer-events-none absolute inset-0 bg-black/40" />
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%)' }}
      />
      {/* Gradiente inferior */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
      />

      {/* ── Contenido — centrado verticalmente ── */}
      <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-8" style={{ maxWidth: '62%' }}>
        {/* Badge */}
        <span className={clsx(
          'mb-2 inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[0.55rem] font-bold text-white uppercase tracking-widest',
          catColor(item.categoria),
        )}>
          {item.categoria}
        </span>

        {/* Título */}
        <h2
          key={`title-${index}`}
          className={clsx(
            'mb-1.5 font-extrabold text-white leading-tight tracking-tight line-clamp-2',
            size === 'large' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl',
          )}
          style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
        >
          {item.titulo}
        </h2>

        {/* Extracto */}
        <p
          key={`desc-${index}`}
          className={clsx(
            'text-white/75 leading-relaxed',
            size === 'large' ? 'mb-5 text-[0.82rem] line-clamp-2' : 'mb-3 text-[0.72rem] line-clamp-1',
          )}
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
        >
          {item.contenido.replace(/<[^>]*>/g, '').slice(0, size === 'large' ? 160 : 100)}
        </p>

        {/* Botón */}
        <button
          onClick={() => onOpen(item)}
          className={clsx(
            'group inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/50 bg-white/15 font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white hover:text-[#0B1730] hover:border-white active:scale-95',
            size === 'large' ? 'px-4 py-2 text-[0.8rem]' : 'px-3 py-1.5 text-[0.72rem]',
          )}
        >
          Leer más
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* ── Flechas ── */}
      {items.length > 1 && (
        <>
          <button
            onClick={() => go(index - 1, 'left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm border border-white/15 transition-all hover:bg-white/25 active:scale-90"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => go(index + 1, 'right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm border border-white/15 transition-all hover:bg-white/25 active:scale-90"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {/* ── Indicadores: dots si hay pocos, contador si hay muchos ── */}
      {items.length > 1 && items.length <= 8 && (
        <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i, i > index ? 'right' : 'left')}
              className={clsx(
                'rounded-full transition-all duration-300',
                i === index ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      )}
      {items.length > 8 && (
        <div className="absolute bottom-3 right-3 rounded-full bg-black/35 px-2 py-0.5 text-[0.62rem] font-semibold text-white/80 tabular-nums backdrop-blur-sm">
          {index + 1} / {items.length}
        </div>
      )}

      {/* Barra de progreso del autoplay */}
      {!paused && items.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
          <div
            key={`progress-${index}`}
            className="h-full bg-white/50"
            style={{ animation: 'carousel-progress 5.5s linear forwards' }}
          />
        </div>
      )}
    </div>
  )
}
