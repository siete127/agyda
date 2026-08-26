import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, HeartPulse, FileText, Download, Check, X, ListChecks, ClipboardCheck,
} from 'lucide-react'
import { incapacidadesService } from '@/services/incapacidades.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { INCAPACIDAD_TIPOS, type Incapacidad, type IncapacidadTipo } from '@/types/incapacidad.types'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-700',
  aprobada: 'bg-emerald-50 text-emerald-700',
  rechazada: 'bg-red-50 text-red-600',
}
const ESTADO_LABELS: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }

function tipoLabel(tipo: IncapacidadTipo) {
  return INCAPACIDAD_TIPOS.find((t) => t.value === tipo)?.label ?? tipo
}

/* ── Modal: solicitar incapacidad ── */
function SolicitarModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ tipo: IncapacidadTipo; motivo: string; fechaInicio: string; fechaFin: string }>({
    tipo: 'enfermedad_general',
    motivo: '',
    fechaInicio: '',
    fechaFin: '',
  })
  const [comprobante, setComprobante] = useState<File | null>(null)

  const canSave = form.fechaInicio && form.fechaFin && form.fechaFin >= form.fechaInicio && !!comprobante

  const enviar = useMutation({
    mutationFn: () => incapacidadesService.crearSolicitud({ ...form, motivo: form.motivo || undefined, comprobante: comprobante! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incapacidades-mis'] })
      toast.success('Solicitud enviada, en espera de aprobación de RH')
      onClose()
    },
    onError: () => toast.error('Error al enviar la solicitud'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Solicitar incapacidad" size="lg">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
          <div className="flex flex-wrap gap-2">
            {INCAPACIDAD_TIPOS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  form.tipo === t.value ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
            <input type="date" value={form.fechaFin} onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))} className="field" min={form.fechaInicio || undefined} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo (opcional)</label>
          <textarea
            value={form.motivo}
            onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
            className="field min-h-[70px]"
            placeholder="Detalle breve del padecimiento..."
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Comprobante médico</label>
          <label className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
            <FileText className="h-4 w-4 flex-shrink-0" />
            {comprobante ? comprobante.name : 'Selecciona el PDF o foto del comprobante (IMSS u otro)'}
            <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={enviar.isPending} disabled={!canSave} onClick={() => enviar.mutate()}>
            Enviar solicitud
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Tarjeta/fila de incapacidad ── */
function IncapacidadRow({ inc, isAdmin, onResponder }: { inc: Incapacidad; isAdmin: boolean; onResponder?: (inc: Incapacidad, estado: 'aprobada' | 'rechazada') => void }) {
  const doc = inc.documentos[0]
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
      {isAdmin && <td className="px-4 py-2.5 font-medium text-gray-900">{inc.usuarioNombre}</td>}
      <td className="px-4 py-2.5 text-gray-600">{tipoLabel(inc.tipo)}</td>
      <td className="px-4 py-2.5 text-gray-500">{formatFecha(inc.fechaInicio)} – {formatFecha(inc.fechaFin)}</td>
      <td className="px-4 py-2.5 text-gray-600">{inc.dias} día{inc.dias !== 1 ? 's' : ''}</td>
      <td className="px-4 py-2.5">
        {doc && (
          <button
            onClick={() => incapacidadesService.descargarComprobante(doc.id, doc.nombre)}
            className="flex items-center gap-1 font-semibold text-brand hover:underline text-xs"
          >
            <Download className="h-3.5 w-3.5" /> Ver
          </button>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={clsx('rounded-lg px-2 py-1 text-[0.7rem] font-semibold', ESTADO_COLORS[inc.estado])}>
          {ESTADO_LABELS[inc.estado]}
        </span>
      </td>
      {isAdmin && (
        <td className="px-4 py-2.5 text-right">
          {inc.estado === 'pendiente' && onResponder && (
            <div className="flex items-center justify-end gap-1">
              <button onClick={() => onResponder(inc, 'aprobada')} title="Aprobar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-emerald-50 hover:text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onResponder(inc, 'rechazada')} title="Rechazar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

/* ── Tab: Mis incapacidades ── */
function MisIncapacidadesTab({ onSolicitar }: { onSolicitar: () => void }) {
  const { data: incapacidades = [], isLoading } = useQuery({
    queryKey: ['incapacidades-mis'],
    queryFn: () => incapacidadesService.getMisIncapacidades(),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (incapacidades.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-gray-400">
        <HeartPulse className="h-8 w-8" />
        <p className="text-sm">No has solicitado ninguna incapacidad</p>
        <Button size="sm" onClick={onSolicitar}><Plus className="h-3.5 w-3.5" /> Solicitar incapacidad</Button>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Tipo</th>
            <th className="px-4 py-2.5 font-semibold">Periodo</th>
            <th className="px-4 py-2.5 font-semibold">Días</th>
            <th className="px-4 py-2.5 font-semibold">Comprobante</th>
            <th className="px-4 py-2.5 font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody>
          {incapacidades.map((inc) => <IncapacidadRow key={inc.id} inc={inc} isAdmin={false} />)}
        </tbody>
      </table>
    </div>
  )
}

/* ── Tab: Aprobar (admin) ── */
function AprobarTab() {
  const qc = useQueryClient()
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'aprobada' | 'rechazada'>('pendiente')

  const { data: incapacidades = [], isLoading } = useQuery({
    queryKey: ['incapacidades-todas', filtroEstado],
    queryFn: () => incapacidadesService.getAll(filtroEstado === 'todos' ? undefined : filtroEstado),
  })

  const responder = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: 'aprobada' | 'rechazada' }) => incapacidadesService.responder(id, estado),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incapacidades-todas'] })
      toast.success(vars.estado === 'aprobada' ? 'Incapacidad aprobada' : 'Incapacidad rechazada')
    },
    onError: () => toast.error('Error al responder la solicitud'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['pendiente', 'aprobada', 'rechazada', 'todos'] as const).map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              filtroEstado === e ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50',
            )}
          >
            {e === 'todos' ? 'Todos' : ESTADO_LABELS[e]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : incapacidades.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <ClipboardCheck className="h-8 w-8" />
          <p className="text-sm">No hay solicitudes en este estado</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Empleado</th>
                <th className="px-4 py-2.5 font-semibold">Tipo</th>
                <th className="px-4 py-2.5 font-semibold">Periodo</th>
                <th className="px-4 py-2.5 font-semibold">Días</th>
                <th className="px-4 py-2.5 font-semibold">Comprobante</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {incapacidades.map((inc) => (
                <IncapacidadRow
                  key={inc.id}
                  inc={inc}
                  isAdmin
                  onResponder={(i, estado) => responder.mutate({ id: i.id, estado })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Página principal ── */
export function IncapacidadesPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'mis' | 'aprobar'>('mis')
  const [showSolicitar, setShowSolicitar] = useState(false)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-brand" /> Incapacidades
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Registro, periodo, comprobante, seguimiento y regreso a labores</p>
        </div>
        {tab === 'mis' && (
          <Button size="sm" onClick={() => setShowSolicitar(true)}>
            <Plus className="h-3.5 w-3.5" /> Solicitar incapacidad
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="flex gap-1 border-b border-gray-100">
          <button
            onClick={() => setTab('mis')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
              tab === 'mis' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <ListChecks className="h-3.5 w-3.5" /> Mis incapacidades
          </button>
          <button
            onClick={() => setTab('aprobar')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
              tab === 'aprobar' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <ClipboardCheck className="h-3.5 w-3.5" /> Aprobar solicitudes
          </button>
        </div>
      )}

      {tab === 'aprobar' && isAdmin ? <AprobarTab /> : <MisIncapacidadesTab onSolicitar={() => setShowSolicitar(true)} />}

      {showSolicitar && <SolicitarModal onClose={() => setShowSolicitar(false)} />}
    </div>
  )
}
