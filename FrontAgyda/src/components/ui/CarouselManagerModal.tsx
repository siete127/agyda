import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, StarOff, GripVertical, ImageIcon, Search, Info } from 'lucide-react'
import { clsx } from 'clsx'
import { noticiasService } from '@/services/noticias.service'
import { Modal } from '@/components/ui/Modal'
import { type Noticia } from '@/types/noticia.types'
import toast from 'react-hot-toast'

const MAX_CARRUSEL = 8

export function CarouselManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [dragId, setDragId] = useState<number | null>(null)
  const [order,  setOrder]  = useState<number[]>([])
  const [busqueda, setBusqueda] = useState('')

  const { data: noticias = [], isLoading } = useQuery({
    queryKey: ['noticias'],
    queryFn: () => noticiasService.getAll(),
    enabled: isOpen,
  })

  const destacadas = noticias
    .filter((n) => n.destacada)
    .sort((a, b) => {
      const ai = order.indexOf(a.id)
      const bi = order.indexOf(b.id)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })

  const noDestacadas = useMemo(() => {
    const base = noticias.filter((n) => !n.destacada && n.activo)
    if (!busqueda.trim()) return base
    const q = busqueda.toLowerCase()
    return base.filter((n) =>
      n.titulo.toLowerCase().includes(q) || n.categoria?.toLowerCase().includes(q)
    )
  }, [noticias, busqueda])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['noticias'] })
    qc.invalidateQueries({ queryKey: ['noticias-destacadas'] })
  }

  const toggleMut = useMutation({
    mutationFn: ({ id, destacada }: { id: number; destacada: boolean }) =>
      noticiasService.toggleDestacada(id, destacada),
    onSuccess: (_, { id, destacada }) => {
      setOrder((prev) => {
        if (!destacada) return prev.filter((x) => x !== id)
        return [...prev, id]
      })
      invalidate()
    },
    onError: () => toast.error('Error al actualizar'),
  })

  const limitReached = destacadas.length >= MAX_CARRUSEL

  /* ── Drag & drop ── */
  const handleDragStart = (id: number) => setDragId(id)
  const handleDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    if (dragId === null || dragId === targetId) return
    const ids = destacadas.map((n) => n.id)
    const from = ids.indexOf(dragId)
    const to   = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    setOrder(next)
  }
  const handleDragEnd = () => setDragId(null)

  function ThumbRow({ n, inCarrusel }: { n: Noticia; inCarrusel: boolean }) {
    const disabled = toggleMut.isPending || (!inCarrusel && limitReached)
    return (
      <div
        draggable={inCarrusel}
        onDragStart={inCarrusel ? () => handleDragStart(n.id) : undefined}
        onDragOver={inCarrusel ? (e) => handleDragOver(e, n.id) : undefined}
        onDragEnd={inCarrusel ? handleDragEnd : undefined}
        className={clsx(
          'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all',
          inCarrusel
            ? clsx('bg-white', dragId === n.id ? 'opacity-40 border-brand/40 bg-brand/5' : 'border-gray-200 hover:border-gray-300 cursor-grab active:cursor-grabbing')
            : 'bg-gray-50/60 border-gray-100 hover:border-gray-200',
          disabled && !inCarrusel && 'opacity-50 cursor-not-allowed',
        )}
      >
        {inCarrusel && <GripVertical className="h-4 w-4 flex-shrink-0 text-gray-300" />}

        {n.imagenPortada
          ? <img src={n.imagenPortada} alt="" className={clsx('h-9 w-14 flex-shrink-0 rounded-lg object-cover', !inCarrusel && 'opacity-70')} />
          : <div className="flex h-9 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <ImageIcon className="h-3.5 w-3.5 text-gray-300" />
            </div>
        }

        <div className="min-w-0 flex-1">
          <p className={clsx('text-[0.73rem] font-semibold line-clamp-1 leading-tight', inCarrusel ? 'text-gray-800' : 'text-gray-500')}>
            {n.titulo}
          </p>
          <p className="text-[0.62rem] text-gray-400 mt-0.5">{n.categoria}</p>
        </div>

        <button
          onClick={() => !disabled && toggleMut.mutate({ id: n.id, destacada: !inCarrusel })}
          disabled={disabled}
          title={inCarrusel ? 'Quitar del carrusel' : limitReached ? `Límite de ${MAX_CARRUSEL}` : 'Agregar al carrusel'}
          className={clsx(
            'flex-shrink-0 rounded-lg p-1.5 transition-colors',
            inCarrusel
              ? 'text-yellow-500 hover:bg-yellow-50 hover:text-yellow-600'
              : disabled
              ? 'text-gray-200 cursor-not-allowed'
              : 'text-gray-300 hover:text-yellow-500 hover:bg-yellow-50',
          )}
        >
          {inCarrusel ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
        </button>
      </div>
    )
  }

  const pct = Math.round((destacadas.length / MAX_CARRUSEL) * 100)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestionar carrusel" size="lg">

      {/* Info banner */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-[0.75rem] text-blue-700 leading-relaxed">
          Las noticias marcadas con ⭐ aparecen en el carrusel del inicio.
          Arrastra para cambiar el orden. Máximo {MAX_CARRUSEL} noticias.
        </p>
      </div>

      {/* Barra de capacidad */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-semibold text-gray-600">
            {destacadas.length} / {MAX_CARRUSEL} en carrusel
          </span>
          <span className={clsx(
            'text-[0.65rem] font-bold',
            limitReached ? 'text-red-500' : destacadas.length >= MAX_CARRUSEL * 0.75 ? 'text-amber-500' : 'text-emerald-500',
          )}>
            {limitReached ? '¡Límite alcanzado!' : `${MAX_CARRUSEL - destacadas.length} disponible${MAX_CARRUSEL - destacadas.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={clsx('h-full rounded-full transition-all duration-300', limitReached ? 'bg-red-400' : 'bg-brand')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[55vh] overflow-y-auto pr-1">

        {/* Columna izquierda: destacadas */}
        <div>
          <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-brand">
            En carrusel ({destacadas.length})
          </p>
          <div className="space-y-1.5 min-h-[60px]">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
              ))
            ) : destacadas.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-10">
                <Star className="h-5 w-5 text-gray-200" />
                <p className="text-xs text-gray-400">Ninguna noticia en carrusel</p>
              </div>
            ) : (
              destacadas.map((n) => <ThumbRow key={n.id} n={n} inCarrusel />)
            )}
          </div>
        </div>

        {/* Columna derecha: disponibles con búsqueda */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-bold uppercase tracking-widest text-gray-400">
              Disponibles
            </p>
            {limitReached && (
              <span className="text-[0.62rem] font-semibold text-red-400">Límite alcanzado</span>
            )}
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar noticia..."
              className="field pl-8 text-[0.78rem] py-1.5"
            />
          </div>

          <div className="space-y-1.5 overflow-y-auto max-h-[340px]">
            {noDestacadas.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-10">
                <p className="text-xs text-gray-400">
                  {busqueda ? 'Sin resultados' : 'Todas las noticias están en el carrusel'}
                </p>
              </div>
            ) : (
              noDestacadas.map((n) => <ThumbRow key={n.id} n={n} inCarrusel={false} />)
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
        <button onClick={onClose}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
