import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Timer, Plus, Trash2, Pencil, Power, BarChart3, CalendarOff } from 'lucide-react'
import { ticketSlaService } from '@/services/ticketSla.service'
import { catalogosTiService } from '@/services/catalogosTi.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { ReglaSla } from '@/types/ticketSla.types'
import { PRIORIDAD_LABELS, type TicketPrioridad } from '@/types/ticket.types'

const PRIORIDADES = ['P1', 'P2', 'P3', 'P4'] as const
const AREAS = ['TI', 'ST']

function formatMinutos(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24)
  const hRestantes = h % 24
  const partes = [`${d}d`]
  if (hRestantes > 0) partes.push(`${hRestantes}h`)
  if (m > 0) partes.push(`${m}min`)
  return partes.join(' ')
}

function GuardarReglaModal({ regla, onClose }: { regla: ReglaSla | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [prioridad, setPrioridad] = useState(regla?.prioridad ?? 'P3')
  const [area, setArea] = useState(regla?.area ?? '')
  const [servicio, setServicio] = useState(regla?.servicio ?? '')
  const [minPrimeraRespuestaDesde, setMinPrimeraRespuestaDesde] = useState<number | ''>(regla?.minPrimeraRespuestaDesde ?? '')
  const [minPrimeraRespuesta, setMinPrimeraRespuesta] = useState<number | ''>(regla?.minPrimeraRespuesta ?? '')
  const [minResolucionDesde, setMinResolucionDesde] = useState<number | ''>(regla?.minResolucionDesde ?? '')
  const [minResolucion, setMinResolucion] = useState<number | ''>(regla?.minResolucion ?? '')

  const { data: servicios = [] } = useQuery({
    queryKey: ['catalogos-ti-servicios'],
    queryFn: () => catalogosTiService.getServicios(),
  })

  const guardar = useMutation({
    mutationFn: () => regla
      ? ticketSlaService.actualizarRegla(regla.id, { prioridad, area: area || undefined, servicio: servicio || undefined, minPrimeraRespuestaDesde: minPrimeraRespuestaDesde === '' ? undefined : Number(minPrimeraRespuestaDesde), minPrimeraRespuesta: Number(minPrimeraRespuesta), minResolucionDesde: minResolucionDesde === '' ? undefined : Number(minResolucionDesde), minResolucion: Number(minResolucion), activa: regla.activa })
      : ticketSlaService.crearRegla({ prioridad, area: area || undefined, servicio: servicio || undefined, minPrimeraRespuestaDesde: minPrimeraRespuestaDesde === '' ? undefined : Number(minPrimeraRespuestaDesde), minPrimeraRespuesta: Number(minPrimeraRespuesta), minResolucionDesde: minResolucionDesde === '' ? undefined : Number(minResolucionDesde), minResolucion: Number(minResolucion) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets-sla-reglas'] })
      qc.invalidateQueries({ queryKey: ['tickets-sla-reporte'] })
      toast.success(regla ? 'Regla actualizada' : 'Regla creada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar la regla'),
  })

  const puedeGuardar = minPrimeraRespuesta !== '' && Number(minPrimeraRespuesta) > 0 && minResolucion !== '' && Number(minResolucion) > 0
    && (minPrimeraRespuestaDesde === '' || Number(minPrimeraRespuestaDesde) < Number(minPrimeraRespuesta))
    && (minResolucionDesde === '' || Number(minResolucionDesde) < Number(minResolucion))

  return (
    <Modal isOpen onClose={onClose} title={regla ? 'Editar regla SLA' : 'Nueva regla SLA'} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Prioridad</label>
          <div className="grid grid-cols-2 gap-2">
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                onClick={() => setPrioridad(p)}
                className={clsx('rounded-xl border px-2 py-2 text-xs font-semibold transition-colors', prioridad === p ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
              >
                {PRIORIDAD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Área (opcional — vacío aplica a todas)</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="field">
            <option value="">Todas las áreas</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Servicio (opcional — vacío aplica a todos)</label>
          <select value={servicio} onChange={(e) => setServicio(e.target.value)} className="field">
            <option value="">Todos los servicios</option>
            {servicios.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Minutos — primera respuesta</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[0.65rem] font-medium text-gray-400">Desde (opcional)</label>
              <input type="number" min={0} value={minPrimeraRespuestaDesde} onChange={(e) => setMinPrimeraRespuestaDesde(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="Ej. 1" />
            </div>
            <div>
              <label className="mb-1 block text-[0.65rem] font-medium text-gray-400">Hasta (límite de SLA)</label>
              <input type="number" min={1} value={minPrimeraRespuesta} onChange={(e) => setMinPrimeraRespuesta(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="Ej. 5" />
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Minutos — resolución</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[0.65rem] font-medium text-gray-400">Desde (opcional)</label>
              <input type="number" min={0} value={minResolucionDesde} onChange={(e) => setMinResolucionDesde(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="Ej. 60" />
            </div>
            <div>
              <label className="mb-1 block text-[0.65rem] font-medium text-gray-400">Hasta (límite de SLA)</label>
              <input type="number" min={1} value={minResolucion} onChange={(e) => setMinResolucion(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="Ej. 240" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!puedeGuardar} onClick={() => guardar.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function DiasFestivosPanel({ soloLectura = false }: { soloLectura?: boolean }) {
  const qc = useQueryClient()
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const { data: festivos = [], isLoading } = useQuery({
    queryKey: ['ti-dias-festivos'],
    queryFn: () => catalogosTiService.getDiasFestivos(),
  })

  const crear = useMutation({
    mutationFn: () => catalogosTiService.createDiaFestivo({ fecha, descripcion: descripcion.trim() || undefined }),
    onSuccess: () => {
      setFecha('')
      setDescripcion('')
      qc.invalidateQueries({ queryKey: ['ti-dias-festivos'] })
    },
    onError: () => toast.error('No se pudo crear el día festivo (¿ya existe esa fecha?)'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => catalogosTiService.deleteDiaFestivo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ti-dias-festivos'] }),
  })

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <CalendarOff className="h-4 w-4 text-brand" />
        <p className="text-sm font-semibold text-ink">Días festivos / no laborables</p>
      </div>
      <p className="mb-3 text-xs text-ink-tertiary">
        Sábados, domingos y las fechas aquí listadas se excluyen por completo del cálculo de SLA — un
        ticket creado un viernes antes de un feriado no "pierde" ese tiempo contra su plazo de resolución.
      </p>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : festivos.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-tertiary">Sin días festivos configurados.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {festivos.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-28 font-mono text-xs text-ink-secondary">{f.fecha}</span>
              <span className="flex-1 text-ink-tertiary">{f.descripcion ?? '—'}</span>
              {!soloLectura && (
                <button className="text-ink-tertiary hover:text-red-500" onClick={() => eliminar.mutate(f.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!soloLectura && (
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input type="date" className="field text-sm" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <input className="field flex-1 text-sm" placeholder="Descripción (ej. Día de la Independencia)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!fecha || crear.isPending}
            onClick={() => crear.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      )}
    </div>
  )
}

export function SlaTab({ soloLectura = false }: { soloLectura?: boolean } = {}) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'crear' | ReglaSla | null>(null)

  const { data: reglas = [], isLoading } = useQuery({
    queryKey: ['tickets-sla-reglas'],
    queryFn: () => ticketSlaService.listReglas(),
  })

  const { data: reporte } = useQuery({
    queryKey: ['tickets-sla-reporte'],
    queryFn: () => ticketSlaService.getReporte(),
  })

  const toggleActiva = useMutation({
    mutationFn: (r: ReglaSla) => ticketSlaService.actualizarRegla(r.id, { prioridad: r.prioridad, area: r.area ?? undefined, servicio: r.servicio ?? undefined, minPrimeraRespuestaDesde: r.minPrimeraRespuestaDesde ?? undefined, minPrimeraRespuesta: r.minPrimeraRespuesta, minResolucionDesde: r.minResolucionDesde ?? undefined, minResolucion: r.minResolucion, activa: !r.activa }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets-sla-reglas'] })
      qc.invalidateQueries({ queryKey: ['tickets-sla-reporte'] })
      toast.success('Regla actualizada')
    },
    onError: () => toast.error('Error al actualizar la regla'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => ticketSlaService.eliminarRegla(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets-sla-reglas'] })
      qc.invalidateQueries({ queryKey: ['tickets-sla-reporte'] })
      toast.success('Regla eliminada')
    },
    onError: () => toast.error('Error al eliminar la regla'),
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Timer className="h-4 w-4 text-brand" /> SLA de Tickets
          </h2>
          <p className="mt-0.5 text-xs text-ink-tertiary">Reglas de tiempo de respuesta y resolución, configurables por prioridad y área</p>
        </div>
        {!soloLectura && (
          <Button size="sm" onClick={() => setModal('crear')}><Plus className="h-3.5 w-3.5" /> Nueva regla</Button>
        )}
      </div>

      {reporte && (
        <DashboardStatRow
          stats={[
            { key: 'cumplimiento', icon: BarChart3, label: '% Cumplimiento general', value: reporte.pctCumplimiento !== null ? `${reporte.pctCumplimiento}%` : '—', tone: (reporte.pctCumplimiento ?? 0) >= 80 ? 'success' : 'warn' },
            { key: 'evaluados', icon: BarChart3, label: 'Tickets evaluados', value: reporte.totalEvaluados, tone: 'brand' },
            { key: 'cumplidos', icon: BarChart3, label: 'Cumplidos', value: reporte.cumplidos, tone: 'success' },
          ]}
        />
      )}

      {reporte && reporte.totalEvaluados > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Cumplimiento por área</h3>
            <div className="space-y-2">
              {reporte.porArea.map((g) => (
                <div key={g.key} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{g.key}</span>
                  <span className="text-gray-600">{g.cumplidos}/{g.total} — <span className="font-semibold">{g.pctCumplimiento}%</span></span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Cumplimiento por prioridad</h3>
            <div className="space-y-2">
              {reporte.porPrioridad.map((g) => (
                <div key={g.key} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{g.key}</span>
                  <span className="text-gray-600">{g.cumplidos}/{g.total} — <span className="font-semibold">{g.pctCumplimiento}%</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : reglas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Timer className="h-8 w-8" />
          <p className="text-sm">Sin reglas de SLA definidas — crea la primera para empezar a medir cumplimiento.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reglas.map((r) => (
            <div key={r.id} className={clsx('card p-4', !r.activa && 'opacity-50')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{PRIORIDAD_LABELS[r.prioridad as TicketPrioridad] ?? r.prioridad}</p>
                  <p className="text-xs text-gray-500">{r.area ?? 'Todas las áreas'}{r.servicio ? ` · ${r.servicio}` : ''}</p>
                </div>
                {!soloLectura && (
                  <div className="flex gap-1">
                    <button onClick={() => toggleActiva.mutate(r)} title={r.activa ? 'Desactivar' : 'Activar'} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setModal(r)} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => eliminar.mutate(r.id)} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1 border-t border-gray-100 pt-2">
                <p className="text-xs text-gray-600">
                  Primera respuesta:{' '}
                  <span className="font-semibold text-gray-800">
                    {r.minPrimeraRespuestaDesde
                      ? `${formatMinutos(r.minPrimeraRespuestaDesde)} a ${formatMinutos(r.minPrimeraRespuesta)}`
                      : formatMinutos(r.minPrimeraRespuesta)}
                  </span>
                </p>
                <p className="text-xs text-gray-600">
                  Resolución:{' '}
                  <span className="font-semibold text-gray-800">
                    {r.minResolucionDesde
                      ? `${formatMinutos(r.minResolucionDesde)} a ${formatMinutos(r.minResolucion)}`
                      : formatMinutos(r.minResolucion)}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <DiasFestivosPanel soloLectura={soloLectura} />

      {!soloLectura && modal && <GuardarReglaModal regla={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
}
