import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, GraduationCap, Clock, FileText, Trash2, Pencil, Upload,
  CheckCircle2, Download, LayoutGrid, ListChecks, Paperclip,
  ClipboardCheck, Globe2, Lock, Copy, Users, XCircle, Search, UserPlus,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { capacitacionService } from '@/services/capacitacion.service'
import { capacitacionExamenService } from '@/services/capacitacionExamen.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { ExamenFormModal } from './ExamenFormModal'
import { ResponderExamen } from './ResponderExamen'
import { CronometroCurso } from './CronometroCurso'
import type { Curso, MiCurso } from '@/types/capacitacion.types'
import type { Examen, ExamenIntento } from '@/types/capacitacionExamen.types'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDuracion(min: number | null) {
  if (!min) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

/* ── Formulario crear/editar curso ── */
function CursoFormModal({ curso, onClose }: { curso?: Curso; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!curso

  // Un curso ya activo acumula duración en vez de reemplazarla — el campo pasa
  // a ser "minutos a agregar" en lugar del total, para no perder el tiempo ya
  // invertido en él si alguien solo quiere corregir el título o la descripción.
  const acumulaDuracion = isEdit && curso!.activo

  const [form, setForm] = useState({
    titulo: curso?.titulo ?? '',
    descripcion: curso?.descripcion ?? '',
    categoria: curso?.categoria ?? '',
    duracionMin: !acumulaDuracion && curso?.duracionMin ? String(curso.duracionMin) : '',
    duracionMinAgregar: '',
  })

  const canSave = form.titulo.trim().length > 0 && form.descripcion.trim().length > 0

  const guardar = useMutation({
    mutationFn: () => {
      const payload = {
        titulo: form.titulo,
        descripcion: form.descripcion,
        categoria: form.categoria || undefined,
        duracionMin: !acumulaDuracion && form.duracionMin ? Number(form.duracionMin) : undefined,
        duracionMinAgregar: acumulaDuracion && form.duracionMinAgregar ? Number(form.duracionMinAgregar) : undefined,
      }
      return isEdit ? capacitacionService.update(curso!.id, payload) : capacitacionService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capacitacion-cursos'] })
      toast.success(isEdit ? 'Curso actualizado' : 'Curso publicado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el curso'),
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar curso' : 'Nuevo curso'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input
            value={form.titulo}
            onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            className="field"
            placeholder="Ej. Inducción general ArdaBytec"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="field min-h-[100px]"
            placeholder="De qué trata el curso y qué va a aprender el empleado..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
            <input
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              className="field"
              placeholder="Ej. Inducción"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              {acumulaDuracion ? 'Agregar minutos' : 'Duración (minutos)'}
            </label>
            {acumulaDuracion ? (
              <input
                type="number"
                min="0"
                value={form.duracionMinAgregar}
                onChange={(e) => setForm((f) => ({ ...f, duracionMinAgregar: e.target.value }))}
                className="field"
                placeholder="Ej. 15"
              />
            ) : (
              <input
                type="number"
                min="0"
                value={form.duracionMin}
                onChange={(e) => setForm((f) => ({ ...f, duracionMin: e.target.value }))}
                className="field"
                placeholder="Ej. 45"
              />
            )}
            {acumulaDuracion && (
              <p className="mt-1 text-[0.68rem] text-gray-400">
                Actual: {formatDuracion(curso!.duracionMin) ?? '0 min'} · se suma a lo que ya tiene, no lo reemplaza.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>
            {isEdit ? 'Guardar cambios' : 'Publicar curso'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Ver intentos de un examen (admin) ── */
function IntentosModal({ examen, onClose }: { examen: Examen; onClose: () => void }) {
  const { data: intentos = [], isLoading } = useQuery({
    queryKey: ['capacitacion-examen-intentos', examen.id],
    queryFn: () => capacitacionExamenService.listIntentos(examen.id),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Resultados — ${examen.titulo}`} size="lg" elevated>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : intentos.length === 0 ? (
        <p className="py-10 text-center text-xs text-gray-400">Nadie ha presentado este examen todavía.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-500">Persona</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-500">Puntaje</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-500">%</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {intentos.map((it: ExamenIntento) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-gray-700">
                    {it.usuarioNombre ?? it.respondienteNombre ?? '—'}
                    {it.respondienteEmail && <p className="text-[0.65rem] text-gray-400">{it.respondienteEmail}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{it.puntajeObtenido}/{it.puntajeTotal}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{it.porcentaje}%</td>
                  <td className="px-3 py-2 text-center">
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', it.aprobado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                      {it.aprobado ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {it.aprobado ? 'Aprobado' : 'No aprobado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

/* ── Sección de exámenes dentro del detalle del curso ── */
function ExamenesSeccion({ cursoId, isAdmin, onPresentar }: { cursoId: number; isAdmin: boolean; onPresentar: (examen: Examen) => void }) {
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [verIntentos, setVerIntentos] = useState<Examen | null>(null)

  const { data: examenes = [], isLoading } = useQuery({
    queryKey: ['capacitacion-examenes', cursoId],
    queryFn: () => capacitacionExamenService.listByCurso(cursoId),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => capacitacionExamenService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['capacitacion-examenes', cursoId] }); toast.success('Examen eliminado') },
    onError: () => toast.error('Error al eliminar el examen'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Exámenes</h3>
        {isAdmin && (
          <button onClick={() => setShowCrear(true)} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            <Plus className="h-3.5 w-3.5" /> Nuevo examen
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      ) : examenes.length === 0 ? (
        <p className="text-xs text-gray-400">Sin exámenes para este curso todavía.</p>
      ) : (
        <div className="space-y-1.5">
          {examenes.map((exa) => (
            <div key={exa.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
              <ClipboardCheck className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-gray-800">{exa.titulo}</p>
                <span className={clsx('inline-flex items-center gap-1 text-[0.62rem] font-semibold', exa.tipoAcceso === 'publico' ? 'text-emerald-600' : 'text-gray-400')}>
                  {exa.tipoAcceso === 'publico' ? <Globe2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                  {exa.tipoAcceso === 'publico' ? 'Público' : 'Privado'}
                </span>
              </div>
              {exa.tipoAcceso === 'publico' && exa.slugPublico && isAdmin && (
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/examen/${exa.slugPublico}`); toast.success('Enlace copiado') }}
                  title="Copiar enlace público"
                  className="flex-shrink-0 text-gray-300 hover:text-brand"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setVerIntentos(exa)} title="Ver resultados" className="flex-shrink-0 text-gray-300 hover:text-brand">
                  <Users className="h-3.5 w-3.5" />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => capacitacionExamenService.descargarPdf(exa.id, exa.titulo)}
                  title="Descargar examen en PDF"
                  className="flex-shrink-0 text-gray-300 hover:text-brand"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => onPresentar(exa)} className="flex-shrink-0 rounded-lg bg-brand/10 px-2 py-1 text-[0.65rem] font-semibold text-brand hover:bg-brand/15 transition-colors">
                Presentar
              </button>
              {isAdmin && (
                <button onClick={() => eliminar.mutate(exa.id)} className="flex-shrink-0 text-gray-300 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCrear && <ExamenFormModal cursoId={cursoId} onClose={() => setShowCrear(false)} />}
      {verIntentos && <IntentosModal examen={verIntentos} onClose={() => setVerIntentos(null)} />}
    </div>
  )
}

/* ── Presentar examen privado (usuario autenticado, dentro del curso) ── */
function PresentarExamenPrivado({ examenId, onCancel }: { examenId: number; onCancel: () => void }) {
  const { data: examen, isLoading } = useQuery({
    queryKey: ['capacitacion-examen-detalle', examenId],
    queryFn: () => capacitacionExamenService.getById(examenId),
  })

  if (isLoading || !examen) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <ResponderExamen
      examen={examen}
      onCancel={onCancel}
      onSubmit={(respuestas) => capacitacionExamenService.responder(examenId, respuestas)}
    />
  )
}

/* ── Detalle de curso: materiales + inscripción/completar ── */
/* ── Asignación de usuarios + acceso público (solo admin) ── */
interface UsuarioLite { id: number; nombre: string; usuario: string; rol: string }

function AsignacionSeccion({ curso, onCambioAcceso }: { curso: Curso; onCambioAcceso: () => void }) {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const linkPublico = curso.slugPublico
    ? `${window.location.origin}/capacitacion/publico/${curso.slugPublico}`
    : ''

  const { data: asignados = [], isLoading: cargandoAsignados } = useQuery({
    queryKey: ['capacitacion-asignados', curso.id],
    queryFn: () => capacitacionService.getAsignados(curso.id),
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-lite-capacitacion'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id ?? r.ID ?? 0),
        nombre: String(r.nombre ?? r.NOMBRES ?? r.nombres ?? '').replace(/\s+/g, ' ').trim(),
        usuario: String(r.usuario ?? r.USUARIO ?? r.login ?? ''),
        rol: String(r.tipoUsuario ?? r.rol ?? ''),
      })) as UsuarioLite[]
    },
    staleTime: 60_000,
  })

  const cambiarAcceso = useMutation({
    mutationFn: (acceso: 'publico' | 'privado') =>
      capacitacionService.update(curso.id, { titulo: curso.titulo, descripcion: curso.descripcion, categoria: curso.categoria ?? undefined, activo: curso.activo, acceso }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['capacitacion-cursos'] }); onCambioAcceso(); },
    onError: () => toast.error('No se pudo cambiar el acceso'),
  })

  const asignar = useMutation({
    mutationFn: () => capacitacionService.asignarUsuarios(curso.id, [...seleccion]),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['capacitacion-asignados', curso.id] })
      setSeleccion(new Set())
      toast.success(r.nuevas > 0 ? `${r.nuevas} usuario(s) asignado(s)` : 'Sin cambios (ya estaban asignados)')
    },
    onError: () => toast.error('No se pudo asignar'),
  })

  const desasignar = useMutation({
    mutationFn: (usuarioId: number) => capacitacionService.desasignarUsuario(curso.id, usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capacitacion-asignados', curso.id] }),
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo quitar'),
  })

  const yaAsignados = new Set(asignados.map((a) => a.usuarioId))
  const q = busca.trim().toLowerCase()
  const candidatos = usuarios
    .filter((u) => !yaAsignados.has(u.id))
    .filter((u) => !q || `${u.nombre} ${u.usuario} ${u.rol}`.toLowerCase().includes(q))
    .slice(0, 40)

  const toggle = (id: number) => setSeleccion((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/40 p-4">
      {/* Acceso público */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Acceso</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => cambiarAcceso.mutate(curso.acceso === 'publico' ? 'privado' : 'publico')}
            disabled={cambiarAcceso.isPending}
            className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-colors',
              curso.acceso === 'publico' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            {curso.acceso === 'publico' ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {curso.acceso === 'publico' ? 'Público (link)' : 'Privado'}
          </button>
          {curso.acceso === 'publico' && linkPublico && (
            <button
              onClick={() => { navigator.clipboard.writeText(linkPublico); toast.success('Link copiado') }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[0.72rem] font-mono text-gray-500 hover:bg-gray-100"
            >
              <Copy className="h-3.5 w-3.5" /> {linkPublico.replace(/^https?:\/\//, '')}
            </button>
          )}
        </div>
        {curso.acceso === 'publico' && (
          <p className="mt-1.5 text-[0.68rem] text-gray-400">
            Con el link cualquiera puede tomar el curso sin cuenta: escribe su número de empleado y nombre.
          </p>
        )}
      </div>

      {/* Asignados */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
          Asignados {asignados.length > 0 && <span className="text-gray-400">({asignados.length})</span>}
        </p>
        {cargandoAsignados ? (
          <p className="text-xs text-gray-400">Cargando…</p>
        ) : asignados.length === 0 ? (
          <p className="text-xs text-gray-400">Nadie asignado todavía.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {asignados.map((a) => (
              <div key={a.usuarioId} className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.78rem] font-medium text-gray-800">{a.nombre}</p>
                  <p className="text-[0.62rem] text-gray-400">{a.usuario} · {a.rol}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <span className={clsx('chip text-[0.58rem]', a.estado === 'completado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                    {a.estado === 'completado' ? 'Completó' : 'Pendiente'}
                  </span>
                  {a.estado !== 'completado' && (
                    <button onClick={() => desasignar.mutate(a.usuarioId)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Asignar a nuevos */}
      <div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar usuario por nombre, usuario o rol…"
            className="field w-full py-1.5 pl-8 text-xs"
          />
        </div>
        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 bg-card p-1">
          {candidatos.length === 0 ? (
            <p className="px-2 py-3 text-center text-[0.72rem] text-gray-400">Sin resultados</p>
          ) : candidatos.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
              <input type="checkbox" checked={seleccion.has(u.id)} onChange={() => toggle(u.id)} className="rounded accent-brand" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.78rem] text-gray-800">{u.nombre}</span>
                <span className="block text-[0.6rem] text-gray-400">{u.usuario} · {u.rol}</span>
              </span>
            </label>
          ))}
        </div>
        <Button
          className="mt-2 w-full"
          size="sm"
          disabled={seleccion.size === 0 || asignar.isPending}
          isLoading={asignar.isPending}
          onClick={() => asignar.mutate()}
        >
          <UserPlus className="h-3.5 w-3.5" /> Asignar {seleccion.size > 0 ? `(${seleccion.size})` : ''}
        </Button>
      </div>
    </div>
  )
}

function CursoDetalleModal({ curso, isAdmin, onClose }: { curso: Curso; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [subiendo, setSubiendo] = useState(false)
  const [presentandoExamen, setPresentandoExamen] = useState<Examen | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['capacitacion-cursos'] })

  const inscribirse = useMutation({
    mutationFn: () => capacitacionService.inscribirse(curso.id),
    onSuccess: () => { invalidate(); toast.success('Te inscribiste al curso') },
    onError: () => toast.error('Error al inscribirte'),
  })

  const completar = useMutation({
    mutationFn: () => capacitacionService.completar(curso.id),
    onSuccess: () => { invalidate(); toast.success('¡Curso completado! Ya puedes descargar tu constancia') },
    onError: () => toast.error('Error al marcar como completado'),
  })

  const eliminarMaterial = useMutation({
    mutationFn: (materialId: number) => capacitacionService.eliminarMaterial(materialId),
    onSuccess: () => { invalidate(); toast.success('Material eliminado') },
    onError: () => toast.error('Error al eliminar el material'),
  })

  const handleSubirMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    try {
      await capacitacionService.subirMaterial(curso.id, file)
      invalidate()
      toast.success('Material agregado')
    } catch {
      toast.error('Error al subir el material')
    } finally {
      setSubiendo(false)
      e.target.value = ''
    }
  }

  const handleDescargarConstancia = async () => {
    try {
      await capacitacionService.descargarConstancia(curso.id, curso.titulo)
    } catch {
      toast.error('Error al generar la constancia')
    }
  }

  if (presentandoExamen) {
    return (
      <Modal isOpen onClose={onClose} title={curso.titulo} size="lg">
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <PresentarExamenPrivado examenId={presentandoExamen.id} onCancel={() => setPresentandoExamen(null)} />
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={curso.titulo} size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          {curso.categoria && <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">{curso.categoria}</span>}
          {curso.duracionMin && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuracion(curso.duracionMin)}</span>}
        </div>

        <p className="text-sm text-gray-700 whitespace-pre-wrap">{curso.descripcion}</p>

        <CronometroCurso curso={curso} isAdmin={isAdmin} />

        {/* Materiales */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Materiales</h3>
            {isAdmin && (
              <label className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> {subiendo ? 'Subiendo...' : 'Agregar material'}
                <input type="file" className="hidden" disabled={subiendo} onChange={handleSubirMaterial} />
              </label>
            )}
          </div>
          {curso.materiales.length === 0 ? (
            <p className="text-xs text-gray-400">Sin materiales adjuntos todavía.</p>
          ) : (
            <div className="space-y-2.5">
              {curso.materiales.map((m) => {
                const esAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(m.tipo ?? '')
                const esVideo = ['mp4', 'webm', 'mov'].includes(m.tipo ?? '')
                const esImagen = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(m.tipo ?? '')
                // PDF e imágenes se presentan inline en el navegador. Audio y video se
                // reproducen embebidos. Los .ppt/.pptx no tienen visor nativo — se descargan.
                const esPresentacion = m.tipo === 'ppt' || m.tipo === 'pptx'

                if (esAudio || esVideo) {
                  return (
                    <div key={m.id} className="rounded-lg border border-gray-100 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <p className="flex-1 min-w-0 truncate text-xs font-medium text-gray-700">{m.nombre}</p>
                        {isAdmin && (
                          <button onClick={() => eliminarMaterial.mutate(m.id)} className="flex-shrink-0 text-gray-300 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {esVideo ? (
                        <video src={m.url} controls className="w-full rounded-lg max-h-64 bg-black" />
                      ) : (
                        <audio src={m.url} controls className="w-full" />
                      )}
                    </div>
                  )
                }

                if (esImagen) {
                  return (
                    <div key={m.id} className="rounded-lg border border-gray-100 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <a href={m.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-xs font-medium text-brand hover:underline">{m.nombre}</a>
                        {isAdmin && (
                          <button onClick={() => eliminarMaterial.mutate(m.id)} className="flex-shrink-0 text-gray-300 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <a href={m.url} target="_blank" rel="noreferrer">
                        <img src={m.url} alt={m.nombre} className="w-full rounded-lg max-h-64 object-cover" />
                      </a>
                    </div>
                  )
                }

                return (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                    <Paperclip className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <a
                      href={m.url}
                      target={esPresentacion ? undefined : '_blank'}
                      download={esPresentacion ? m.nombre : undefined}
                      rel="noreferrer"
                      className="flex-1 min-w-0 truncate text-xs font-medium text-brand hover:underline"
                    >
                      {m.nombre}{esPresentacion && <span className="ml-1.5 text-gray-400 font-normal">(descargar para ver)</span>}
                    </a>
                    {isAdmin && (
                      <button
                        onClick={() => eliminarMaterial.mutate(m.id)}
                        className="flex-shrink-0 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Exámenes */}
        <ExamenesSeccion cursoId={curso.id} isAdmin={isAdmin} onPresentar={setPresentandoExamen} />

        {/* Asignación de usuarios + acceso público — solo admin */}
        {isAdmin && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <Users className="h-3.5 w-3.5" /> Asignar a usuarios
            </h3>
            <AsignacionSeccion curso={curso} onCambioAcceso={invalidate} />
          </div>
        )}

        {/* Acción según mi estado */}
        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
          {curso.miEstado === 'completado' ? (
            <Button onClick={handleDescargarConstancia}>
              <Download className="h-3.5 w-3.5" /> Descargar constancia
            </Button>
          ) : curso.miEstado === 'inscrito' ? (
            <Button isLoading={completar.isPending} onClick={() => completar.mutate()}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como completado
            </Button>
          ) : (
            <Button isLoading={inscribirse.isPending} onClick={() => inscribirse.mutate()}>
              Inscribirme
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ── Tarjeta de curso en el catálogo ── */
function CursoCard({ curso, isAdmin, onAbrir, onEditar, onEliminar }: {
  curso: Curso
  isAdmin: boolean
  onAbrir: () => void
  onEditar: () => void
  onEliminar: () => void
}) {
  return (
    <div className={clsx(
      'card flex flex-col gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-md',
      !curso.activo && 'opacity-60',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10">
            <GraduationCap className="h-4 w-4 text-brand" />
          </div>
          <h3 className="font-semibold text-sm text-gray-900 leading-snug pt-1.5">{curso.titulo}</h3>
        </div>
        {curso.miEstado === 'completado' && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Completado
          </span>
        )}
        {curso.miEstado === 'inscrito' && (
          <span className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[0.65rem] font-semibold text-blue-700">
            Inscrito
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
        {curso.categoria && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{curso.categoria}</span>}
        {curso.duracionMin && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuracion(curso.duracionMin)}</span>}
        {curso.materiales.length > 0 && <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {curso.materiales.length} material{curso.materiales.length !== 1 ? 'es' : ''}</span>}
        {curso.timerCorriendo && (
          <span className="flex items-center gap-1 font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> En curso
          </span>
        )}
      </div>

      <p className="text-xs text-gray-600 line-clamp-2">{curso.descripcion}</p>

      <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-100">
        <button onClick={onAbrir} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <GraduationCap className="h-3.5 w-3.5" /> Ver curso
        </button>

        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={onEditar} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onEliminar} title="Despublicar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Tab: Mis cursos ── */
function MisCursosTab() {
  const { data: misCursos = [], isLoading } = useQuery({
    queryKey: ['capacitacion-mis-cursos'],
    queryFn: () => capacitacionService.getMisCursos(),
  })

  const handleDescargar = async (c: MiCurso) => {
    try {
      await capacitacionService.descargarConstancia(c.cursoId, c.titulo)
    } catch {
      toast.error('Error al generar la constancia')
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (misCursos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <ListChecks className="h-8 w-8" />
        <p className="text-sm">Todavía no te has inscrito a ningún curso</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Curso</th>
            <th className="px-4 py-2.5 font-semibold">Categoría</th>
            <th className="px-4 py-2.5 font-semibold">Inscripción</th>
            <th className="px-4 py-2.5 font-semibold">Estado</th>
            <th className="px-4 py-2.5 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {misCursos.map((c) => (
            <tr key={c.cursoId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{c.titulo}</td>
              <td className="px-4 py-2.5 text-gray-600">{c.categoria ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-500">{formatFecha(c.fechaInscripcion)}</td>
              <td className="px-4 py-2.5">
                <span className={clsx(
                  'rounded-lg px-2 py-1 text-[0.7rem] font-semibold',
                  c.estado === 'completado' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700',
                )}>
                  {c.estado === 'completado' ? 'Completado' : 'Inscrito'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                {c.estado === 'completado' && (
                  <button onClick={() => handleDescargar(c)} className="flex items-center gap-1 ml-auto text-xs font-semibold text-brand hover:underline">
                    <Download className="h-3.5 w-3.5" /> Constancia
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Página principal ── */
export function CapacitacionPage() {
  const qc = useQueryClient()
  const isAdmin = useIsADorTI()

  const [tab, setTab] = useState<'catalogo' | 'mis-cursos'>('catalogo')
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<Curso | null>(null)
  const [verCurso, setVerCurso] = useState<Curso | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<Curso | null>(null)

  const { data: cursos = [], isLoading } = useQuery({
    queryKey: ['capacitacion-cursos'],
    queryFn: () => capacitacionService.getCursos(isAdmin),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['capacitacion-cursos'] })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => capacitacionService.delete(id),
    onSuccess: () => { invalidate(); toast.success('Curso despublicado') },
    onError: () => toast.error('Error al despublicar el curso'),
  })

  // Si el modal de detalle está abierto, mantenerlo sincronizado con los datos frescos.
  const cursoDetalle = verCurso ? cursos.find((c) => c.id === verCurso.id) ?? verCurso : null

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-brand" /> Capacitación
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Inducción, cursos, materiales y constancias</p>
        </div>
        {tab === 'catalogo' && isAdmin && (
          <Button size="sm" onClick={() => setShowCrear(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo curso
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('catalogo')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'catalogo' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Catálogo
        </button>
        <button
          onClick={() => setTab('mis-cursos')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'mis-cursos' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <ListChecks className="h-3.5 w-3.5" /> Mis cursos
        </button>
      </div>

      {tab === 'mis-cursos' ? (
        <MisCursosTab />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : cursos.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <GraduationCap className="h-8 w-8" />
          <p className="text-sm">No hay cursos publicados todavía</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map((c) => (
            <CursoCard
              key={c.id}
              curso={c}
              isAdmin={isAdmin}
              onAbrir={() => setVerCurso(c)}
              onEditar={() => setEditando(c)}
              onEliminar={() => setConfirmEliminar(c)}
            />
          ))}
        </div>
      )}

      {showCrear && <CursoFormModal onClose={() => setShowCrear(false)} />}
      {editando && <CursoFormModal curso={editando} onClose={() => setEditando(null)} />}
      {cursoDetalle && <CursoDetalleModal curso={cursoDetalle} isAdmin={isAdmin} onClose={() => setVerCurso(null)} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.id) }}
        title="Despublicar curso"
        message={`¿Seguro que deseas despublicar "${confirmEliminar?.titulo}"? Dejará de mostrarse en el catálogo.`}
        confirmLabel="Despublicar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
