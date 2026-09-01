import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVentasSession } from '@/hooks/useVentasSession'
import { ventasService } from '@/services/ventas.service'
import { type AgenteVentas, type Campana } from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Users, Search, Plus, Pencil, ToggleLeft, ToggleRight, AlertCircle, RefreshCw, ChevronDown,
} from 'lucide-react'

const ROLES = ['agente', 'supervisor', 'admin'] as const

export function VentasAgentesPage() {
  const { isReady, error, retry } = useVentasSession()
  if (!isReady) return <div className="flex min-h-[50vh] items-center justify-center"><Spinner size="lg" /></div>
  if (error) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-gray-500">{error}</p>
      <button onClick={retry} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
    </div>
  )
  return <AgentesContent />
}

function AgentesContent() {
  const qc = useQueryClient()
  const [search,      setSearch]      = useState('')
  const [filtroRol,   setFiltroRol]   = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [editAgente,  setEditAgente]  = useState<AgenteVentas | null>(null)

  const { data: agentes   = [], isLoading } = useQuery({ queryKey: ['ventas-agentes'],  queryFn: () => ventasService.getAgentes() })
  const { data: campanas  = [] }            = useQuery({ queryKey: ['ventas-campanas'], queryFn: () => ventasService.getCampanas() })

  const toggle = useMutation({
    mutationFn: (id: number) => ventasService.toggleAgente(id),
    onSuccess: () => { toast.success('Estado actualizado'); qc.invalidateQueries({ queryKey: ['ventas-agentes'] }) },
    onError: () => toast.error('Error al actualizar'),
  })

  const filtered = agentes.filter((a) => {
    const q = search.toLowerCase()
    return (
      (a.nombreAgente.toLowerCase().includes(q) || a.username.toLowerCase().includes(q)) &&
      (!filtroRol || a.role === filtroRol)
    )
  })

  const activos   = agentes.filter((a) => a.activo).length
  const inactivos = agentes.filter((a) => !a.activo).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" /> Agentes
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">{activos} activos · {inactivos} inactivos</p>
        </div>
        <button onClick={() => { setEditAgente(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark transition-colors">
          <Plus className="h-4 w-4" /> Nuevo agente
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o usuario..."
            className="w-full rounded-xl border border-gray-200 bg-card py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
        </div>
        <div className="relative">
          <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}
            className="appearance-none rounded-xl border border-gray-200 bg-card py-2 pl-3 pr-8 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10">
            <option value="">Todos los roles</option>
            {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <Users className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin agentes{search ? ` para "${search}"` : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Agente','Usuario','Rol','Campaña','Estado','Acciones'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((a) => {
                  const campana = campanas.find((c) => c.id === a.campaignId)
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold text-white"
                            style={{ backgroundColor: a.color ?? '#1B4FD8' }}>
                            {a.nombreAgente.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[0.82rem] font-semibold text-gray-800">{a.nombreAgente}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[0.78rem] font-mono text-gray-500">{a.username}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold capitalize',
                          a.role === 'admin' || a.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                          a.role === 'supervisor' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        )}>{a.role}</span>
                      </td>
                      <td className="px-4 py-3 text-[0.78rem] text-gray-500">{campana?.nombre ?? `ID ${a.campaignId}`}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold',
                          a.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400')}>
                          {a.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditAgente(a); setShowModal(true) }}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => toggle.mutate(a.id)} disabled={toggle.isPending}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors" title={a.activo ? 'Desactivar' : 'Activar'}>
                            {a.activo
                              ? <ToggleRight className="h-4 w-4 text-emerald-500" />
                              : <ToggleLeft  className="h-4 w-4 text-gray-300" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <AgenteModal
          agente={editAgente}
          campanas={campanas}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ['ventas-agentes'] }) }}
        />
      )}
    </div>
  )
}

function AgenteModal({ agente, campanas, onClose, onSaved }: {
  agente: AgenteVentas | null; campanas: Campana[]
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    nombreAgente: agente?.nombreAgente ?? '',
    username:     agente?.username     ?? '',
    password:     '',
    role:         agente?.role         ?? 'agente',
    campaignId:   agente?.campaignId   ?? campanas[0]?.id ?? 0,
  })

  const guardar = useMutation<void>({
    mutationFn: () => agente
      ? ventasService.updateAgente(agente.id, { ...form, campaignId: Number(form.campaignId) })
      : ventasService.createAgente({ ...form, campaignId: Number(form.campaignId) }).then(() => {}),
    onSuccess: () => { toast.success(agente ? 'Agente actualizado' : 'Agente creado'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })

  const canSave = form.nombreAgente.trim() && form.username.trim() && (agente || form.password.trim())

  return (
    <Modal isOpen title={agente ? 'Editar agente' : 'Nuevo agente'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre completo</label>
          <input value={form.nombreAgente} onChange={(e) => setForm((f) => ({ ...f, nombreAgente: e.target.value }))}
            className="field w-full" placeholder="Nombre del agente" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Usuario</label>
          <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="field w-full" placeholder="CC_0200" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">
            Contraseña {agente && <span className="font-normal text-gray-400">(dejar vacío para no cambiar)</span>}
          </label>
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="field w-full" placeholder="••••••••" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Rol</label>
            <div className="relative">
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AgenteVentas['role'] }))}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-[0.82rem] text-gray-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10">
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Campaña</label>
            <div className="relative">
              <select value={form.campaignId} onChange={(e) => setForm((f) => ({ ...f, campaignId: Number(e.target.value) }))}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-[0.82rem] text-gray-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10">
                {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!canSave || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark transition-colors disabled:opacity-50">
            {guardar.isPending && <Spinner size="sm" />}
            {agente ? 'Guardar cambios' : 'Crear agente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
