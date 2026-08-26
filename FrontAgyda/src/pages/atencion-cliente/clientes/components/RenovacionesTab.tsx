import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, Trash2, RotateCcw, Calendar } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clienteFechaService } from '@/services/clienteFecha.service'
import { TIPO_FECHA_LABEL, ESTATUS_FECHA_CONFIG, type FechaTipo, type CliFechaImportante } from '@/types/clienteFecha.types'
import { useActionAccess } from '@/hooks/useActionAccess'

function NuevaFechaModal({ contactoId, onClose }: { contactoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<FechaTipo>('contrato')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [recurrenteAnual, setRecurrenteAnual] = useState(false)
  const [diasAlerta, setDiasAlerta] = useState('30,15,7')

  const crear = useMutation({
    mutationFn: () => clienteFechaService.create(contactoId, { tipo, descripcion: descripcion.trim(), fecha, recurrenteAnual, diasAlerta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-fechas', contactoId] })
      toast.success('Fecha importante registrada')
      onClose()
    },
    onError: () => toast.error('No se pudo registrar la fecha'),
  })

  const valido = descripcion.trim() && fecha

  return (
    <Modal isOpen onClose={onClose} title="Nueva fecha importante" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(TIPO_FECHA_LABEL) as FechaTipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={clsx('rounded-xl border-2 py-2 text-[0.7rem] font-semibold transition-all', tipo === t ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300')}
              >
                {TIPO_FECHA_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="field" placeholder="Ej. Renovación de contrato anual" autoFocus maxLength={200} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Alertar (días antes)</label>
            <input value={diasAlerta} onChange={(e) => setDiasAlerta(e.target.value)} className="field" placeholder="30,15,7" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={recurrenteAnual} onChange={(e) => setRecurrenteAnual(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/30" />
          Se repite cada año (ej. cumpleaños, aniversario)
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!valido} onClick={() => crear.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function diasHasta(fecha: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const f = new Date(`${fecha}T00:00:00`)
  return Math.round((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export function RenovacionesTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const puedeGestionar = can('atencion-cliente', 'clientes-renovaciones')
  const [showNueva, setShowNueva] = useState(false)

  const { data: fechas = [], isLoading } = useQuery({
    queryKey: ['cliente-fechas', contactoId],
    queryFn: () => clienteFechaService.getByContacto(contactoId),
    staleTime: 15_000,
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => clienteFechaService.delete(id),
    onSuccess: () => { toast.success('Fecha eliminada'); qc.invalidateQueries({ queryKey: ['cliente-fechas', contactoId] }) },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const marcarRenovada = useMutation({
    mutationFn: (f: CliFechaImportante) => clienteFechaService.update(f.id, {
      tipo: f.tipo, descripcion: f.descripcion, fecha: f.fecha, recurrenteAnual: f.recurrenteAnual, diasAlerta: f.diasAlerta, estatus: 'renovada',
    }),
    onSuccess: () => { toast.success('Marcada como renovada'); qc.invalidateQueries({ queryKey: ['cliente-fechas', contactoId] }) },
    onError: () => toast.error('No se pudo actualizar'),
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Renovaciones y fechas importantes</p>
        {puedeGestionar && (
          <button onClick={() => setShowNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nueva fecha
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : fechas.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin fechas importantes registradas</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {fechas.map((f) => {
            const cfg = ESTATUS_FECHA_CONFIG[f.estatus]
            const dias = diasHasta(f.fecha)
            return (
              <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{f.descripcion}</p>
                    <p className="text-[0.68rem] text-gray-400">
                      {TIPO_FECHA_LABEL[f.tipo]} · {new Date(`${f.fecha}T00:00:00`).toLocaleDateString('es-MX')}
                      {f.estatus === 'vigente' && (dias >= 0 ? ` · en ${dias} día${dias !== 1 ? 's' : ''}` : ` · hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`)}
                      {f.recurrenteAnual && ' · anual'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold', cfg.bg, cfg.text)}>{cfg.label}</span>
                  {puedeGestionar && f.estatus === 'vigente' && (
                    <>
                      <button onClick={() => marcarRenovada.mutate(f)} title="Marcar como renovada" className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { if (window.confirm('¿Eliminar esta fecha importante?')) eliminar.mutate(f.id) }}
                        title="Eliminar"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showNueva && <NuevaFechaModal contactoId={contactoId} onClose={() => setShowNueva(false)} />}
    </div>
  )
}
