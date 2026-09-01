import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  TrendingUp, Plus, X, Phone, Mail, CalendarDays, FileText,
  CheckCircle2, Circle, Trash2, Users, Kanban, ListTodo,
  Building2, User, ArrowRight, PhoneCall, Edit2, DollarSign,
  Calendar, ChevronRight, MoreHorizontal, BarChart2, Globe,
  Clock, List, Star, UserCheck, Briefcase,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { useCurrentUser } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from '@/hooks/useActionAccess'
import { crmService } from '@/services/crm.service'
import { api } from '@/lib/axios'
import {
  CRM_ETAPAS, CRM_ACTIVIDAD_TIPOS,
  type CRMEtapa, type CRMOportunidad, type CRMContacto,
  type CRMActividad, type CRMInteraccion, type CRMCotizacion,
} from '@/types/crm.types'
import { CRMReportesTab } from './CRMReportesTab'
import { CRMEmailModal }   from './CRMEmailModal'
import { CRMCotizacionModal } from './CRMCotizacionModal'
import { CRMSeguimientoTab } from './CRMSeguimientoTab'
import { CRMGenerarProyectoModal } from './CRMGenerarProyectoModal'

type Tab = 'pipeline' | 'contactos' | 'actividades' | 'seguimiento' | 'reportes'
type DrawerState = { opo: CRMOportunidad; contactos: CRMContacto[] } | null

