import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { PieChart, Plus, Trash2, Pencil } from 'lucide-react'
import { presupuestosService } from '@/services/presupuestos.service'
import { AREA_KEYS, AREA_LABELS, type AreaKey } from '@/config/areas'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { Presupuesto } from '@/types/presupuestos.types'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function hoyPeriodo() {
  return new Date().toISOString().slice(0, 7)
}

function PresupuestoCard({ p, isAdmin, onEdit, onDelete }: { p: Presupuesto; isAdmin: boolean; onEdit: () => void; onDelete: () => void }) {
  const pct = p.montoAsignado > 0 ? Math.min(999, Math.round((p.montoEjercido / p.montoAsignado) * 100)) : 0
  const excedido = pct > 100
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{AREA_LABELS[p.areaKey]}</p>
        {isAdmin && (
          <div className="flex gap-1">
            <button onClick={onEdit} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-600">{formatMonto(p.montoEjercido)} / {formatMonto(p.montoAsignado)}</span>
          <span className={clsx('font-bold', excedido ? 'text-red-600' : 'text-gray-700')}>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={clsx('h-full rounded-full transition-all', excedido ? 'bg-red-500' : 'bg-brand')} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
    </div>
  )
}

function GuardarPresupuestoModal({ periodo, presupuesto, onClose }: { periodo: string; presupuesto: Presupuesto | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [areaKey, setAreaKey] = useState<AreaKey | ''>(presupuesto?.areaKey ?? '')
  const [montoAsignado, setMontoAsignado] = useState<number | ''>(presupuesto?.montoAsignado ?? '')
  const [montoEjercido, setMontoEjercido] = useState<number | ''>(presupuesto?.montoEjercido ?? '')

  const guardar = useMutation({
    mutationFn: () => presupuestosService.guardar({
      areaKey: areaKey as AreaKey,
      periodo,
      montoAsignado: montoAsignado === '' ? undefined : Number(montoAsignado),
      montoEjercido: montoEjercido === '' ? undefined : Number(montoEjercido),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-presupuestos'] })
      toast.success('Presupuesto guardado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar el presupuesto'),
  })

  const puedeGuardar = areaKey !== ''

  return (
    <Modal isOpen onClose={onClose} title={presupuesto ? `Editar presupuesto — ${periodo}` : `Nuevo presupuesto — ${periodo}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Área</label>
          <select value={areaKey} onChange={(e) => setAreaKey(e.target.value as AreaKey)} className="field" disabled={!!presupuesto}>
            <option value="">Selecciona un área</option>
            {AREA_KEYS.map((k) => <option key={k} value={k}>{AREA_LABELS[k]}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Monto asignado ($)</label>
            <input type="number" min={0} step="0.01" value={montoAsignado} onChange={(e) => setMontoAsignado(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Monto ejercido ($)</label>
            <input type="number" min={0} step="0.01" value={montoEjercido} onChange={(e) => setMontoEjercido(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="0.00" />
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

export function PresupuestosPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState(hoyPeriodo())
  const [modal, setModal] = useState<'crear' | Presupuesto | null>(null)

  const { data: presupuestos = [], isLoading } = useQuery({
    queryKey: ['finanzas-presupuestos', periodo],
    queryFn: () => presupuestosService.list(periodo),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => presupuestosService.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-presupuestos'] })
      toast.success('Presupuesto eliminado')
    },
    onError: () => toast.error('Error al eliminar el presupuesto'),
  })

  const totalAsignado = presupuestos.reduce((s, p) => s + p.montoAsignado, 0)
  const totalEjercido = presupuestos.reduce((s, p) => s + p.montoEjercido, 0)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-brand" /> Presupuestos
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Presupuesto asignado y ejercido por área y periodo</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="field" />
          {isAdmin && (
            <Button size="sm" onClick={() => setModal('crear')}><Plus className="h-3.5 w-3.5" /> Nuevo presupuesto</Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : presupuestos.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <PieChart className="h-8 w-8" />
          <p className="text-sm">Sin presupuestos registrados para este periodo</p>
        </div>
      ) : (
        <>
          <div className="card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <PieChart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">{formatMonto(totalEjercido)} / {formatMonto(totalAsignado)}</p>
              <p className="text-xs text-gray-500">Ejercido / Asignado en {presupuestos.length} área{presupuestos.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presupuestos.map((p) => (
              <PresupuestoCard key={p.id} p={p} isAdmin={isAdmin} onEdit={() => setModal(p)} onDelete={() => eliminar.mutate(p.id)} />
            ))}
          </div>
        </>
      )}

      {modal && <GuardarPresupuestoModal periodo={periodo} presupuesto={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
}
