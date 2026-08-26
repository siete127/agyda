import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Target, Plus, Trash2, User } from 'lucide-react'
import { ventasAreaService } from '@/services/ventasArea.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { MetaVenta } from '@/services/ventasArea.service'

function hoyPeriodo() {
  return new Date().toISOString().slice(0, 7)
}

function MetaCard({ meta, isAdmin, onDelete }: { meta: MetaVenta; isAdmin: boolean; onDelete: (id: number) => void }) {
  const pct = meta.metaUnidades > 0 ? Math.min(100, Math.round((meta.avanceUnidades / meta.metaUnidades) * 100)) : 0
  const cumplida = pct >= 100
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{meta.asesorNombre}</p>
            <p className="text-[0.68rem] text-gray-500">{meta.periodo}</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => onDelete(meta.id)} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {meta.metaUnidades > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-600">{meta.avanceUnidades} / {meta.metaUnidades} unidades</span>
              <span className={clsx('font-bold', cumplida ? 'text-emerald-600' : 'text-gray-700')}>{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={clsx('h-full rounded-full transition-all', cumplida ? 'bg-emerald-500' : 'bg-brand')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {meta.metaMonto > 0 && (
          <p className="text-xs text-gray-500">Meta de monto: <span className="font-semibold text-gray-800">${meta.metaMonto.toLocaleString('es-MX')}</span></p>
        )}
      </div>
    </div>
  )
}

function CrearMetaModal({ periodo, onClose }: { periodo: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [asesorId, setAsesorId] = useState<number | ''>('')
  const [metaMonto, setMetaMonto] = useState<number | ''>('')
  const [metaUnidades, setMetaUnidades] = useState<number | ''>('')

  const { data: asesores = [] } = useQuery({
    queryKey: ['ventas-area-asesores'],
    queryFn: () => ventasAreaService.getAsesores(),
  })

  const crear = useMutation({
    mutationFn: () => ventasAreaService.createMeta({
      asesorId: Number(asesorId),
      periodo,
      metaMonto: metaMonto === '' ? undefined : Number(metaMonto),
      metaUnidades: metaUnidades === '' ? undefined : Number(metaUnidades),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-metas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-dashboard'] })
      toast.success('Meta guardada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar la meta'),
  })

  const puedeCrear = asesorId !== '' && (metaMonto !== '' || metaUnidades !== '')

  return (
    <Modal isOpen onClose={onClose} title={`Nueva meta — ${periodo}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asesor</label>
          <select value={asesorId} onChange={(e) => setAsesorId(e.target.value ? Number(e.target.value) : '')} className="field">
            <option value="">Selecciona un asesor</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Meta de unidades vendidas</label>
          <input type="number" min={0} value={metaUnidades} onChange={(e) => setMetaUnidades(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="Ej. 20" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Meta de monto ($)</label>
          <input type="number" min={0} value={metaMonto} onChange={(e) => setMetaMonto(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="Ej. 50000" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Guardar meta</Button>
        </div>
      </div>
    </Modal>
  )
}

export function MetasVentasPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState(hoyPeriodo())
  const [showCrear, setShowCrear] = useState(false)

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ['ventas-area-metas', periodo],
    queryFn: () => ventasAreaService.getMetas(periodo),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => ventasAreaService.eliminarMeta(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-metas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-dashboard'] })
      toast.success('Meta eliminada')
    },
    onError: () => toast.error('Error al eliminar la meta'),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Target className="h-5 w-5 text-brand" /> Metas
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Metas diaria, semanal y mensual por asesor</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="field" />
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nueva meta</Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : metas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Target className="h-8 w-8" />
          <p className="text-sm">Sin metas registradas para este periodo</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metas.map((m) => <MetaCard key={m.id} meta={m} isAdmin={isAdmin} onDelete={(id) => eliminar.mutate(id)} />)}
        </div>
      )}

      {showCrear && <CrearMetaModal periodo={periodo} onClose={() => setShowCrear(false)} />}
    </div>
  )
}
