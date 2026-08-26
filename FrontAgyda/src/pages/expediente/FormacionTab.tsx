import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Award, GraduationCap, Briefcase, Plus, X } from 'lucide-react'
import { api } from '@/lib/axios'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Campo, CampoSelect, CampoCheckbox, NIVEL_ACADEMICO_OPCIONES } from './expedienteCompleto.shared'

interface Certificacion { id: number; nombre: string; institucion: string; numFolio: string; fechaEmision: string; fechaVencimiento: string }
interface Academico { id: number; nivel: string; institucion: string; carreraTitulo: string; fechaInicio: string; fechaFin: string; enCurso: boolean }
interface ExperienciaLaboral { id: number; empresa: string; puesto: string; fechaInicio: string; fechaFin: string; actual: boolean; descripcion: string }

function fmt(f: string) {
  if (!f) return '—'
  return new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Certificaciones ── */
function CertificacionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ nombre: '', institucion: '', numFolio: '', fechaEmision: '', fechaVencimiento: '' })

  const crear = useMutation({
    mutationFn: () => api.post('/expedientes/mi/certificaciones', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-certificaciones'] }); toast.success('Certificación agregada'); onClose() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Licencia o certificación" size="md">
      <div className="space-y-3">
        <Campo label="Nombre" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
        <Campo label="Institución" value={form.institucion} onChange={(v) => setForm({ ...form, institucion: v })} />
        <Campo label="No. de folio / certificado" value={form.numFolio} onChange={(v) => setForm({ ...form, numFolio: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha de emisión" type="date" value={form.fechaEmision} onChange={(v) => setForm({ ...form, fechaEmision: v })} />
          <Campo label="Fecha de vencimiento" type="date" value={form.fechaVencimiento} onChange={(v) => setForm({ ...form, fechaVencimiento: v })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} onClick={() => crear.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function CertificacionesSeccion() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { data: items = [], isLoading } = useQuery<Certificacion[]>({
    queryKey: ['expediente-certificaciones'],
    queryFn: async () => (await api.get('/expedientes/mi/certificaciones')).data?.data ?? [],
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/expedientes/mi/certificaciones/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-certificaciones'] }); toast.success('Eliminada'); setConfirmId(null) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Award className="h-4 w-4" /></div>
          <h3 className="text-[0.82rem] font-bold text-gray-800">Licencias y certificaciones</h3>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1.5 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Licencia o certificación
        </button>
      </div>
      {isLoading ? (
        <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-[0.78rem] text-gray-400 py-4 text-center">Sin certificaciones registradas</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{c.nombre}</p>
                <p className="text-[0.7rem] text-gray-400">{c.institucion}{c.numFolio ? ` · No. ${c.numFolio}` : ''}</p>
                <p className="text-[0.7rem] text-gray-400">{fmt(c.fechaEmision)} {c.fechaVencimiento ? `– ${fmt(c.fechaVencimiento)}` : ''}</p>
              </div>
              <button onClick={() => setConfirmId(c.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {showModal && <CertificacionModal onClose={() => setShowModal(false)} />}
      <ConfirmDialog isOpen={confirmId !== null} onClose={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId !== null) eliminar.mutate(confirmId) }}
        title="Eliminar certificación" message="¿Seguro que deseas eliminar esta certificación?" confirmLabel="Eliminar" isPending={eliminar.isPending} />
    </div>
  )
}

/* ── Trayectoria académica ── */
function AcademicoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ nivel: '', institucion: '', carreraTitulo: '', fechaInicio: '', fechaFin: '', enCurso: false })

  const crear = useMutation({
    mutationFn: () => api.post('/expedientes/mi/academico', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-academico'] }); toast.success('Información académica agregada'); onClose() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Información académica" size="md">
      <div className="space-y-3">
        <CampoSelect label="Nivel" value={form.nivel} onChange={(v) => setForm({ ...form, nivel: v })} opciones={NIVEL_ACADEMICO_OPCIONES} />
        <Campo label="Institución" value={form.institucion} onChange={(v) => setForm({ ...form, institucion: v })} />
        <Campo label="Carrera / Título" value={form.carreraTitulo} onChange={(v) => setForm({ ...form, carreraTitulo: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha de inicio" type="date" value={form.fechaInicio} onChange={(v) => setForm({ ...form, fechaInicio: v })} />
          <Campo label="Fecha de fin" type="date" value={form.fechaFin} onChange={(v) => setForm({ ...form, fechaFin: v })} />
        </div>
        <CampoCheckbox label="En curso actualmente" checked={form.enCurso} onChange={(v) => setForm({ ...form, enCurso: v })} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} onClick={() => crear.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function AcademicoSeccion() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { data: items = [], isLoading } = useQuery<Academico[]>({
    queryKey: ['expediente-academico'],
    queryFn: async () => (await api.get('/expedientes/mi/academico')).data?.data ?? [],
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/expedientes/mi/academico/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-academico'] }); toast.success('Eliminado'); setConfirmId(null) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><GraduationCap className="h-4 w-4" /></div>
          <h3 className="text-[0.82rem] font-bold text-gray-800">Trayectoria académica</h3>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1.5 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Información académica
        </button>
      </div>
      {isLoading ? (
        <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-[0.78rem] text-gray-400 py-4 text-center">Sin registros académicos</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{a.nivel} — {a.carreraTitulo}</p>
                <p className="text-[0.7rem] text-gray-400">{a.institucion}</p>
                <p className="text-[0.7rem] text-gray-400">{fmt(a.fechaInicio)} – {a.enCurso ? 'En curso' : fmt(a.fechaFin)}</p>
              </div>
              <button onClick={() => setConfirmId(a.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {showModal && <AcademicoModal onClose={() => setShowModal(false)} />}
      <ConfirmDialog isOpen={confirmId !== null} onClose={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId !== null) eliminar.mutate(confirmId) }}
        title="Eliminar registro académico" message="¿Seguro que deseas eliminar este registro?" confirmLabel="Eliminar" isPending={eliminar.isPending} />
    </div>
  )
}

/* ── Experiencia laboral ── */
function ExperienciaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ empresa: '', puesto: '', fechaInicio: '', fechaFin: '', actual: false, descripcion: '' })

  const crear = useMutation({
    mutationFn: () => api.post('/expedientes/mi/experiencia-laboral', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-experiencia-laboral'] }); toast.success('Experiencia agregada'); onClose() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Información laboral" size="md">
      <div className="space-y-3">
        <Campo label="Empresa" value={form.empresa} onChange={(v) => setForm({ ...form, empresa: v })} />
        <Campo label="Puesto" value={form.puesto} onChange={(v) => setForm({ ...form, puesto: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha de inicio" type="date" value={form.fechaInicio} onChange={(v) => setForm({ ...form, fechaInicio: v })} />
          <Campo label="Fecha de fin" type="date" value={form.fechaFin} onChange={(v) => setForm({ ...form, fechaFin: v })} />
        </div>
        <CampoCheckbox label="Puesto actual" checked={form.actual} onChange={(v) => setForm({ ...form, actual: v })} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} className="field resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} onClick={() => crear.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function ExperienciaSeccion() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { data: items = [], isLoading } = useQuery<ExperienciaLaboral[]>({
    queryKey: ['expediente-experiencia-laboral'],
    queryFn: async () => (await api.get('/expedientes/mi/experiencia-laboral')).data?.data ?? [],
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/expedientes/mi/experiencia-laboral/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expediente-experiencia-laboral'] }); toast.success('Eliminada'); setConfirmId(null) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Briefcase className="h-4 w-4" /></div>
          <h3 className="text-[0.82rem] font-bold text-gray-800">Experiencia laboral</h3>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1.5 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Información laboral
        </button>
      </div>
      {isLoading ? (
        <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-[0.78rem] text-gray-400 py-4 text-center">Sin experiencia laboral registrada</p>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{e.puesto} — {e.empresa}</p>
                <p className="text-[0.7rem] text-gray-400">{fmt(e.fechaInicio)} – {e.actual ? 'Actual' : fmt(e.fechaFin)}</p>
                {e.descripcion && <p className="text-[0.72rem] text-gray-500 mt-1">{e.descripcion}</p>}
              </div>
              <button onClick={() => setConfirmId(e.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {showModal && <ExperienciaModal onClose={() => setShowModal(false)} />}
      <ConfirmDialog isOpen={confirmId !== null} onClose={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId !== null) eliminar.mutate(confirmId) }}
        title="Eliminar experiencia laboral" message="¿Seguro que deseas eliminar este registro?" confirmLabel="Eliminar" isPending={eliminar.isPending} />
    </div>
  )
}

export function FormacionTab() {
  return (
    <div className="space-y-4 animate-fade-in">
      <CertificacionesSeccion />
      <AcademicoSeccion />
      <ExperienciaSeccion />
    </div>
  )
}
