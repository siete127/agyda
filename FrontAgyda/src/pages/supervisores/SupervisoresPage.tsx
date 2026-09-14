import { useMemo, useState, useEffect, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Users, UserCheck, Clock, BarChart3, Plus, Trash2, Coffee, History,
  ChevronRight, ChevronLeft, Layers, MessageCircle, Circle, PowerOff, MinusCircle,
  AlertTriangle, CheckCircle2, Megaphone, RefreshCw, LogOut, TrendingUp,
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/axios'
import { supervisoresService } from '@/services/supervisores.service'
import { ccService } from '@/services/cc.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import {
  TIPO_PAUSA_LABELS, ESTADO_AGENTE_LABELS, type AgenteEstado, type EstadoAgente, type ProductividadAgente,
  NOTIFICACION_ALCANCE_LABELS, type NotificacionTipo, type NotificacionAlcance, type AlarmaInstancia,
} from '@/types/supervisores.types'
import type { CCInteraccion } from '@/types/cc.types'
import { HistorialConversacionesPanel } from '@/pages/livechat/HistorialConversacionesPanel'
import { AsignacionSupervisores } from '@/pages/configuracion/ContactCenterTabs'
import { Eye, Radio, LogIn } from 'lucide-react'
import type { CCMensaje } from '@/types/cc.types'
import { getSocket } from '@/lib/socket'
import { useColumnasVisibles } from '@/hooks/useColumnasVisibles'
import { SelectorColumnas } from '@/components/ui/SelectorColumnas'

interface Usuario { id: number; nombre: string; tipoUsuario: string }

