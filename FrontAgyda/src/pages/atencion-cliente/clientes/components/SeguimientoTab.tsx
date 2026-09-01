import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, Clock, User, CalendarClock } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { TIPO_CONTACTO_LABEL, type TipoContacto } from '@/types/clienteSeguimiento.types'
import { CLIENTE_ESTATUS_COLORES, type ClienteEstatusColor } from '@/types/crm.types'
import { useActionAccess } from '@/hooks/useActionAccess'

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

function NuevoSeguimientoModal({ contactoId, onClose }: { contactoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [tipoContacto, setTipoContacto] = useState<TipoContacto>('llamada')
  const [estatusColor, setEstatusColor] = useState<ClienteEstatusColor>('verde')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [acuerdos, setAcuerdos] = useState('')
  const [proximaFecha, setProximaFecha] = useState('')

  const crear = useMutation({
    mutationFn: () => clienteSeguimientoService.createSeguimiento(contactoId, {
      tipoContacto, estatusColor,
      motivo: motivo.trim() || undefined,
      nota: nota.trim() || undefined,
      acuerdos: acuerdos.trim() || undefined,
      proximaFecha: proximaFecha || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-seguimientos', contactoId] })
      qc.invalidateQueries({ queryKey: ['cliente-expediente', contactoId] })
      toast.success('Seguimiento registrado')
      onClose()
    },
    onError: () => toast.error('No se pudo registrar el seguimiento'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nuevo seguimiento" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de contacto</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(TIPO_CONTACTO_LABEL) as TipoContacto[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoContacto(t)}
                className={clsx(
                  'rounded-xl border-2 py-2 text-[0.75rem] font-semibold transition-all',
                  tipoContacto === t ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300',
                )}
              >
                {TIPO_CONTACTO_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estatus del cliente</label>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {CLIENTE_ESTATUS_COLORES.map((cfg) => (
              <button
                key={cfg.key}
                type="button"
                onClick={() => setEstatusColor(cfg.key)}
                title={cfg.label}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-[0.62rem] font-semibold transition-all',
                  estatusColor === cfg.key ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300',
                )}
              >
                <span className={clsx('h-2 w-2 rounded-full', cfg.dot)} />
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="field" placeholder="Ej. Confirmación de servicio, solicitud de información..." maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Comentarios</label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            className="field resize-none"
            placeholder="Qué se habló durante el contacto..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Acuerdos</label>
          <textarea
            value={acuerdos}
            onChange={(e) => setAcuerdos(e.target.value)}
            rows={2}
            className="field resize-none"
            placeholder="Compromisos acordados con el cliente..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Próxima fecha de seguimiento</label>
          <input type="date" value={proximaFecha} onChange={(e) => setProximaFecha(e.target.value)} className="field" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} onClick={() => crear.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

export function SeguimientoTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const puedeRegistrar = can('atencion-cliente', 'clientes-seguimiento')
  const [showNuevo, setShowNuevo] = useState(false)

  const { data: seguimientos = [], isLoading } = useQuery({
    queryKey: ['cliente-seguimientos', contactoId],
    queryFn: () => clienteSeguimientoService.getSeguimientos(contactoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Historial de seguimiento</p>
        {puedeRegistrar && (
          <button onClick={() => setShowNuevo(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nuevo seguimiento
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : seguimientos.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin seguimientos registrados</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {seguimientos.map((s) => {
            const cfg = CLIENTE_ESTATUS_COLORES.find((c) => c.key === s.estatusColor) ?? CLIENTE_ESTATUS_COLORES[0]
            return (
              <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                <div className={clsx('mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full', cfg.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[0.78rem] font-semibold text-gray-800">{TIPO_CONTACTO_LABEL[s.tipoContacto]}</span>
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', cfg.bg, cfg.text)}>
                      {cfg.label}
                    </span>
                  </div>
                  {s.motivo && <p className="mt-1 text-[0.75rem] font-semibold text-gray-700">{s.motivo}</p>}
                  {s.nota && <p className="mt-0.5 text-sm text-gray-600 leading-relaxed">{s.nota}</p>}
                  {s.acuerdos && (
                    <p className="mt-1 rounded-lg bg-gray-50 px-2 py-1.5 text-[0.75rem] text-gray-600"><span className="font-semibold">Acuerdos:</span> {s.acuerdos}</p>
                  )}
                  <p className="mt-1.5 flex items-center gap-2 flex-wrap text-[0.68rem] text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtFecha(s.fecha)}</span>
                    {s.usuarioNombre && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {s.usuarioNombre}</span>}
                    {s.proximaFecha && (
                      <span className="flex items-center gap-1 font-semibold text-brand"><CalendarClock className="h-3 w-3" /> Próximo: {new Date(`${s.proximaFecha}T00:00:00`).toLocaleDateString('es-MX')}</span>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showNuevo && <NuevoSeguimientoModal contactoId={contactoId} onClose={() => setShowNuevo(false)} />}
    </div>
  )
}
