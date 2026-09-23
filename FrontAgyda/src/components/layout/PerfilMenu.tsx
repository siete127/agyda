import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, LogOut, Music2, Power, Loader2, Play, Square, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'
import { useMusicStore } from '@/stores/music.store'
import { useMascotaStore } from '@/stores/mascota.store'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { disconnectSocket, getSocket } from '@/lib/socket'
import { api } from '@/lib/axios'
import { detectarGenero } from '@/lib/genero'
import { livechatService } from '@/services/livechat.service'
import { Avatar } from '@/components/ui/Avatar'
import { usePausaTipos, usePausaModulos } from '@/hooks/usePausaTipos'
import { limitePausa } from '@/types/pausaTipos.types'

interface PausaActiva { tiempo_id: number; status_id: number; fecha_inicio: string; duracionSegundos: number }
interface BanioSlot { ocupado: boolean; porUsuario: string | null; porNombre: string | null }
interface BanioStatus { hombres: BanioSlot; mujeres: BanioSlot }

// Los estados son los tipos de pausa configurados (Configuración → Tipos de
// pausa). El baño (tipo con semáforo de ocupación) además se refleja/dispara
// por socket; el resto es solo REST (/reports/pausa/*).

// Tinte del color del tipo: translúcido (sufijo alfa hex) para que funcione
// sobre fondo claro u oscuro sin quedar "en blanco" en modo noche.
function acento(color: string) {
  return {
    card: { borderColor: `${color}66`, background: `${color}1A` },
    text: { color },
    solid: { background: color },
  }
}

