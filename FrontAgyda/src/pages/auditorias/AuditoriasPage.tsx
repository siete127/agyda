import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ClipboardList, Plus, Trash2, X, ArrowLeft } from 'lucide-react'
import { auditoriasService } from '@/services/auditorias.service'
import { cumplimientoProcesosService } from '@/services/cumplimientoProcesos.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { VEREDICTO_LABELS, type VeredictoAuditoria } from '@/types/auditorias.types'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

const VEREDICTO_COLOR: Record<VeredictoAuditoria, string> = {
  en_curso: 'bg-blue-100 text-blue-700',
  aprobada: 'bg-emerald-100 text-emerald-700',
  observaciones: 'bg-amber-100 text-amber-700',
  no_aprobada: 'bg-red-100 text-red-700',
}

function CrearAuditoriaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [alcance, setAlcance] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [seleccionados, setSeleccionados] = useState<number[]>([])

  const { data: registros = [] } = useQuery({
    queryKey: ['calidad-procesos-registros'],
    queryFn: () => cumplimientoProcesosService.listRegistros(),
  })

  const crear = useMutation({
    mutationFn: () => auditoriasService.crear({
      titulo: titulo.trim(),
      alcance: alcance.trim() || undefined,
      periodoInicio: periodoInicio || undefined,
      periodoFin: periodoFin || undefined,
      registroIds: seleccionados,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-auditorias'] })
      toast.success('Auditoría creada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear la auditoría'),
  })

  const toggleRegistro = (id: number) => {
    setSeleccionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const puedeCrear = titulo.trim() !== ''

  return (
    <Modal isOpen onClose={onClose} title="Nueva auditoría" size="lg">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Ej. Auditoría trimestral Q3" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Alcance (opcional)</label>
          <textarea value={alcance} onChange={(e) => setAlcance(e.target.value)} className="field" rows={2} placeholder="Qué se revisó y por qué" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Periodo desde</label>
            <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Periodo hasta</label>
            <input type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} className="field" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Registros de cumplimiento a incluir (opcional)</label>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
            {registros.length === 0 ? (
              <p className="p-3 text-xs text-gray-400">Sin registros de cumplimiento disponibles</p>
            ) : (
              registros.map((r) => (
                <label key={r.id} className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={seleccionados.includes(r.id)} onChange={() => toggleRegistro(r.id)} className="h-4 w-4" />
                  <span className="text-xs text-gray-700">
                    {r.procesoNombre} — {r.agenteNombre ?? `Agente ${r.agenteId}`} — {r.pctCumplimiento}% — {formatFecha(r.fecha)}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Crear auditoría</Button>
        </div>
      </div>
    </Modal>
  )
}

function CerrarAuditoriaModal({ auditoriaId, onClose }: { auditoriaId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [veredicto, setVeredicto] = useState<VeredictoAuditoria>('aprobada')
  const [hallazgos, setHallazgos] = useState('')

  const cerrar = useMutation({
    mutationFn: () => auditoriasService.cerrar(auditoriaId, veredicto, hallazgos.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-auditorias'] })
      qc.invalidateQueries({ queryKey: ['calidad-auditoria', auditoriaId] })
      toast.success('Auditoría cerrada')
      onClose()
    },
    onError: () => toast.error('Error al cerrar la auditoría'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Cerrar auditoría" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Veredicto</label>
          <div className="grid grid-cols-3 gap-2">
            {(['aprobada', 'observaciones', 'no_aprobada'] as VeredictoAuditoria[]).map((v) => (
              <button
                key={v}
                onClick={() => setVeredicto(v)}
                className={clsx('rounded-xl border px-2 py-2 text-xs font-semibold transition-colors', veredicto === v ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
              >
                {VEREDICTO_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Hallazgos (opcional)</label>
          <textarea value={hallazgos} onChange={(e) => setHallazgos(e.target.value)} className="field" rows={4} placeholder="Resumen de los hallazgos generales" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={cerrar.isPending} onClick={() => cerrar.mutate()}>Cerrar auditoría</Button>
        </div>
      </div>
    </Modal>
  )
}

function AuditoriaDetalleView({ id, onVolver }: { id: number; onVolver: () => void }) {
  const qc = useQueryClient()
  const [showCerrar, setShowCerrar] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['calidad-auditoria', id],
    queryFn: () => auditoriasService.get(id),
  })

  const quitarRegistro = useMutation({
    mutationFn: (registroId: number) => auditoriasService.quitarRegistro(id, registroId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-auditoria', id] })
      qc.invalidateQueries({ queryKey: ['calidad-auditorias'] })
    },
    onError: () => toast.error('Error al quitar el registro'),
  })

  if (isLoading || !data) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
      </button>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold text-gray-900">{data.titulo}</p>
            {data.alcance && <p className="text-sm text-gray-600 mt-1">{data.alcance}</p>}
            <p className="text-xs text-gray-500 mt-1">Periodo: {formatFecha(data.periodoInicio)} — {formatFecha(data.periodoFin)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', VEREDICTO_COLOR[data.veredicto])}>{VEREDICTO_LABELS[data.veredicto]}</span>
            {data.veredicto === 'en_curso' && (
              <Button size="sm" onClick={() => setShowCerrar(true)}>Cerrar auditoría</Button>
            )}
          </div>
        </div>
        {data.hallazgos && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Hallazgos</p>
            <p className="text-sm text-gray-700 mt-1">{data.hallazgos}</p>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2.5 font-semibold">Proceso</th>
              <th className="px-4 py-2.5 font-semibold">Agente</th>
              <th className="px-4 py-2.5 font-semibold">Cumplimiento</th>
              <th className="px-4 py-2.5 font-semibold">Fecha</th>
              <th className="px-4 py-2.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {data.registros.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin registros incluidos en esta auditoría</td></tr>
            ) : (
              data.registros.map((r) => (
                <tr key={r.vinculoId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.procesoNombre}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.agenteNombre ?? `Agente ${r.agenteId}`}</td>
                  <td className="px-4 py-2.5 font-semibold">{r.pctCumplimiento}%</td>
                  <td className="px-4 py-2.5 text-gray-500">{formatFecha(r.fecha)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => quitarRegistro.mutate(r.registroId)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 ml-auto">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCerrar && <CerrarAuditoriaModal auditoriaId={id} onClose={() => setShowCerrar(false)} />}
    </div>
  )
}

export function AuditoriasPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)

  const { data: auditorias = [], isLoading } = useQuery({
    queryKey: ['calidad-auditorias'],
    queryFn: () => auditoriasService.listAll(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => auditoriasService.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-auditorias'] })
      toast.success('Auditoría eliminada')
    },
    onError: () => toast.error('Error al eliminar la auditoría'),
  })

  if (detalleId !== null) {
    return (
      <div className="space-y-5 animate-fade-in">
        <AuditoriaDetalleView id={detalleId} onVolver={() => setDetalleId(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand" /> Auditorías
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Auditorías de cumplimiento de procesos de calidad</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nueva auditoría</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : auditorias.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <ClipboardList className="h-8 w-8" />
          <p className="text-sm">Sin auditorías registradas todavía</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {auditorias.map((a) => (
            <div key={a.id} className="card p-4 cursor-pointer hover:border-brand/30" onClick={() => setDetalleId(a.id)}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{a.titulo}</p>
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); eliminar.mutate(a.id) }} className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className={clsx('mt-2 inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', VEREDICTO_COLOR[a.veredicto])}>{VEREDICTO_LABELS[a.veredicto]}</span>
              <p className="mt-2 text-xs text-gray-500">{a.totalRegistros} registro{a.totalRegistros !== 1 ? 's' : ''} incluido{a.totalRegistros !== 1 ? 's' : ''}</p>
              {a.promedioCumplimiento !== null && (
                <p className="text-xs text-gray-500">Promedio de cumplimiento: <span className="font-semibold text-gray-800">{Math.round(a.promedioCumplimiento * 10) / 10}%</span></p>
              )}
              <p className="mt-1 text-[0.68rem] text-gray-400">{formatFecha(a.fechaCreacion)}</p>
            </div>
          ))}
        </div>
      )}

      {showCrear && <CrearAuditoriaModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
