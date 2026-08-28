import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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

      {/* Contador total */}
      {total > 0 && (
        <span className="text-[0.7rem] text-gray-400 tabular-nums">{total}</span>
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
