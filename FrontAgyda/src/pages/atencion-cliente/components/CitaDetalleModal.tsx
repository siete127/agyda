import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Video, Phone, Calendar, Link as LinkIcon, CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { citaService } from '@/services/cita.service'
import {
  CITA_MODALIDAD_CONFIG, ESTATUS_CITA_CONFIG, type Cita, type CitaEstatus,
} from '@/types/cita.types'
import { useActionAccess } from '@/hooks/useActionAccess'

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

const MODALIDAD_ICON = { videollamada: Video, telefonica: Phone, generica: Calendar }
// Transiciones que ofrece el detalle (agendada/confirmada/reprogramada son estados "abiertos").
const TRANSICIONES: CitaEstatus[] = ['confirmada', 'reprogramada', 'asistio', 'no_asistio', 'cancelada']

export function CitaDetalleModal({ cita, onClose, queryKeysToInvalidate }: {
  cita: Cita
  onClose: () => void
  queryKeysToInvalidate: unknown[][]
}) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')
  const qc = useQueryClient()
  const [nota, setNota] = useState(cita.notaResultado ?? '')
  const [marcando, setMarcando] = useState<'asistio' | 'no_asistio' | null>(null)

  const modalCfg = CITA_MODALIDAD_CONFIG[cita.modalidad]
  const estCfg = ESTATUS_CITA_CONFIG[cita.estatus]
  const Icon = MODALIDAD_ICON[cita.modalidad]
  const cerrada = ['asistio', 'no_asistio', 'cancelada'].includes(cita.estatus)

  const invalidar = () => { for (const k of queryKeysToInvalidate) qc.invalidateQueries({ queryKey: k }) }

  const cambiar = useMutation({
    mutationFn: (p: { estatus: CitaEstatus; notaResultado?: string }) => citaService.updateEstatus(cita.id, p.estatus, p.notaResultado),
    onSuccess: () => { toast.success('Cita actualizada'); setMarcando(null); invalidar() },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo actualizar'),
  })

  const resolverSol = useMutation({
    mutationFn: (accion: 'aprobar' | 'rechazar') => citaService.resolverSolicitud(cita.solicitudPendiente!.id, accion),
    onSuccess: () => { toast.success('Solicitud resuelta'); invalidar() },
    onError: () => toast.error('No se pudo resolver'),
  })

  return (
    <Modal isOpen onClose={onClose} title={cita.titulo} size="lg">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', modalCfg.bg, modalCfg.text)}>
            <Icon className="h-3 w-3" /> {modalCfg.label}
          </span>
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', estCfg.bg, estCfg.text)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
          </span>
          {cita.confirmadaPorCliente && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.68rem] font-bold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Confirmada por el cliente
            </span>
          )}
          {cita.tratamientoNombre && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[0.68rem] font-semibold text-gray-500">
              {cita.tratamientoNombre}{cita.numeroSesion ? ` · sesión ${cita.numeroSesion}${cita.tratamientoTotalSesiones ? ` de ${cita.tratamientoTotalSesiones}` : ''}` : ''}
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-card p-3 space-y-1.5">
          <p className="text-sm font-semibold text-gray-800">{fmtFecha(cita.fechaHora)} · {cita.duracionMin} min</p>
          {cita.contactoNombre && <p className="text-xs text-gray-500">Cliente: {cita.contactoNombre}</p>}
          {cita.asignadoNombre && <p className="text-xs text-gray-500">Asesor: {cita.asignadoNombre}</p>}
          {cita.modalidad === 'videollamada' && cita.enlace && (
            <a href={cita.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              <LinkIcon className="h-3 w-3" /> {cita.enlace}
            </a>
          )}
          {cita.modalidad === 'telefonica' && cita.telefono && <p className="text-xs text-gray-500">Teléfono: {cita.telefono}</p>}
          {cita.motivo && <p className="text-sm text-gray-600 pt-1">{cita.motivo}</p>}
        </div>

        {/* Solicitud de cambio pendiente del portal */}
        {cita.solicitudPendiente && puedeGestionar && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-[0.78rem] font-bold text-amber-800">
              El cliente solicitó {cita.solicitudPendiente.tipo === 'cancelar' ? 'cancelar' : 'reprogramar'} esta cita
            </p>
            {cita.solicitudPendiente.fechaPropuesta && (
              <p className="text-[0.75rem] text-amber-700">Fecha propuesta: {fmtFecha(cita.solicitudPendiente.fechaPropuesta)}</p>
            )}
            {cita.solicitudPendiente.motivo && <p className="text-[0.75rem] text-amber-700">Motivo: {cita.solicitudPendiente.motivo}</p>}
            <div className="flex gap-2">
              <Button isLoading={resolverSol.isPending} onClick={() => resolverSol.mutate('aprobar')}>Aprobar</Button>
              <Button variant="ghost" onClick={() => resolverSol.mutate('rechazar')}>Rechazar</Button>
            </div>
          </div>
        )}

        {/* Transiciones de estatus */}
        {puedeGestionar && !cerrada && (
          <div className="flex flex-wrap gap-1.5">
            {TRANSICIONES.filter((e) => e !== cita.estatus).map((e) => {
              const cfg = ESTATUS_CITA_CONFIG[e]
              if (e === 'asistio' || e === 'no_asistio') {
                return (
                  <button key={e} onClick={() => setMarcando(e)}
                    className={clsx('rounded-lg border border-transparent px-3 py-1.5 text-[0.72rem] font-semibold transition-colors hover:opacity-80', cfg.bg, cfg.text)}>
                    Marcar {cfg.label.toLowerCase()}
                  </button>
                )
              }
              return (
                <button key={e} onClick={() => cambiar.mutate({ estatus: e })} disabled={cambiar.isPending}
                  className={clsx('rounded-lg border border-transparent px-3 py-1.5 text-[0.72rem] font-semibold transition-colors hover:opacity-80 disabled:opacity-50', cfg.bg, cfg.text)}>
                  {e === 'cancelada' ? 'Cancelar cita' : `Marcar ${cfg.label.toLowerCase()}`}
                </button>
              )
            })}
          </div>
        )}

        {/* Nota de evolución al marcar asistió / no asistió */}
        {marcando && (
          <div className="rounded-2xl border border-gray-100 bg-card p-3 space-y-2">
            <p className="text-[0.75rem] font-bold text-gray-600">Nota de {marcando === 'asistio' ? 'la sesión' : 'la inasistencia'}</p>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} className="field resize-none text-sm" placeholder="Evolución / observaciones..." />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMarcando(null)}>Cancelar</Button>
              <Button isLoading={cambiar.isPending} onClick={() => cambiar.mutate({ estatus: marcando, notaResultado: nota.trim() || undefined })}>
                Guardar
              </Button>
            </div>
          </div>
        )}

        {/* Nota de resultado ya registrada */}
        {cerrada && cita.notaResultado && (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3">
            <p className="text-[0.75rem] font-bold text-gray-600 mb-1">
              {cita.estatus === 'no_asistio' ? <XCircle className="inline h-3.5 w-3.5 text-red-500" /> : <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500" />}
              {' '}Nota
            </p>
            <p className="text-sm text-gray-700">{cita.notaResultado}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}
