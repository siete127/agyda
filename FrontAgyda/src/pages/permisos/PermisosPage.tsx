import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, CalendarCheck, Clock, CheckCircle, XCircle, X } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface Permiso {
  id: number
  usuarioId: number
  tipo: string
  fechaSolicitud: string
  fechaInicio: string
  fechaFin: string
  motivo: string
  estatus: 'pendiente' | 'aprobado' | 'rechazado'
  comentarioAdmin: string | null
}

function parsePermiso(r: Record<string, unknown>): Permiso {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['id'] ?? r['PERMISO_ID'] ?? 0),
    usuarioId: Number(r['usuarioId'] ?? r['USUARIO_ID'] ?? 0),
    tipo: s(['tipo', 'TIPO']),
    fechaSolicitud: s(['fechaSolicitud', 'FECHA_SOLICITUD']),
    fechaInicio: s(['fechaInicio', 'FECHA_INICIO']),
    fechaFin: s(['fechaFin', 'FECHA_FIN']),
    motivo: s(['motivo', 'MOTIVO']),
    estatus: (s(['estatus', 'ESTATUS', 'estado', 'ESTADO']) || 'pendiente').toLowerCase() as Permiso['estatus'],
    comentarioAdmin: s(['comentarioAdmin', 'COMENTARIO_ADMIN']) || null,
  }
}

const ESTATUS_CONFIG = {
  pendiente: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700', Icon: Clock },
  aprobado:  { label: 'Aprobado',  cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle },
  rechazado: { label: 'Rechazado', cls: 'bg-red-100 text-red-700', Icon: XCircle },
}

const TIPOS_PERMISO = [
  'Permiso personal', 'Cita médica', 'Asunto familiar',
  'Trámite oficial', 'Capacitación externa', 'Otro',
]

/* ── Skeleton ── */
function SkeletonCard() {
  return (
    <div className="card p-4 animate-pulse space-y-2">
      <div className="flex gap-2"><div className="h-5 w-20 rounded-full bg-gray-100" /><div className="h-5 w-28 rounded-full bg-gray-100" /></div>
      <div className="h-4 w-2/3 rounded-lg bg-gray-100" />
      <div className="h-3 w-1/2 rounded-lg bg-gray-100" />
    </div>
  )
}

