import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Send } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'

function fmtHora(f: string) {
  try { return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}
function fmtFechaCorta(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

// Compartido por las tabs "Conversación" (visibleCliente=true, lo que ve el
// cliente) y "Notas internas" (visibleCliente=false, nunca se notifica ni se
// muestra en el Portal de Cliente) — mismo componente, filtrado por el flag
// CCO_VISIBLE_CLIENTE del backend. Burbujas de chat con la paleta de marca:
// lo que escribió el agente a la derecha (bg-brand), lo que escribió el
// cliente a la izquierda (fondo blanco).
export function HiloComentarios({ casoId, visibleCliente, puedeEscribir, placeholder }: {
  casoId: number
  visibleCliente: boolean
  puedeEscribir: boolean
  placeholder: string
}) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleParam = visibleCliente ? '1' : '0'
  const queryKey = ['caso-comentarios', casoId, visibleParam]

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => casoService.getComentarios(casoId, visibleParam),
    staleTime: 15_000,
    refetchInterval: 20_000,
  })

  const enviar = useMutation({
    mutationFn: () => casoService.addComentario(casoId, texto.trim(), visibleCliente),
    onSuccess: () => { setTexto(''); qc.invalidateQueries({ queryKey }) },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [comentarios.length])

  // Agrupa por día para mostrar un separador tipo "26 sep 2026" entre bloques.
  let ultimoDia = ''

  return (
    <div className="flex h-[420px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center"><Spinner size="sm" /></div>
      ) : comentarios.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-[0.78rem] text-gray-500">Sin mensajes todavía</p>
      ) : (
        <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
          {comentarios.map((c) => {
            // En "Notas internas" todos los mensajes son del equipo (no hay
            // 2 lados) — se muestran todos a la izquierda, como una bitácora,
            // no como conversación bilateral.
            const propio = visibleCliente && c.origen === 'interno'
            const dia = fmtFechaCorta(c.fecha)
            const mostrarSeparador = dia !== ultimoDia
            ultimoDia = dia
            return (
              <div key={c.id}>
                {mostrarSeparador && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-[0.65rem] font-semibold text-gray-500 shadow-sm">{dia}</span>
                  </div>
                )}
                <div className={clsx('flex', propio ? 'justify-end' : 'justify-start')}>
                  <div className={clsx(
                    'max-w-[75%] rounded-2xl px-3 py-2 shadow-sm',
                    propio ? 'rounded-tr-sm bg-brand text-white' : 'rounded-tl-sm bg-white text-gray-800',
                  )}>
                    <p className={clsx('mb-0.5 text-[0.68rem] font-bold', propio ? 'text-white/80' : 'text-brand')}>
                      {visibleCliente ? (propio ? (c.usuarioNombre ?? 'Agente') : (c.contactoNombre ?? 'Cliente')) : (c.usuarioNombre ?? 'Usuario')}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.comentario}</p>
                    <p className={clsx('mt-0.5 text-right text-[0.62rem]', propio ? 'text-white/70' : 'text-gray-400')}>{fmtHora(c.fecha)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {puedeEscribir && (
        <div className="flex items-center gap-2 border-t border-gray-200 bg-card p-2.5">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) enviar.mutate() }}
            placeholder={placeholder}
            className="field flex-1 text-sm"
          />
          <button
            onClick={() => enviar.mutate()}
            disabled={!texto.trim() || enviar.isPending}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
          >
            {enviar.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