function fmtCronometro(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`
}

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
  const { activos: tiposActivos, porId: tipoPorId, banioId } = usePausaTipos()
  const { puedePausar } = usePausaModulos()

  /* ── Música ── */
  const bubbleVisible = useMusicStore((s) => s.bubbleVisible)
  const setBubbleVisible = useMusicStore((s) => s.setBubbleVisible)
  const { mascota } = usePersonalizacion()
  const mascotaFlotanteHabilitada = mascota.flotante.habilitado
  const mascotaVisible = useMascotaStore((s) => s.flotanteVisible)
  const setMascotaVisible = useMascotaStore((s) => s.setFlotanteVisible)
  const puedeMusica = rol !== 'CC' && rol !== 'CL' && isAllowed('musica')

  /* ── Pausa activa (REST) ── */
  const { data: pausaActiva, refetch: refetchPausa } = useQuery({
    queryKey: ['pausa-activa'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: PausaActiva | null }>('/reports/pausa/activa')
      return data.data
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    enabled: puedePausar,
  })

  /* ── Acumulado de HOY por estado (segundos) ── */
  const { data: acumHoy = {} as Record<number, number>, dataUpdatedAt: acumUpdatedAt, refetch: refetchAcum } = useQuery({
    queryKey: ['pausa-hoy'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: Record<number, number> }>('/reports/pausa/hoy')
      return data.data
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    enabled: puedePausar,
  })

  // Al abrir el menú, traer el estado fresco de inmediato.
  useEffect(() => {
    if (open && puedePausar) { refetchPausa(); refetchAcum() }
  }, [open, puedePausar, refetchPausa, refetchAcum])

  /* ── Baño (socket) ── */
  const esF = user?.genero ? user.genero === 'F' : detectarGenero(user?.nombres ?? '') === 'F'
  const miKey = esF ? 'mujeres' : 'hombres'
  const [banio, setBanio] = useState<BanioSlot | null>(null)
  useEffect(() => {
    const sock = getSocket()
    const onStatus = (data: BanioStatus) => setBanio(data[miKey])
    sock.on('banio:status', onStatus)
    if (sock.connected) sock.emit('banio:get')
    return () => { sock.off('banio:status', onStatus) }
  }, [miKey])

  const myIdStr = String(user?.id ?? '')
  const banioMio = !!banio?.ocupado && String(banio.porUsuario) === myIdStr
  const banioBloqueado = !!banio?.ocupado && !banioMio

  // Cuando el socket confirma que entré/salí del baño, refrescar las queries
  // REST (el socket escribe la fila async). Dos refetches: uno rápido y uno
  // de respaldo por si la escritura tardó.
  useEffect(() => {
    if (!puedePausar) return
    const run = () => { refetchPausa(); refetchAcum() }
    const a = setTimeout(run, 400)
    const b = setTimeout(run, 1500)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [banioMio, puedePausar, refetchPausa, refetchAcum])

  /* ── Estado activo unificado + cambio ── */
  const [loadingStatus, setLoadingStatus] = useState<number | null>(null)
  // statusId activo: baño por socket, resto por la query REST.
  const statusActivo = banioMio ? banioId : (pausaActiva?.status_id ?? null)

  const emitBanioToggle = () => {
    const sock = getSocket()
    const payload = { userId: user?.id ?? null, userName: user?.nombres?.split(' ').slice(0, 2).join(' ') ?? 'Usuario' }
    if (sock.connected) sock.emit('banio:toggle', payload)
    else throw new Error('sin conexión')
  }

  const cambiarEstado = async (statusId: number) => {
    if (loadingStatus !== null) return
    if (statusId === banioId && banioBloqueado) return
    // El único estado "activo" real: baño por socket, resto por la query REST.
    const activo = statusActivo
    const terminar = activo === statusId
    setLoadingStatus(statusId)
    try {
      if (statusId === banioId) {
        // Si venía de otra pausa (comida/capac/permiso), cerrarla primero
        // para no quedar con dos filas abiertas.
        if (activo !== null && activo !== banioId) {
          await api.post('/reports/pausa/terminar', { statusId: activo }).catch(() => {})
        }
        // Baño: solo socket (el handler banio:toggle escribe USUARIO_TIEMPOS).
        emitBanioToggle()
      } else {
        // Si venía del baño, salir primero (el socket no se entera de que
        // iniciarPausa cerró la fila del baño, quedaría "pegado").
        if (activo === banioId && banioMio) { try { emitBanioToggle() } catch { /* seguimos */ } }
        await api.post(terminar ? '/reports/pausa/terminar' : '/reports/pausa/iniciar', { statusId })
        qc.invalidateQueries({ queryKey: ['pausa-activa'] })
      }
    } catch { toast.error('No se pudo cambiar el estado') }
    finally { setLoadingStatus(null) }
  }

  /* ── Cronómetro del estado activo ────────────────────────────
     El contador (izquierda) = ACUMULADO DE HOY para ese estado.
     `acumHoy[st]` viene del backend (SUM de segundos del día, incluye la
     sesión abierta hasta el instante `acumUpdatedAt`). El contador sigue
     subiendo: acumHoy[st] + (ahora − acumUpdatedAt). Como acumHoy y
     acumUpdatedAt se refrescan juntos, la suma es estable entre refetches. */
  const baseSeg = statusActivo !== null ? (acumHoy[statusActivo] ?? 0) : 0
  const baseAtMs = acumUpdatedAt
  const hayDato = statusActivo !== null && pausaActiva !== undefined

  const [elapsed, setElapsed] = useState<number | null>(null)
  useEffect(() => {
    if (statusActivo === null || !hayDato) {
      setElapsed(null)  // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    const tick = () => setElapsed(baseSeg + Math.max(0, Math.floor((Date.now() - baseAtMs) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [statusActivo, hayDato, baseSeg, baseAtMs])

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
        <Avatar
          src={user.perfilFotoUrl}
          name={user.nombres}
          size="sm"
          ring="brand"
          statusDot={esAgenteLivechat ? (miEstado?.disponible ? 'online' : 'offline') : undefined}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 z-40 animate-slide-up overflow-hidden rounded-2xl border border-gray-200 bg-card shadow-card-lg">
          {/* Cabecera */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
            <Avatar
              src={user.perfilFotoUrl}
              name={user.nombres}
              size="md"
              ring="brand"
              statusDot={esAgenteLivechat ? (miEstado?.disponible ? 'online' : 'offline') : undefined}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.85rem] font-bold text-gray-900">{user.perfilAlias ?? user.nombres}</p>
              <p className="text-[0.68rem] text-gray-400">{user.usuario} · {user.tipoUsuario}</p>
              {esAgenteLivechat && (
                <p className={clsx('mt-0.5 text-[0.66rem] font-semibold', miEstado?.disponible ? 'text-emerald-500' : 'text-gray-400')}>
                  {miEstado?.disponible ? 'Ahora estás en línea' : 'Ahora estás desconectado'}
                </p>
              )}
            </div>
            {esAgenteLivechat && (
              <button
                onClick={() => toggleDisponible.mutate(!miEstado?.disponible)}
                disabled={toggleDisponible.isPending}
                title={miEstado?.disponible ? 'Ponerme sin conexión' : 'Ponerme en línea'}
                className={clsx(
                  'ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
                  miEstado?.disponible ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                )}
              >
                {toggleDisponible.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              </button>
            )}
          </div>

          {/* Estado de pausa — solo con el permiso reports:gestionar-pausas (y la empresa con el módulo) */}
          {puedePausar && (
          <div className="border-b border-gray-50 px-3 py-2.5">
            <p className="mb-1.5 px-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Estado de pausa</p>

            {statusActivo !== null ? (
              /* ── Un estado activo: ocupa todo el ancho, con cronómetro ── */
              (() => {
                // Puede ser un tipo ya desactivado (se inició antes): se busca en todos.
                const est = tipoPorId(statusActivo)
                const a = acento(est?.color ?? '#6B7280')
                const esBanio = statusActivo === banioId
                const limite = limitePausa(est, rol, 'asistencia') // minutos, o null
                const limiteSeg = limite !== null ? limite * 60 : null
                const seg = elapsed ?? 0                              // acumulado de HOY
                const restante = limiteSeg !== null ? Math.max(0, limiteSeg - seg) : null
                const excedido = limiteSeg !== null && seg >= limiteSeg
                return (
                  <div className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2.5', excedido && 'border-red-500/50 bg-red-500/10')}
                    style={excedido ? undefined : a.card}>
                    <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-white', excedido && 'bg-red-500')}
                      style={excedido ? undefined : a.solid}>
                      <span className="text-lg leading-none">{esBanio ? (esF ? '🚺' : '🚹') : (est?.emoji ?? '⏸️')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-[0.8rem] font-bold leading-tight', excedido && 'text-red-500')} style={excedido ? undefined : a.text}>{est?.etiqueta ?? 'Pausa'}</p>
                      <p className={clsx('mt-0.5 font-mono text-[0.9rem] font-bold tabular-nums', excedido && 'text-red-500')} style={excedido ? undefined : a.text}>
                        {/* izquierda: acumulado de hoy (sube) · derecha: límite − acumulado (baja a 0) */}
                        {elapsed === null ? '··:··' : fmtCronometro(seg)}
                        {restante !== null && <span className="opacity-60"> / {elapsed === null ? '··:··' : fmtCronometro(restante)}</span>}
                      </p>
                      {limiteSeg !== null && (
                        <p className="mt-0.5 text-[0.6rem] text-gray-400">
                          {excedido ? 'Excediste tu tiempo del día' : `usado hoy · límite diario ${fmtCronometro(limiteSeg)}`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => cambiarEstado(statusActivo)}
                      disabled={loadingStatus !== null}
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[0.72rem] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={a.solid}
                    >
                      {loadingStatus !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                      Terminar
                    </button>
                  </div>
                )
              })()
            ) : (
              /* ── Sin estado activo: un botón por tipo de pausa activo ── */
              <div className="grid grid-cols-2 gap-1.5">
                {tiposActivos.map((e) => {
                  const esBanio = e.statusId === banioId
                  const bloqueado = esBanio && banioBloqueado
                  const cargando = loadingStatus === e.statusId
                  return (
                    <button
                      key={e.statusId}
                      onClick={() => cambiarEstado(e.statusId)}
                      disabled={loadingStatus !== null || bloqueado}
                      title={bloqueado ? `${banio?.porNombre ?? 'Alguien'} está en el baño` : undefined}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2 text-[0.72rem] font-semibold text-gray-600 transition-colors hover:border-gray-300 disabled:opacity-40"
                    >
                      {cargando ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <span className="text-base leading-none">{esBanio ? (esF ? '🚺' : '🚹') : e.emoji}</span>}
                      <span className="truncate">{bloqueado ? 'Baño ocupado' : e.etiqueta}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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

          {/* Mascota flotante — solo si la empresa la habilitó */}
          {mascotaFlotanteHabilitada && (
            <button
              onClick={() => setMascotaVisible(!mascotaVisible)}
              className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', mascotaVisible ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-400')}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8rem] font-semibold text-gray-800">Mascota flotante</p>
                <p className="text-[0.66rem] text-gray-400">{mascotaVisible ? 'Visible en pantalla' : 'Oculta'}</p>
              </div>
              <span className={clsx('relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors', mascotaVisible ? 'bg-violet-600' : 'bg-gray-200')}>
                <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', mascotaVisible ? 'translate-x-4' : 'translate-x-0')} />
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
            className="flex w-full items-center gap-3 border-t border-gray-50 px-4 py-3 text-[0.8rem] font-semibold text-red-500 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
