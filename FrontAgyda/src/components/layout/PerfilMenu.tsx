import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, LogOut, Music2, Headset, Loader2, Coffee, GraduationCap, Hand, Play, Square } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'
import { useMusicStore } from '@/stores/music.store'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { disconnectSocket } from '@/lib/socket'
import { api } from '@/lib/axios'
import { livechatService } from '@/services/livechat.service'
import { Avatar } from '@/components/ui/Avatar'

interface PausaActiva { tiempo_id: number; status_id: number }

// Pausas por REST (el baño se maneja aparte, en PausaWidget, porque necesita
// socket + alertas de colisión). Aquí van Comida / Capacitación / Permiso.
const PAUSAS = [
  { statusId: 2, label: 'Comida',       icon: Coffee,         color: 'text-orange-500' },
  { statusId: 5, label: 'Capacitación', icon: GraduationCap,  color: 'text-violet-500' },
  { statusId: 6, label: 'Permiso',      icon: Hand,           color: 'text-emerald-500' },
]

export function PerfilMenu() {
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const { isAllowed } = useModuleAccess()
  const qc = useQueryClient()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const rol = (user?.tipoUsuario ?? '').toUpperCase()
  const esAgenteLivechat = ['AD', 'TI', 'CC'].includes(rol) && isAllowed('livechat')

  /* ── Música ── */
  const bubbleVisible = useMusicStore((s) => s.bubbleVisible)
  const setBubbleVisible = useMusicStore((s) => s.setBubbleVisible)
  const puedeMusica = rol !== 'CC' && rol !== 'CL' && isAllowed('musica')

  /* ── Pausa activa (REST) ── */
  const { data: pausaActiva } = useQuery({
    queryKey: ['pausa-activa'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: PausaActiva | null }>('/reports/pausa/activa')
      return data.data
    },
    staleTime: 10_000,
  })

  const togglePausa = useMutation({
    mutationFn: async (statusId: number) => {
      if (pausaActiva?.status_id === statusId) {
        await api.post('/reports/pausa/terminar', { statusId })
      } else {
        await api.post('/reports/pausa/iniciar', { statusId })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pausa-activa'] }),
    onError: () => toast.error('No se pudo cambiar la pausa'),
  })

  /* ── Livechat disponible ── */
  const { data: miEstado } = useQuery({
    queryKey: ['livechat-mi-estado'],
    queryFn: () => livechatService.getMiEstado(),
    enabled: esAgenteLivechat,
    staleTime: 10_000,
  })

  const toggleDisponible = useMutation({
    mutationFn: (v: boolean) => livechatService.setDisponible(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['livechat-mi-estado'] }),
    onError: () => toast.error('No se pudo cambiar tu estado'),
  })

  const logout = () => {
    disconnectSocket()
    clearSession()
    window.location.replace('/login')
  }

  if (!user) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Perfil"
        className={clsx('rounded-full transition-transform', open ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
      >
        <Avatar src={user.perfilFotoUrl} name={user.nombres} size="sm" ring="brand" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 z-40 animate-slide-up overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-card-lg">
          {/* Cabecera */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
            <Avatar src={user.perfilFotoUrl} name={user.nombres} size="md" ring="brand" />
            <div className="min-w-0">
              <p className="truncate text-[0.85rem] font-bold text-gray-900">{user.perfilAlias ?? user.nombres}</p>
              <p className="text-[0.68rem] text-gray-400">{user.usuario} · {user.tipoUsuario}</p>
            </div>
          </div>

          {/* Estado de pausa */}
          <div className="border-b border-gray-50 px-3 py-2.5">
            <p className="mb-1.5 px-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Estado de pausa</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PAUSAS.map((p) => {
                const Icon = p.icon
                const activa = pausaActiva?.status_id === p.statusId
                const cargando = togglePausa.isPending && togglePausa.variables === p.statusId
                return (
                  <button
                    key={p.statusId}
                    onClick={() => togglePausa.mutate(p.statusId)}
                    disabled={togglePausa.isPending || (!!pausaActiva && !activa)}
                    className={clsx(
                      'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[0.66rem] font-semibold transition-colors disabled:opacity-40',
                      activa ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {cargando ? <Loader2 className="h-4 w-4 animate-spin" />
                      : activa ? <Square className="h-4 w-4" />
                      : <Icon className={clsx('h-4 w-4', p.color)} />}
                    {activa ? 'Terminar' : p.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 px-1 text-[0.6rem] text-gray-400">El baño se gestiona desde su burbuja flotante.</p>
          </div>

          {/* Chat en vivo */}
          {esAgenteLivechat && (
            <button
              onClick={() => toggleDisponible.mutate(!miEstado?.disponible)}
              disabled={toggleDisponible.isPending}
              className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', miEstado?.disponible ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400')}>
                <Headset className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8rem] font-semibold text-gray-800">Chat en vivo</p>
                <p className="text-[0.66rem] text-gray-400">{miEstado?.disponible ? 'Recibiendo conversaciones' : 'No recibes conversaciones'}</p>
              </div>
              <span className={clsx('relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors', miEstado?.disponible ? 'bg-emerald-500' : 'bg-gray-200')}>
                {toggleDisponible.isPending
                  ? <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
                  : <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', miEstado?.disponible ? 'translate-x-4' : 'translate-x-0')} />}
              </span>
            </button>
          )}

          {/* Burbuja de música */}
          {puedeMusica && (
            <button
              onClick={() => setBubbleVisible(!bubbleVisible)}
              className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', bubbleVisible ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-400')}>
                {bubbleVisible ? <Music2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8rem] font-semibold text-gray-800">Burbuja de música</p>
                <p className="text-[0.66rem] text-gray-400">{bubbleVisible ? 'Visible en pantalla' : 'Oculta'}</p>
              </div>
              <span className={clsx('relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors', bubbleVisible ? 'bg-brand' : 'bg-gray-200')}>
                <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', bubbleVisible ? 'translate-x-4' : 'translate-x-0')} />
              </span>
            </button>
          )}

          {/* Acciones */}
          <Link
            to="/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-[0.8rem] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <User className="h-4 w-4 text-gray-400" /> Mi perfil
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 border-t border-gray-50 px-4 py-3 text-[0.8rem] font-semibold text-red-500 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
