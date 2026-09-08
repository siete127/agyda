import { useMemo, useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Users, UserCheck, Clock, BarChart3, Plus, Trash2, Coffee, History,
  ChevronRight, ChevronLeft, Layers, MessageCircle, Circle, PowerOff, MinusCircle,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { supervisoresService } from '@/services/supervisores.service'
import { ccService } from '@/services/cc.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { TIPO_PAUSA_LABELS, ESTADO_AGENTE_LABELS, type AgenteEstado, type EstadoAgente } from '@/types/supervisores.types'
import type { CCInteraccion } from '@/types/cc.types'
import { HistorialConversacionesPanel } from '@/pages/livechat/HistorialConversacionesPanel'

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

/* ── Tarjeta de agente (nivel 3: agentes de un skill) ── */
function AgenteCard({ agente, chatsActivos, onClick }: { agente: AgenteEstado; chatsActivos: number; onClick: () => void }) {
  const estilo = ESTADO_ESTILOS[agente.estado]
  return (
    <button
      onClick={onClick}
      className={clsx('card p-4 flex items-center gap-3 text-left transition-colors hover:border-brand/30 hover:bg-brand/[0.02]', estilo.card)}
    >
      <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', estilo.iconBg)}>
        {estilo.icon({ className: 'h-4 w-4' })}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{agente.nombre}</p>
        <p className="text-xs text-gray-500">{estadoTexto(agente)}</p>
      </div>
      {chatsActivos > 0 && (
        <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[0.68rem] font-semibold text-brand">
          <MessageCircle className="h-3 w-3" /> {chatsActivos}
        </span>
      )}
      <span className={clsx('flex-shrink-0 h-2 w-2 rounded-full', estilo.dot)} />
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
    </button>
  )
}

/* ── Fila de chat asignado (nivel 4: chats de un agente) ── */
function ChatRow({ chat }: { chat: CCInteraccion }) {
  const ESTADO_LABEL: Record<string, string> = { activa: 'Activa', en_cola: 'En cola', pendiente_tipificacion: 'Pendiente tipificación' }
  const ESTADO_COLOR: Record<string, string> = {
    activa: 'bg-emerald-100 text-emerald-700',
    en_cola: 'bg-amber-100 text-amber-700',
    pendiente_tipificacion: 'bg-blue-100 text-blue-700',
  }
  return (
    <div className="card p-3.5 flex items-center gap-3">
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
    </div>
  )
}

/* ── Tab: Panel en vivo — navegación Campaña > Skill > Agente > sus chats ── */
function PanelEnVivoTab() {
  const [campaniaId, setCampaniaId] = useState<number | null>(null)
  const [skillId, setSkillId] = useState<number | null>(null)
  const [agenteSeleccionado, setAgenteSeleccionado] = useState<AgenteEstado | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['supervisores-mi-panel'],
    queryFn: () => supervisoresService.getMiPanel(),
    refetchInterval: 15_000,
  })

  // Solo se pide cuando hace falta contar/listar chats (niveles 3 y 4) — evita
  // pedir todas las interacciones activas de la empresa mientras se navegan
  // campañas y skills, donde todavía no hace falta.
  const { data: interacciones = [] } = useQuery({
    queryKey: ['cc-supervision-activas'],
    queryFn: () => ccService.supervisionActivas(),
    enabled: campaniaId != null && skillId != null,
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

  // ── Breadcrumb ──
  const campaniaActiva = campanias.find((c) => c.id === campaniaId)
  const skillActivo = grupos.find((g) => g.id === skillId)
  const Breadcrumb = () => (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
      <button
        onClick={() => { setCampaniaId(null); setSkillId(null); setAgenteSeleccionado(null) }}
        className={clsx('font-medium hover:text-brand', campaniaId == null && 'text-brand')}
      >
        Campañas
      </button>
      {campaniaActiva && (
        <>
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => { setSkillId(null); setAgenteSeleccionado(null) }}
            className={clsx('font-medium hover:text-brand', skillId == null && 'text-brand')}
          >
            {campaniaActiva.nombre}
          </button>
        </>
      )}
      {skillActivo && (
        <>
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => setAgenteSeleccionado(null)}
            className={clsx('font-medium hover:text-brand', agenteSeleccionado == null && 'text-brand')}
          >
            {skillActivo.nombre}
          </button>
        </>
      )}
      {agenteSeleccionado && (
        <>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-brand">{agenteSeleccionado.nombre}</span>
        </>
      )}
    </div>
  )

  // ── Nivel 4: chats del agente seleccionado ──
  if (agenteSeleccionado) {
    const chats = chatsPorAgente.get(agenteSeleccionado.agenteId) ?? []
    return (
      <div className="space-y-4">
        <Breadcrumb />
        <button onClick={() => setAgenteSeleccionado(null)} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-brand">
          <ChevronLeft className="h-3.5 w-3.5" /> Volver a agentes
        </button>
        {chats.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
            <MessageCircle className="h-8 w-8" />
            <p className="text-sm">{agenteSeleccionado.nombre} no tiene chats asignados ahora mismo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((c) => <ChatRow key={c.id} chat={c} />)}
          </div>
        )}
      </div>
    )
  }

  // ── Nivel 3: agentes del skill seleccionado ──
  if (skillId != null) {
    const agentesDelSkill = agentes.filter((a) => a.grupoId === skillId)
    const disponibles = agentesDelSkill.filter((a) => a.estado === 'disponible').length
    const enPausa = agentesDelSkill.filter((a) => a.estado === 'pausa').length
    const desconectados = agentesDelSkill.filter((a) => a.estado === 'desconectado').length
    return (
      <div className="space-y-4">
        <Breadcrumb />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Users className="h-4 w-4" /></div>
            <div><p className="text-lg font-bold text-gray-900 leading-tight">{agentesDelSkill.length}</p><p className="text-[0.68rem] text-gray-500">Agentes</p></div>
          </div>
          <div className="card p-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><UserCheck className="h-4 w-4" /></div>
            <div><p className="text-lg font-bold text-gray-900 leading-tight">{disponibles}</p><p className="text-[0.68rem] text-gray-500">Disponibles</p></div>
          </div>
          <div className="card p-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Coffee className="h-4 w-4" /></div>
            <div><p className="text-lg font-bold text-gray-900 leading-tight">{enPausa}</p><p className="text-[0.68rem] text-gray-500">En pausa</p></div>
          </div>
          <div className="card p-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-400"><PowerOff className="h-4 w-4" /></div>
            <div><p className="text-lg font-bold text-gray-900 leading-tight">{desconectados}</p><p className="text-[0.68rem] text-gray-500">Desconectados</p></div>
          </div>
        </div>
        {agentesDelSkill.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
            <Users className="h-8 w-8" />
            <p className="text-sm">Este skill no tiene agentes asignados</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agentesDelSkill.map((a) => (
              <AgenteCard
                key={a.agenteId}
                agente={a}
                chatsActivos={(chatsPorAgente.get(a.agenteId) ?? []).length}
                onClick={() => setAgenteSeleccionado(a)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Nivel 2: skills de la campaña seleccionada ──
  if (campaniaId != null) {
    const skillsDeCampania = grupos.filter((g) => g.campaniaId === campaniaId)
    return (
      <div className="space-y-4">
        <Breadcrumb />
        {skillsDeCampania.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
            <Layers className="h-8 w-8" />
            <p className="text-sm">Esta campaña no tiene skills configurados</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skillsDeCampania.map((s) => {
              const cantidadAgentes = agentes.filter((a) => a.grupoId === s.id).length
              return (
                <button
                  key={s.id}
                  onClick={() => setSkillId(s.id)}
                  className="card p-4 flex items-center gap-3 text-left transition-colors hover:border-brand/30 hover:bg-brand/[0.02]"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 text-base">
                    {s.icono || <Layers className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.nombre}</p>
                    <p className="text-xs text-gray-500">{cantidadAgentes} agente{cantidadAgentes !== 1 ? 's' : ''}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Nivel 1: campañas ──
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campanias.map((c) => {
          const cantidadAgentes = agentes.filter((a) => a.campaniaId === c.id).length
          const cantidadSkills = grupos.filter((g) => g.campaniaId === c.id).length
          return (
            <button
              key={c.id}
              onClick={() => setCampaniaId(c.id)}
              className="card p-4 flex items-center gap-3 text-left transition-colors hover:border-brand/30 hover:bg-brand/[0.02]"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Circle className="h-4 w-4 fill-current" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre}</p>
                <p className="text-xs text-gray-500">{cantidadSkills} skill{cantidadSkills !== 1 ? 's' : ''} · {cantidadAgentes} agente{cantidadAgentes !== 1 ? 's' : ''}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Tab: Productividad del día ── */
function ProductividadTab() {
  const { data: productividad = [], isLoading } = useQuery({
    queryKey: ['supervisores-productividad'],
    queryFn: () => supervisoresService.getProductividad(),
    refetchInterval: 15_000,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (productividad.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <BarChart3 className="h-8 w-8" />
        <p className="text-sm">Sin datos de productividad para hoy</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Agente</th>
            <th className="px-4 py-2.5 font-semibold">Estado</th>
            <th className="px-4 py-2.5 font-semibold">Baño</th>
            <th className="px-4 py-2.5 font-semibold">Comida</th>
            <th className="px-4 py-2.5 font-semibold">Capacitación</th>
            <th className="px-4 py-2.5 font-semibold">Permiso</th>
            <th className="px-4 py-2.5 font-semibold">Total pausas</th>
          </tr>
        </thead>
        <tbody>
          {productividad.map((p) => {
            const enPausa = p.estado === 'pausa'
            const BADGE_COLOR: Record<string, string> = {
              disponible: 'bg-emerald-100 text-emerald-700',
              pausa: 'bg-amber-100 text-amber-700',
              no_disponible: 'bg-orange-100 text-orange-700',
              desconectado: 'bg-gray-100 text-gray-500',
            }
            const DOT_COLOR: Record<string, string> = {
              disponible: 'bg-emerald-500',
              pausa: 'bg-amber-500',
              no_disponible: 'bg-orange-500',
              desconectado: 'bg-gray-400',
            }
            return (
              <tr key={p.agenteId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.nombre}</td>
                <td className="px-4 py-2.5">
                  <span className={clsx(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold',
                    BADGE_COLOR[p.estado],
                  )}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', DOT_COLOR[p.estado])} />
                    {enPausa ? (TIPO_PAUSA_LABELS[p.tipoPausa ?? ''] ?? p.tipoPausa) : ESTADO_AGENTE_LABELS[p.estado]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{p.banio} min</td>
                <td className="px-4 py-2.5 text-gray-600">{p.comida} min</td>
                <td className="px-4 py-2.5 text-gray-600">{p.capacitacion} min</td>
                <td className="px-4 py-2.5 text-gray-600">{p.permiso} min</td>
                <td className="px-4 py-2.5 font-semibold text-gray-900">{p.totalPausaMin} min</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
      toast.success('Supervisor quitado de la campaña')
    },
    onError: () => toast.error('Error al quitar el supervisor'),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAsignar(true)}><Plus className="h-3.5 w-3.5" /> Asignar supervisor</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : asignaciones.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Users className="h-8 w-8" />
          <p className="text-sm">No hay supervisores asignados a campañas todavía</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Campaña</th>
                <th className="px-4 py-2.5 font-semibold">Supervisor</th>
                <th className="px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {asignaciones.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{a.campaniaNombre}</td>
                  <td className="px-4 py-2.5 text-gray-600">{a.supervisorNombre}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => quitar.mutate(a.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 ml-auto">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAsignar && <AsignarSupervisorModal onClose={() => setShowAsignar(false)} />}
    </div>
  )
}

/* ── Página principal ── */
export function SupervisoresPage() {
  const isAdmin = useIsADorTI()
  const [searchParams] = useSearchParams()
  const tabInicial = searchParams.get('tab')
  const [tab, setTab] = useState<'panel' | 'productividad' | 'historial' | 'administrar'>(
    tabInicial === 'productividad' || tabInicial === 'historial' || tabInicial === 'administrar' ? tabInicial : 'panel',
  )

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
      {/* Solo admins: no existe "mi propio historial" en Supervisores, así
          que siempre ve el historial completo de todos los agentes (puedeSupervisar=true). */}
      {tab === 'historial' && isAdmin && <HistorialConversacionesPanel puedeSupervisar />}
      {tab === 'administrar' && isAdmin && <AdministrarTab />}
    </div>
  )
}