function formatDuracion(iso: string | null) {
  if (!iso) return ''
  const inicio = new Date(iso).getTime()
  const minutos = Math.floor((Date.now() - inicio) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  return `${h}h ${minutos % 60}min`
}

const ESTADO_ESTILOS: Record<EstadoAgente, { card: string; iconBg: string; dot: string; icon: (p: { className?: string }) => ReactElement }> = {
  disponible: { card: '', iconBg: 'bg-emerald-100 text-emerald-600', dot: 'bg-emerald-400', icon: (p) => <UserCheck {...p} /> },
  pausa: { card: 'border-amber-200 bg-amber-50/40', iconBg: 'bg-amber-100 text-amber-600', dot: 'bg-amber-400', icon: (p) => <Coffee {...p} /> },
  no_disponible: { card: 'border-orange-200 bg-orange-50/40', iconBg: 'bg-orange-100 text-orange-600', dot: 'bg-orange-400', icon: (p) => <MinusCircle {...p} /> },
  desconectado: { card: 'border-gray-200 bg-gray-50/60 opacity-75', iconBg: 'bg-gray-100 text-gray-400', dot: 'bg-gray-300', icon: (p) => <PowerOff {...p} /> },
}

function estadoTexto(agente: AgenteEstado) {
  if (agente.estado === 'pausa') {
    return <>En {TIPO_PAUSA_LABELS[agente.tipoPausa ?? ''] ?? agente.tipoPausa} · {formatDuracion(agente.pausaDesde)}</>
  }
  return ESTADO_AGENTE_LABELS[agente.estado]
}

/* ── Fila de chat asignado (nivel 4: chats de un agente) — clic abre el visor de solo lectura ── */
function ChatRow({ chat, onClick }: { chat: CCInteraccion; onClick: () => void }) {
  const ESTADO_LABEL: Record<string, string> = { activa: 'Activa', en_cola: 'En cola', pendiente_tipificacion: 'Pendiente tipificación' }
  const ESTADO_COLOR: Record<string, string> = {
    activa: 'bg-emerald-100 text-emerald-700',
    en_cola: 'bg-amber-100 text-amber-700',
    pendiente_tipificacion: 'bg-blue-100 text-blue-700',
  }
  return (
    <button onClick={onClick} className="card w-full p-3.5 flex items-center gap-3 text-left transition-colors hover:border-brand/30 hover:bg-brand/[0.02]">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
        <MessageCircle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{chat.clienteNombre || chat.clienteTelefono || 'Sin nombre'}</p>
        <p className="text-xs text-gray-500 truncate">{chat.canalNombre ?? chat.tipo}{chat.ticket ? ` · #${chat.ticket}` : ''}</p>
      </div>
      <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', ESTADO_COLOR[chat.estado] ?? 'bg-gray-100 text-gray-600')}>
        {ESTADO_LABEL[chat.estado] ?? chat.estado}
      </span>
      <Eye className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
    </button>
  )
}

/* ── Modal: ver la conversación en vivo (Fase 1, 3.1 del plan basado en
   PSUP): el supervisor observa, y ahora también puede Susurrar (mensaje al
   agente, invisible para el cliente) o Tomar el chat (se hace cargo él
   mismo). No hay forma de escribirle al cliente directamente — solo de las
   dos formas de arriba, igual que Monitoreo/Coaching de PSUP. ── */
function VerConversacionModal({ interaccionId, onClose }: { interaccionId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [susurro, setSusurro] = useState('')
  const { data: inter, isLoading } = useQuery({
    queryKey: ['cc-inter-detalle-supervisor', interaccionId],
    queryFn: () => ccService.getInteraccion(interaccionId),
    refetchInterval: 5000,
  })

  useEffect(() => {
    const s = getSocket()
    s.emit('join_interaccion', { interaccionId })
    const refetch = () => qc.invalidateQueries({ queryKey: ['cc-inter-detalle-supervisor', interaccionId] })
    s.on('cc:mensaje', refetch)
    s.on('cc:interaccion_tomada', refetch)
    s.on('cc:interaccion_cerrada', refetch)
    return () => {
      s.off('cc:mensaje', refetch)
      s.off('cc:interaccion_tomada', refetch)
      s.off('cc:interaccion_cerrada', refetch)
      s.emit('leave_interaccion', { interaccionId })
    }
  }, [interaccionId, qc])

  const susurrar = useMutation({
    mutationFn: (contenido: string) => ccService.susurrar(interaccionId, contenido),
    onSuccess: () => { setSusurro(''); toast.success('Susurro enviado al agente') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo enviar el susurro'),
  })

  const tomarChat = useMutation({
    mutationFn: () => ccService.tomarSupervisor(interaccionId),
    onSuccess: () => { toast.success('Ahora atiendes tú este chat'); qc.invalidateQueries({ queryKey: ['cc-inter-detalle-supervisor', interaccionId] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo tomar el chat'),
  })

  const puedeIntervenir = inter?.estado === 'activa'

  return (
    <Modal isOpen onClose={onClose} title="Chat en vivo — supervisión" size="lg">
      {isLoading || !inter ? (
        <div className="flex justify-center py-14"><Spinner /></div>
      ) : (
        <div className="flex h-[60vh] flex-col">
          <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{inter.clienteNombre || inter.clienteTelefono || 'Sin nombre'}</p>
              <p className="text-xs text-gray-500">
                {inter.canalNombre ?? inter.tipo}{inter.grupoNombre ? ` · ${inter.grupoNombre}` : ''}{inter.agenteNombre ? ` · Atiende: ${inter.agenteNombre}` : ''}
              </p>
            </div>
            {puedeIntervenir ? (
              <Button size="sm" variant="secondary" onClick={() => tomarChat.mutate()} disabled={tomarChat.isPending}>
                <LogIn className="h-3.5 w-3.5" /> Tomar el chat
              </Button>
            ) : (
              <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[0.65rem] font-semibold text-amber-700">
                <Eye className="h-3 w-3" /> Solo lectura
              </span>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50/40 p-3">
            {((inter.mensajes ?? []) as CCMensaje[]).length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                <MessageCircle className="h-6 w-6" />
                <p className="text-xs">Sin mensajes todavía</p>
              </div>
            ) : (
              (inter.mensajes as CCMensaje[]).map((m) => (
                <div key={m.id} className={clsx('flex', m.emisor === 'agente' ? 'justify-end' : m.emisor === 'sistema' ? 'justify-center' : 'justify-start')}>
                  {m.emisor === 'sistema' ? (
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-[0.68rem] italic text-gray-500">{m.contenido}</span>
                  ) : (
                    <div className={clsx(
                      'max-w-[70%] rounded-2xl px-3 py-2 text-sm',
                      m.emisor === 'agente' ? 'rounded-br-sm bg-violet-600 text-white' : 'rounded-bl-sm bg-white text-gray-800 ring-1 ring-gray-200',
                    )}>
                      {m.mediaId && m.mediaMime?.startsWith('image/') && (
                        <img src={ccService.mediaUrl(m.mediaId)} alt="" className="mb-1 max-h-48 rounded-lg" />
                      )}
                      {m.mediaId && m.mediaMime?.startsWith('audio/') && (
                        <audio src={ccService.mediaUrl(m.mediaId)} controls className="mb-1 max-w-full" />
                      )}
                      {m.mediaId && !m.mediaMime?.startsWith('image/') && !m.mediaMime?.startsWith('audio/') && (
                        <a href={ccService.mediaUrl(m.mediaId)} target="_blank" rel="noreferrer" className="mb-1 block text-xs underline">{m.mediaNombre || 'Archivo'}</a>
                      )}
                      {m.contenido}
                      <div className={clsx('mt-0.5 text-[0.6rem]', m.emisor === 'agente' ? 'text-violet-200' : 'text-gray-400')}>
                        {new Date(m.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {puedeIntervenir && (
            <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
              <Radio className="h-4 w-4 flex-shrink-0 text-violet-500" />
              <input
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
                placeholder="Susurrar al agente (el cliente no lo ve)…"
                value={susurro}
                onChange={(e) => setSusurro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && susurro.trim()) susurrar.mutate(susurro.trim()) }}
              />
              <Button size="sm" onClick={() => susurrar.mutate(susurro.trim())} disabled={!susurro.trim() || susurrar.isPending}>
                Enviar
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ── Fila de agente dentro de un skill expandido (nivel 3, en línea) ── */
function AgenteRow({ agente, chatsActivos, expandido, onClick }: { agente: AgenteEstado; chatsActivos: number; expandido: boolean; onClick: () => void }) {
  const estilo = ESTADO_ESTILOS[agente.estado]
  return (
    <button
      onClick={onClick}
      className={clsx('w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50', expandido && 'bg-brand/5')}
    >
      <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', estilo.iconBg)}>
        {estilo.icon({ className: 'h-3.5 w-3.5' })}
      </div>
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <p className="text-sm font-semibold text-gray-900 truncate">{agente.nombre}</p>
        <p className="text-xs text-gray-500 truncate">{estadoTexto(agente)}</p>
      </div>
      {chatsActivos > 0 && (
        <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[0.68rem] font-semibold text-brand">
          <MessageCircle className="h-3 w-3" /> {chatsActivos}
        </span>
      )}
      <span className={clsx('flex-shrink-0 h-2 w-2 rounded-full', estilo.dot)} />
      <ChevronRight className={clsx('h-4 w-4 flex-shrink-0 text-gray-300 transition-transform', expandido && 'rotate-90')} />
    </button>
  )
}

/* ── Acciones remotas sobre la sesión del agente (Fase 3, 3.7) — versión
   reducida del "resetear PAD"/"desloguear agente" del manual de PSUP,
   adaptada a que aquí es una app web: forzar refresh o cerrar la sesión. ── */
function AccionesRemotasAgente({ agenteId }: { agenteId: number }) {
  const [confirmando, setConfirmando] = useState(false)

  const refrescar = useMutation({
    mutationFn: () => supervisoresService.refrescarAgente(agenteId),
    onSuccess: () => toast.success('Se pidió actualizar la pantalla del agente'),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo enviar la acción'),
  })
  const desconectar = useMutation({
    mutationFn: () => supervisoresService.desconectarAgente(agenteId),
    onSuccess: () => { toast.success('Se cerró la sesión del agente'); setConfirmando(false) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo enviar la acción'),
  })

  if (confirmando) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <span className="text-xs text-gray-500">¿Cerrar su sesión?</span>
        <Button size="sm" variant="danger" onClick={() => desconectar.mutate()} disabled={desconectar.isPending}>Sí, cerrar</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => refrescar.mutate()} disabled={refrescar.isPending} title="Forzar que su pantalla se actualice">
        <RefreshCw className="h-3.5 w-3.5" /> Refrescar
      </Button>
      <Button size="sm" variant="danger" onClick={() => setConfirmando(true)} title="Cerrar su sesión de inmediato">
        <LogOut className="h-3.5 w-3.5" /> Desconectar
      </Button>
    </div>
  )
}

/* ── Tab: Panel en vivo — 3 columnas: campañas | skills+resumen | detalle
   (agentes filtrados o chats del agente seleccionado), estilo explorador ── */
function PanelEnVivoTab() {
  const [campaniaId, setCampaniaId] = useState<number | null>(null)
  const [skillId, setSkillId] = useState<number | null>(null)
  const [agenteSeleccionado, setAgenteSeleccionado] = useState<AgenteEstado | null>(null)
  // Filtro de estado activo (clic en una de las 4 tarjetas de resumen) —
  // 'todos' o uno de los 4 estados de EstadoAgente.
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoAgente>('todos')
  const [chatEnVista, setChatEnVista] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['supervisores-mi-panel'],
    queryFn: () => supervisoresService.getMiPanel(),
    refetchInterval: 15_000,
  })

  // Se piden en cuanto hay un skill seleccionado — es la única señal de que
  // el supervisor está mirando el detalle de agentes/chats.
  const { data: interacciones = [] } = useQuery({
    queryKey: ['cc-supervision-activas'],
    queryFn: () => ccService.supervisionActivas(),
    enabled: skillId != null,
    refetchInterval: 15_000,
  })

  const chatsPorAgente = useMemo(() => {
    const mapa = new Map<number, CCInteraccion[]>()
    for (const i of interacciones) {
      if (i.agenteId == null) continue
      if (!mapa.has(i.agenteId)) mapa.set(i.agenteId, [])
      mapa.get(i.agenteId)!.push(i)
    }
    return mapa
  }, [interacciones])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const campanias = data?.campanias ?? []
  const grupos = data?.grupos ?? []
  const agentes = data?.agentes ?? []

  if (agentes.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <Users className="h-8 w-8" />
        <p className="text-sm">No tienes agentes asignados a tus campañas todavía</p>
      </div>
    )
  }

  const seleccionarCampania = (id: number) => {
    setCampaniaId((v) => (v === id ? null : id))
    setSkillId(null)
    setAgenteSeleccionado(null)
    setFiltroEstado('todos')
  }
  const seleccionarSkill = (id: number) => {
    setSkillId((v) => (v === id ? null : id))
    setAgenteSeleccionado(null)
    setFiltroEstado('todos')
  }
  const toggleFiltro = (estado: 'todos' | EstadoAgente) => {
    setFiltroEstado((v) => (v === estado ? 'todos' : estado))
    setAgenteSeleccionado(null)
  }

  const campaniaActiva = campanias.find((c) => c.id === campaniaId) ?? null
  const skillsDeCampania = campaniaActiva ? grupos.filter((g) => g.campaniaId === campaniaActiva.id) : []
  const skillActivo = skillsDeCampania.find((s) => s.id === skillId) ?? null
  const agentesDelSkill = skillActivo ? agentes.filter((a) => a.grupoId === skillActivo.id) : []
  const disponibles = agentesDelSkill.filter((a) => a.estado === 'disponible').length
  const enPausa = agentesDelSkill.filter((a) => a.estado === 'pausa').length
  const desconectados = agentesDelSkill.filter((a) => a.estado === 'desconectado').length
  const agentesFiltrados = filtroEstado === 'todos' ? agentesDelSkill : agentesDelSkill.filter((a) => a.estado === filtroEstado)
  const chatsDelAgente = agenteSeleccionado ? (chatsPorAgente.get(agenteSeleccionado.agenteId) ?? []) : []

  return (
    <div className="flex gap-4 min-h-[32rem] items-start">
      {/* ── Columna 1: campañas, con sus skills anidados debajo de la activa ── */}
      <div className="w-64 flex-shrink-0 card p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-3.5 py-2.5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Campañas</p>
        </div>
        <div className="divide-y divide-gray-50">
          {campanias.map((c) => {
            const cantidadAgentes = agentes.filter((a) => a.campaniaId === c.id).length
            const skillsDeEsta = grupos.filter((g) => g.campaniaId === c.id)
            const activa = campaniaId === c.id
            return (
              <div key={c.id}>
                <button
                  onClick={() => seleccionarCampania(c.id)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition-colors',
                    activa ? 'bg-brand/10 border-l-2 border-brand' : 'border-l-2 border-transparent hover:bg-gray-50',
                  )}
                >
                  <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', activa ? 'bg-brand text-white' : 'bg-brand/10 text-brand')}>
                    <Circle className="h-3.5 w-3.5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={clsx('text-sm truncate', activa ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>{c.nombre}</p>
                    <p className="text-[0.68rem] text-gray-500">{skillsDeEsta.length} skill{skillsDeEsta.length !== 1 ? 's' : ''} · {cantidadAgentes} agente{cantidadAgentes !== 1 ? 's' : ''}</p>
                  </div>
                </button>

                {activa && skillsDeEsta.length > 0 && (
                  <div className="bg-gray-50/60 py-1 animate-fade-in">
                    {skillsDeEsta.map((s) => {
                      const cantidad = agentes.filter((a) => a.grupoId === s.id).length
                      const activo = skillId === s.id
                      return (
                        <button
                          key={s.id}
                          onClick={() => seleccionarSkill(s.id)}
                          className={clsx(
                            'w-full flex items-center gap-2 pl-8 pr-3.5 py-2 text-left transition-colors',
                            activo ? 'bg-brand/10' : 'hover:bg-gray-100',
                          )}
                        >
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 text-xs">
                            {s.icono || <Layers className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={clsx('text-xs truncate', activo ? 'font-semibold text-gray-900' : 'font-medium text-gray-600')}>{s.nombre}</p>
                          </div>
                          <span className="flex-shrink-0 text-[0.65rem] text-gray-400">{cantidad}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Columna 2: detalle — chips de estado + lista de agentes filtrados, o los chats del agente seleccionado ── */}
      <div className="flex-1 min-w-0 card overflow-hidden">
        {!campaniaActiva ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-400">
            <Circle className="h-8 w-8" />
            <p className="text-sm">Selecciona una campaña para ver sus skills y agentes</p>
          </div>
        ) : skillsDeCampania.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-400">
            <Layers className="h-8 w-8" />
            <p className="text-sm">Esta campaña no tiene skills configurados</p>
          </div>
        ) : !skillActivo ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-gray-400">
            <Layers className="h-8 w-8" />
            <p className="text-sm">Selecciona un skill para ver sus agentes</p>
          </div>
        ) : agenteSeleccionado ? (
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
              <button
                onClick={() => setAgenteSeleccionado(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Volver a la lista de agentes"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', ESTADO_ESTILOS[agenteSeleccionado.estado].iconBg)}>
                {ESTADO_ESTILOS[agenteSeleccionado.estado].icon({ className: 'h-3.5 w-3.5' })}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{agenteSeleccionado.nombre}</p>
                <p className="text-xs text-gray-500">{estadoTexto(agenteSeleccionado)}</p>
              </div>
              <AccionesRemotasAgente agenteId={agenteSeleccionado.agenteId} />
            </div>
            <div className="p-3 space-y-1.5">
              {chatsDelAgente.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                  <MessageCircle className="h-6 w-6" />
                  <p className="text-xs">{agenteSeleccionado.nombre} no tiene chats asignados ahora mismo</p>
                </div>
              ) : (
                chatsDelAgente.map((c) => <ChatRow key={c.id} chat={c} onClick={() => setChatEnVista(c.id)} />)
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="border-b border-gray-100 px-4 py-3 space-y-2.5">
              <p className="text-sm font-semibold text-gray-900">{skillActivo.nombre}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => toggleFiltro('todos')}
                  title={`Ver todos los agentes (${agentesDelSkill.length})`}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filtroEstado === 'todos' ? 'bg-brand/10 text-brand ring-1 ring-brand/30' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand" />
                  Agentes
                </button>
                <button
                  onClick={() => toggleFiltro('disponible')}
                  title={`Filtrar por agentes disponibles (${disponibles})`}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filtroEstado === 'disponible' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                  Disponibles
                </button>
                <button
                  onClick={() => toggleFiltro('pausa')}
                  title={`Filtrar por agentes en pausa (${enPausa})`}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filtroEstado === 'pausa' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
                  En pausa
                </button>
                <button
                  onClick={() => toggleFiltro('desconectado')}
                  title={`Filtrar por agentes desconectados (${desconectados})`}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filtroEstado === 'desconectado' ? 'bg-gray-200 text-gray-700 ring-1 ring-gray-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-400" />
                  Desconectados
                </button>
                {filtroEstado !== 'todos' && (
                  <button
                    onClick={() => setFiltroEstado('todos')}
                    className="text-[0.68rem] font-medium text-gray-400 hover:text-brand hover:underline"
                  >
                    Quitar filtro
                  </button>
                )}
              </div>
            </div>
            <div className="p-3">
              {agentesDelSkill.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                  <Users className="h-6 w-6" />
                  <p className="text-xs">Este skill no tiene agentes asignados</p>
                </div>
              ) : agentesFiltrados.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                  <Users className="h-6 w-6" />
                  <p className="text-xs">Ningún agente en este estado ahora mismo</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {agentesFiltrados.map((a) => (
                    <AgenteRow
                      key={a.agenteId}
                      agente={a}
                      chatsActivos={(chatsPorAgente.get(a.agenteId) ?? []).length}
                      expandido={false}
                      onClick={() => setAgenteSeleccionado(a)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {chatEnVista != null && (
        <VerConversacionModal interaccionId={chatEnVista} onClose={() => setChatEnVista(null)} />
      )}
    </div>
  )
}

/* ── Tab: Productividad del día ── */
const PAUSA_COLORES: Record<'banio' | 'comida' | 'capacitacion' | 'permiso', { bar: string; dot: string; label: string }> = {
  banio: { bar: 'bg-blue-400', dot: 'bg-blue-400', label: 'Baño' },
  comida: { bar: 'bg-orange-400', dot: 'bg-orange-400', label: 'Comida' },
  capacitacion: { bar: 'bg-violet-400', dot: 'bg-violet-400', label: 'Capacitación' },
  permiso: { bar: 'bg-emerald-400', dot: 'bg-emerald-400', label: 'Permiso' },
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

/* ── Barras apiladas: minutos en pausa por agente, coloreadas por tipo ── */
function GraficoPausasPorAgente({ productividad }: { productividad: ProductividadAgente[] }) {
  const conPausas = productividad.filter((p) => p.totalPausaMin > 0)
  if (conPausas.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-10 text-gray-400">
        <BarChart3 className="h-6 w-6" />
        <p className="text-xs">Nadie registró tiempo en pausa este día</p>
      </div>
    )
  }
  const maxMin = Math.max(...conPausas.map((p) => p.totalPausaMin))
  const ordenado = [...conPausas].sort((a, b) => b.totalPausaMin - a.totalPausaMin)

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Minutos en pausa por agente</p>
        <div className="flex flex-wrap items-center gap-3">
          {(Object.keys(PAUSA_COLORES) as (keyof typeof PAUSA_COLORES)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[0.68rem] text-gray-500">
              <span className={clsx('h-2 w-2 rounded-full', PAUSA_COLORES[k].dot)} />
              {PAUSA_COLORES[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {ordenado.map((p) => (
          <div key={p.agenteId} className="flex items-center gap-3">
            <p className="w-36 flex-shrink-0 truncate text-xs font-medium text-gray-700">{p.nombre}</p>
            <div className="flex h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
              {(['banio', 'comida', 'capacitacion', 'permiso'] as const).map((k) => {
                const minutos = p[k]
                if (minutos <= 0) return null
                return (
                  <div
                    key={k}
                    className={clsx('h-full transition-all', PAUSA_COLORES[k].bar)}
                    style={{ width: `${(minutos / maxMin) * 100}%` }}
                    title={`${PAUSA_COLORES[k].label}: ${minutos} min`}
                  />
                )
              })}
            </div>
            <p className="w-14 flex-shrink-0 text-right text-xs font-semibold text-gray-900">{p.totalPausaMin} min</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Comparativo vs. promedio semanal: chip con flecha + diferencia ── */
function ComparativoSemanal({ p }: { p: ProductividadAgente }) {
  if (p.avgSemanalMin == null) {
    return <span className="text-[0.68rem] text-gray-300">Sin historial</span>
  }
  const diferencia = p.totalPausaMin - p.avgSemanalMin
  if (Math.abs(diferencia) < 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.68rem] font-medium text-gray-500">
        ≈ promedio ({p.avgSemanalMin} min)
      </span>
    )
  }
  const arriba = diferencia > 0
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold',
      arriba ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
    )}>
      {arriba ? '↑' : '↓'} {Math.abs(diferencia)} min <span className="font-normal opacity-70">vs. {p.avgSemanalMin} min</span>
    </span>
  )
}

const COLUMNAS_PRODUCTIVIDAD = [
  { key: 'estado', label: 'Estado' },
  { key: 'banio', label: 'Baño' },
  { key: 'comida', label: 'Comida' },
  { key: 'capacitacion', label: 'Capacitación' },
  { key: 'permiso', label: 'Permiso' },
  { key: 'totalPausaMin', label: 'Total pausas' },
  { key: 'avgSemanal', label: 'Vs. promedio semanal' },
]

/* ── Sub-vista: histórico de SLA en el tiempo (Fase 3, 3.5 del plan basado en
   PSUP) — línea de tiempo por día en vez del dato de "hoy" que muestran el
   resto de las vistas de Productividad/Comparador. Vive dentro de
   Productividad, como sugiere el plan, con su propio selector de campaña y
   rango de 7/30 días. ── */
// Compara la primera mitad del rango contra la segunda mitad de una serie de
// métricas — sirve para dar una flecha de tendencia simple ("vamos mejor o
// peor que hace una semana") sin necesitar un periodo anterior real del
// backend, ya suficiente para un vistazo rápido de dirección.
function tendenciaSerie(serie: any[], campo: string) {
  const valores = serie.filter((p: any) => p[campo] != null)
  if (valores.length < 2) return null
  const mitad = Math.floor(valores.length / 2)
  const primera = valores.slice(0, mitad)
  const segunda = valores.slice(mitad)
  if (primera.length === 0 || segunda.length === 0) return null
  const avg = (arr: any[]) => arr.reduce((s, p) => s + p[campo], 0) / arr.length
  const a = avg(primera)
  const b = avg(segunda)
  if (a === 0) return null
  return { actual: b, delta: ((b - a) / a) * 100 }
}

function KpiTendencia({
  icono, label, valor, tendencia, positivoEsSubida, sufijo,
}: {
  icono: ReactElement
  label: string
  valor: string
  tendencia: { actual: number; delta: number } | null
  positivoEsSubida: boolean
  sufijo?: string
}) {
  const sube = (tendencia?.delta ?? 0) > 0.5
  const baja = (tendencia?.delta ?? 0) < -0.5
  const esBueno = sube ? positivoEsSubida : baja ? !positivoEsSubida : null
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        {icono}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-bold leading-tight text-gray-900">{valor}{sufijo}</p>
          {tendencia && (sube || baja) && (
            <span className={clsx(
              'inline-flex items-center gap-0.5 text-[0.68rem] font-semibold',
              esBueno ? 'text-emerald-600' : 'text-red-500',
            )}>
              {sube ? '↑' : '↓'} {Math.abs(tendencia.delta).toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function HistoricoSlaTab() {
  const [dias, setDias] = useState<7 | 30>(7)
  const [campaniaId, setCampaniaId] = useState<number | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: ['supervisores-historico-sla', dias, campaniaId],
    queryFn: () => supervisoresService.getHistoricoSla(dias, campaniaId || undefined),
  })

  const serie = data?.serie ?? []
  const campanias = data?.campanias ?? []
  const fmtDia = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${d}/${m}`
  }

  const sinDatos = serie.every((p) => p.chatsCerrados === 0)
  const totalChats = serie.reduce((s, p) => s + p.chatsCerrados, 0)
  const promSla = (() => {
    const vals = serie.filter((p) => p.pctDentroSla != null).map((p) => p.pctDentroSla as number)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  })()
  const promRespuesta = (() => {
    const vals = serie.filter((p) => p.segRespuestaProm != null).map((p) => p.segRespuestaProm as number)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  })()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500">Campaña</label>
          <select
            value={campaniaId}
            onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          >
            <option value="">Todas mis campañas</option>
            {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', dias === d ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : sinDatos ? (
        <div className="card flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
            <TrendingUp className="h-6 w-6 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Sin actividad en este rango</p>
            <p className="mt-0.5 text-xs text-gray-400">No hay chats cerrados en los últimos {dias} días para graficar</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTendencia
              icono={<CheckCircle2 className="h-5 w-5" />}
              label={`Nivel de Servicio · ${dias}d`}
              valor={promSla != null ? promSla.toFixed(0) : '—'}
              sufijo="%"
              tendencia={tendenciaSerie(serie, 'pctDentroSla')}
              positivoEsSubida
            />
            <KpiTendencia
              icono={<Clock className="h-5 w-5" />}
              label={`1ra respuesta prom. · ${dias}d`}
              valor={promRespuesta != null ? fmtSegundos(Math.round(promRespuesta)) : '—'}
              tendencia={tendenciaSerie(serie, 'segRespuestaProm')}
              positivoEsSubida={false}
            />
            <KpiTendencia
              icono={<MessageCircle className="h-5 w-5" />}
              label={`Chats cerrados · ${dias}d`}
              valor={String(totalChats)}
              tendencia={tendenciaSerie(serie, 'chatsCerrados')}
              positivoEsSubida
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Nivel de Servicio — % de chats atendidos en ≤ 2 min
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie}>
                    <defs>
                      <linearGradient id="slaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1B4FD8" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#1B4FD8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="dia" tickFormatter={fmtDia} tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip labelFormatter={fmtDia} formatter={(v: number) => [`${v}%`, 'Dentro de SLA']} />
                    <Area type="monotone" dataKey="pctDentroSla" name="% dentro de SLA" stroke="#1B4FD8" strokeWidth={2} fill="url(#slaFill)" dot={{ r: 3 }} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tiempo de 1ra respuesta promedio
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="dia" tickFormatter={fmtDia} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={fmtDia} formatter={(v: number) => [fmtSegundos(v), '1ra respuesta']} />
                    <Line type="monotone" dataKey="segRespuestaProm" name="1ra respuesta (seg)" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-4 lg:col-span-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Volumen de chats cerrados por día</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="dia" tickFormatter={fmtDia} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip labelFormatter={fmtDia} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="chatsCerrados" name="Chats cerrados" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type ProductividadVista = 'dia' | 'historico'

function ProductividadTab() {
  const [vista, setVista] = useState<ProductividadVista>('dia')
  const [fecha, setFecha] = useState(hoyISO())
  const esHoy = fecha === hoyISO()
  const { visibles, toggle, esVisible } = useColumnasVisibles('productividad', COLUMNAS_PRODUCTIVIDAD)

  const { data: productividad = [], isLoading } = useQuery({
    queryKey: ['supervisores-productividad', fecha],
    queryFn: () => supervisoresService.getProductividad(fecha),
    refetchInterval: esHoy ? 15_000 : false,
    enabled: vista === 'dia',
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setVista('dia')}
          className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', vista === 'dia' ? 'bg-white text-brand shadow-sm' : 'text-gray-500')}
        >
          Día actual
        </button>
        <button
          onClick={() => setVista('historico')}
          className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', vista === 'historico' ? 'bg-white text-brand shadow-sm' : 'text-gray-500')}
        >
          <TrendingUp className="h-3.5 w-3.5" /> Histórico SLA
        </button>
      </div>

      {vista === 'historico' ? <HistoricoSlaTab /> : (
      <>
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500">Fecha</label>
          <input
            type="date"
            value={fecha}
            max={hoyISO()}
            onChange={(e) => setFecha(e.target.value || hoyISO())}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          />
        </div>
        {!esHoy && (
          <button
            onClick={() => setFecha(hoyISO())}
            className="text-[0.68rem] font-medium text-brand hover:underline"
          >
            Volver a hoy
          </button>
        )}
        <div className="ml-auto">
          <SelectorColumnas columnas={COLUMNAS_PRODUCTIVIDAD} visibles={visibles} onToggle={toggle} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : productividad.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
            <BarChart3 className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">Sin datos de productividad para este día</p>
        </div>
      ) : (
        <>
          <GraficoPausasPorAgente productividad={productividad} />

          <div className="card overflow-hidden overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-left">
                  <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Agente</th>
                  {esVisible('estado') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Estado</th>}
                  {esVisible('banio') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Baño</th>}
                  {esVisible('comida') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Comida</th>}
                  {esVisible('capacitacion') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Capacitación</th>}
                  {esVisible('permiso') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Permiso</th>}
                  {esVisible('totalPausaMin') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Total pausas</th>}
                  {esVisible('avgSemanal') && <th className="px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">Vs. promedio semanal</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(() => {
                  const maxPausa = Math.max(1, ...productividad.map((p) => p.totalPausaMin))
                  return productividad.map((p) => {
                    const enPausa = p.estado === 'pausa'
                    const BADGE_COLOR: Record<string, string> = {
                      disponible: 'bg-emerald-100 text-emerald-700',
                      pausa: 'bg-amber-100 text-amber-700',
                      no_disponible: 'bg-orange-100 text-orange-700',
                      desconectado: 'bg-gray-100 text-gray-500',
                    }
                    const DOT_COLOR: Record<string, string> = {
                      disponible: 'bg-emerald-500',
                      pausa: 'bg-amber-500 animate-pulse',
                      no_disponible: 'bg-orange-500',
                      desconectado: 'bg-gray-400',
                    }
                    const barraColor = p.totalPausaMin >= 60 ? 'bg-red-400' : p.totalPausaMin >= 30 ? 'bg-amber-400' : 'bg-slate-300'
                    return (
                      <tr key={p.agenteId} className="transition-colors hover:bg-brand/[0.03]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={p.nombre} size="sm" />
                            <span className="font-semibold text-gray-800">{p.nombre}</span>
                          </div>
                        </td>
                        {esVisible('estado') && (
                          <td className="px-4 py-2.5">
                            <span className={clsx(
                              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold',
                              BADGE_COLOR[p.estado],
                            )}>
                              <span className={clsx('h-1.5 w-1.5 rounded-full', DOT_COLOR[p.estado])} />
                              {enPausa ? (TIPO_PAUSA_LABELS[p.tipoPausa ?? ''] ?? p.tipoPausa) : ESTADO_AGENTE_LABELS[p.estado]}
                            </span>
                          </td>
                        )}
                        {esVisible('banio') && <td className="px-4 py-2.5 font-mono tabular-nums text-gray-600">{p.banio} min</td>}
                        {esVisible('comida') && <td className="px-4 py-2.5 font-mono tabular-nums text-gray-600">{p.comida} min</td>}
                        {esVisible('capacitacion') && <td className="px-4 py-2.5 font-mono tabular-nums text-gray-600">{p.capacitacion} min</td>}
                        {esVisible('permiso') && <td className="px-4 py-2.5 font-mono tabular-nums text-gray-600">{p.permiso} min</td>}
                        {esVisible('totalPausaMin') && (
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-14 flex-shrink-0 font-mono text-xs font-bold tabular-nums text-gray-900">{p.totalPausaMin} min</span>
                              <BarraComparativa valor={p.totalPausaMin} max={maxPausa} color={barraColor} />
                            </div>
                          </td>
                        )}
                        {esVisible('avgSemanal') && <td className="px-4 py-2.5"><ComparativoSemanal p={p} /></td>}
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}

/* ── Modal: asignar supervisor a campaña ── */
function AsignarSupervisorModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [campaniaId, setCampaniaId] = useState<number | ''>('')
  const [supervisorId, setSupervisorId] = useState<number | ''>('')

  // Catálogo real de campañas (el mismo que usa Configuración > Contact Center
  // > Campañas y skills / Asignación de agentes) — antes leía de
  // /operaciones/campanias, una tabla vieja sin datos, desconectada de donde
  // realmente se cargan campañas y agentes.
  const { data: campanias = [] } = useQuery({
    queryKey: ['cc-campanias-supervisor'],
    queryFn: () => ccService.getCampanias(),
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-todas-areas'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/todas-areas')
      return ((data?.data ?? []) as Usuario[]).filter((u) => ['AD', 'TI'].includes(u.tipoUsuario))
    },
  })

  const asignar = useMutation({
    mutationFn: () => supervisoresService.asignar(Number(campaniaId), Number(supervisorId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisores-asignaciones'] })
      toast.success('Supervisor asignado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al asignar'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Asignar supervisor a campaña" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaña</label>
          <select value={campaniaId} onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')} className="field">
            <option value="">Selecciona una campaña</option>
            {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Supervisor</label>
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value ? Number(e.target.value) : '')} className="field">
            <option value="">Selecciona un usuario</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={asignar.isPending} disabled={!campaniaId || !supervisorId} onClick={() => asignar.mutate()}>Asignar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Tab: Estatus — todos los agentes de todas las campañas, filtrables por estado ── */
function EstatusTab() {
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoAgente>('todos')

  const { data, isLoading } = useQuery({
    queryKey: ['supervisores-mi-panel'],
    queryFn: () => supervisoresService.getMiPanel(),
    refetchInterval: 15_000,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const agentes = data?.agentes ?? []
  const grupos = data?.grupos ?? []
  const campanias = data?.campanias ?? []

  if (agentes.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <Users className="h-8 w-8" />
        <p className="text-sm">No tienes agentes asignados a tus campañas todavía</p>
      </div>
    )
  }

  const nombreCampania = new Map(campanias.map((c) => [c.id, c.nombre]))
  const nombreSkill = new Map(grupos.map((g) => [g.id, g.nombre]))

  // getMiPanel devuelve una fila por combinación agente+skill (un agente
  // puede estar en varios skills) — aquí se listan agentes, no asignaciones,
  // así que cada agenteId debe aparecer una sola vez.
  const agentesUnicos = Array.from(new Map(agentes.map((a) => [a.agenteId, a])).values())

  const disponibles = agentesUnicos.filter((a) => a.estado === 'disponible').length
  const enPausa = agentesUnicos.filter((a) => a.estado === 'pausa').length
  const noDisponibles = agentesUnicos.filter((a) => a.estado === 'no_disponible').length
  const desconectados = agentesUnicos.filter((a) => a.estado === 'desconectado').length
  const agentesFiltrados = filtroEstado === 'todos' ? agentesUnicos : agentesUnicos.filter((a) => a.estado === filtroEstado)

  const toggleFiltro = (estado: 'todos' | EstadoAgente) => setFiltroEstado((v) => (v === estado ? 'todos' : estado))

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => toggleFiltro('todos')}
          title={`Ver todos los agentes (${agentesUnicos.length})`}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
            filtroEstado === 'todos' ? 'bg-brand/10 text-brand ring-1 ring-brand/30' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
          )}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand" />
          Agentes
        </button>
        <button
          onClick={() => toggleFiltro('disponible')}
          title={`Filtrar por agentes disponibles (${disponibles})`}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
            filtroEstado === 'disponible' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
          )}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
          Disponibles
        </button>
        <button
          onClick={() => toggleFiltro('pausa')}
          title={`Filtrar por agentes en pausa (${enPausa})`}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
            filtroEstado === 'pausa' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
          )}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
          En pausa
        </button>
        <button
          onClick={() => toggleFiltro('no_disponible')}
          title={`Filtrar por agentes no disponibles (${noDisponibles})`}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
            filtroEstado === 'no_disponible' ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
          )}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
          No disponibles
        </button>
        <button
          onClick={() => toggleFiltro('desconectado')}
          title={`Filtrar por agentes desconectados (${desconectados})`}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
            filtroEstado === 'desconectado' ? 'bg-gray-200 text-gray-700 ring-1 ring-gray-300' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
          )}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-400" />
          Desconectados
        </button>
        {filtroEstado !== 'todos' && (
          <button
            onClick={() => setFiltroEstado('todos')}
            className="text-[0.68rem] font-medium text-gray-400 hover:text-brand hover:underline"
          >
            Quitar filtro
          </button>
        )}
      </div>

      <div className="p-3">
        {agentesFiltrados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Users className="h-6 w-6" />
            <p className="text-xs">Ningún agente en este estado ahora mismo</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {agentesFiltrados.map((a) => {
              const estilo = ESTADO_ESTILOS[a.estado]
              return (
                <div
                  key={a.agenteId}
                  className={clsx('w-full flex items-center gap-3 rounded-lg px-3 py-2.5', estilo.card)}
                >
                  <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', estilo.iconBg)}>
                    {estilo.icon({ className: 'h-3.5 w-3.5' })}
                  </div>
                  <div className="min-w-0 flex-1 flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.nombre}</p>
                    <p className="text-xs text-gray-500 truncate">{estadoTexto(a)}</p>
                  </div>
                  <p className="flex-shrink-0 text-[0.68rem] text-gray-400">
                    {nombreCampania.get(a.campaniaId) ?? ''} · {nombreSkill.get(a.grupoId) ?? ''}
                  </p>
                  <span className={clsx('flex-shrink-0 h-2 w-2 rounded-full', estilo.dot)} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Asignar supervisor por skill, sin salir del módulo Supervisor ── */
function AsignarPorSkillPanel() {
  const qc = useQueryClient()
  const [campaniaId, setCampaniaId] = useState<number | ''>('')
  const [skillId, setSkillId] = useState<number | ''>('')

  const { data: campanias = [] } = useQuery({
    queryKey: ['cc-campanias-supervisor'],
    queryFn: () => ccService.getCampanias(),
  })
  const { data: skills = [] } = useQuery({
    queryKey: ['cc-grupos-supervisor', campaniaId],
    queryFn: () => ccService.getGrupos(Number(campaniaId)),
    enabled: campaniaId !== '',
  })
  const skillActivo = skills.find((s) => s.id === skillId)

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
          <Layers className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Asignar supervisor por skill</p>
          <p className="text-xs text-gray-500">Alcance acotado a un solo skill dentro de una campaña</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Selector en forma de "camino" campaña → skill, para reforzar la jerarquía */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">1. Campaña</label>
            <select
              value={campaniaId}
              onChange={(e) => { setCampaniaId(e.target.value ? Number(e.target.value) : ''); setSkillId('') }}
              className="field"
            >
              <option value="">Selecciona una campaña</option>
              {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <ChevronRight className="hidden h-4 w-4 flex-shrink-0 text-gray-300 sm:block sm:mt-5" />
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">2. Skill</label>
            <select
              value={skillId}
              onChange={(e) => setSkillId(e.target.value ? Number(e.target.value) : '')}
              disabled={campaniaId === ''}
              className="field disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{campaniaId === '' ? 'Elige una campaña primero' : 'Selecciona un skill'}</option>
              {skills.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>

        {skillId !== '' && (
          <div className="animate-fade-in rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Layers className="h-3.5 w-3.5 text-violet-500" />
              Supervisores de {skillActivo?.nombre ?? 'este skill'}
            </p>
            <AsignacionSupervisores
              nivel="skill"
              id={Number(skillId)}
              onChanged={() => qc.invalidateQueries({ queryKey: ['supervisores-historial-asignaciones'] })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Tab: Alarmas — instancias activas (en_alarma/atendida) de las alarmas
   configuradas (Fase 1 del plan de evolución basado en PSUP de Mitrol):
   agente en pausa prolongada, skill con chats en cola sin asignar. ── */
// Hace cuánto empezó la alarma, en formato corto ("hace 12 min") — ayuda a
// priorizar de un vistazo sin tener que leer la fecha/hora completa.
function tiempoTranscurrido(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function AlarmaCard({
  inst, comentario, onComentarioChange, onAtender, atendiendo,
}: {
  inst: AlarmaInstancia
  comentario: string
  onComentarioChange: (v: string) => void
  onAtender: () => void
  atendiendo: boolean
}) {
  const activa = inst.estado === 'en_alarma'
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-xl border p-4 transition-shadow',
        activa ? 'border-red-200 bg-red-50/40 shadow-sm' : 'border-gray-100 bg-white',
      )}
    >
      {activa && <span className="absolute inset-y-0 left-0 w-1 bg-red-500" />}
      <div className="flex items-start gap-3">
        <div className={clsx(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
          activa ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600',
        )}>
          {activa ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-gray-900">{inst.alarmaNombre}</p>
            <span className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide',
              activa ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
            )}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', activa ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')} />
              {activa ? 'En alarma' : 'Atendida'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              {inst.objetoTipo === 'agente' ? <UserCheck className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
              <span className="font-medium text-gray-700">{inst.objetoNombre ?? `#${inst.objetoId}`}</span>
            </span>
            <span className="text-gray-300">·</span>
            <span className={clsx(activa && 'font-semibold text-red-600')}>{tiempoTranscurrido(inst.fechaInicio)}</span>
          </div>
          {inst.comentario && (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-500">Nota:</span> {inst.comentario}
            </p>
          )}
          {activa && (
            <div className="mt-3 flex items-center gap-2">
              <input
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                placeholder="Comentario (opcional)"
                value={comentario}
                onChange={(e) => onComentarioChange(e.target.value)}
              />
              <Button size="sm" onClick={onAtender} disabled={atendiendo}>
                Atender
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AlarmasTab() {
  const qc = useQueryClient()
  const [comentarios, setComentarios] = useState<Record<number, string>>({})

  const { data: instancias = [], isLoading } = useQuery({
    queryKey: ['supervisores-alarmas'],
    queryFn: () => supervisoresService.getAlarmas(),
    refetchInterval: 15_000,
  })

  const atender = useMutation({
    mutationFn: ({ id, comentario }: { id: number; comentario?: string }) => supervisoresService.atenderAlarma(id, comentario),
    onSuccess: () => { toast.success('Alarma atendida'); qc.invalidateQueries({ queryKey: ['supervisores-alarmas'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo atender la alarma'),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const enAlarma = instancias.filter((i) => i.estado === 'en_alarma')
  const atendidas = instancias.filter((i) => i.estado === 'atendida')

  if (instancias.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Todo en orden</p>
          <p className="mt-0.5 text-xs text-gray-400">No hay alarmas activas en tus campañas ahora mismo</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className={clsx('card flex items-center gap-3 p-3', enAlarma.length > 0 && 'border-red-200 bg-red-50/40')}>
          <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', enAlarma.length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400')}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className={clsx('text-lg font-bold leading-none', enAlarma.length > 0 ? 'text-red-600' : 'text-gray-400')}>{enAlarma.length}</p>
            <p className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-gray-400">En alarma</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-lg font-bold leading-none text-gray-700">{atendidas.length}</p>
            <p className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-gray-400">Atendidas</p>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {[...enAlarma, ...atendidas].map((inst) => (
          <AlarmaCard
            key={inst.id}
            inst={inst}
            comentario={comentarios[inst.id] ?? ''}
            onComentarioChange={(v) => setComentarios((c) => ({ ...c, [inst.id]: v }))}
            onAtender={() => atender.mutate({ id: inst.id, comentario: comentarios[inst.id] })}
            atendiendo={atender.isPending}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Tab: Notificaciones a agentes (Fase 2, 3.3 del plan basado en PSUP) —
   informativa (toast que se cierra solo) u obligatoria (bloquea la pantalla
   del agente hasta que la cierra), dirigida a un agente, un skill, una
   campaña o todos. ── */
function NotificacionesTab() {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<NotificacionTipo>('informativa')
  const [alcance, setAlcance] = useState<NotificacionAlcance>('agente')
  const [alcanceId, setAlcanceId] = useState<number | ''>('')
  const [mensaje, setMensaje] = useState('')

  const { data: panel } = useQuery({
    queryKey: ['supervisores-mi-panel'],
    queryFn: () => supervisoresService.getMiPanel(),
  })
  const { data: enviadas = [], isLoading } = useQuery({
    queryKey: ['supervisores-notificaciones-enviadas'],
    queryFn: () => supervisoresService.getNotificacionesEnviadas(),
  })

  const enviar = useMutation({
    mutationFn: () => supervisoresService.crearNotificacion({
      tipo, alcance, alcanceId: alcance === 'todos' ? undefined : Number(alcanceId), mensaje: mensaje.trim(),
    }),
    onSuccess: () => {
      toast.success('Notificación enviada')
      setMensaje('')
      setAlcanceId('')
      qc.invalidateQueries({ queryKey: ['supervisores-notificaciones-enviadas'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo enviar la notificación'),
  })

  const agentesUnicos = useMemo(() => {
    const vistos = new Set<number>()
    return (panel?.agentes ?? []).filter((a) => (vistos.has(a.agenteId) ? false : (vistos.add(a.agenteId), true)))
  }, [panel?.agentes])

  const puedeEnviar = mensaje.trim().length > 0 && (alcance === 'todos' || alcanceId !== '')
  const MENSAJE_MAX = 500

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-500">Tipo de notificación</label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setTipo('informativa')}
              className={clsx(
                'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors',
                tipo === 'informativa' ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 hover:border-gray-200',
              )}
            >
              <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', tipo === 'informativa' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400')}>
                <Megaphone className="h-4 w-4" />
              </div>
              <div>
                <p className={clsx('text-sm font-semibold', tipo === 'informativa' ? 'text-blue-700' : 'text-gray-700')}>Informativa</p>
                <p className="mt-0.5 text-xs text-gray-400">Aparece como aviso, no bloquea al agente</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('obligatoria')}
              className={clsx(
                'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors',
                tipo === 'obligatoria' ? 'border-red-300 bg-red-50/60' : 'border-gray-100 hover:border-gray-200',
              )}
            >
              <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', tipo === 'obligatoria' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400')}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className={clsx('text-sm font-semibold', tipo === 'obligatoria' ? 'text-red-700' : 'text-gray-700')}>Obligatoria</p>
                <p className="mt-0.5 text-xs text-gray-400">Bloquea su pantalla hasta que la cierra</p>
              </div>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Enviar a</label>
            <select
              value={alcance}
              onChange={(e) => { setAlcance(e.target.value as NotificacionAlcance); setAlcanceId('') }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              {(Object.keys(NOTIFICACION_ALCANCE_LABELS) as NotificacionAlcance[]).map((a) => (
                <option key={a} value={a}>{NOTIFICACION_ALCANCE_LABELS[a]}</option>
              ))}
            </select>
          </div>
          {alcance === 'agente' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Agente</label>
              <select value={alcanceId} onChange={(e) => setAlcanceId(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                <option value="">Selecciona...</option>
                {agentesUnicos.map((a) => <option key={a.agenteId} value={a.agenteId}>{a.nombre}</option>)}
              </select>
            </div>
          )}
          {alcance === 'skill' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Skill</label>
              <select value={alcanceId} onChange={(e) => setAlcanceId(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                <option value="">Selecciona...</option>
                {(panel?.grupos ?? []).map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </div>
          )}
          {alcance === 'campania' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Campaña</label>
              <select value={alcanceId} onChange={(e) => setAlcanceId(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                <option value="">Selecciona...</option>
                {(panel?.campanias ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value.slice(0, MENSAJE_MAX))}
            placeholder="Escribe el mensaje para los agentes..."
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <p className="mt-1 text-right text-[0.65rem] text-gray-300">{mensaje.length}/{MENSAJE_MAX}</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => enviar.mutate()} disabled={!puedeEnviar || enviar.isPending} isLoading={enviar.isPending}>
            <Megaphone className="h-4 w-4" /> Enviar notificación
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          Enviadas
          {enviadas.length > 0 && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.62rem] font-bold text-gray-500">{enviadas.length}</span>}
        </h3>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : enviadas.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
              <Megaphone className="h-5 w-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">Todavía no has enviado notificaciones</p>
          </div>
        ) : (
          <div className="space-y-2">
            {enviadas.map((n) => (
              <div key={n.id} className="card flex items-start gap-3 p-3.5">
                <div className={clsx('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                  n.tipo === 'obligatoria' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600')}>
                  {n.tipo === 'obligatoria' ? <AlertTriangle className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{n.mensaje}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-500">
                      {NOTIFICACION_ALCANCE_LABELS[n.alcance]}
                    </span>
                    <span className={clsx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide',
                      n.tipo === 'obligatoria' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600',
                    )}>
                      {n.tipo === 'obligatoria' ? 'Obligatoria' : 'Informativa'}
                    </span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {new Date(n.fecha).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Tab: Comparador entre agentes/campañas (Fase 2, 3.4 del plan basado en
   PSUP) — a diferencia de Productividad (un agente vs su propio histórico),
   aquí se ordenan varios agentes o campañas lado a lado por la misma
   métrica, para ver quién destaca o quién necesita atención. ── */
function fmtSegundos(seg: number | null) {
  if (seg == null) return '—'
  if (seg < 60) return `${seg}s`
  return `${Math.floor(seg / 60)}m ${seg % 60}s`
}

type ComparadorVista = 'agentes' | 'campanias'
type OrdenCampo = 'pausaMin' | 'chatsCerrados' | 'tiempoRespuestaProm' | 'agentes'

const COLUMNAS_COMPARADOR_AGENTES = [
  { key: 'chatsCerrados', label: 'Chats cerrados hoy' },
  { key: 'pausaMin', label: 'Minutos en pausa' },
  { key: 'tiempoRespuestaProm', label: '1ra respuesta prom.' },
]
const COLUMNAS_COMPARADOR_CAMPANIAS = [
  { key: 'agentes', label: 'Agentes' },
  { key: 'chatsCerrados', label: 'Chats cerrados hoy' },
  { key: 'pausaMin', label: 'Minutos en pausa' },
]

// Umbral de Nivel de Servicio para primera respuesta — mismo valor que usa el
// backend en getHistoricoSla (SLA_UMBRAL_SEGUNDOS). Solo para pintar el
// semáforo de la columna; el cálculo real vive en el servidor.
const SLA_UMBRAL_SEG = 120

// Mini barra horizontal proporcional al máximo del grupo visible — deja "ver"
// quién destaca de un vistazo, en vez de solo comparar números en columnas.
function BarraComparativa({ valor, max, color }: { valor: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((valor / max) * 100)) : 0
  return (
    <div className="h-1.5 w-full min-w-[64px] overflow-hidden rounded-full bg-gray-100">
      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function MedallaPosicion({ posicion }: { posicion: number }) {
  if (posicion > 2) return null
  const estilos = [
    'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
    'bg-gray-100 text-gray-600 ring-1 ring-gray-300',
    'bg-orange-100 text-orange-700 ring-1 ring-orange-300',
  ]
  return (
    <span className={clsx('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold', estilos[posicion])}>
      {posicion + 1}
    </span>
  )
}

function ComparadorTab() {
  const [vista, setVista] = useState<ComparadorVista>('agentes')
  const [orden, setOrden] = useState<OrdenCampo>('chatsCerrados')
  const [asc, setAsc] = useState(false)
  const columnasDisponibles = vista === 'agentes' ? COLUMNAS_COMPARADOR_AGENTES : COLUMNAS_COMPARADOR_CAMPANIAS
  const { visibles, toggle, esVisible } = useColumnasVisibles(
    vista === 'agentes' ? 'comparador_agentes' : 'comparador_campanias',
    columnasDisponibles,
  )

  const { data, isLoading } = useQuery({
    queryKey: ['supervisores-comparador'],
    queryFn: () => supervisoresService.getComparador(),
    refetchInterval: 30_000,
  })

  const filas = useMemo(() => {
    const base = vista === 'agentes' ? (data?.agentes ?? []) : (data?.campanias ?? [])
    return [...base].sort((a: any, b: any) => {
      const va = a[orden] ?? -1
      const vb = b[orden] ?? -1
      return asc ? va - vb : vb - va
    })
  }, [data, vista, orden, asc])

  // Máximos del grupo visible, para escalar las barras comparativas de cada
  // columna — recalculado con las filas ya filtradas/ordenadas.
  const maximos = useMemo(() => ({
    chatsCerrados: Math.max(1, ...filas.map((f: any) => f.chatsCerrados ?? 0)),
    pausaMin: Math.max(1, ...filas.map((f: any) => f.pausaMin ?? 0)),
    agentes: Math.max(1, ...filas.map((f: any) => f.agentes ?? 0)),
  }), [filas])

  const cambiarOrden = (campo: OrdenCampo) => {
    if (orden === campo) setAsc((v) => !v)
    else { setOrden(campo); setAsc(false) }
  }

  const Encabezado = ({ campo, children }: { campo: OrdenCampo; children: ReactElement | string }) => (
    <th
      onClick={() => cambiarOrden(campo)}
      className={clsx(
        'cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-right text-[0.65rem] font-bold uppercase tracking-wide transition-colors',
        orden === campo ? 'text-brand' : 'text-gray-400 hover:text-gray-600',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={clsx('text-[0.6rem] transition-opacity', orden === campo ? 'opacity-100' : 'opacity-0')}>
          {asc ? '▲' : '▼'}
        </span>
      </span>
    </th>
  )

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <button
            onClick={() => setVista('agentes')}
            className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', vista === 'agentes' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700')}
          >
            <UserCheck className="h-3.5 w-3.5" /> Por agente
          </button>
          <button
            onClick={() => setVista('campanias')}
            className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', vista === 'campanias' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700')}
          >
            <Layers className="h-3.5 w-3.5" /> Por campaña
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {filas.length} {vista === 'agentes' ? (filas.length === 1 ? 'agente' : 'agentes') : (filas.length === 1 ? 'campaña' : 'campañas')} · hoy
        </p>
        <div className="ml-auto">
          <SelectorColumnas columnas={columnasDisponibles} visibles={visibles} onToggle={toggle} />
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <BarChart3 className="h-8 w-8" />
          <p className="text-sm">Sin datos para comparar hoy</p>
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">
                  {vista === 'agentes' ? 'Agente' : 'Campaña'}
                </th>
                {vista === 'campanias' && esVisible('agentes') && <Encabezado campo="agentes">Agentes</Encabezado>}
                {esVisible('chatsCerrados') && <Encabezado campo="chatsCerrados">Chats cerrados hoy</Encabezado>}
                {esVisible('pausaMin') && <Encabezado campo="pausaMin">Minutos en pausa</Encabezado>}
                {vista === 'agentes' && esVisible('tiempoRespuestaProm') && <Encabezado campo="tiempoRespuestaProm">1ra respuesta prom.</Encabezado>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map((f: any, i: number) => {
                const pausaMin = f.pausaMin ?? 0
                const pausaColor = pausaMin >= 60 ? 'text-red-600' : pausaMin >= 30 ? 'text-amber-600' : 'text-gray-700'
                const dentroSla = f.tiempoRespuestaProm != null && f.tiempoRespuestaProm <= SLA_UMBRAL_SEG
                return (
                  <tr key={f.agenteId ?? f.campaniaId} className="group transition-colors hover:bg-brand/[0.03]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <MedallaPosicion posicion={i} />
                        {vista === 'agentes' ? (
                          <Avatar name={f.nombre || '?'} size="sm" />
                        ) : (
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                            <Layers className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className="font-semibold text-gray-800">{f.nombre || `#${f.agenteId ?? f.campaniaId}`}</span>
                      </div>
                    </td>
                    {vista === 'campanias' && esVisible('agentes') && (
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-xs tabular-nums text-gray-600">{f.agentes}</span>
                          <BarraComparativa valor={f.agentes ?? 0} max={maximos.agentes} color="bg-slate-400" />
                        </div>
                      </td>
                    )}
                    {esVisible('chatsCerrados') && (
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700">{f.chatsCerrados}</span>
                          <BarraComparativa valor={f.chatsCerrados ?? 0} max={maximos.chatsCerrados} color="bg-emerald-500" />
                        </div>
                      </td>
                    )}
                    {esVisible('pausaMin') && (
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-end gap-1">
                          <span className={clsx('font-mono text-xs font-semibold tabular-nums', pausaColor)}>{pausaMin} min</span>
                          <BarraComparativa valor={pausaMin} max={maximos.pausaMin} color={pausaMin >= 60 ? 'bg-red-400' : pausaMin >= 30 ? 'bg-amber-400' : 'bg-slate-300'} />
                        </div>
                      </td>
                    )}
                    {vista === 'agentes' && esVisible('tiempoRespuestaProm') && (
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
                            f.tiempoRespuestaProm == null ? 'text-gray-400' : dentroSla ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                          )}
                        >
                          {f.tiempoRespuestaProm != null && <span className={clsx('h-1.5 w-1.5 rounded-full', dentroSla ? 'bg-emerald-500' : 'bg-red-500')} />}
                          {fmtSegundos(f.tiempoRespuestaProm)}
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Historial de quién asignó/quitó a qué supervisor y cuándo ── */
function HistorialAsignacionesPanel() {
  const { data: historial = [], isLoading } = useQuery({
    queryKey: ['supervisores-historial-asignaciones'],
    queryFn: () => supervisoresService.getHistorialAsignaciones(),
  })

  if (isLoading) return <div className="card flex justify-center py-10"><Spinner /></div>
  if (historial.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-12 text-gray-400">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
          <History className="h-5 w-5" />
        </div>
        <p className="text-sm">Todavía no hay cambios registrados</p>
        <p className="text-xs text-gray-400">Cada asignación o remoción de supervisor aparecerá aquí</p>
      </div>
    )
  }

  return (
    <div className="card divide-y divide-gray-50 overflow-hidden p-0">
      {historial.map((h) => {
        const d = h.detalle
        const alcance = d?.grupoNombre ?? d?.campaniaNombre ?? '—'
        const tipo = d?.grupoNombre ? 'skill' : 'campaña'
        const esQuitar = h.accion.startsWith('quitar-')
        return (
          <div key={h.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={h.usuarioNombre ?? '?'} size="sm" />
            <div className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', esQuitar ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600')}>
              {esQuitar ? <Trash2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </div>
            <div className="min-w-0 flex-1 text-xs text-gray-600">
              <span className="font-semibold text-gray-900">{h.usuarioNombre ?? 'Alguien'}</span>{' '}
              {esQuitar ? 'quitó' : 'asignó'} a{' '}
              <span className="font-medium text-gray-800">{d?.supervisorNombre ?? 'un supervisor'}</span>{' '}
              {esQuitar ? 'de' : 'a'}{' '}
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', tipo === 'skill' ? 'bg-violet-50 text-violet-600' : 'bg-brand/10 text-brand')}>
                {tipo === 'skill' ? <Layers className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
                {alcance}
              </span>
            </div>
            <span className="flex-shrink-0 text-[0.68rem] text-gray-400">
              {new Date(h.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Tab: Administrar (admin) ── */
function AdministrarTab() {
  const qc = useQueryClient()
  const [showAsignar, setShowAsignar] = useState(false)

  const { data: asignaciones = [], isLoading } = useQuery({
    queryKey: ['supervisores-asignaciones'],
    queryFn: () => supervisoresService.getAsignaciones(),
  })

  const quitar = useMutation({
    mutationFn: (id: number) => supervisoresService.quitar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisores-asignaciones'] })
      qc.invalidateQueries({ queryKey: ['supervisores-historial-asignaciones'] })
      toast.success('Supervisor quitado de la campaña')
    },
    onError: () => toast.error('Error al quitar el supervisor'),
  })

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Circle className="h-4 w-4 fill-current" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Supervisores por campaña</p>
              <p className="text-xs text-gray-500">Ven todos los skills de la campaña asignada</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowAsignar(true)}><Plus className="h-3.5 w-3.5" /> Asignar supervisor</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : asignaciones.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-12 text-gray-400">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
              <Users className="h-5 w-5" />
            </div>
            <p className="text-sm">No hay supervisores asignados a campañas todavía</p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="divide-y divide-gray-50">
              {asignaciones.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/60">
                  <Avatar name={a.supervisorNombre} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.supervisorNombre}</p>
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <Circle className="h-2 w-2 fill-current text-brand" />
                      {a.campaniaNombre}
                    </p>
                  </div>
                  <button
                    onClick={() => quitar.mutate(a.id)}
                    title="Quitar supervisor de esta campaña"
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AsignarPorSkillPanel />

      <div>
        <p className="mb-3 text-sm font-semibold text-gray-900">Historial de cambios</p>
        <HistorialAsignacionesPanel />
      </div>

      {showAsignar && <AsignarSupervisorModal onClose={() => setShowAsignar(false)} />}
    </div>
  )
}

/* ── Página principal ── */
export function SupervisoresPage() {
  const isAdmin = useIsADorTI()
  const [searchParams] = useSearchParams()
  const tabInicial = searchParams.get('tab')
  const [tab, setTab] = useState<'panel' | 'productividad' | 'comparador' | 'estatus' | 'alarmas' | 'notificaciones' | 'historial' | 'administrar'>(
    tabInicial === 'productividad' || tabInicial === 'comparador' || tabInicial === 'estatus' || tabInicial === 'alarmas' || tabInicial === 'notificaciones' || tabInicial === 'historial' || tabInicial === 'administrar' ? tabInicial : 'panel',
  )
  const { data: alarmas = [] } = useQuery({
    queryKey: ['supervisores-alarmas'],
    queryFn: () => supervisoresService.getAlarmas(),
    refetchInterval: 15_000,
  })
  const alarmasActivas = alarmas.filter((a) => a.estado === 'en_alarma').length

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-brand" /> Supervisor
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Panel de supervisores de Call Center</p>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('panel')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'panel' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <Clock className="h-3.5 w-3.5" /> Panel en vivo
        </button>
        <button
          onClick={() => setTab('productividad')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'productividad' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Productividad
        </button>
        <button
          onClick={() => setTab('comparador')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'comparador' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <Layers className="h-3.5 w-3.5" /> Comparador
        </button>
        <button
          onClick={() => setTab('estatus')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'estatus' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <Circle className="h-3.5 w-3.5" /> Estatus
        </button>
        <button
          onClick={() => setTab('alarmas')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'alarmas' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Alarmas
          {alarmasActivas > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.65rem] font-bold text-white">
              {alarmasActivas}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('notificaciones')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'notificaciones' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <Megaphone className="h-3.5 w-3.5" /> Notificaciones
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('historial')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'historial' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            <History className="h-3.5 w-3.5" /> Historial
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setTab('administrar')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'administrar' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            <Users className="h-3.5 w-3.5" /> Administrar
          </button>
        )}
      </div>

      {tab === 'panel' && <PanelEnVivoTab />}
      {tab === 'productividad' && <ProductividadTab />}
      {tab === 'comparador' && <ComparadorTab />}
      {tab === 'estatus' && <EstatusTab />}
      {tab === 'alarmas' && <AlarmasTab />}
      {tab === 'notificaciones' && <NotificacionesTab />}
      {/* Solo admins: no existe "mi propio historial" en Supervisores, así
          que siempre ve el historial completo de todos los agentes (puedeSupervisar=true). */}
      {tab === 'historial' && isAdmin && <HistorialConversacionesPanel puedeSupervisar />}
      {tab === 'administrar' && isAdmin && <AdministrarTab />}
    </div>
  )
}
