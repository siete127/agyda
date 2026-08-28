import { useState } from 'react'
import { Bell, BellOff, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore } from '@/stores/notification.store'
import { notificationService } from '@/services/notification.service'
import { Badge } from '@/components/ui/Badge'
import { clsx } from 'clsx'

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore()
  const navigate = useNavigate()
  const recent = notifications.slice(0, 6)

  const handleMarkAsRead = async (id: number) => {
    markAsRead(id)
    try { await notificationService.markAsRead(id) } catch { /* silencioso */ }
  }

  const handleMarkAllRead = async () => {
    markAllAsRead()
    try { await notificationService.markAllAsRead() } catch { /* silencioso */ }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Notificaciones"
        className={clsx(
          'relative rounded-full p-1.5 transition-colors',
          isOpen ? 'text-brand' : 'text-ink-tertiary hover:text-ink-secondary',
        )}
      >
        <Bell className="h-[19px] w-[19px]" />
        <Badge count={unreadCount} size="md" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-full mt-2 w-80 z-40 animate-slide-up overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-card-lg">

            {/* Header del panel */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">Notificaciones</span>
                {unreadCount > 0 && (
                  <span className="chip bg-brand/10 text-brand">{unreadCount}</span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[0.72rem] font-medium text-brand hover:text-brand-dark transition-colors"
                >
                  Marcar todas
                </button>
              )}
            </div>

            {/* Lista */}
            <div className="max-h-64 divide-y divide-gray-50 overflow-y-auto">
              {recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                    <BellOff className="h-5 w-5 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400">Sin notificaciones</p>
                </div>
              ) : (
                recent.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      handleMarkAsRead(n.id)
                      if (n.tipo === 'queja_nueva' && n.dataExtra?.quejaId) {
                        setIsOpen(false)
                        navigate(`/quejas?quejaId=${n.dataExtra.quejaId}`)
                      } else if (n.dataExtra?.encuestaId || n.dataExtra?.action === 'responder_encuesta') {
                        setIsOpen(false)
                        navigate(n.dataExtra?.encuestaId ? `/mis-encuestas?encuesta=${n.dataExtra.encuestaId}` : '/mis-encuestas')
                      }
                    }}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50',
                      !n.leida && 'bg-brand/[0.03]',
                    )}
                  >
                    <div className={clsx(
                      'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                      n.leida ? 'bg-gray-200' : n.tipo === 'queja_nueva' ? 'bg-orange-500' : 'bg-brand',
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className={clsx(
                        'text-xs leading-snug line-clamp-2',
                        n.leida ? 'text-gray-500' : 'font-medium text-gray-800',
                      )}>
                        {n.mensaje}
                      </p>
                      {n.fecha && (
                        <p className="mt-1 text-[0.65rem] text-gray-400">
                          {new Date(n.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer "ver todas" */}
            {notifications.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2.5">
                <button
                  onClick={() => { setIsOpen(false); navigate('/notificaciones') }}
                  className="flex w-full items-center justify-center gap-1.5 text-[0.72rem] font-medium text-brand hover:text-brand-dark transition-colors py-0.5"
                >
                  Ver todas las notificaciones
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
