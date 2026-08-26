import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { type Noticia } from '@/types/noticia.types'

const CAT: Record<string, { text: string; bg: string }> = {
  Comunicado: { text: 'text-blue-700',   bg: 'bg-blue-50'   },
  Evento:     { text: 'text-purple-700', bg: 'bg-purple-50' },
  Noticia:    { text: 'text-emerald-700',bg: 'bg-emerald-50'},
  Urgente:    { text: 'text-red-700',    bg: 'bg-red-50'    },
}
const catStyle = (c: string) => CAT[c] ?? { text: 'text-gray-600', bg: 'bg-gray-100' }

/* ── Card individual ── */
function NewsCard({ noticia, onOpen }: { noticia: Noticia; onOpen: (n: Noticia) => void }) {
  const [hovered, setHovered] = useState(false)
  const st = catStyle(noticia.categoria)
  const fecha = new Date(noticia.fechaCreacion).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short',
  })

  return (
    <article
      className={clsx(
        'flex-shrink-0 w-[260px] flex flex-col overflow-hidden rounded-2xl bg-white border border-gray-200/60 cursor-pointer transition-all duration-200',
        hovered ? '-translate-y-1 shadow-card-lg border-gray-300/60' : 'shadow-card',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(noticia)}
    >
      {/* Imagen */}
      <div className="relative h-36 overflow-hidden bg-gray-100 flex-shrink-0">
        {noticia.imagenPortada ? (
          <img
            src={noticia.imagenPortada}
            alt={noticia.titulo}
            className={clsx(
              'h-full w-full object-cover transition-transform duration-500',
              hovered && 'scale-[1.04]',
            )}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8]" />
        )}
        <span className={clsx('absolute bottom-2 left-2 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ring-1 ring-inset ring-transparent', st.bg, st.text)}>
          {noticia.categoria}
        </span>
      </div>

      {/* Contenido */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="flex items-center gap-1 text-[0.65rem] text-gray-400">
          <CalendarDays className="h-3 w-3" /> {fecha}
        </p>
        <h4 className={clsx('text-[0.82rem] font-bold leading-snug line-clamp-2 transition-colors', hovered ? 'text-brand' : 'text-gray-900')}>
          {noticia.titulo}
        </h4>
        <p className="text-[0.72rem] text-gray-400 line-clamp-2 leading-relaxed flex-1">
          {noticia.contenido.replace(/<[^>]*>/g, '').slice(0, 90)}
        </p>
        <div className={clsx('flex items-center gap-1 text-[0.7rem] font-semibold transition-colors mt-auto', hovered ? 'text-brand' : 'text-gray-400')}>
          Leer más <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </article>
  )
}

/* ── Sección con scroll horizontal ── */
interface NewsSectionProps {
  title: string
  items: Noticia[]
  onOpen: (n: Noticia) => void
  onVerTodas?: () => void
}

export function NewsSection({ title, items, onOpen, onVerTodas }: NewsSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    el?.addEventListener('scroll', checkScroll, { passive: true })
    return () => el?.removeEventListener('scroll', checkScroll)
  }, [items])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 280 : -280, behavior: 'smooth' })
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-brand" />
          <h3 className="text-[0.95rem] font-bold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onVerTodas && (
            <button
              onClick={onVerTodas}
              className="mr-2 text-[0.72rem] font-semibold text-brand hover:text-brand-dark transition-colors"
            >
              Ver todas →
            </button>
          )}
          <button
            onClick={() => scroll('left')}
            disabled={!canLeft}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-lg border transition-all',
              canLeft
                ? 'border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand shadow-sm'
                : 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canRight}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-lg border transition-all',
              canRight
                ? 'border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand shadow-sm'
                : 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scroll container */}
      <div className="relative">
        {/* Fade izquierda */}
        <div className={clsx('pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-surface to-transparent z-10 transition-opacity', canLeft ? 'opacity-100' : 'opacity-0')} />
        {/* Fade derecha */}
        <div className={clsx('pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-surface to-transparent z-10 transition-opacity', canRight ? 'opacity-100' : 'opacity-0')} />

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((n) => (
            <NewsCard key={n.id} noticia={n} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </div>
  )
}
