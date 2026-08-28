import { useState } from 'react'
import { MessagesSquare, MessageCircleOff, ArrowRight, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'

export function MensajeriaBell() {
  const [isOpen, setIsOpen] = useState(false)
  const { canales, unreadTotal, abrirChatFlotante } = useMensajeriaStore()
  const navigate = useNavigate()
  const recientes = canales.slice(0, 6)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Mensajería"
        className={clsx(
          'relative rounded-full p-1.5 transition-colors',
          isOpen ? 'text-brand' : 'text-ink-tertiary hover:text-ink-secondary',
        )}
      >
        <MessagesSquare className="h-[19px] w-[19px]" />
        <Badge count={unreadTotal} size="md" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-full mt-2 w-80 z-40 animate-slide-up overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-card-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">Mensajería</span>
                {unreadTotal > 0 && (
                  <span className="chip bg-brand/10 text-brand">{unreadTotal}</span>
                )}
              </div>
            </div>

            <div className="max-h-64 divide-y divide-gray-50 overflow-y-auto">
              {recientes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                    <MessageCircleOff className="h-5 w-5 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400">Sin conversaciones</p>
                </div>
              ) : (
                recientes.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => { setIsOpen(false); abrirChatFlotante(c.id) }}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50',
                      c.noLeidos > 0 && 'bg-brand/[0.03]',
                    )}
                  >
                    {c.tipo === 'grupo' ? (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                        <Users className="h-4 w-4" />
                      </div>
                    ) : (
                      <Avatar name={c.nombre ?? '?'} size="sm" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-xs leading-snug truncate', c.noLeidos > 0 ? 'font-semibold text-gray-800' : 'text-gray-600')}>
                        {c.nombre || 'Conversación'}
                      </p>
                      <p className="text-[0.68rem] text-gray-400 truncate">{c.ultimoMensajePreview || 'Sin mensajes aún'}</p>
                    </div>
                    {c.noLeidos > 0 && (
                      <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">
                        {c.noLeidos > 9 ? '9+' : c.noLeidos}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-100 px-4 py-2.5">
              <button
                onClick={() => { setIsOpen(false); navigate('/mensajeria') }}
                className="flex w-full items-center justify-center gap-1.5 text-[0.72rem] font-medium text-brand hover:text-brand-dark transition-colors py-0.5"
              >
                Abrir mensajería
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
