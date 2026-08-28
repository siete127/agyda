import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react'
import { useNotificationStore, type NotificationItem } from '@/stores/notification.store'
import { notificationService } from '@/services/notification.service'
import { notificationTarget } from '@/lib/notificationTarget'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { api } from '@/lib/axios'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const TIPO_CONFIG: Record<string, { label: string; dot: string }> = {
  ticket:           { label: 'Ticket',    dot: 'bg-brand' },
  proyecto:         { label: 'Proyecto',  dot: 'bg-purple-500' },
  tarea_completada: { label: 'Tarea',     dot: 'bg-emerald-500' },
  tarea:            { label: 'Tarea',     dot: 'bg-emerald-400' },
  permiso:          { label: 'Permiso',   dot: 'bg-emerald-500' },
  vacacion:         { label: 'Vacación',  dot: 'bg-cyan-500' },
  noticia:          { label: 'Noticia',   dot: 'bg-orange-400' },
  encuesta:         { label: 'Encuesta',  dot: 'bg-yellow-500' },
  sistema:          { label: 'Sistema',   dot: 'bg-gray-400' },
  queja_nueva:      { label: 'Queja',     dot: 'bg-orange-500' },
  queja:            { label: 'Queja',     dot: 'bg-orange-500' },
}

function getDot(tipo: string | null) {
  const key = Object.keys(TIPO_CONFIG).find((k) => tipo?.toLowerCase().includes(k))
  return TIPO_CONFIG[key ?? '']?.dot ?? 'bg-gray-300'
}

function getLabel(tipo: string | null) {
  const key = Object.keys(TIPO_CONFIG).find((k) => tipo?.toLowerCase().includes(k))
  return TIPO_CONFIG[key ?? '']?.label ?? (tipo ?? 'General')
}

function fmtFecha(fecha: string | null) {
  if (!fecha) return ''
  const d = new Date(fecha)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'Ahora'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)}d`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Skeleton ── */
function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-5 py-4 animate-pulse">
      <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-gray-100 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-3/4 rounded-lg bg-gray-100" />
        <div className="h-2.5 w-1/4 rounded-full bg-gray-100" />
      </div>
      <div className="h-4 w-12 rounded-full bg-gray-100 flex-shrink-0" />
    </div>
  )
}

export function NotificacionesPage() {
  const [confirmLimpiar, setConfirmLimpiar] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { notifications, unreadCount, setNotifications, markAsRead, markAllAsRead } = useNotificationStore()

  const { isLoading, refetch } = useQuery({
    queryKey: ['notificaciones-full', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const items = await notificationService.getNotifications(user.id)
      setNotifications(items)
      return items
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  })

  const marcarLeida = useMutation({
    mutationFn: (id: number) => notificationService.markAsRead(id),
    onSuccess: (_d, id) => markAsRead(id),
  })

  const marcarTodas = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => { markAllAsRead(); toast.success('Todas marcadas como leídas') },
    onError: () => toast.error('Error al marcar'),
  })

  const eliminarLeidas = useMutation({
    mutationFn: () => api.delete(`/notificaciones/leidas/${user?.id}`),
    onSuccess: async () => {
      await refetch()
      toast.success('Notificaciones leídas eliminadas')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const noLeidas  = notifications.filter((n) => !n.leida)
  const leidas    = notifications.filter((n) => n.leida)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Notificaciones</h1>
                <p className="mt-0.5 text-xs text-white/50">
                  {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  isLoading={marcarTodas.isPending}
                  onClick={() => marcarTodas.mutate()}
                  className="bg-white/10 text-white hover:bg-white/20 !shadow-none border-0 text-[0.78rem] py-1.5 px-3"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
                </Button>
              )}
              {leidas.length > 0 && (
                <Button
                  isLoading={eliminarLeidas.isPending}
                  onClick={() => setConfirmLimpiar(true)}
                  className="bg-white/10 text-white hover:bg-red-500/30 !shadow-none border-0 text-[0.78rem] py-1.5 px-3"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpiar leídas
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="card divide-y divide-gray-50">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-24">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
            <BellOff className="h-8 w-8 text-gray-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin notificaciones</p>
            <p className="text-xs text-gray-400 mt-0.5">Estás al día con todo</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">

          {/* No leídas */}
          {noLeidas.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 w-1 rounded-full bg-brand" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Sin leer</h2>
                <span className="chip bg-brand/10 text-brand text-[0.65rem]">{noLeidas.length}</span>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {noLeidas.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={() => marcarLeida.mutate(n.id)} onNavigate={navigate} />
                ))}
              </div>
            </section>
          )}

          {/* Leídas */}
          {leidas.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 w-1 rounded-full bg-gray-300" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Leídas</h2>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden opacity-70">
                {leidas.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={() => {}} onNavigate={navigate} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmLimpiar}
        onClose={() => setConfirmLimpiar(false)}
        onConfirm={() => eliminarLeidas.mutate()}
        title="Limpiar notificaciones leídas"
        message="¿Seguro que deseas eliminar todas las notificaciones leídas?"
        confirmLabel="Limpiar"
        isPending={eliminarLeidas.isPending}
      />
    </div>
  )
}

/* ── Fila de notificación ── */
function NotifRow({ n, onRead, onNavigate }: { n: NotificationItem; onRead: () => void; onNavigate: (path: string) => void }) {
  const target = notificationTarget(n)
  const isNavegable = !!target

  function handleClick() {
    if (!n.leida) onRead()
    if (target) onNavigate(target)
  }

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'flex items-start gap-3 px-5 py-4 transition-colors',
        isNavegable ? 'cursor-pointer' : (!n.leida ? 'cursor-pointer' : ''),
        !n.leida ? 'bg-brand/[0.015] hover:bg-brand/[0.03]' : 'bg-card hover:bg-gray-50/50',
      )}
    >
      <div className={clsx('mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full', getDot(n.tipo))} />
      <div className="flex-1 min-w-0">
        <p className={clsx(
          'text-[0.82rem] leading-snug',
          n.leida ? 'text-gray-500' : 'font-semibold text-gray-800',
        )}>
          {n.mensaje}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {n.tipo && (
            <span className="chip bg-gray-100 text-gray-500 text-[0.6rem] py-0.5">
              {getLabel(n.tipo)}
            </span>
          )}
          {n.fecha && (
            <span className="text-[0.65rem] text-gray-400">{fmtFecha(n.fecha)}</span>
          )}
        </div>
      </div>
      {!n.leida && (
        <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand shadow-[0_0_6px_rgba(27,79,216,0.5)]" />
      )}
    </div>
  )
}
