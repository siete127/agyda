import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Briefcase, Users, FileText, RefreshCw,
  LayoutGrid, LayoutDashboard, ClipboardList, UserCheck,
} from 'lucide-react'
import { vacantesService } from '@/services/vacantes.service'
import { useIsAdmin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { VacantesGrid } from '@/components/vacantes/VacantesGrid'
import { PostulantesTable, POSTULANTE_ESTADOS_OPTIONS as ESTADOS } from '@/components/vacantes/PostulantesTable'
import type { Vacante, Modalidad, PostulanteEstado } from '@/types/vacante.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const MODALIDADES: { value: Modalidad; label: string }[] = [
  { value: 'remoto', label: 'Remoto' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'hibrido', label: 'Híbrido' },
]

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Formulario crear/editar vacante ── */
function VacanteFormModal({ vacante, onClose }: { vacante?: Vacante; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!vacante

  const [form, setForm] = useState({
    titulo: vacante?.titulo ?? '',
    descripcion: vacante?.descripcion ?? '',
    requisitos: vacante?.requisitos ?? '',
    ubicacion: vacante?.ubicacion ?? '',
    modalidad: (vacante?.modalidad ?? 'presencial') as Modalidad,
    tipoContrato: vacante?.tipoContrato ?? '',
    salario: vacante?.salario ?? '',
    fechaLimite: vacante?.fechaLimite ? vacante.fechaLimite.slice(0, 10) : '',
  })

  const canSave = form.titulo.trim().length > 0 && form.descripcion.trim().length > 0

  const guardar = useMutation({
    mutationFn: () =>
      isEdit
        ? vacantesService.update(vacante!.id, form)
        : vacantesService.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacantes'] })
      toast.success(isEdit ? 'Vacante actualizada' : 'Vacante publicada')
      onClose()
    },
    onError: () => toast.error('Error al guardar la vacante'),
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar vacante' : 'Nueva vacante'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título del puesto</label>
          <input
            value={form.titulo}
            onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            className="field"
            placeholder="Ej. Desarrollador Backend"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="field min-h-[100px]"
            placeholder="Describe las responsabilidades del puesto..."
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Requisitos</label>
          <textarea
            value={form.requisitos}
            onChange={(e) => setForm((f) => ({ ...f, requisitos: e.target.value }))}
            className="field min-h-[80px]"
            placeholder="Experiencia, habilidades, estudios..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Ubicación</label>
            <input
              value={form.ubicacion}
              onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))}
              className="field"
              placeholder="Ej. CDMX"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de contrato</label>
            <input
              value={form.tipoContrato}
              onChange={(e) => setForm((f) => ({ ...f, tipoContrato: e.target.value }))}
              className="field"
              placeholder="Ej. Tiempo completo"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Modalidad</label>
          <div className="flex gap-2">
            {MODALIDADES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, modalidad: m.value }))}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  form.modalidad === m.value
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Salario</label>
            <input
              value={form.salario}
              onChange={(e) => setForm((f) => ({ ...f, salario: e.target.value }))}
              className="field"
              placeholder="Ej. A convenir"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha límite</label>
            <input
              type="date"
              value={form.fechaLimite}
              onChange={(e) => setForm((f) => ({ ...f, fechaLimite: e.target.value }))}
              className="field"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>
            {isEdit ? 'Guardar cambios' : 'Publicar vacante'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal de postulantes de una vacante ── */
function PostulantesModal({ vacante, onClose }: { vacante: Vacante; onClose: () => void }) {
  const qc = useQueryClient()

  const { data: postulantes = [], isLoading } = useQuery({
    queryKey: ['vacantes', vacante.id, 'postulantes'],
    queryFn: () => vacantesService.getPostulantes(vacante.id),
  })

  const estadoMut = useMutation({
    mutationFn: ({ postId, estado }: { postId: number; estado: PostulanteEstado }) =>
      vacantesService.updateEstadoPostulante(vacante.id, postId, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacantes', vacante.id, 'postulantes'] }),
    onError: () => toast.error('Error al actualizar el estado'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Postulantes — ${vacante.titulo}`} size="xl">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : postulantes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
          <Users className="h-8 w-8" />
          <p className="text-sm">Aún no hay postulantes para esta vacante</p>
        </div>
      ) : (
        <div className="space-y-3">
          {postulantes.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900">{p.nombre}</p>
                <p className="text-xs text-gray-500">{p.email}{p.telefono ? ` · ${p.telefono}` : ''}</p>
                <p className="text-[0.68rem] text-gray-400 mt-0.5">{formatFecha(p.fecha)}</p>
                {p.mensaje && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{p.mensaje}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={p.cvUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  <FileText className="h-3.5 w-3.5" /> CV
                </a>
                <select
                  value={p.estado}
                  onChange={(e) => estadoMut.mutate({ postId: p.id, estado: e.target.value as PostulanteEstado })}
                  className="field text-xs py-1.5"
                >
                  {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ── Tarjeta de métrica del dashboard ── */
function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

/* ── Dashboard: métricas + tabla de todas las postulaciones recibidas desde la página pública ── */
function DashboardTab() {
  const [filtroVacante, setFiltroVacante] = useState<number | 'todas'>('todas')
  const [filtroEstado, setFiltroEstado] = useState<PostulanteEstado | 'todos'>('todos')
  const qc = useQueryClient()

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['vacantes', 'dashboard-stats'],
    queryFn: () => vacantesService.getDashboardStats(),
  })

  const { data: postulaciones = [], isLoading: isLoadingPostulaciones, refetch, isRefetching } = useQuery({
    queryKey: ['vacantes', 'postulantes-todas'],
    queryFn: () => vacantesService.getAllPostulantes(),
  })

  const estadoMut = useMutation({
    mutationFn: ({ vacanteId, postId, estado }: { vacanteId: number; postId: number; estado: PostulanteEstado }) =>
      vacantesService.updateEstadoPostulante(vacanteId, postId, estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacantes', 'postulantes-todas'] })
      qc.invalidateQueries({ queryKey: ['vacantes', 'dashboard-stats'] })
    },
    onError: () => toast.error('Error al actualizar el estado'),
  })

  const vacantesUnicas = Array.from(
    new Map(postulaciones.map((p) => [p.vacanteId, p.vacanteTitulo ?? `Vacante #${p.vacanteId}`])).entries(),
  )

  const filtradas = postulaciones.filter((p) => {
    if (filtroVacante !== 'todas' && p.vacanteId !== filtroVacante) return false
    if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false
    return true
  })

  const isLoading = isLoadingStats || isLoadingPostulaciones

  return (
    <div className="space-y-5">
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Briefcase} label="Vacantes activas" value={stats?.vacantesActivas ?? 0} />
            <StatCard icon={LayoutGrid} label="Vacantes totales" value={stats?.vacantesTotal ?? 0} />
            <StatCard icon={ClipboardList} label="Postulaciones totales" value={stats?.postulacionesTotal ?? 0} />
            <StatCard
              icon={UserCheck}
              label="Nuevas sin revisar"
              value={stats?.porEstado.find((e) => e.estado === 'nuevo')?.total ?? 0}
            />
          </div>

          {stats && stats.porVacante.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Postulaciones por vacante</h3>
              <div className="space-y-2">
                {stats.porVacante.map((v) => {
                  const max = Math.max(...stats.porVacante.map((x) => x.totalPostulantes), 1)
                  return (
                    <div key={v.vacanteId} className="flex items-center gap-3">
                      <span className={clsx('w-40 flex-shrink-0 truncate text-xs font-medium', !v.vacanteActiva && 'text-gray-400')}>
                        {v.vacanteTitulo}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${(v.totalPostulantes / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 flex-shrink-0 text-right text-xs font-semibold text-gray-700">{v.totalPostulantes}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filtroVacante}
                onChange={(e) => setFiltroVacante(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
                className="field text-xs py-1.5"
              >
                <option value="todas">Todas las vacantes</option>
                {vacantesUnicas.map(([id, titulo]) => (
                  <option key={id} value={id}>{titulo}</option>
                ))}
              </select>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as PostulanteEstado | 'todos')}
                className="field text-xs py-1.5"
              >
                <option value="todos">Todos los estados</option>
                {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} isLoading={isRefetching}>
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
          </div>

          {filtradas.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
              <Users className="h-8 w-8" />
              <p className="text-sm">No hay postulaciones que coincidan con el filtro</p>
            </div>
          ) : (
            <PostulantesTable
              postulantes={filtradas}
              onEstadoChange={(vacanteId, postId, estado) => estadoMut.mutate({ vacanteId, postId, estado })}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ── Página principal ── */
export function VacantesPage() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()

  const [tab, setTab] = useState<'vacantes' | 'dashboard'>('vacantes')
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<Vacante | null>(null)
  const [verPostulantes, setVerPostulantes] = useState<Vacante | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<Vacante | null>(null)

  const { data: vacantes = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['vacantes'],
    queryFn: () => vacantesService.getAll(true),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vacantes'] })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => vacantesService.delete(id),
    onSuccess: () => { invalidate(); toast.success('Vacante despublicada') },
    onError: () => toast.error('Error al eliminar la vacante'),
  })

  const activoMut = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => vacantesService.toggleActivo(id, activo),
    onSuccess: invalidate,
    onError: () => toast.error('Error al cambiar el estado'),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-brand" /> Vacantes
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{vacantes.length} vacante{vacantes.length !== 1 ? 's' : ''} registrada{vacantes.length !== 1 ? 's' : ''}</p>
        </div>
        {tab === 'vacantes' && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} isLoading={isRefetching}>
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowCrear(true)}>
                <Plus className="h-3.5 w-3.5" /> Nueva vacante
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('vacantes')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'vacantes' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Vacantes
        </button>
        <button
          onClick={() => setTab('dashboard')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'dashboard' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
        </button>
      </div>

      {tab === 'dashboard' ? <DashboardTab /> : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <VacantesGrid
          vacantes={vacantes}
          isAdmin={isAdmin}
          onVerPostulantes={setVerPostulantes}
          onEditar={setEditando}
          onEliminar={setConfirmEliminar}
          onToggleActivo={(id, activo) => activoMut.mutate({ id, activo })}
        />
      )}

      {showCrear && <VacanteFormModal onClose={() => setShowCrear(false)} />}
      {editando && <VacanteFormModal vacante={editando} onClose={() => setEditando(null)} />}
      {verPostulantes && <PostulantesModal vacante={verPostulantes} onClose={() => setVerPostulantes(null)} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.id) }}
        title="Despublicar vacante"
        message={`¿Seguro que deseas despublicar "${confirmEliminar?.titulo}"? Dejará de mostrarse en el sitio público.`}
        confirmLabel="Despublicar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
