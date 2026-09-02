import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Users, UserCheck, Clock, BarChart3, Plus, Trash2, Coffee, History,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { supervisoresService } from '@/services/supervisores.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { TIPO_PAUSA_LABELS, type AgenteEstado } from '@/types/supervisores.types'
import { HistorialConversacionesPanel } from '@/pages/livechat/HistorialConversacionesPanel'

interface Usuario { id: number; nombre: string; tipoUsuario: string }
interface Campania { id: number; nombre: string; estatus: string }

function formatDuracion(iso: string | null) {
  if (!iso) return ''
  const inicio = new Date(iso).getTime()
  const minutos = Math.floor((Date.now() - inicio) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  return `${h}h ${minutos % 60}min`
}

/* ── Tarjeta de agente ── */
function AgenteCard({ agente }: { agente: AgenteEstado }) {
  const enPausa = agente.estado === 'pausa'
  return (
    <div className={clsx('card p-4 flex items-center gap-3', enPausa && 'border-amber-200 bg-amber-50/40')}>
      <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', enPausa ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')}>
        {enPausa ? <Coffee className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{agente.nombre}</p>
        <p className="text-xs text-gray-500">
          {enPausa ? (
            <>En {TIPO_PAUSA_LABELS[agente.tipoPausa ?? ''] ?? agente.tipoPausa} · {formatDuracion(agente.pausaDesde)}</>
          ) : (
            'Disponible'
          )}
        </p>
      </div>
      <span className={clsx('flex-shrink-0 h-2 w-2 rounded-full', enPausa ? 'bg-amber-400' : 'bg-emerald-400')} />
    </div>
  )
}

/* ── Tab: Panel en vivo ── */
function PanelEnVivoTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['supervisores-mi-panel'],
    queryFn: () => supervisoresService.getMiPanel(),
    refetchInterval: 15_000,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const agentes = data?.agentes ?? []
  const disponibles = agentes.filter((a) => a.estado === 'disponible').length
  const enPausa = agentes.filter((a) => a.estado === 'pausa').length

  if (agentes.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <Users className="h-8 w-8" />
        <p className="text-sm">No tienes agentes asignados a tus campañas todavía</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Users className="h-4 w-4" /></div>
          <div><p className="text-lg font-bold text-gray-900 leading-tight">{agentes.length}</p><p className="text-[0.68rem] text-gray-500">Agentes</p></div>
        </div>
        <div className="card p-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><UserCheck className="h-4 w-4" /></div>
          <div><p className="text-lg font-bold text-gray-900 leading-tight">{disponibles}</p><p className="text-[0.68rem] text-gray-500">Disponibles</p></div>
        </div>
        <div className="card p-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Coffee className="h-4 w-4" /></div>
          <div><p className="text-lg font-bold text-gray-900 leading-tight">{enPausa}</p><p className="text-[0.68rem] text-gray-500">En pausa</p></div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agentes.map((a) => <AgenteCard key={a.agenteId} agente={a} />)}
      </div>
    </div>
  )
}

/* ── Tab: Productividad del día ── */
function ProductividadTab() {
  const { data: productividad = [], isLoading } = useQuery({
    queryKey: ['supervisores-productividad'],
    queryFn: () => supervisoresService.getProductividad(),
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
            <th className="px-4 py-2.5 font-semibold">Baño</th>
            <th className="px-4 py-2.5 font-semibold">Comida</th>
            <th className="px-4 py-2.5 font-semibold">Capacitación</th>
            <th className="px-4 py-2.5 font-semibold">Permiso</th>
            <th className="px-4 py-2.5 font-semibold">Total pausas</th>
          </tr>
        </thead>
        <tbody>
          {productividad.map((p) => (
            <tr key={p.agenteId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.nombre}</td>
              <td className="px-4 py-2.5 text-gray-600">{p.banio} min</td>
              <td className="px-4 py-2.5 text-gray-600">{p.comida} min</td>
              <td className="px-4 py-2.5 text-gray-600">{p.capacitacion} min</td>
              <td className="px-4 py-2.5 text-gray-600">{p.permiso} min</td>
              <td className="px-4 py-2.5 font-semibold text-gray-900">{p.totalPausaMin} min</td>
            </tr>
          ))}
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

  const { data: campanias = [] } = useQuery({
    queryKey: ['operaciones-campanias'],
    queryFn: async () => {
      const { data } = await api.get('/operaciones/campanias')
      return (data?.data ?? []) as Campania[]
    },
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
          <Users className="h-5 w-5 text-brand" /> Supervisores
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
