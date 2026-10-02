import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { noticiasService } from '@/services/noticias.service'
import { REACCIONES, type ReaccionTipo } from '@/types/noticia.types'
import { clsx } from 'clsx'

interface Props {
  noticiaId: number
  miReaccion: string | null
  total: number
  queryKey?: string
}

export function ReactionPicker({ noticiaId, miReaccion, total, queryKey = 'noticias' }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showReactores, setShowReactores] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const current = REACCIONES.find((r) => r.tipo === miReaccion)

  const mut = useMutation({
    mutationFn: async (tipo: ReaccionTipo | null) => {
      if (tipo === null || miReaccion === tipo) {
        await noticiasService.removeReaccion(noticiaId)
      } else {
        await noticiasService.setReaccion(noticiaId, tipo)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      qc.invalidateQueries({ queryKey: ['noticias-destacadas'] })
    },
  })

  const handleOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }

  const handleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }

  const handleReact = (tipo: ReaccionTipo) => {
    setOpen(false)
    mut.mutate(tipo)
  }

  const handleMainClick = () => {
    if (current) {
      mut.mutate(null)
    } else {
      mut.mutate('like')
    }
  }

  // Cerrar con click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5 select-none">
      {/* Picker emergente */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 z-50 flex items-center gap-1 rounded-2xl border border-gray-100 bg-card px-2 py-1.5 shadow-xl"
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
          style={{ animation: 'reactionPop 0.18s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          {REACCIONES.map(({ tipo, emoji, label }, i) => (
            <button
              key={tipo}
              title={label}
              onClick={() => handleReact(tipo)}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-xl text-xl transition-all hover:scale-125 hover:bg-gray-50',
                miReaccion === tipo && 'scale-110 bg-blue-50',
              )}
              style={{ animationDelay: `${i * 25}ms` }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Botón principal */}
      <button
        onClick={handleMainClick}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        disabled={mut.isPending}
        className={clsx(
          'flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-sm transition-all hover:scale-105 active:scale-95',
          current
            ? 'border-blue-200 bg-blue-50 text-blue-600'
            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100',
        )}
      >
        <span className="text-base leading-none">
          {current ? current.emoji : '👍'}
        </span>
        {current && (
          <span className="text-[0.7rem] font-semibold leading-none">{current.label}</span>
        )}
      </button>

      {/* Contador total — clic abre quién reaccionó */}
      {total > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowReactores(true) }}
          className="text-[0.7rem] text-gray-400 tabular-nums hover:text-gray-600 hover:underline"
        >
          {total}
        </button>
      )}

      {showReactores && (
        <ReactoresModal noticiaId={noticiaId} onClose={() => setShowReactores(false)} />
      )}

      <style>{`
        @keyframes reactionPop {
          from { opacity: 0; transform: scale(0.8) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ────────────────────────────────────────────────
   Modal: lista de quién reaccionó a la noticia
──────────────────────────────────────────────── */
function ReactoresModal({ noticiaId, onClose }: { noticiaId: number; onClose: () => void }) {
  const { data: reactores = [], isLoading } = useQuery({
    queryKey: ['noticia-reactores', noticiaId],
    queryFn: () => noticiasService.getReactores(noticiaId),
  })

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <p className="text-[0.85rem] font-bold text-ink">Reacciones</p>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink transition-colors text-lg leading-none">
            ×
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-5 text-center text-[0.78rem] text-ink-tertiary">Cargando…</p>
          ) : reactores.length === 0 ? (
            <p className="px-4 py-5 text-center text-[0.78rem] text-ink-tertiary">Nadie ha reaccionado todavía.</p>
          ) : (
            reactores.map((r) => {
              const info = REACCIONES.find((x) => x.tipo === r.tipo)
              return (
                <div key={r.usuarioId} className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-border last:border-0">
                  {r.fotoUrl ? (
                    <img src={r.fotoUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[0.7rem] font-bold text-brand">
                      {r.nombre.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 text-[0.8rem] font-medium text-ink truncate">{r.nombre}</span>
                  <span className="text-lg leading-none flex-shrink-0" title={info?.label}>{info?.emoji ?? '👍'}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
