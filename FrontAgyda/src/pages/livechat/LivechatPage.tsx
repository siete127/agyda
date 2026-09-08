import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, User, Users, UserCheck, Clock, CheckCircle2, Loader2, ArrowRightLeft, FileText, Headset } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { ccService } from '@/services/cc.service'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { useCurrentUser } from '@/hooks/useAuth'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { LivechatConversacion, LivechatMensaje, LivechatConfig } from '@/types/livechat.types'
import { parseLivechatMensaje } from '@/types/livechat.types'
import { CANAL_ICONO, CANAL_LABEL } from '@/types/cc.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { CampaniasModal } from './CampaniasModal'
import { UsuariosCampaniasModal } from './UsuariosCampaniasModal'
import { HistorialConversacionesPanel } from './HistorialConversacionesPanel'
import { AsesoresPanel } from '@/pages/asesores/AsesoresPanel'
import { CCChatPanel } from '@/pages/contact-center/CCChatPanel'
import {
  type ItemBandeja, idUnificado, nombreUnificado, subtituloUnificado,
  fechaInicioUnificado, posicionColaUnificado,
} from './bandejaUnificada'

// "Mi día — estado y tiempos personales" en modal, para no salir de Chat en
// Vivo a revisar el propio estado/pausas — reusa el mismo panel que la ruta
// /operaciones/asesores, con el Modal genérico de ui/ (aquí sí es apropiado:
// AsesoresPanel es contenido de cards normal, no una bandeja con su propio
// scroll interno como LivechatPage).
function AsesoresModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Mi día" size="lg">
      <AsesoresPanel />
    </Modal>
  )
}

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

function HistorialModal({ onClose, puedeSupervisar, agenteId }: { onClose: () => void; puedeSupervisar: boolean; agenteId?: number }) {
  return (
    <Modal isOpen onClose={onClose} title="Historial de conversaciones" size="xl">
      <HistorialConversacionesPanel puedeSupervisar={puedeSupervisar} agenteId={agenteId} />
    </Modal>
  )
}

// Tiempo transcurrido desde que el visitante entró a la cola, en formato corto
// ("2 min", "1 h 05 min") — ayuda a un supervisor a ver de un vistazo quién
// lleva más tiempo esperando sin tener que restar fechas mentalmente.
function minutosEsperando(iso: string): number {
  const inicio = new Date(iso).getTime()
  if (Number.isNaN(inicio)) return 0
  return Math.max(0, Math.floor((Date.now() - inicio) / 60000))
}

function tiempoEsperando(iso: string): string {
  const minutos = minutosEsperando(iso)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `${horas} h ${String(resto).padStart(2, '0')} min`
}