/* ════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
════════════════════════════════════════════════════════ */
export function CRMInternoPage() {
  const [tab, setTab]           = useState<Tab>('pipeline')
  const [globalDrawer, setGD]   = useState<DrawerState>(null)
  const qc                      = useQueryClient()
  const { can }                 = useActionAccess()

  const { data: allOpos = [] } = useQuery({
    queryKey: ['crm-oportunidades'],
    queryFn:  crmService.getOportunidades,
    staleTime: 30_000,
  })
  const { data: allContactos = [] } = useQuery({
    queryKey: ['crm-contactos'],
    queryFn:  () => crmService.getContactos(),
    staleTime: 60_000,
  })

  const openOpo = (opoId: number) => {
    const opo = allOpos.find((o) => o.id === opoId)
    if (opo) { setGD({ opo, contactos: allContactos }); setTab('pipeline') }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">CRM</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">Gestión de oportunidades y contactos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit flex-wrap">
        {([
          { key: 'pipeline',    label: 'Pipeline',    icon: <Kanban className="h-3.5 w-3.5" /> },
          { key: 'contactos',   label: 'Contactos',   icon: <Users className="h-3.5 w-3.5" /> },
          { key: 'actividades', label: 'Actividades', icon: <ListTodo className="h-3.5 w-3.5" /> },
          ...(can('crm', 'seguimiento-ver') ? [{ key: 'seguimiento' as const, label: 'Seguimiento', icon: <UserCheck className="h-3.5 w-3.5" /> }] : []),
          { key: 'reportes',    label: 'Reportes',    icon: <BarChart2 className="h-3.5 w-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[0.78rem] font-semibold transition-all',
              tab === t.key ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'pipeline'     && <PipelineTab externalDrawer={globalDrawer} onClearExternal={() => setGD(null)} />}
      {tab === 'contactos'    && <ContactosTab />}
      {tab === 'actividades'  && <ActividadesTab onOpenOpo={openOpo} />}
      {tab === 'seguimiento'  && <CRMSeguimientoTab />}
      {tab === 'reportes'     && <CRMReportesTab />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   PIPELINE — Kanban
════════════════════════════════════════════════════════ */
function PipelineTab({
  externalDrawer, onClearExternal,
}: {
  externalDrawer: DrawerState | null
  onClearExternal: () => void
}) {
  const qc    = useQueryClient()
  const user  = useCurrentUser()
  const [drawerOpo, setDrawerOpo]   = useState<CRMOportunidad | null>(null)
  const [showNewOpo, setShowNewOpo] = useState(false)
  const [proyectoParaOpo, setProyectoParaOpo] = useState<CRMOportunidad | null>(null)
  const dragOpoId                   = useRef<number | null>(null)
  const dragOverOpoId               = useRef<number | null>(null)

  const { data: opos = [], isLoading } = useQuery({
    queryKey: ['crm-oportunidades'],
    queryFn:  crmService.getOportunidades,
    staleTime: 30_000,
  })
  const { data: contactos = [] } = useQuery({
    queryKey: ['crm-contactos'],
    queryFn:  () => crmService.getContactos(),
    staleTime: 60_000,
  })

  const del = useMutation({
    mutationFn: (id: number) => crmService.deleteOportunidad(id),
    onSuccess: () => { toast.success('Oportunidad eliminada'); qc.invalidateQueries({ queryKey: ['crm-oportunidades'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const moverEtapa = useMutation({
    mutationFn: ({ id, etapa }: { id: number; etapa: CRMEtapa }) => {
      const opo = opos.find((o) => o.id === id)!
      return crmService.updateOportunidad(id, {
        nombre: opo.nombre, etapa, contactoId: opo.contactoId,
        valor: opo.valor, fechaCierre: opo.fechaCierre, asignadoA: opo.asignadoA, notas: opo.notas,
        usuarioId: user?.id, usuarioNombre: user?.nombres,
      })
    },
    onSuccess: (_data, { id, etapa }) => {
      qc.invalidateQueries({ queryKey: ['crm-oportunidades'] })
      const opo = opos.find((o) => o.id === id)
      if (etapa === 'propuesta' && opo && !opo.proyectoId) setProyectoParaOpo(opo)
    },
    onError: () => toast.error('Error al mover'),
  })

  const reordenar = useMutation({
    mutationFn: ({ id, orden }: { id: number; orden: number }) => {
      const opo = opos.find((o) => o.id === id)!
      return crmService.updateOportunidad(id, {
        nombre: opo.nombre, etapa: opo.etapa, contactoId: opo.contactoId,
        valor: opo.valor, fechaCierre: opo.fechaCierre, asignadoA: opo.asignadoA, notas: opo.notas,
        usuarioId: user?.id, usuarioNombre: user?.nombres, orden,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-oportunidades'] }),
    onError: () => toast.error('Error al reordenar'),
  })

  // ── Filtros y Vista ──
  const [filtros, setFiltros] = useState({ busqueda: '', responsable: '', fechaDesde: '', fechaHasta: '', preset: '' })
  const [showFiltrosDropdown, setShowFiltrosDropdown] = useState(false)
  const [vista, setVista] = useState<'kanban' | 'lista'>('kanban')

  const userId = useAuthStore((s) => s.user?.id)

  const oposFiltradas = useMemo(() => opos.filter((o) => {
    if (filtros.preset === 'mias' && o.asignadoA !== userId) return false
    if (filtros.preset === 'sin_asignar' && o.asignadoA != null) return false
    if (filtros.preset === 'ganadas' && o.etapa !== 'ganado') return false
    if (filtros.preset === 'perdidas' && o.etapa !== 'perdido') return false
    if (filtros.preset === 'en_curso' && (o.etapa === 'ganado' || o.etapa === 'perdido')) return false
    if (filtros.busqueda && !`${o.nombre} ${o.contactoNombre ?? ''} ${o.contactoEmpresa ?? ''}`.toLowerCase().includes(filtros.busqueda.toLowerCase())) return false
    if (filtros.responsable && String(o.asignadoA) !== filtros.responsable) return false
    if (filtros.fechaDesde && o.fechaCierre && o.fechaCierre < filtros.fechaDesde) return false
    if (filtros.fechaHasta && o.fechaCierre && o.fechaCierre > filtros.fechaHasta) return false
    return true
  }), [opos, filtros, userId])

  const responsablesUnicos = useMemo(() => {
    const map = new Map<number, string>()
    opos.forEach((o) => { if (o.asignadoA && o.asignadoNombre) map.set(o.asignadoA, o.asignadoNombre) })
    return Array.from(map.entries()).map(([id, nombre]) => ({ value: String(id), label: nombre }))
  }, [opos])

  const PRESETS = [
    { key: 'mias',        label: 'Mis oportunidades' },
    { key: 'sin_asignar', label: 'Sin asignar' },
    { key: 'ganadas',     label: 'Ganadas' },
    { key: 'perdidas',    label: 'Perdidas' },
    { key: 'en_curso',    label: 'En curso' },
  ]

  const activeDrawerOpo = externalDrawer?.opo ?? drawerOpo
  const activeContactos = externalDrawer?.contactos ?? contactos

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <>
      {/* Header con botones de vista y nueva oportunidad */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Barra de filtros */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Dropdown presets */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFiltrosDropdown((v) => !v)}
              className={clsx(
                'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.78rem] font-semibold transition-colors',
                filtros.preset ? 'border-brand/40 bg-brand/5 text-brand' : 'border-gray-200 bg-card text-gray-600 hover:bg-gray-50',
              )}
            >
              {filtros.preset ? PRESETS.find((p) => p.key === filtros.preset)?.label : 'Filtros'}
              <ChevronRight className={clsx('h-3.5 w-3.5 text-gray-400 transition-transform', showFiltrosDropdown && 'rotate-90')} />
            </button>
            {showFiltrosDropdown && (
              <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-xl border border-gray-200 bg-card shadow-xl overflow-hidden">
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => { setFiltros((f) => ({ ...f, preset: '' })); setShowFiltrosDropdown(false) }}
                    className={clsx('w-full px-3 py-2 text-left text-[0.78rem] hover:bg-gray-50 transition-colors', !filtros.preset ? 'text-brand font-semibold bg-brand/5' : 'text-gray-600')}
                  >
                    Todas
                  </button>
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => { setFiltros((f) => ({ ...f, preset: p.key })); setShowFiltrosDropdown(false) }}
                      className={clsx('w-full px-3 py-2 text-left text-[0.78rem] hover:bg-gray-50 transition-colors', filtros.preset === p.key ? 'text-brand font-semibold bg-brand/5' : 'text-gray-600')}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Búsqueda libre */}
          <input
            value={filtros.busqueda}
            onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
            placeholder="Buscar..."
            className="rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.78rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 w-40"
          />

          {/* Responsable */}
          {responsablesUnicos.length > 0 && (
            <div className="w-44">
              <CustomSelect
                value={filtros.responsable}
                onChange={(v) => setFiltros((f) => ({ ...f, responsable: v }))}
                placeholder="Responsable"
                options={responsablesUnicos}
              />
            </div>
          )}

          {/* Fechas */}
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => setFiltros((f) => ({ ...f, fechaDesde: e.target.value }))}
            className="rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.78rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
            title="Fecha cierre desde"
          />
          <input
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => setFiltros((f) => ({ ...f, fechaHasta: e.target.value }))}
            className="rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.78rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
            title="Fecha cierre hasta"
          />

          {/* Limpiar */}
          {(filtros.busqueda || filtros.responsable || filtros.fechaDesde || filtros.fechaHasta || filtros.preset) && (
            <button
              type="button"
              onClick={() => setFiltros({ busqueda: '', responsable: '', fechaDesde: '', fechaHasta: '', preset: '' })}
              className="rounded-xl border border-gray-200 px-3 py-2 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Vista toggle + Nueva oportunidad */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setVista('kanban')}
              title="Vista Kanban"
              className={clsx('flex items-center gap-1 px-3 py-2 text-[0.78rem] transition-colors', vista === 'kanban' ? 'bg-brand text-white' : 'bg-card text-gray-500 hover:bg-gray-50')}
            >
              <Kanban className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              title="Vista Lista"
              className={clsx('flex items-center gap-1 px-3 py-2 text-[0.78rem] transition-colors border-l border-gray-200', vista === 'lista' ? 'bg-brand text-white' : 'bg-card text-gray-500 hover:bg-gray-50')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setShowNewOpo(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-bold text-white hover:bg-brand-dark transition-colors"
          >
            <Plus className="h-4 w-4" /> Nueva oportunidad
          </button>
        </div>
      </div>

      {/* Vista Lista */}
      {vista === 'lista' && (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          {oposFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
              <MoreHorizontal className="h-10 w-10 opacity-20" />
              <p className="text-[0.85rem] font-medium">Sin oportunidades que coincidan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-4 py-2.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">Nombre</th>
                    <th className="px-4 py-2.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">Contacto / Empresa</th>
                    <th className="px-4 py-2.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">Etapa</th>
                    <th className="px-4 py-2.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">Valor</th>
                    <th className="px-4 py-2.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">Fecha cierre</th>
                    <th className="px-4 py-2.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">Asignado</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {oposFiltradas.map((o) => {
                    const etapaInfo = CRM_ETAPAS.find((e) => e.key === o.etapa)
                    return (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-[0.82rem] font-semibold text-gray-900">{o.nombre}</td>
                        <td className="px-4 py-3 text-[0.78rem] text-gray-500">
                          {o.contactoNombre ?? o.contactoEmpresa ?? '—'}
                          {o.contactoNombre && o.contactoEmpresa && (
                            <span className="text-gray-400 text-[0.7rem] ml-1">· {o.contactoEmpresa}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {etapaInfo && (
                            <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', etapaInfo.bgColor, etapaInfo.color)}>
                              {etapaInfo.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[0.78rem] font-semibold text-emerald-700">
                          {o.valor != null ? `$${o.valor.toLocaleString('es-MX')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-[0.75rem] text-gray-400">{o.fechaCierre ?? '—'}</td>
                        <td className="px-4 py-3 text-[0.75rem] text-gray-500">{o.asignadoNombre ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDrawerOpo(o)}
                            className="rounded-lg bg-gray-100 px-3 py-1 text-[0.72rem] font-semibold text-gray-600 hover:bg-brand/10 hover:text-brand transition-colors"
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Board Kanban */}
      {vista === 'kanban' && (
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 520 }}>
        {CRM_ETAPAS.map((etapa) => {
          const cards = oposFiltradas.filter((o) => o.etapa === etapa.key)
          return (
            <KanbanColumn
              key={etapa.key}
              etapa={etapa}
              cards={cards}
              onOpen={setDrawerOpo}
              onDelete={(id) => del.mutate(id)}
              onDragStart={(id) => { dragOpoId.current = id }}
              onDragOver={(id) => { dragOverOpoId.current = id }}
              onDrop={(targetEtapa) => {
                const srcId = dragOpoId.current
                if (srcId === null) return
                const srcOpo = opos.find((o) => o.id === srcId)
                if (!srcOpo) { dragOpoId.current = null; return }
                if (srcOpo.etapa === targetEtapa) {
                  // Reordenar dentro de la misma columna
                  const overOpoId = dragOverOpoId.current
                  if (overOpoId !== null && overOpoId !== srcId) {
                    const colCards = opos.filter((o) => o.etapa === targetEtapa).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                    const overIdx = colCards.findIndex((o) => o.id === overOpoId)
                    const nuevoOrden = overIdx >= 0 ? overIdx : colCards.length
                    reordenar.mutate({ id: srcId, orden: nuevoOrden })
                  }
                } else {
                  moverEtapa.mutate({ id: srcId, etapa: targetEtapa })
                }
                dragOpoId.current = null
                dragOverOpoId.current = null
              }}
            />
          )
        })}
      </div>
      )}

      {activeDrawerOpo && (
        <OportunidadDrawer
          opo={activeDrawerOpo}
          contactos={activeContactos}
          onClose={() => { setDrawerOpo(null); onClearExternal() }}
          onUpdated={() => {
            qc.invalidateQueries({ queryKey: ['crm-oportunidades'] })
            setDrawerOpo(null)
            onClearExternal()
          }}
        />
      )}

      {showNewOpo && (
        <OportunidadModal
          contactos={contactos}
          onClose={() => setShowNewOpo(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['crm-oportunidades'] }); setShowNewOpo(false) }}
          userId={user?.id}
          userNombre={user?.nombres}
        />
      )}

      {proyectoParaOpo && (
        <CRMGenerarProyectoModal
          opo={proyectoParaOpo}
          onClose={() => setProyectoParaOpo(null)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['crm-oportunidades'] }); setProyectoParaOpo(null) }}
        />
      )}
    </>
  )
}

function KanbanColumn({
  etapa, cards, onOpen, onDelete, onDragStart, onDragOver, onDrop,
}: {
  etapa: typeof CRM_ETAPAS[number]
  cards: CRMOportunidad[]
  onOpen: (o: CRMOportunidad) => void
  onDelete: (id: number) => void
  onDragStart: (id: number) => void
  onDragOver: (id: number) => void
  onDrop: (etapa: CRMEtapa) => void
}) {
  const [over, setOver] = useState(false)
  const total = cards.reduce((s, c) => s + (c.valor ?? 0), 0)
  return (
    <div
      className={clsx('flex-shrink-0 w-72 flex flex-col rounded-2xl transition-colors', over && 'ring-2 ring-brand/30 bg-brand/5')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(etapa.key) }}
    >
      {/* Header columna */}
      <div className={clsx('flex items-center justify-between rounded-xl border px-3 py-2 mb-3', etapa.bgColor, 'border-transparent')}>
        <div className="flex items-center gap-2">
          <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', etapa.borderColor.replace('border-','bg-'))} />
          <span className={clsx('text-[0.78rem] font-bold', etapa.color)}>{etapa.label}</span>
          <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold', etapa.color, 'bg-white/60')}>{cards.length}</span>
        </div>
        {total > 0 && (
          <span className={clsx('text-[0.65rem] font-semibold', etapa.color)}>
            ${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto max-h-[70vh] p-0.5">
        {cards.map((o) => (
          <OportunidadCard
            key={o.id} opo={o}
            onClick={() => onOpen(o)}
            onDelete={() => onDelete(o.id)}
            onDragStart={() => onDragStart(o.id)}
            onDragOver={() => onDragOver(o.id)}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300 text-[0.72rem] gap-1">
            <MoreHorizontal className="h-5 w-5" />
            Sin oportunidades
          </div>
        )}
      </div>
    </div>
  )
}

function OportunidadCard({ opo, onClick, onDelete, onDragStart, onDragOver }: { opo: CRMOportunidad; onClick: () => void; onDelete: () => void; onDragStart: () => void; onDragOver: () => void }) {
  const etapa = CRM_ETAPAS.find((e) => e.key === opo.etapa)
  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver() }}
      onClick={onClick}
      className={clsx(
        'group relative cursor-pointer rounded-xl border-l-4 border border-gray-100 bg-card p-3 shadow-sm hover:shadow-md transition-all active:opacity-60',
        etapa?.borderColor ?? 'border-gray-400',
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); if (window.confirm('¿Eliminar esta oportunidad?')) onDelete() }}
        className="absolute right-2 top-2 hidden rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 group-hover:flex"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <p className="text-[0.82rem] font-bold text-gray-900 leading-tight pr-6 mb-1">{opo.nombre}</p>

      {(opo.contactoNombre || opo.contactoEmpresa) && (
        <div className="flex items-center gap-1 text-[0.7rem] text-gray-500 mb-1">
          <Building2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{opo.contactoNombre ?? opo.contactoEmpresa}</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
        {opo.valor != null && (
          <span className="flex items-center gap-0.5 text-[0.68rem] font-semibold text-emerald-600">
            <DollarSign className="h-3 w-3" />{opo.valor.toLocaleString('es-MX')}
          </span>
        )}
        {opo.fechaCierre && (
          <span className="flex items-center gap-0.5 text-[0.65rem] text-gray-400">
            <Calendar className="h-3 w-3" />
            {new Date(opo.fechaCierre + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
          </span>
        )}
        {opo.actividadesPendientes > 0 && (
          <span className="ml-auto flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-700">
            {(opo as any).tipoActividadUrgente
              ? <ListTodo className="h-3 w-3" />
              : <Clock className="h-3 w-3" />
            }{opo.actividadesPendientes}
          </span>
        )}
      </div>

      {opo.asignadoNombre && (
        <div className="mt-2 flex items-center gap-1 text-[0.65rem] text-gray-400">
          <User className="h-3 w-3" />{opo.asignadoNombre}
        </div>
      )}

      {opo.tags && opo.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {opo.tags.slice(0,3).map((tag, i) => {
            const colors = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700']
            return <span key={i} className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-medium', colors[i % colors.length])}>{tag}</span>
          })}
        </div>
      )}

      {opo.prioridad > 0 && (
        <div className="flex gap-0.5 mt-1">
          {Array.from({length:3}).map((_,i) => (
            <Star key={i} className={clsx('h-3 w-3', i < opo.prioridad ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   DRAWER — Detalle oportunidad
════════════════════════════════════════════════════════ */
const ESTATUS_COLORS_COT: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviada: 'bg-blue-100 text-blue-700',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
}

function OportunidadDrawer({
  opo, contactos, onClose, onUpdated,
}: {
  opo: CRMOportunidad
  contactos: CRMContacto[]
  onClose: () => void
  onUpdated: () => void
}) {
  const qc   = useQueryClient()
  const user = useCurrentUser()
  const [etapa, setEtapa]         = useState<CRMEtapa>(opo.etapa)
  const etapaActualRef            = useRef<CRMEtapa>(opo.etapa)
  const [showActForm, setActForm] = useState(false)
  const [showEmail,  setEmail]    = useState(false)
  const [intTipo, setIntTipo]     = useState<CRMInteraccion['tipo']>('nota')
  const [intContenido, setIntCon] = useState('')
  const [editMode, setEditMode]   = useState(false)
  const [drawerTab, setDrawerTab] = useState<'actividades' | 'historial' | 'cotizaciones'>('actividades')
  const [showCotModal, setShowCotModal] = useState(false)
  const [editCot, setEditCot]     = useState<CRMCotizacion | null>(null)
  const [showGenerarProyecto, setShowGenerarProyecto] = useState(false)
  const contactoActual            = contactos.find((c) => c.id === opo.contactoId) ?? null

  const { data: actividades = [], isLoading: loadAct } = useQuery({
    queryKey: ['crm-actividades', opo.id],
    queryFn:  () => crmService.getActividades(opo.id),
    staleTime: 15_000,
  })
  const { data: interacciones = [], isLoading: loadInt } = useQuery({
    queryKey: ['crm-interacciones', opo.id],
    queryFn:  () => crmService.getInteracciones(opo.id),
    staleTime: 15_000,
  })
  const { data: cotizaciones = [], refetch: refetchCots } = useQuery({
    queryKey: ['crm-cotizaciones', opo.id],
    queryFn:  () => crmService.getCotizaciones(opo.id),
    staleTime: 15_000,
  })

  const cambiarEtapa = useMutation({
    mutationFn: (e: CRMEtapa) => crmService.updateOportunidad(opo.id, {
      nombre: opo.nombre, etapa: e, contactoId: opo.contactoId,
      valor: opo.valor, fechaCierre: opo.fechaCierre, asignadoA: opo.asignadoA, notas: opo.notas,
      usuarioId: user?.id, usuarioNombre: user?.nombres,
    }),
    onSuccess: (_data, nuevaEtapa) => {
      etapaActualRef.current = nuevaEtapa
      toast.success('Etapa actualizada')
      qc.invalidateQueries({ queryKey: ['crm-oportunidades'] })
      qc.invalidateQueries({ queryKey: ['crm-interacciones', opo.id] })
      if (nuevaEtapa === 'propuesta' && !opo.proyectoId) setShowGenerarProyecto(true)
    },
    onError: () => toast.error('Error al actualizar'),
  })

  const addInteraccion = useMutation({
    mutationFn: () => crmService.createInteraccion({
      opoId: opo.id, tipo: intTipo, contenido: intContenido,
      usuarioId: user?.id, usuarioNombre: user?.nombres,
    }),
    onSuccess: () => {
      setIntCon(''); toast.success('Registrado')
      qc.invalidateQueries({ queryKey: ['crm-interacciones', opo.id] })
    },
    onError: () => toast.error('Error'),
  })

  const toggleAct = useMutation({
    mutationFn: (a: CRMActividad) => crmService.updateActividad(a.id, {
      descripcion: a.descripcion, fechaDue: a.fechaDue, asignadoA: a.asignadoA,
      completada: !a.completada,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-actividades', opo.id] }),
    onError: () => toast.error('Error'),
  })

  const etapaInfo = CRM_ETAPAS.find((e) => e.key === etapa)

  const TIPO_ICONS: Record<string, React.ReactNode> = {
    nota: <FileText className="h-3.5 w-3.5" />,
    llamada: <PhoneCall className="h-3.5 w-3.5" />,
    email: <Mail className="h-3.5 w-3.5" />,
    reunion: <CalendarDays className="h-3.5 w-3.5" />,
    cambio_etapa: <ArrowRight className="h-3.5 w-3.5" />,
    creacion: <Plus className="h-3.5 w-3.5" />,
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[500px] flex-col bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.95rem] font-bold text-gray-900 leading-tight">{opo.nombre}</h2>
            {(opo.contactoNombre || opo.contactoEmpresa) && (
              <p className="text-[0.72rem] text-gray-500 mt-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {opo.contactoNombre}{opo.contactoEmpresa ? ` · ${opo.contactoEmpresa}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setEmail(true)} title="Enviar email" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors">
              <Mail className="h-4 w-4" />
            </button>
            <button onClick={() => setEditMode(true)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
              <Edit2 className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Etapas selector */}
        <div className="border-b border-gray-50 px-5 py-3">
          <div className="flex gap-1 overflow-x-auto">
            {CRM_ETAPAS.map((e, i) => (
              <button
                key={e.key}
                disabled={cambiarEtapa.isPending}
                onClick={() => { setEtapa(e.key); cambiarEtapa.mutate(e.key) }}
                className={clsx(
                  'flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.68rem] font-bold transition-all disabled:opacity-50',
                  etapa === e.key ? `${e.bgColor} ${e.color} ring-1 ring-current/30` : 'text-gray-400 hover:bg-gray-50',
                )}
              >
                {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
                {e.label}
                {cambiarEtapa.isPending && etapa === e.key && <Spinner size="sm" />}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs del drawer */}
        <div className="flex gap-1 px-4 pt-3 border-b flex-shrink-0">
          {(['actividades', 'historial', 'cotizaciones'] as const).map(tab => (
            <button key={tab} onClick={() => setDrawerTab(tab)}
              className={clsx('px-3 py-1.5 text-sm font-medium rounded-t-lg capitalize transition-colors',
                drawerTab === tab ? 'bg-card border border-b-white text-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700')}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Info rápida — siempre visible */}
          <div className="grid grid-cols-2 gap-3">
            {opo.valor != null && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[0.65rem] text-emerald-600 font-semibold uppercase tracking-wide">Valor</p>
                <p className="text-[0.9rem] font-bold text-emerald-700">${opo.valor.toLocaleString('es-MX')}</p>
              </div>
            )}
            {opo.fechaCierre && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                <p className="text-[0.65rem] text-blue-600 font-semibold uppercase tracking-wide">Cierre estimado</p>
                <p className="text-[0.9rem] font-bold text-blue-700">{opo.fechaCierre}</p>
              </div>
            )}
          </div>

          {opo.proyectoId ? (
            <div className="flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-[0.75rem] font-semibold text-indigo-700">
              <Briefcase className="h-3.5 w-3.5" /> Proyecto vinculado (#{opo.proyectoId})
            </div>
          ) : opo.etapa === 'propuesta' && (
            <button
              onClick={() => setShowGenerarProyecto(true)}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-[0.75rem] font-semibold text-gray-500 hover:border-brand/40 hover:text-brand transition-colors"
            >
              <Briefcase className="h-3.5 w-3.5" /> Generar proyecto de seguimiento
            </button>
          )}

          {/* Tab: Actividades */}
          {drawerTab === 'actividades' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[0.78rem] font-bold text-gray-700 flex items-center gap-1.5">
                <ListTodo className="h-4 w-4 text-amber-500" /> Actividades
              </h3>
              <button
                onClick={() => setActForm(true)}
                className="flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[0.68rem] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Plus className="h-3 w-3" /> Nueva
              </button>
            </div>
            {loadAct ? <Spinner size="sm" /> : actividades.length === 0 ? (
              <p className="text-[0.72rem] text-gray-400 py-2">Sin actividades registradas</p>
            ) : (
              <div className="space-y-1.5">
                {actividades.map((a) => (
                  <div key={a.id} className={clsx('flex items-start gap-2 rounded-xl border p-2.5 transition-colors', a.completada ? 'bg-gray-50 border-gray-100' : 'bg-card border-gray-200')}>
                    <button onClick={() => toggleAct.mutate(a)} className="mt-0.5 flex-shrink-0">
                      {a.completada
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <Circle className="h-4 w-4 text-gray-300 hover:text-amber-500 transition-colors" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-[0.75rem] font-semibold', a.completada ? 'text-gray-400 line-through' : 'text-gray-800')}>
                        {a.descripcion ?? a.tipo}
                      </p>
                      {a.fechaDue && (
                        <p className="text-[0.62rem] text-gray-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(a.fechaDue).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      )}
                    </div>
                    <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold capitalize',
                      a.tipo === 'llamada' ? 'bg-blue-50 text-blue-600' :
                      a.tipo === 'email'   ? 'bg-purple-50 text-purple-600' :
                      a.tipo === 'reunion' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-gray-50 text-gray-500'
                    )}>{a.tipo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Tab: Historial */}
          {drawerTab === 'historial' && (
          <>
          {/* Agregar interacción */}
          <div>
            <h3 className="text-[0.78rem] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-brand" /> Registrar interacción
            </h3>
            <div className="space-y-2">
              <div className="flex gap-1 flex-wrap">
                {(['nota','llamada','email','reunion'] as CRMInteraccion['tipo'][]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setIntTipo(t)}
                    className={clsx(
                      'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.68rem] font-semibold capitalize transition-colors',
                      intTipo === t ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    {TIPO_ICONS[t]} {t}
                  </button>
                ))}
              </div>
              <textarea
                value={intContenido}
                onChange={(e) => setIntCon(e.target.value)}
                placeholder="Escribe aquí el detalle de la interacción..."
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-[0.8rem] text-gray-700 placeholder-gray-400 outline-none resize-none focus:border-brand focus:bg-card focus:ring-2 focus:ring-brand/10"
              />
              <button
                onClick={() => addInteraccion.mutate()}
                disabled={!intContenido.trim() || addInteraccion.isPending}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
              >
                {addInteraccion.isPending && <Spinner size="sm" />} Guardar
              </button>
            </div>
          </div>

          {/* Historial */}
          <div>
            <h3 className="text-[0.78rem] font-bold text-gray-700 mb-2">Historial</h3>
            {loadInt ? <Spinner size="sm" /> : interacciones.length === 0 ? (
              <p className="text-[0.72rem] text-gray-400">Sin interacciones</p>
            ) : (
              <div className="space-y-2">
                {interacciones.map((i) => (
                  <InteraccionItem
                    key={i.id}
                    interaccion={i}
                    tipoIcon={TIPO_ICONS[i.tipo] ?? <FileText className="h-3 w-3" />}
                    currentUserId={user?.id}
                    onDeleted={() => qc.invalidateQueries({ queryKey: ['crm-interacciones', opo.id] })}
                    onUpdated={() => qc.invalidateQueries({ queryKey: ['crm-interacciones', opo.id] })}
                  />
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {/* Tab: Cotizaciones */}
          {drawerTab === 'cotizaciones' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold text-gray-700">Cotizaciones</p>
              <button onClick={() => { setEditCot(null); setShowCotModal(true) }} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors">+ Nueva</button>
            </div>
            {cotizaciones.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin cotizaciones</p>}
            {cotizaciones.map((c: any) => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-card p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-blue-600">{c.folio}</span>
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize', ESTATUS_COLORS_COT[c.estatus] ?? 'bg-gray-100 text-gray-600')}>{c.estatus}</span>
                </div>
                <p className="text-sm text-gray-700 font-medium truncate">{c.titulo}</p>
                <p className="text-sm font-bold text-emerald-700">${Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => window.open(`/api/crm/cotizaciones/${c.id}/pdf`, '_blank')} className="text-xs text-gray-500 hover:text-blue-600 underline">PDF</button>
                  {c.estatus === 'borrador' && <button onClick={() => { setEditCot(c); setShowCotModal(true) }} className="text-xs text-gray-500 hover:text-blue-600 underline">Editar</button>}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      {showCotModal && (
        <CRMCotizacionModal
          opoId={opo.id}
          cot={editCot}
          onClose={() => setShowCotModal(false)}
          onSaved={() => { setShowCotModal(false); refetchCots() }}
        />
      )}

      {showActForm && (
        <ActividadModal
          opoId={opo.id}
          userId={user?.id}
          onClose={() => setActForm(false)}
          onSaved={() => { setActForm(false); qc.invalidateQueries({ queryKey: ['crm-actividades', opo.id] }) }}
        />
      )}

      {editMode && (
        <OportunidadModal
          contactos={contactos ?? []}
          opo={{ ...opo, etapa: etapaActualRef.current }}
          onClose={() => setEditMode(false)}
          onSaved={() => { setEditMode(false); onUpdated() }}
          userId={user?.id}
          userNombre={user?.nombres}
        />
      )}

      {showEmail && (
        <CRMEmailModal
          opoId={opo.id}
          contacto={contactoActual}
          onClose={() => setEmail(false)}
        />
      )}

      {showGenerarProyecto && (
        <CRMGenerarProyectoModal
          opo={opo}
          onClose={() => setShowGenerarProyecto(false)}
          onCreated={() => { setShowGenerarProyecto(false); onUpdated() }}
        />
      )}
    </>
  )
}

/* ─── Dropdown custom (evita que el <select> nativo se salga del modal) ─── */
function CustomSelect({ value, onChange, options, placeholder }: {
  value: string | number
  onChange: (v: string) => void
  options: { value: string | number; label: string }[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => String(o.value) === String(value))

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const inBtn = btnRef.current?.contains(target)
      const inDrop = dropRef.current?.contains(target)
      if (!inBtn && !inDrop) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen((o) => !o)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="field-input w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={clsx('truncate', !selected && 'text-gray-400')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronRight className={clsx('h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform', open && 'rotate-90')} />
      </button>
      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
          }}
          className="rounded-xl border border-gray-200 bg-card shadow-2xl overflow-hidden"
        >
          <div className="max-h-52 overflow-y-auto py-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(''); setOpen(false) }}
              className={clsx(
                'w-full px-3 py-2 text-left text-[0.8rem] hover:bg-gray-50 transition-colors',
                !value ? 'text-brand font-semibold bg-brand/5' : 'text-gray-400',
              )}
            >
              {placeholder}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(String(o.value)); setOpen(false) }}
                className={clsx(
                  'w-full px-3 py-2 text-left text-[0.8rem] hover:bg-gray-50 transition-colors truncate',
                  String(o.value) === String(value) ? 'text-brand font-semibold bg-brand/5' : 'text-gray-700',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   MODAL — Nueva / Editar Oportunidad
════════════════════════════════════════════════════════ */
function OportunidadModal({
  opo, contactos, onClose, onSaved, userId, userNombre,
}: {
  opo?: CRMOportunidad
  contactos: CRMContacto[]
  onClose: () => void
  onSaved: () => void
  userId?: number
  userNombre?: string
}) {
  const [form, setForm] = useState({
    nombre:      opo?.nombre ?? '',
    contactoId:  opo?.contactoId ?? null as number | null,
    etapa:       opo?.etapa ?? 'prospecto' as CRMEtapa,
    valor:       opo?.valor?.toString() ?? '',
    fechaCierre: opo?.fechaCierre ?? '',
    notas:       opo?.notas ?? '',
    asignadoA:   opo?.asignadoA ?? null as number | null,
    tags:        opo?.tags ?? [] as string[],
    prioridad:   (opo?.prioridad ?? 0) as 0|1|2|3,
  })

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-list'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const arr = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (arr as Record<string, unknown>[])
        .filter((u) => u['NEUS_ACTIVO'] === true || u['activo'] === true || u['NEUS_ACTIVO'] === 1 || u['activo'] === 1)
        .map((u) => ({ id: Number(u['NEUS_ID'] ?? u['id']), nombre: String(u['NEUS_NOMBRES'] ?? u['nombre'] ?? u['nombres'] ?? '') }))
    },
    staleTime: 300_000,
  })

  const save = useMutation({
    mutationFn: () => {
      const body = {
        nombre:       form.nombre.trim(),
        contactoId:   form.contactoId,
        etapa:        form.etapa,
        valor:        form.valor ? parseFloat(form.valor) : null,
        fechaCierre:  form.fechaCierre || null,
        notas:        form.notas || null,
        asignadoA:    form.asignadoA,
        creadoPor:    userId,
        usuarioId:    userId,
        usuarioNombre: userNombre,
        tags:         form.tags.join(','),
        prioridad:    form.prioridad,
      }
      return opo ? crmService.updateOportunidad(opo.id, body) : crmService.createOportunidad(body)
    },
    onSuccess: () => { toast.success(opo ? 'Actualizada' : 'Oportunidad creada'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })

  const ETAPA_STYLE: Record<string, string> = {
    prospecto:   'bg-gray-100 text-gray-600 ring-gray-300',
    contactado:  'bg-blue-50 text-blue-700 ring-blue-300',
    propuesta:   'bg-purple-50 text-purple-700 ring-purple-300',
    negociacion: 'bg-amber-50 text-amber-700 ring-amber-300',
    ganado:      'bg-emerald-50 text-emerald-700 ring-emerald-300',
    perdido:     'bg-red-50 text-red-600 ring-red-300',
  }

  return (
    <Modal isOpen title="" onClose={onClose} size="lg">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-brand to-indigo-500 px-4 py-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-white leading-tight">
              {opo ? 'Editar oportunidad' : 'Nueva oportunidad'}
            </p>
            <p className="text-[0.7rem] text-white/70 mt-0.5">
              {opo ? `Oportunidad #${opo.id}` : 'Completa los datos para agregar al pipeline'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="field-label flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-gray-400" /> Nombre de la oportunidad *
          </label>
          <input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            className="field-input font-medium"
            placeholder="Ej: Contrato servicio IT"
            autoFocus
          />
        </div>

        {/* Contacto + Asignado */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label flex items-center gap-1.5">
              <User className="h-3 w-3 text-gray-400" /> Contacto
            </label>
            <CustomSelect
              value={form.contactoId ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, contactoId: v ? Number(v) : null }))}
              placeholder="Sin contacto"
              options={contactos.map((c) => ({ value: c.id, label: c.nombre + (c.empresa ? ` · ${c.empresa}` : '') }))}
            />
          </div>
          <div>
            <label className="field-label flex items-center gap-1.5">
              <Users className="h-3 w-3 text-gray-400" /> Asignado a
            </label>
            <CustomSelect
              value={form.asignadoA ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, asignadoA: v ? Number(v) : null }))}
              placeholder="Sin asignar"
              options={usuarios.map((u) => ({ value: u.id, label: u.nombre }))}
            />
          </div>
        </div>

        {/* Etapa — pills visuales */}
        <div>
          <label className="field-label flex items-center gap-1.5 mb-2">
            <ChevronRight className="h-3 w-3 text-gray-400" /> Etapa
          </label>
          <div className="flex flex-wrap gap-2">
            {CRM_ETAPAS.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, etapa: e.key as CRMEtapa }))}
                className={clsx(
                  'rounded-full px-3 py-1 text-[0.72rem] font-bold transition-all ring-1',
                  form.etapa === e.key
                    ? clsx(ETAPA_STYLE[e.key], 'ring-2 scale-105 shadow-sm')
                    : 'bg-gray-50 text-gray-400 ring-gray-200 hover:bg-gray-100',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Valor + Fecha */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label flex items-center gap-1.5">
              <DollarSign className="h-3 w-3 text-gray-400" /> Valor estimado
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.78rem] text-gray-400 font-medium">$</span>
              <input
                type="number"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                className="field-input pl-7"
                placeholder="0.00"
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="field-label flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-gray-400" /> Fecha de cierre
            </label>
            <input
              type="date"
              value={form.fechaCierre}
              onChange={(e) => setForm((f) => ({ ...f, fechaCierre: e.target.value }))}
              className="field-input"
            />
          </div>
        </div>

        {/* Notas */}
        <div>
          <label className="field-label flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-gray-400" /> Notas
          </label>
          <textarea
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            className="field-input resize-none"
            rows={3}
            placeholder="Observaciones adicionales..."
          />
        </div>

        {/* Etiquetas */}
        <div>
          <label className="field-label">Etiquetas</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {form.tags.map((tag, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {tag}
                <button type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))} className="text-blue-400 hover:text-blue-700">×</button>
              </span>
            ))}
          </div>
          <input
            className="field-input text-sm"
            placeholder="Escribe y presiona Enter o coma..."
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && e.currentTarget.value.trim()) {
                e.preventDefault()
                const tag = e.currentTarget.value.trim().slice(0, 20)
                if (form.tags.length < 5 && !form.tags.includes(tag)) {
                  setForm(f => ({ ...f, tags: [...f.tags, tag] }))
                }
                e.currentTarget.value = ''
              }
            }}
          />
        </div>

        {/* Prioridad */}
        <div>
          <label className="field-label">Prioridad</label>
          <div className="flex gap-1">
            {([1,2,3] as const).map(n => (
              <button key={n} type="button" onClick={() => setForm(f => ({ ...f, prioridad: (f.prioridad === n ? 0 : n) as 0|1|2|3 }))}>
                <Star className={clsx('h-5 w-5 transition-colors', n <= form.prioridad ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300')} />
              </button>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!form.nombre.trim() || save.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-[0.82rem] font-bold text-white hover:bg-brand-dark disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
          >
            {save.isPending ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />}
            {opo ? 'Guardar cambios' : 'Crear oportunidad'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════
   MODAL — Nueva Actividad
════════════════════════════════════════════════════════ */
function ActividadModal({ opoId, userId, onClose, onSaved }: {
  opoId: number; userId?: number; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    tipo: 'tarea' as CRMActividad['tipo'],
    descripcion: '',
    fechaDue: '',
    asignadoA: null as number | null,
  })

  const { data: usuariosAct = [] } = useQuery({
    queryKey: ['usuarios-crm'],
    queryFn: () => api.get('/usuarios').then((r) => {
      const arr = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.usuarios ?? [])
      return (arr as Record<string, unknown>[])
        .filter((u) => u['NEUS_ACTIVO'] === true || u['activo'] === true || u['NEUS_ACTIVO'] === 1 || u['activo'] === 1)
        .map((u) => ({ id: Number(u['NEUS_ID'] ?? u['id']), nombre: String(u['NEUS_NOMBRES'] ?? u['nombre'] ?? u['nombres'] ?? '') }))
    }),
    staleTime: 300_000,
  })

  const save = useMutation({
    mutationFn: () => crmService.createActividad({
      opoId,
      tipo: form.tipo,
      descripcion: form.descripcion || null,
      fechaDue: form.fechaDue || null,
      creadoPor: userId,
      asignadoA: form.asignadoA,
    }),
    onSuccess: () => { toast.success('Actividad creada'); onSaved() },
    onError: () => toast.error('Error'),
  })

  return (
    <Modal isOpen title="Nueva actividad" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="field-label">Tipo</label>
          <div className="flex gap-1 flex-wrap">
            {CRM_ACTIVIDAD_TIPOS.map((t) => (
              <button key={t.key} onClick={() => setForm((f) => ({ ...f, tipo: t.key as CRMActividad['tipo'] }))}
                className={clsx('rounded-lg px-3 py-1.5 text-[0.72rem] font-semibold transition-colors',
                  form.tipo === t.key ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label">Descripción</label>
          <input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="field-input" placeholder="Ej: Llamar al cliente para confirmar propuesta" />
        </div>
        <div>
          <label className="field-label">Fecha límite</label>
          <input type="datetime-local" value={form.fechaDue} onChange={(e) => setForm((f) => ({ ...f, fechaDue: e.target.value }))}
            className="field-input" />
        </div>
        <div>
          <label className="field-label flex items-center gap-1.5">
            <Users className="h-3 w-3 text-gray-400" /> Asignado a
          </label>
          <CustomSelect
            value={form.asignadoA ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, asignadoA: v ? Number(v) : null }))}
            placeholder="Sin asignar"
            options={usuariosAct.map((u) => ({ value: u.id, label: u.nombre }))}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {save.isPending && <Spinner size="sm" />} Crear actividad
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════
   INTERACCION ITEM — con inline edit/delete
════════════════════════════════════════════════════════ */
function InteraccionItem({ interaccion: i, tipoIcon, currentUserId, onDeleted, onUpdated }: {
  interaccion: CRMInteraccion
  tipoIcon: React.ReactNode
  currentUserId?: number
  onDeleted: () => void
  onUpdated: () => void
}) {
  const [editing, setEditing]   = useState(false)
  const [draft,   setDraft]     = useState(i.contenido ?? '')
  const canEdit = i.tipo !== 'cambio_etapa' && i.tipo !== 'creacion' &&
                  (currentUserId == null || i.usuarioId == null || i.usuarioId === currentUserId)

  const upd = useMutation({
    mutationFn: () => crmService.updateInteraccion(i.id, draft.trim()),
    onSuccess: () => { setEditing(false); onUpdated() },
    onError: () => toast.error('Error al guardar'),
  })
  const del = useMutation({
    mutationFn: () => crmService.deleteInteraccion(i.id),
    onSuccess: onDeleted,
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="flex gap-2.5 group">
      <div className={clsx('mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
        i.tipo === 'llamada'      ? 'bg-blue-100 text-blue-600' :
        i.tipo === 'email'        ? 'bg-purple-100 text-purple-600' :
        i.tipo === 'reunion'      ? 'bg-emerald-100 text-emerald-600' :
        i.tipo === 'cambio_etapa' ? 'bg-amber-100 text-amber-600' :
        i.tipo === 'creacion'     ? 'bg-brand/10 text-brand' :
        'bg-gray-100 text-gray-500'
      )}>
        {tipoIcon}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-brand/30 bg-gray-50 p-2 text-[0.75rem] text-gray-700 outline-none resize-none focus:border-brand focus:bg-card"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => upd.mutate()}
                disabled={!draft.trim() || upd.isPending}
                className="rounded-lg bg-brand px-3 py-1 text-[0.68rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
              >
                {upd.isPending ? <Spinner size="sm" /> : 'Guardar'}
              </button>
              <button onClick={() => { setEditing(false); setDraft(i.contenido ?? '') }}
                className="rounded-lg border border-gray-200 px-3 py-1 text-[0.68rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[0.75rem] text-gray-800 leading-relaxed">{i.contenido}</p>
        )}
        <p className="text-[0.62rem] text-gray-400 mt-0.5">
          {i.usuarioNombre && <span>{i.usuarioNombre} · </span>}
          {new Date(i.fecha).toLocaleDateString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
        </p>
      </div>
      {canEdit && !editing && (
        <div className="hidden group-hover:flex items-start gap-0.5 flex-shrink-0 pt-0.5">
          <button onClick={() => setEditing(true)} className="rounded-lg p-1 text-gray-300 hover:text-brand hover:bg-brand/5 transition-colors">
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={() => { if (window.confirm('¿Eliminar esta interacción?')) del.mutate() }}
            className="rounded-lg p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   TAB — Contactos
════════════════════════════════════════════════════════ */
function ContactosTab() {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const [q, setQ]               = useState('')
  const [debouncedQ, setDQ]     = useState('')
  const [showModal, setModal]   = useState(false)
  const [selected, setSelected] = useState<CRMContacto | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data: contactos = [], isLoading } = useQuery({
    queryKey: ['crm-contactos', debouncedQ],
    queryFn:  () => crmService.getContactos(debouncedQ || undefined),
    staleTime: 30_000,
  })

  const del = useMutation({
    mutationFn: (id: number) => crmService.deleteContacto(id),
    onSuccess: () => { toast.success('Contacto eliminado'); qc.invalidateQueries({ queryKey: ['crm-contactos'] }) },
    onError: () => toast.error('Error'),
  })

  const invitar = useMutation({
    mutationFn: (id: number) => crmService.invitarPortal(id),
    onSuccess: () => toast.success('Invitación enviada al correo del contacto'),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al enviar invitación'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, empresa, correo..."
          className="flex-1 rounded-xl border border-gray-200 bg-card px-4 py-2.5 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
        <button
          onClick={() => { setSelected(null); setModal(true) }}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[0.82rem] font-bold text-white hover:bg-brand-dark transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" /> Nuevo contacto
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          {contactos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
              <Users className="h-10 w-10 opacity-20" />
              <p className="text-[0.85rem] font-medium">Sin contactos{q ? ' que coincidan' : ''}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {contactos.map((c) => (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10">
                    <User className="h-5 w-5 text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.85rem] font-bold text-gray-900">{c.nombre}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-0.5">
                      {c.empresa && <span className="flex items-center gap-1 text-[0.72rem] text-gray-500"><Building2 className="h-3 w-3" />{c.empresa}</span>}
                      {c.cargo && <span className="text-[0.72rem] text-gray-400">{c.cargo}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.telefono && <span className="flex items-center gap-1 text-[0.7rem] text-gray-400"><Phone className="h-3 w-3" />{c.telefono}</span>}
                      {c.correo && <span className="flex items-center gap-1 text-[0.7rem] text-gray-400"><Mail className="h-3 w-3" />{c.correo}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {c.correo && (
                      <button
                        onClick={() => invitar.mutate(c.id)}
                        disabled={invitar.isPending}
                        title="Invitar al portal"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                      >
                        <Globe className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => { setSelected(c); setModal(true) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => { if (window.confirm('¿Eliminar este contacto?')) del.mutate(c.id) }} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ContactoModal
          contacto={selected}
          userId={user?.id}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ['crm-contactos'] }) }}
        />
      )}
    </div>
  )
}

function ContactoModal({ contacto, userId, onClose, onSaved }: {
  contacto: CRMContacto | null; userId?: number; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    nombre:   contacto?.nombre ?? '',
    empresa:  contacto?.empresa ?? '',
    correo:   contacto?.correo ?? '',
    telefono: contacto?.telefono ?? '',
    cargo:    contacto?.cargo ?? '',
    notas:    contacto?.notas ?? '',
  })
  const save = useMutation({
    mutationFn: () => contacto
      ? crmService.updateContacto(contacto.id, form)
      : crmService.createContacto({ ...form, creadoPor: userId }),
    onSuccess: () => { toast.success(contacto ? 'Contacto actualizado' : 'Contacto creado'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })
  return (
    <Modal isOpen title={contacto ? 'Editar contacto' : 'Nuevo contacto'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="field-label">Nombre *</label>
          <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="field-input" placeholder="Nombre completo" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Empresa</label>
            <input value={form.empresa} onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))} className="field-input" placeholder="Empresa S.A." />
          </div>
          <div>
            <label className="field-label">Cargo</label>
            <input value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} className="field-input" placeholder="Director, Gerente..." />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Teléfono</label>
            <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="field-input" placeholder="5512345678" />
          </div>
          <div>
            <label className="field-label">Correo</label>
            <input type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} className="field-input" placeholder="correo@empresa.com" />
          </div>
        </div>
        <div>
          <label className="field-label">Notas</label>
          <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} className="field-input resize-none" rows={2} placeholder="Observaciones..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!form.nombre.trim() || save.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {save.isPending && <Spinner size="sm" />} {contacto ? 'Guardar' : 'Crear contacto'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════
   TAB — Actividades (todas)
════════════════════════════════════════════════════════ */
function ActividadesTab({ onOpenOpo }: { onOpenOpo: (opoId: number) => void }) {
  const qc = useQueryClient()
  const { data: todas = [], isLoading } = useQuery({
    queryKey: ['crm-todas-actividades'],
    queryFn:  crmService.getAllActividades,
    staleTime: 30_000,
  })

  const toggle = useMutation({
    mutationFn: (a: CRMActividad) => crmService.updateActividad(a.id, {
      descripcion: a.descripcion, fechaDue: a.fechaDue, asignadoA: a.asignadoA, completada: !a.completada,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-todas-actividades'] }),
    onError: () => toast.error('Error'),
  })

  const del = useMutation({
    mutationFn: (id: number) => crmService.deleteActividad(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-todas-actividades'] }),
    onError: () => toast.error('Error'),
  })

  const now      = new Date()
  const hoy      = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const finSemana = new Date(hoy); finSemana.setDate(hoy.getDate() + 7)

  const grupos = [
    { label: 'Vencidas',        items: todas.filter((a) => !a.completada && a.fechaDue && new Date(a.fechaDue) < hoy), color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Hoy',             items: todas.filter((a) => !a.completada && a.fechaDue && new Date(a.fechaDue) >= hoy && new Date(a.fechaDue) < new Date(hoy.getTime() + 86400000)), color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Esta semana',     items: todas.filter((a) => !a.completada && a.fechaDue && new Date(a.fechaDue) >= new Date(hoy.getTime() + 86400000) && new Date(a.fechaDue) <= finSemana), color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Próximamente',    items: todas.filter((a) => !a.completada && (!a.fechaDue || new Date(a.fechaDue) > finSemana)), color: 'text-gray-600', bg: 'bg-gray-50' },
    { label: 'Completadas',     items: todas.filter((a) => a.completada), color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ]

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      {grupos.map((g) => g.items.length === 0 ? null : (
        <div key={g.label} className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className={clsx('flex items-center gap-2 border-b border-gray-100 px-5 py-3', g.bg)}>
            <span className={clsx('text-[0.82rem] font-bold', g.color)}>{g.label}</span>
            <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold bg-white/70', g.color)}>{g.items.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {g.items.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                <button onClick={() => toggle.mutate(a)} className="mt-0.5 flex-shrink-0">
                  {a.completada
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <Circle className="h-4 w-4 text-gray-300 hover:text-brand transition-colors" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={clsx('text-[0.82rem] font-semibold', a.completada ? 'text-gray-400 line-through' : 'text-gray-900')}>
                      {a.descripcion ?? a.tipo}
                    </p>
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.6rem] font-bold capitalize',
                      a.tipo === 'llamada' ? 'bg-blue-50 text-blue-600' :
                      a.tipo === 'email'   ? 'bg-purple-50 text-purple-600' :
                      a.tipo === 'reunion' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-gray-50 text-gray-500'
                    )}>{a.tipo}</span>
                  </div>
                  {a.opoNombre && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenOpo(a.opoId) }}
                      className="flex items-center gap-0.5 text-[0.7rem] text-brand/70 hover:text-brand mt-0.5 transition-colors"
                    >
                      <ArrowRight className="h-2.5 w-2.5" />{a.opoNombre}
                    </button>
                  )}
                  {a.fechaDue && (
                    <p className="text-[0.65rem] text-gray-400 mt-0.5 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(a.fechaDue).toLocaleDateString('es-MX', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  )}
                </div>
                <button onClick={() => { if (window.confirm('¿Eliminar esta actividad?')) del.mutate(a.id) }} className="hidden rounded-lg p-1.5 text-red-300 hover:bg-red-50 hover:text-red-400 group-hover:flex flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {todas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
          <ListTodo className="h-10 w-10 opacity-20" />
          <p className="text-[0.85rem]">Sin actividades registradas</p>
        </div>
      )}
    </div>
  )
}
