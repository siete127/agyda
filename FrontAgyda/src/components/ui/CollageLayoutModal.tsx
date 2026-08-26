import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GripVertical, ImageOff, LayoutGrid, Pin, ArrowUp, ArrowDown, Save, X, Eye, Plus,
} from 'lucide-react'
import { noticiasService } from '@/services/noticias.service'
import { type Noticia } from '@/types/noticia.types'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/axios'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

type Shape = 'square' | 'wide' | 'tall'

interface ItemConfig {
  id: number
  shape: Shape
  colSpan: number
  rowSpan: number
  pinned: boolean
}

const SHAPES: { value: Shape; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'square', label: 'Cuadrado',  icon: <div className="h-5 w-5 rounded-sm border-2 border-current" />,                    hint: '1:1' },
  { value: 'wide',   label: 'Panorámico',icon: <div className="h-3.5 w-6 rounded-sm border-2 border-current" />,                  hint: '16:9' },
  { value: 'tall',   label: 'Vertical',  icon: <div className="h-6 w-3.5 rounded-sm border-2 border-current" />,                  hint: '2:3' },
]

function defaultConfig(n: Noticia): ItemConfig {
  return { id: n.id, shape: 'square', colSpan: 1, rowSpan: 1, pinned: false }
}

/* ── Mini preview card para la grilla ── */
function PreviewCell({ n, cfg, isSelected, onClick }: {
  n: Noticia; cfg: ItemConfig; isSelected: boolean; onClick: () => void
}) {
  const aspectClass: Record<Shape, string> = {
    square: 'aspect-square',
    wide:   'aspect-video',
    tall:   'aspect-[2/3]',
  }
  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-150',
        isSelected ? 'border-brand shadow-[0_0_0_3px_rgba(107,142,245,0.25)]' : 'border-transparent hover:border-gray-300',
      )}
      style={{ gridColumn: `span ${cfg.colSpan}`, gridRow: `span ${cfg.rowSpan}` }}
    >
      <div className={aspectClass[cfg.shape]}>
        {n.imagenPortada ? (
          <img src={n.imagenPortada} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8]">
            <ImageOff className="h-4 w-4 text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <p className="absolute bottom-1.5 left-1.5 right-1.5 text-[0.6rem] font-semibold text-white leading-tight line-clamp-2">
          {n.titulo}
        </p>
        {cfg.pinned && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
            <Pin className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
    </div>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onNuevaNoticia?: () => void
}

export function CollageLayoutModal({ isOpen, onClose, onNuevaNoticia }: Props) {
  const qc = useQueryClient()
  const [configs, setConfigs]   = useState<Map<number, ItemConfig>>(new Map())
  const [order,   setOrder]     = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [dragIdx,  setDragIdx]  = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(true)

  const { data: noticias = [], isLoading } = useQuery({
    queryKey: ['noticias'],
    queryFn: () => noticiasService.getAll(),
    staleTime: 30_000,
    enabled: isOpen,
  })

  const activeNoticias = noticias.filter((n) => n.activo)

  const ordered: Noticia[] = order.length
    ? order.map((id) => activeNoticias.find((n) => n.id === id)!).filter(Boolean)
    : activeNoticias

  const getConfig = (id: number): ItemConfig =>
    configs.get(id) ?? defaultConfig(activeNoticias.find((n) => n.id === id)!)

  const updateConfig = (id: number, patch: Partial<ItemConfig>) => {
    setConfigs((prev) => {
      const next = new Map(prev)
      next.set(id, { ...getConfig(id), ...patch })
      return next
    })
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver  = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setDragOver(idx)
    const ids = ordered.map((n) => n.id)
    const next = [...ids]
    const [item] = next.splice(dragIdx, 1)
    next.splice(idx, 0, item)
    setOrder(next)
    setDragIdx(idx)
  }
  const handleDragEnd = () => { setDragIdx(null); setDragOver(null) }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const ids = ordered.map((n) => n.id)
    const next = [...ids]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setOrder(next)
  }

  const pinItem = (id: number) => {
    const wasPinned = getConfig(id).pinned
    updateConfig(id, { pinned: !wasPinned })
    const ids = ordered.map((n) => n.id)
    const pinned = ids.filter((i) => (getConfig(i).pinned && i !== id) || (!wasPinned && i === id))
    const rest   = ids.filter((i) => !pinned.includes(i))
    setOrder([...pinned, ...rest])
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const order = ordered.map((n) => n.id)
      // El backend espera `config` como objeto indexado por id
      const config: Record<number, Omit<ItemConfig, 'id'>> = {}
      ordered.forEach((n) => {
        const c = getConfig(n.id)
        config[n.id] = { shape: c.shape, colSpan: c.colSpan, rowSpan: c.rowSpan, pinned: c.pinned }
      })
      return api.post('/noticias/layout', { order, config })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['noticias'] })
      toast.success('Layout guardado')
      onClose()
    },
    onError: () => toast.error('Error al guardar layout'),
  })

  const sel = selected != null ? getConfig(selected) : null
  const selNoticia = selected != null ? activeNoticias.find((n) => n.id === selected) : null
  const unsavedCount = configs.size

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editor de collage" size="xl">
      <div className="flex flex-col gap-0" style={{ minHeight: 480 }}>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-[0.72rem] text-gray-400">
            {ordered.length} publicaciones · {unsavedCount > 0 ? <span className="text-amber-500 font-semibold">{unsavedCount} cambio{unsavedCount > 1 ? 's' : ''} sin guardar</span> : 'Sin cambios'}
          </p>
          <div className="flex items-center gap-2">
            {onNuevaNoticia && (
              <button
                onClick={onNuevaNoticia}
                className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1 text-[0.72rem] font-semibold text-brand hover:bg-brand/10 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva noticia
              </button>
            )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.72rem] font-semibold transition-colors',
              showPreview ? 'border-brand/40 bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Vista previa
          </button>
          </div>
        </div>

        <div className="flex gap-4 flex-1 overflow-hidden">

          {/* ── Lista de noticias ── */}
          <div className="w-[260px] flex-shrink-0 overflow-y-auto pr-1 space-y-1.5 max-h-[520px]">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Orden ({ordered.length})
            </p>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
              ))
            ) : ordered.map((n, idx) => {
              const cfg = getConfig(n.id)
              const isSelected = selected === n.id
              return (
                <div
                  key={n.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelected(isSelected ? null : n.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-2 py-2 cursor-pointer transition-all select-none',
                    isSelected
                      ? 'border-brand/50 bg-brand/5 shadow-sm'
                      : dragOver === idx
                      ? 'border-brand/30 bg-brand/3'
                      : 'border-gray-100 bg-white hover:border-gray-200',
                    dragIdx === idx && 'opacity-40',
                  )}
                >
                  <GripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-gray-200" />
                  <div className="h-9 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {n.imagenPortada
                      ? <img src={n.imagenPortada} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8]">
                          <ImageOff className="h-2.5 w-2.5 text-white/30" />
                        </div>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.72rem] font-semibold text-gray-900 leading-tight">{n.titulo}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[0.6rem] text-gray-400">{n.categoria}</span>
                      {cfg.pinned && <Pin className="h-2.5 w-2.5 text-brand" />}
                      {cfg.shape !== 'square' && (
                        <span className="rounded bg-brand/10 px-1 text-[0.56rem] font-bold text-brand uppercase">{cfg.shape}</span>
                      )}
                      {cfg.colSpan > 1 && (
                        <span className="rounded bg-gray-100 px-1 text-[0.56rem] font-bold text-gray-400">{cfg.colSpan}col</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); moveItem(idx, -1) }} disabled={idx === 0}
                      className="rounded p-0.5 text-gray-200 hover:text-brand transition-colors disabled:opacity-20">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveItem(idx, 1) }} disabled={idx === ordered.length - 1}
                      className="rounded p-0.5 text-gray-200 hover:text-brand transition-colors disabled:opacity-20">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="flex-shrink-0 w-4 text-center text-[0.62rem] font-bold text-gray-300">{idx + 1}</span>
                </div>
              )
            })}
          </div>

          {/* ── Panel central: vista previa grilla ── */}
          {showPreview && (
            <div className="flex-1 overflow-y-auto max-h-[520px]">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-2">
                Vista previa
              </p>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
              >
                {ordered.slice(0, 12).map((n) => (
                  <PreviewCell
                    key={n.id}
                    n={n}
                    cfg={getConfig(n.id)}
                    isSelected={selected === n.id}
                    onClick={() => setSelected(selected === n.id ? null : n.id)}
                  />
                ))}
              </div>
              {ordered.length > 12 && (
                <p className="mt-2 text-center text-[0.65rem] text-gray-400">
                  +{ordered.length - 12} más no mostradas en preview
                </p>
              )}
            </div>
          )}

          {/* ── Panel de edición ── */}
          <div className="w-[220px] flex-shrink-0">
            {sel && selNoticia ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4 sticky top-0">
                {/* Preview imagen */}
                <div className="relative overflow-hidden rounded-xl bg-gray-100" style={{ height: 100 }}>
                  {selNoticia.imagenPortada
                    ? <img src={selNoticia.imagenPortada} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8]">
                        <ImageOff className="h-6 w-6 text-white/20" />
                      </div>
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <p className="absolute bottom-1.5 left-2 right-2 text-[0.68rem] font-bold text-white line-clamp-2 leading-tight">
                    {selNoticia.titulo}
                  </p>
                </div>

                {/* Forma */}
                <div>
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">Forma</p>
                  <div className="flex gap-1.5">
                    {SHAPES.map((s) => (
                      <button key={s.value} onClick={() => updateConfig(selected!, { shape: s.value })}
                        className={clsx(
                          'flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-2 text-[0.58rem] font-semibold transition-all',
                          sel.shape === s.value
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300',
                        )}>
                        {s.icon}
                        <span>{s.label}</span>
                        <span className="text-[0.52rem] opacity-60">{s.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Columnas */}
                <div>
                  <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">
                    Columnas: <span className="text-brand">{sel.colSpan}</span>
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((v) => (
                      <button key={v} onClick={() => updateConfig(selected!, { colSpan: v })}
                        className={clsx(
                          'flex-1 rounded-lg border py-1.5 text-[0.72rem] font-bold transition-all',
                          sel.colSpan === v ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-400 hover:border-gray-300',
                        )}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filas */}
                <div>
                  <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">
                    Alto: <span className="text-brand">{sel.rowSpan}</span>
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((v) => (
                      <button key={v} onClick={() => updateConfig(selected!, { rowSpan: v })}
                        className={clsx(
                          'flex-1 rounded-lg border py-1.5 text-[0.72rem] font-bold transition-all',
                          sel.rowSpan === v ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-400 hover:border-gray-300',
                        )}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pin */}
                <button
                  onClick={() => pinItem(selected!)}
                  className={clsx(
                    'flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-[0.72rem] font-semibold transition-all',
                    sel.pinned
                      ? 'border-brand/40 bg-brand/5 text-brand'
                      : 'border-gray-200 text-gray-400 hover:border-brand/30 hover:text-brand',
                  )}
                >
                  <Pin className="h-3.5 w-3.5" />
                  {sel.pinned ? 'Fijada al inicio ✓' : 'Fijar al inicio'}
                </button>

                <button onClick={() => setSelected(null)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-[0.68rem] text-gray-400 hover:bg-gray-100 transition-colors">
                  <X className="h-3.5 w-3.5" /> Deseleccionar
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 py-16 text-center h-full">
                <LayoutGrid className="h-8 w-8 text-gray-200" />
                <p className="text-xs text-gray-400">Haz clic en una<br />publicación para<br />editar su layout</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">
          {unsavedCount === 0
            ? 'Sin cambios pendientes'
            : <span className="text-amber-500">{unsavedCount} cambio{unsavedCount > 1 ? 's' : ''} sin guardar</span>}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {saveMut.isPending
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <Save className="h-3.5 w-3.5" />}
            Guardar layout
          </button>
        </div>
      </div>
    </Modal>
  )
}