// Bandeja consolidada de TODOS los leads en espera (de cualquier agente, no
// solo los propios) — la lista lateral ya muestra "esperando" pero mezclada
// con las conversaciones propias y sin tanto detalle; esta vista es para ver
// de un vistazo si se está acumulando gente sin atender, y tomarla directo
// sin pasar primero por el detalle.
function BandejaEsperaModal({ onClose, onTomada }: { onClose: () => void; onTomada: (conversacionId: number) => void }) {
  const { data: esperando = [], isLoading, refetch } = useQuery({
    queryKey: ['livechat-bandeja-espera'],
    queryFn: () => livechatService.getMisConversaciones('esperando'),
    refetchInterval: 8_000,
  })

  const tomar = useMutation({
    mutationFn: (conversacionId: number) => livechatService.tomarConversacion(conversacionId),
    onSuccess: (_data, conversacionId) => {
      toast.success('Conversación tomada')
      refetch()
      onTomada(conversacionId)
      onClose()
    },
    onError: () => toast.error('No se pudo tomar la conversación (quizás ya fue asignada)'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Bandeja de espera" size="lg">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5">
          <Users size={15} className="text-brand shrink-0 mt-0.5" />
          <p className="text-xs text-ink-secondary leading-relaxed">
            Todos los leads en cola ahora mismo, sin importar a qué agente le toquen. Cualquiera puede tomarlos.
            {!isLoading && esperando.length > 0 && (
              <span className="text-ink-tertiary"> · {esperando.length} esperando</span>
            )}
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <div className="flex justify-center py-14"><Spinner /></div>
          ) : esperando.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                <CheckCircle2 size={18} />
              </div>
              <p className="text-sm text-ink-tertiary">Nadie esperando ahora mismo</p>
            </div>
          ) : (
            esperando
              .slice()
              .sort((a, b) => (a.posicionCola ?? 999) - (b.posicionCola ?? 999))
              .map((c) => {
                const minutos = minutosEsperando(c.fechaInicio)
                const urgente = minutos >= 10
                const critico = minutos >= 15
                return (
                  <div
                    key={c.id}
                    className={clsx(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                      critico
                        ? 'border-red-500/30 bg-red-500/[0.06]'
                        : urgente
                        ? 'border-amber-500/30 bg-amber-500/[0.06]'
                        : 'border-surface-border bg-card',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        critico ? 'bg-red-500/15 text-red-500' : urgente ? 'bg-amber-500/15 text-amber-500' : 'bg-brand/15 text-brand',
                      )}
                    >
                      {c.posicionCola ?? '—'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink truncate">{c.visitanteNombre || 'Anónimo'}</p>
                        {c.posicionCola === 1 && (
                          <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                            Siguiente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-tertiary truncate">
                        {c.visitanteEmail || c.visitanteTelefono || 'Sin contacto'}
                        {c.motivo ? ` · ${c.motivo}` : ''}
                      </p>
                    </div>

                    <div
                      className={clsx(
                        'flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                        critico ? 'bg-red-500/15 text-red-500' : urgente ? 'bg-amber-500/15 text-amber-500' : 'text-ink-tertiary',
                      )}
                    >
                      <Clock size={12} />
                      {tiempoEsperando(c.fechaInicio)}
                    </div>

                    <Button size="sm" onClick={() => tomar.mutate(c.id)} disabled={tomar.isPending}>
                      Tomar
                    </Button>
                  </div>
                )
              })
          )}
        </div>
      </div>
    </Modal>
  )
}

// Solo lectura — un supervisor/admin ve el contenido de conversaciones de
// CUALQUIER agente, no solo las propias (a diferencia del panel principal,
// que solo maneja "mis conversaciones"). Reusa GET /conversaciones/:id, que
// ya no filtra por dueño en el backend.
function SupervisionModal({ onClose }: { onClose: () => void }) {
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)
  const qc = useQueryClient()

  const { data: conversaciones = [], isLoading } = useQuery({
    queryKey: ['livechat-supervision-activas'],
    queryFn: () => livechatService.getConversacionesActivasSupervision(),
    // El polling queda como red de respaldo — el refresh real viene de los
    // eventos de socket de abajo, que actualizan la lista al instante en vez
    // de esperar hasta 8s a que alguien tome/cierre/transfiera una conversación.
    refetchInterval: 8_000,
  })

  // Refresca la lista al instante cuando cambia el estado de cualquier
  // conversación — así un supervisor ve de inmediato quién tomó un chat de
  // la bandeja de espera, sin esperar el próximo poll.
  const refrescarLista = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['livechat-supervision-activas'] })
  }, [qc])
  useSocketEvent('livechat:conversacion_tomada', refrescarLista)
  useSocketEvent('livechat:nueva_en_cola', refrescarLista)
  useSocketEvent('livechat:conversacion_cerrada', refrescarLista)
  useSocketEvent('livechat:conversacion_transferida', refrescarLista)

  const { data: detalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['livechat-supervision-detalle', seleccionadaId],
    queryFn: () => livechatService.getConversacion(seleccionadaId!),
    enabled: seleccionadaId != null,
    refetchInterval: 5_000,
  })

  return (
    <Modal isOpen onClose={onClose} title="Supervisión — conversaciones activas" size="xl">
      <div className="grid grid-cols-[1fr_1.4fr] gap-3" style={{ height: '65vh' }}>
        <div className="overflow-y-auto rounded-xl border border-gray-200">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : conversaciones.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No hay conversaciones activas ni en espera.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {conversaciones.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSeleccionadaId(c.id)}
                  className={clsx(
                    'block w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50',
                    seleccionadaId === c.id && 'bg-blue-50',
                  )}
                >
                  <p className="font-medium text-gray-800">{c.visitanteNombre || 'Visitante'}</p>
                  <p className="text-xs text-gray-500">
                    {c.agenteNombre ? `Atiende: ${c.agenteNombre}` : 'Sin agente asignado'} ·{' '}
                    <span className={clsx('font-semibold', c.estado === 'activa' ? 'text-emerald-600' : 'text-amber-600')}>
                      {c.estado === 'activa' ? 'Activa' : 'En espera'}
                    </span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-y-auto rounded-xl border border-gray-200 p-3">
          {seleccionadaId == null ? (
            <p className="py-10 text-center text-sm text-gray-400">Selecciona una conversación para ver los mensajes.</p>
          ) : loadingDetalle || !detalle ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <div className="space-y-2">
              {detalle.mensajes.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Sin mensajes todavía.</p>
              ) : (
                detalle.mensajes.map((m) => (
                  <div key={m.id} className={clsx('rounded-lg px-3 py-2 text-sm', m.emisor === 'agente' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8')}>
                    <p className="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500">{m.emisor}</p>
                    <p className="text-gray-800">{m.contenido}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function AgentesEstadoModal({ onClose }: { onClose: () => void }) {
  const { data: agentes = [], isLoading } = useQuery({
    queryKey: ['livechat-agentes-estado'],
    queryFn: () => livechatService.getAgentesEstado(),
    refetchInterval: 8_000,
  })

  const disponibles = agentes.filter((a) => a.online && a.disponible).length

  return (
    <Modal isOpen onClose={onClose} title="Agentes de Chat en Vivo" size="lg">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5">
          <UserCheck size={15} className="text-brand shrink-0 mt-0.5" />
          <p className="text-xs text-ink-secondary leading-relaxed">
            Solo los marcados como <span className="font-semibold text-emerald-500">Disponible</span> pueden recibir la
            siguiente conversación (bot escalando o cola liberándose).
            {!isLoading && agentes.length > 0 && (
              <span className="text-ink-tertiary"> · {disponibles} de {agentes.length} disponibles ahora</span>
            )}
          </p>
        </div>
        <div className="border border-surface-border rounded-xl overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : agentes.length === 0 ? (
              <p className="text-center text-sm text-ink-tertiary py-10">Ningún agente ha usado Chat en Vivo todavía</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs uppercase text-ink-tertiary sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Agente</th>
                    <th className="text-left px-4 py-2 font-semibold">Estado</th>
                    <th className="text-left px-4 py-2 font-semibold">Chats activos</th>
                    <th className="text-left px-4 py-2 font-semibold">Última conexión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {agentes.map((a) => {
                    const puedeRecibir = a.online && a.disponible
                    return (
                      <tr key={a.usuarioId} className="hover:bg-surface/60">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                              {a.nombre.trim().charAt(0).toUpperCase() || '?'}
                            </span>
                            <span className="font-medium text-ink">{a.nombre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                              puedeRecibir
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : a.online
                                ? 'bg-amber-500/15 text-amber-500'
                                : 'bg-ink-tertiary/15 text-ink-tertiary',
                            )}
                          >
                            <span
                              className={clsx(
                                'h-1.5 w-1.5 rounded-full',
                                puedeRecibir ? 'bg-emerald-500' : a.online ? 'bg-amber-500' : 'bg-ink-tertiary',
                              )}
                            />
                            {puedeRecibir ? 'Disponible' : a.online ? 'En línea, no disponible' : 'Desconectado'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={clsx(
                            'inline-flex items-center justify-center min-w-[1.5rem] rounded-full px-2 py-0.5 text-xs font-semibold',
                            a.conversacionesActivas > 0 ? 'bg-brand/15 text-brand' : 'text-ink-tertiary',
                          )}>
                            {a.conversacionesActivas}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-tertiary whitespace-nowrap">{formatFecha(a.ultimaConexion)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// Beep corto sintetizado (Web Audio API, sin archivo de audio externo que
// mantener) para avisar de una conversación nueva sin que el agente tenga
// que estar viendo la pantalla. Los navegadores bloquean audio sin gesto
// previo del usuario; como esto solo suena después de que el agente ya
// interactuó con la página (togglear disponible, hacer clic, etc.), el
// contexto ya está desbloqueado en la práctica.
function reproducirAlertaNuevaConversacion() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const tono = (frecuencia: number, inicio: number, duracion: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frecuencia
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio)
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + inicio + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracion)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + inicio)
      osc.stop(ctx.currentTime + inicio + duracion + 0.02)
    }
    tono(880, 0, 0.12)
    tono(1175, 0.14, 0.16)
  } catch {
    // Silencioso: la alerta visual (toast) ya cubre el aviso si el audio falla.
  }
}

function formatHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // timeZone explícito: sin esto, la hora depende de cómo esté configurado
  // el sistema operativo/navegador de quien mire la pantalla, no de México.
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

function ConversacionItem({ item, activa, onClick }: { item: ItemBandeja; activa: boolean; onClick: () => void }) {
  const esperando = item.origen === 'livechat' ? item.data.estado === 'esperando' : item.data.estado === 'en_cola'
  const { pos, total } = posicionColaUnificado(item)
  const canalIcono = item.origen === 'cc' ? (CANAL_ICONO[item.data.tipo] || '💬') : null
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3 border-b border-gray-100 transition-colors',
        activa ? 'bg-blue-50' : 'hover:bg-gray-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium text-sm text-gray-800 truncate">
          {canalIcono && <span className="shrink-0">{canalIcono}</span>}
          {nombreUnificado(item)}
        </span>
        {esperando && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
            <Clock size={11} />
            {pos ? `${pos} de ${total}` : 'Esperando'}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 truncate mt-0.5">{subtituloUnificado(item)}</p>
      <p className="text-xs text-gray-500 truncate mt-0.5">
        {item.origen === 'livechat' ? (item.data.motivo || 'Sin motivo especificado') : (item.data.grupoNombre || CANAL_LABEL[item.data.tipo] || item.data.tipo)}
      </p>
      <p className="text-[11px] text-gray-400 mt-1">{formatHora(fechaInicioUnificado(item))}</p>
    </button>
  )
}

// Fila de la bandeja de espera integrada en el panel lateral: a diferencia de
// ConversacionItem (que navega al detalle), esta se toma directo con un
// botón — son leads sin dueño todavía, cualquier agente puede tomarlos.
function EsperaItem({ item, onTomar, tomando }: { item: ItemBandeja; onTomar: () => void; tomando: boolean }) {
  const fecha = fechaInicioUnificado(item)
  const minutos = minutosEsperando(fecha)
  const urgente = minutos >= 10
  const critico = minutos >= 15
  const { pos } = posicionColaUnificado(item)
  const canalIcono = item.origen === 'cc' ? (CANAL_ICONO[item.data.tipo] || '💬') : null
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-4 py-3 border-b border-gray-100',
        critico ? 'bg-red-50/60' : urgente ? 'bg-amber-50/60' : undefined,
      )}
    >
      <span
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
          critico ? 'bg-red-500/15 text-red-500' : urgente ? 'bg-amber-500/15 text-amber-500' : 'bg-brand/15 text-brand',
        )}
      >
        {canalIcono ?? pos ?? '—'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-gray-800 truncate">{nombreUnificado(item)}</p>
        <p className="text-[11px] text-gray-400 truncate">{subtituloUnificado(item)}</p>
        <p className={clsx('flex items-center gap-1 text-[11px] font-semibold mt-0.5', critico ? 'text-red-500' : urgente ? 'text-amber-600' : 'text-gray-400')}>
          <Clock size={11} />
          {tiempoEsperando(fecha)}
        </p>
      </div>

      <Button size="sm" onClick={onTomar} disabled={tomando} className="shrink-0">
        Tomar
      </Button>
    </div>
  )
}

function ChatPanel({ conversacionId, onCerrada }: { conversacionId: number; onCerrada: () => void }) {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const [mensajes, setMensajes] = useState<LivechatMensaje[]>([])
  const [conv, setConv] = useState<LivechatConversacion | null>(null)
  const [texto, setTexto] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['livechat-conversacion', conversacionId],
    queryFn: () => livechatService.getConversacion(conversacionId),
  })

  useEffect(() => {
    if (data) {
      setConv(data)
      setMensajes(data.mensajes)
    }
  }, [data])

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_livechat_conversation', { conversacionId })

    const onMensaje = (raw: Record<string, unknown>) => {
      const msg = parseLivechatMensaje(raw)
      if (msg.conversacionId !== conversacionId) return
      setMensajes((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    }
    const onTomada = (payload: { conversacionId: number; agenteNombre: string }) => {
      if (payload.conversacionId !== conversacionId) return
      setConv((prev) => (prev ? { ...prev, estado: 'activa', agenteNombre: payload.agenteNombre } : prev))
    }
    const onCerrar = (payload: { conversacionId: number }) => {
      if (payload.conversacionId !== conversacionId) return
      toast('La conversación fue cerrada', { icon: 'ℹ️' })
      onCerrada()
    }
    // El agente ya cerró (motivo elegido); ahora se espera a que el visitante
    // califique — la conversación desaparece del lado del agente igual que
    // un cierre normal (ya no cuenta contra su cupo), pero del lado del
    // visitante sigue "abierta" un momento más.
    const onPendienteCalificacion = (payload: { conversacionId: number }) => {
      if (payload.conversacionId !== conversacionId) return
      toast('Conversación cerrada, esperando calificación del visitante', { icon: '⭐' })
      onCerrada()
    }
    const onTransferida = (payload: { conversacionId: number; agenteNombre: string }) => {
      if (payload.conversacionId !== conversacionId) return
      toast(`Conversación transferida a ${payload.agenteNombre}`, { icon: '↪️' })
      onCerrada()
    }

    socket.on('receive_livechat_message', onMensaje)
    socket.on('livechat:conversacion_tomada', onTomada)
    socket.on('livechat:conversacion_cerrada', onCerrar)
    socket.on('livechat:pendiente_calificacion', onPendienteCalificacion)
    socket.on('livechat:conversacion_transferida', onTransferida)

    return () => {
      socket.emit('leave_livechat_conversation', { conversacionId })
      socket.off('receive_livechat_message', onMensaje)
      socket.off('livechat:conversacion_tomada', onTomada)
      socket.off('livechat:conversacion_cerrada', onCerrar)
      socket.off('livechat:pendiente_calificacion', onPendienteCalificacion)
      socket.off('livechat:conversacion_transferida', onTransferida)
    }
  }, [conversacionId, onCerrada])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const tomar = useMutation({
    mutationFn: () => livechatService.tomarConversacion(conversacionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mis-conversaciones'] })
      qc.invalidateQueries({ queryKey: ['livechat-esperando'] })
      setConv((prev) => (prev ? { ...prev, estado: 'activa', agenteId: user?.id ?? null } : prev))
    },
    onError: () => toast.error('No se pudo tomar la conversación (quizás ya fue asignada)'),
  })

  const enviar = useMutation({
    mutationFn: (contenido: string) => livechatService.enviarMensaje(conversacionId, contenido),
    onSuccess: () => setTexto(''),
    onError: () => toast.error('No se pudo enviar el mensaje'),
  })

  const [cerrarOpen, setCerrarOpen] = useState(false)
  const [motivoCierreId, setMotivoCierreId] = useState<number | null>(null)
  const [comentarioCierre, setComentarioCierre] = useState('')
  const [motivoCierreLibre, setMotivoCierreLibre] = useState('')

  // Motivos de cierre solo existen si la conversación pertenece a un grupo
  // (viene de una campaña) — sin grupo, se mantiene el cierre con texto libre
  // opcional de siempre.
  const { data: motivosCierre = [] } = useQuery({
    queryKey: ['livechat-motivos-cierre', conv?.grupoId],
    queryFn: () => livechatService.getMotivosCierre(conv!.grupoId!),
    enabled: cerrarOpen && !!conv?.grupoId,
  })
  const motivoSeleccionado = motivosCierre.find((m) => m.id === motivoCierreId)

  const cerrar = useMutation({
    mutationFn: () => livechatService.cerrarConversacion(conversacionId, {
      motivoCierreId: motivoCierreId ?? undefined,
      motivoCierre: motivoCierreLibre.trim() || undefined,
      comentarioCierre: comentarioCierre.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mis-conversaciones'] })
      toast.success('Conversación cerrada, esperando calificación del visitante')
      onCerrada()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo cerrar la conversación')
    },
  })

  const handleCerrar = () => {
    if (conv?.grupoId && !motivoCierreId) {
      toast.error('Elige un motivo de cierre')
      return
    }
    if (motivoSeleccionado?.requiereComentario && !comentarioCierre.trim()) {
      toast.error('Este motivo requiere un comentario')
      return
    }
    cerrar.mutate()
  }

  const [transferirOpen, setTransferirOpen] = useState(false)
  const { data: agentesTransferibles = [] } = useQuery({
    queryKey: ['livechat-agentes-transferibles', conversacionId],
    queryFn: () => livechatService.getAgentesTransferibles(conversacionId),
    enabled: transferirOpen,
  })

  // Plantillas rápidas: solo si la conversación tiene grupo (viene de una campaña).
  const [plantillasOpen, setPlantillasOpen] = useState(false)
  const { data: plantillas = [] } = useQuery({
    queryKey: ['livechat-plantillas', conv?.grupoId],
    queryFn: () => livechatService.getPlantillas(conv!.grupoId!),
    enabled: !!conv?.grupoId,
  })

  const transferir = useMutation({
    mutationFn: (nuevoAgenteId: number) => livechatService.transferirConversacion(conversacionId, nuevoAgenteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mis-conversaciones'] })
      toast.success('Conversación transferida')
      setTransferirOpen(false)
      onCerrada()
    },
    onError: () => toast.error('No se pudo transferir la conversación'),
  })

  const handleEnviar = () => {
    const contenido = texto.trim()
    if (!contenido) return
    enviar.mutate(contenido)
  }

  if (isLoading || !conv) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  const esperandoAsignacion = conv.estado === 'esperando'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 relative">
        <div>
          <p className="font-semibold text-gray-800">{conv.visitanteNombre || 'Visitante anónimo'}</p>
          <p className="text-xs text-gray-500">{conv.visitanteEmail || conv.visitanteTelefono || 'Sin datos de contacto'}</p>
        </div>
        <div className="flex items-center gap-2">
          {esperandoAsignacion ? (
            <Button size="sm" onClick={() => tomar.mutate()} disabled={tomar.isPending}>
              {tomar.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Tomar conversación
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setTransferirOpen((v) => !v)}>
                <ArrowRightLeft size={14} />
                Transferir
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCerrarOpen((v) => !v)}>
                Cerrar chat
              </Button>
            </>
          )}
        </div>

        {cerrarOpen && (
          <div className="absolute right-5 top-14 z-10 w-80 bg-card border border-gray-200 rounded-xl shadow-lg p-4 space-y-3">
            {conv.grupoId ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo de cierre</label>
                <select
                  value={motivoCierreId ?? ''}
                  onChange={(e) => setMotivoCierreId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Selecciona un motivo…</option>
                  {motivosCierre.map((m) => (
                    <option key={m.id} value={m.id}>{m.motivo}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo (opcional)</label>
                <input
                  type="text"
                  value={motivoCierreLibre}
                  onChange={(e) => setMotivoCierreLibre(e.target.value)}
                  placeholder="Ej. Resuelto, sin respuesta…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
            )}
            {(motivoSeleccionado?.requiereComentario || !conv.grupoId) && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Comentario{motivoSeleccionado?.requiereComentario ? '' : ' (opcional)'}
                </label>
                <textarea
                  value={comentarioCierre}
                  onChange={(e) => setComentarioCierre(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm resize-none"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCerrarOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCerrar} disabled={cerrar.isPending}>
                {cerrar.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmar cierre
              </Button>
            </div>
          </div>
        )}

        {transferirOpen && (
          <div className="absolute right-5 top-14 z-10 w-64 bg-card border border-gray-200 rounded-xl shadow-lg py-2">
            {agentesTransferibles.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">No hay otros agentes conectados</p>
            ) : (
              agentesTransferibles.map((a) => (
                <button
                  key={a.usuarioId}
                  disabled={!a.online || !a.disponible || transferir.isPending}
                  onClick={() => transferir.mutate(a.usuarioId)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', a.online ? 'bg-green-500' : 'bg-gray-300')} />
                    <span className="truncate">{a.nombre}</span>
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {!a.online ? 'Desconectado' : a.disponible ? `${a.conversacionesActivas} chats` : 'Lleno'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
        {mensajes.map((m) => (
          <div key={m.id} className={clsx('flex', m.emisor === 'agente' ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'max-w-[70%] rounded-2xl px-4 py-2 text-sm',
                m.emisor === 'agente' && 'bg-blue-600 text-white rounded-br-sm',
                m.emisor === 'visitante' && 'bg-card text-gray-800 border border-gray-200 rounded-bl-sm',
                m.emisor === 'sistema' && 'bg-gray-200 text-gray-600 italic text-xs mx-auto',
              )}
            >
              {m.contenido}
              <div className={clsx('text-[10px] mt-1', m.emisor === 'agente' ? 'text-blue-100' : 'text-gray-400')}>
                {formatHora(m.fecha)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-100 flex items-center gap-2 shrink-0 relative">
        {plantillas.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlantillasOpen((v) => !v)}
              disabled={esperandoAsignacion}
              title="Plantillas rápidas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              <FileText size={15} />
            </button>
            {plantillasOpen && (
              <div className="absolute bottom-12 left-0 z-10 w-72 bg-card border border-gray-200 rounded-xl shadow-lg py-2 max-h-64 overflow-y-auto">
                {plantillas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setTexto(p.contenido); setPlantillasOpen(false) }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <p className="font-medium text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{p.contenido}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEnviar()}
          disabled={esperandoAsignacion}
          placeholder={esperandoAsignacion ? 'Toma la conversación para responder' : 'Escribe un mensaje...'}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <Button onClick={handleEnviar} disabled={esperandoAsignacion || enviar.isPending || !texto.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}

export default function LivechatPage() {
  const user = useCurrentUser()
  const { can } = useActionAccess()
  const puedeSupervisar = can('livechat', 'gestionar-campanas')
  // Bandeja fusionada: Livechat (motor viejo) + Contact Center (WhatsApp/
  // Messenger/Instagram/web) — el id por sí solo puede colisionar entre
  // ambas fuentes, así que la selección se guarda como ItemBandeja completo.
  const [selected, setSelected] = useState<ItemBandeja | null>(null)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [usuariosCampaniasOpen, setUsuariosCampaniasOpen] = useState(false)
  const [campaniasOpen, setCampaniasOpen] = useState(false)
  const [agentesOpen, setAgentesOpen] = useState(false)
  const [supervisionOpen, setSupervisionOpen] = useState(false)
  const [asesoresOpen, setAsesoresOpen] = useState(false)

  // Sin esto, 'livechat:nueva_conversacion' y 'livechat:actividad_conversacion'
  // (dirigidos a la sala user:{agenteId}) nunca le llegan a este agente — la
  // sala solo se une emitiendo 'joinUser', que nada más emitía un hook
  // (useSocket) que no se usaba en ningún componente activo de la app.
  useEffect(() => {
    if (!user?.id) return
    const socket = getSocket()
    const unirse = () => socket.emit('joinUser', user.id)
    unirse()
    socket.on('connect', unirse)
    return () => {
      socket.off('connect', unirse)
      socket.emit('leaveUser', user.id)
    }
  }, [user?.id])

  const { data: esperandoLc = [], refetch: refetchEsperandoLc } = useQuery({
    queryKey: ['livechat-esperando'],
    queryFn: () => livechatService.getMisConversaciones('esperando'),
    refetchInterval: 8_000,
  })

  const { data: miasLc = [], refetch: refetchMiasLc } = useQuery({
    queryKey: ['livechat-mis-conversaciones'],
    queryFn: () => livechatService.getMisConversaciones('activa'),
    refetchInterval: 8_000,
  })

  // Mismas dos bandejas, ahora también para Contact Center (CCO_*) — ver
  // ccService.getInteracciones. 'en_cola' es equivalente a 'esperando' de
  // Livechat; sin filtro trae las 'activa'/'pendiente_tipificacion' propias.
  const { data: esperandoCc = [], refetch: refetchEsperandoCc } = useQuery({
    queryKey: ['cc-inter', 'en_cola'],
    queryFn: () => ccService.getInteracciones('en_cola'),
    refetchInterval: 8_000,
  })
  const { data: miasCc = [], refetch: refetchMiasCc } = useQuery({
    queryKey: ['cc-inter', 'activa'],
    queryFn: () => ccService.getInteracciones(),
    refetchInterval: 8_000,
  })

  const refetchEsperando = useCallback(() => { refetchEsperandoLc(); refetchEsperandoCc() }, [refetchEsperandoLc, refetchEsperandoCc])
  const refetchMias = useCallback(() => { refetchMiasLc(); refetchMiasCc() }, [refetchMiasLc, refetchMiasCc])

  const esperando: ItemBandeja[] = [
    ...esperandoLc.map((data): ItemBandeja => ({ origen: 'livechat', data })),
    ...esperandoCc.map((data): ItemBandeja => ({ origen: 'cc', data })),
  ]
  const mias: ItemBandeja[] = [
    ...miasLc.map((data): ItemBandeja => ({ origen: 'livechat', data })),
    ...miasCc.map((data): ItemBandeja => ({ origen: 'cc', data })),
  ]

  const tomarDesdeEspera = useMutation({
    mutationFn: (item: ItemBandeja) => (item.origen === 'livechat'
      ? livechatService.tomarConversacion(item.data.id)
      : ccService.tomar(item.data.id)),
    onSuccess: (_data, item) => {
      toast.success('Conversación tomada')
      refetchEsperando()
      refetchMias()
      setSelected(item)
    },
    onError: () => toast.error('No se pudo tomar la conversación (quizás ya fue asignada)'),
  })

  const handleNuevaAsignada = useCallback(() => {
    refetchMias()
    reproducirAlertaNuevaConversacion()
    toast('Nueva conversación asignada a ti', { icon: '💬' })
  }, [refetchMias])

  const handleNuevaEnCola = useCallback(() => {
    refetchEsperando()
    reproducirAlertaNuevaConversacion()
    toast('Alguien se está comunicando — se agregó a la cola', { icon: '💬' })
  }, [refetchEsperando])

  // Un mensaje nuevo en cualquier conversación (propia o en cola) refresca
  // ambas listas — sin esto, un chat que no está seleccionado en este momento
  // solo se actualizaba al recargar la página o tras el polling de 8s.
  const handleActividad = useCallback(() => {
    refetchMias()
    refetchEsperando()
  }, [refetchMias, refetchEsperando])

  useEffect(() => {
    const socket = getSocket()
    socket.on('livechat:nueva_conversacion', handleNuevaAsignada)
    socket.on('livechat:nueva_en_cola', handleNuevaEnCola)
    socket.on('livechat:actividad_conversacion', handleActividad)
    // Equivalentes de Contact Center — mismo tratamiento: nueva interacción
    // asignada, nueva en cola, o actividad en cualquiera (mensaje/cierre).
    socket.on('cc:nueva_interaccion', handleNuevaEnCola)
    socket.on('cc:mensaje', handleActividad)
    socket.on('cc:actividad', handleActividad)
    socket.on('cc:interaccion_cerrada', handleActividad)
    return () => {
      socket.off('livechat:nueva_conversacion', handleNuevaAsignada)
      socket.off('livechat:nueva_en_cola', handleNuevaEnCola)
      socket.off('livechat:actividad_conversacion', handleActividad)
      socket.off('cc:nueva_interaccion', handleNuevaEnCola)
      socket.off('cc:mensaje', handleActividad)
      socket.off('cc:actividad', handleActividad)
      socket.off('cc:interaccion_cerrada', handleActividad)
    }
  }, [handleNuevaAsignada, handleNuevaEnCola, handleActividad])

  const handleCerrada = () => {
    setSelected(null)
    refetchMias()
    refetchEsperando()
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Atención a campañas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setAsesoresOpen(true)}>
            <Headset size={16} />
            Mi día
          </Button>
        </div>
      </div>

      {historialOpen && (
        <HistorialModal
          onClose={() => setHistorialOpen(false)}
          // El historial completo (todos los agentes) ahora vive en
          // Supervisores → Historial; acá cada quien ve solo lo suyo.
          puedeSupervisar={false}
          agenteId={user?.id}
        />
      )}
      {usuariosCampaniasOpen && <UsuariosCampaniasModal onClose={() => setUsuariosCampaniasOpen(false)} />}
      {campaniasOpen && <CampaniasModal onClose={() => setCampaniasOpen(false)} />}
      {agentesOpen && <AgentesEstadoModal onClose={() => setAgentesOpen(false)} />}
      {supervisionOpen && <SupervisionModal onClose={() => setSupervisionOpen(false)} />}
      {asesoresOpen && <AsesoresModal onClose={() => setAsesoresOpen(false)} />}

      <div className="flex-1 flex bg-card rounded-xl border border-gray-200 overflow-hidden min-h-0">
        <div className="w-72 border-r border-gray-100 shrink-0 flex flex-col min-h-0">
          {/* ── Mitad superior: mis conversaciones activas ── */}
          <div className="flex-1 min-h-0 flex flex-col border-b border-gray-100">
            <p className="shrink-0 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50/60">
              Mis conversaciones{mias.length > 0 && ` · ${mias.length}`}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {mias.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  <User size={24} className="mx-auto mb-2 opacity-40" />
                  Sin conversaciones activas
                </div>
              ) : (
                mias.map((item) => (
                  <ConversacionItem
                    key={idUnificado(item)}
                    item={item}
                    activa={!!selected && idUnificado(selected) === idUnificado(item)}
                    onClick={() => setSelected(item)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Mitad inferior: bandeja de espera (cualquiera puede tomarlas) ── */}
          <div className="flex-1 min-h-0 flex flex-col">
            <p className="shrink-0 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50/60">
              Bandeja de espera{esperando.length > 0 && ` · ${esperando.length}`}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {esperando.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  <CheckCircle2 size={24} className="mx-auto mb-2 opacity-40" />
                  Nadie esperando ahora mismo
                </div>
              ) : (
                esperando
                  .slice()
                  .sort((a, b) => new Date(fechaInicioUnificado(a)).getTime() - new Date(fechaInicioUnificado(b)).getTime())
                  .map((item) => (
                    <EsperaItem
                      key={idUnificado(item)}
                      item={item}
                      onTomar={() => tomarDesdeEspera.mutate(item)}
                      tomando={tomarDesdeEspera.isPending}
                    />
                  ))
              )}
            </div>
          </div>
        </div>

        {selected?.origen === 'livechat' ? (
          <ChatPanel conversacionId={selected.data.id} onCerrada={handleCerrada} />
        ) : selected?.origen === 'cc' ? (
          <CCChatPanel interaccionId={selected.data.id} onClosed={handleCerrada} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecciona una conversación
          </div>
        )}
      </div>
    </div>
  )
}