/* ── Modal nuevo permiso ── */
function NuevoPermisoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState({ tipo: TIPOS_PERMISO[0], fechaInicio: '', fechaFin: '', motivo: '' })

  const crear = useMutation({
    mutationFn: () => api.post('/permisos', { ...form, usuarioId: user?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permisos'] }); toast.success('Permiso solicitado'); onClose() },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al solicitar permiso'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Solicitar permiso" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de permiso</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="field">
            {TIPOS_PERMISO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
            <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} min={form.fechaInicio} className="field" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo</label>
          <textarea value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} rows={3} placeholder="Describe el motivo..." className="field resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!form.fechaInicio || !form.fechaFin || !form.motivo.trim()} onClick={() => crear.mutate()}>
            Solicitar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Card de permiso ── */
function PermisoCard({ permiso, isAdmin, isMine, onApprove, onReject, onCancelar }: {
  permiso: Permiso
  isAdmin: boolean
  isMine: boolean
  onApprove: (id: number) => void
  onReject: (id: number) => void
  onCancelar: (id: number) => void
}) {
  const [hovered, setHovered] = useState(false)
  const cfg = ESTATUS_CONFIG[permiso.estatus] ?? ESTATUS_CONFIG.pendiente
  const { Icon } = cfg
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const dias = permiso.fechaInicio && permiso.fechaFin
    ? Math.ceil((new Date(permiso.fechaFin).getTime() - new Date(permiso.fechaInicio).getTime()) / 86400000) + 1
    : null

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2xl bg-white border transition-all duration-200 p-4',
        hovered ? '-translate-y-0.5 shadow-card-md border-gray-300/60' : 'shadow-card border-gray-200/60',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx('chip text-[0.65rem] flex items-center gap-1', cfg.cls)}>
              <Icon className="h-3 w-3" /> {cfg.label}
            </span>
            <span className="chip bg-gray-100 text-gray-500 text-[0.65rem]">{permiso.tipo}</span>
          </div>

          <p className="text-[0.85rem] font-semibold text-gray-800">
            {fmt(permiso.fechaInicio)} → {fmt(permiso.fechaFin)}
            {dias && <span className="ml-2 text-[0.72rem] font-normal text-gray-400">({dias} día{dias !== 1 ? 's' : ''})</span>}
          </p>

          {permiso.motivo && <p className="text-[0.75rem] text-gray-500 mt-1 leading-relaxed">{permiso.motivo}</p>}

          {permiso.comentarioAdmin && (
            <p className="text-[0.72rem] text-gray-400 mt-1.5 italic border-l-2 border-brand/20 pl-2">
              Admin: "{permiso.comentarioAdmin}"
            </p>
          )}

          <p className="text-[0.68rem] text-gray-400 mt-1.5">Solicitado: {fmt(permiso.fechaSolicitud)}</p>
        </div>

        {permiso.estatus === 'pendiente' && (
          <div className="flex gap-1.5 flex-shrink-0 flex-col items-end">
            {isAdmin && (
              <>
                <button onClick={() => onApprove(permiso.id)} className="rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                  Aprobar
                </button>
                <button onClick={() => onReject(permiso.id)} className="rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                  Rechazar
                </button>
              </>
            )}
            {isMine && !isAdmin && (
              <button
                onClick={() => onCancelar(permiso.id)}
                className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200"
              >
                <X className="h-3 w-3" /> Cancelar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Página ── */
export function PermisosPage() {
  const [showNuevo, setShowNuevo] = useState(false)
  const [confirmCancelar, setConfirmCancelar] = useState<number | null>(null)
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const user    = useAuthStore((s) => s.user)
  const qc      = useQueryClient()

  const cancelar = useMutation({
    mutationFn: (id: number) => api.delete(`/permisos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permisos'] }); toast.success('Permiso cancelado') },
    onError: () => toast.error('Error al cancelar'),
  })

  const { data: permisos = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['permisos'],
    queryFn: async () => {
      const headers: Record<string, string> = {
        tipousuario: isAdmin ? 'admin' : 'user',
        usuarioid: String(user?.id ?? ''),
      }
      const { data } = await api.get('/permisos', { headers })
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parsePermiso)
    },
  })

  const aprobar = useMutation({
    mutationFn: (id: number) => api.get(`/permisos/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permisos'] }); toast.success('Permiso aprobado') },
    onError: () => toast.error('Error al aprobar'),
  })

  const rechazar = useMutation({
    mutationFn: (id: number) => api.get(`/permisos/${id}/reject`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permisos'] }); toast.success('Permiso rechazado') },
    onError: () => toast.error('Error al rechazar'),
  })

  const pendientes = permisos.filter((p) => p.estatus === 'pendiente')
  const resueltos  = permisos.filter((p) => p.estatus !== 'pendiente')

  const stats = [
    { label: 'Pendientes', val: pendientes.length, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Aprobados',  val: permisos.filter((p) => p.estatus === 'aprobado').length,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Rechazados', val: permisos.filter((p) => p.estatus === 'rechazado').length, color: 'text-red-600',     bg: 'bg-red-50' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#059669] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <CalendarCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Permisos</h1>
                <p className="mt-0.5 text-xs text-white/50">{pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} de revisión</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Button onClick={() => setShowNuevo(true)} className="bg-white !text-emerald-700 hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Solicitar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={clsx('rounded-2xl p-4 text-center transition-all', s.bg)}>
            <p className={clsx('text-2xl font-bold', s.color)}>{s.val}</p>
            <p className={clsx('text-[0.72rem] font-semibold mt-0.5', s.color)}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : permisos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <CalendarCheck className="h-7 w-7 text-emerald-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin permisos</p>
            <p className="text-xs text-gray-400 mt-0.5">Aún no has solicitado ningún permiso</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {pendientes.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full bg-yellow-400" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Pendientes</h2>
              </div>
              <div className="space-y-3">
                {pendientes.map((p) => (
                  <PermisoCard key={p.id} permiso={p} isAdmin={isAdmin} isMine={p.usuarioId === user?.id} onApprove={(id) => aprobar.mutate(id)} onReject={(id) => rechazar.mutate(id)} onCancelar={(id) => setConfirmCancelar(id)} />
                ))}
              </div>
            </section>
          )}
          {resueltos.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full bg-gray-300" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Historial</h2>
              </div>
              <div className="space-y-3 opacity-70">
                {resueltos.map((p) => (
                  <PermisoCard key={p.id} permiso={p} isAdmin={isAdmin} isMine={p.usuarioId === user?.id} onApprove={(id) => aprobar.mutate(id)} onReject={(id) => rechazar.mutate(id)} onCancelar={(id) => cancelar.mutate(id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showNuevo && <NuevoPermisoModal onClose={() => setShowNuevo(false)} />}

      <ConfirmDialog
        isOpen={confirmCancelar !== null}
        onClose={() => setConfirmCancelar(null)}
        onConfirm={() => { if (confirmCancelar !== null) cancelar.mutate(confirmCancelar) }}
        title="Cancelar solicitud"
        message="¿Seguro que deseas cancelar esta solicitud de permiso?"
        confirmLabel="Cancelar solicitud"
        isPending={cancelar.isPending}
      />
    </div>
  )
}
