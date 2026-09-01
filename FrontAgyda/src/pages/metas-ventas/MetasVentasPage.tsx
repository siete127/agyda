import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Target, Plus, Trash2, User, Users } from 'lucide-react'
import { ventasAreaService } from '@/services/ventasArea.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { MetaVenta, MetaTipo, MetaAlcance } from '@/services/ventasArea.service'

function hoyMes() {
  return new Date().toISOString().slice(0, 7)
}
function hoyDia() {
  return new Date().toISOString().slice(0, 10)
}

function MetaCard({ meta, puedeGestionar, onDelete }: { meta: MetaVenta; puedeGestionar: boolean; onDelete: (id: number) => void }) {
  const pct = meta.metaUnidades > 0 ? Math.min(100, Math.round((meta.avanceUnidades / meta.metaUnidades) * 100)) : 0
  const cumplida = pct >= 100
  const esCampana = meta.alcance === 'campana'
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
            esCampana ? 'bg-violet-100 text-violet-600' : 'bg-brand/10 text-brand')}>
            {esCampana ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {esCampana ? (meta.campanaNombre ?? 'Campaña') : meta.asesorNombre}
            </p>
            <p className="text-[0.68rem] text-gray-500">
              {meta.periodo} · {meta.tipo === 'diaria' ? 'diaria' : 'mensual'}
              {!esCampana && meta.campanaNombre && ` · ${meta.campanaNombre}`}
            </p>
          </div>
        </div>
        {puedeGestionar && (
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
              <div className={clsx('h-full rounded-full transition-all', cumplida ? 'bg-emerald-500' : (esCampana ? 'bg-violet-500' : 'bg-brand'))} style={{ width: `${pct}%` }} />
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

function CrearMetaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<MetaTipo>('diaria')
  const [alcance, setAlcance] = useState<MetaAlcance>('asesor')
  const [asesorId, setAsesorId] = useState<number | ''>('')
  const [campanaId, setCampanaId] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState(hoyDia())
  const [metaMonto, setMetaMonto] = useState<number | ''>('')
  const [metaUnidades, setMetaUnidades] = useState<number | ''>('')

  const { data: asesores = [] } = useQuery({
    queryKey: ['ventas-area-asesores'],
    queryFn: () => ventasAreaService.getAsesores(),
  })
  const { data: campanas = [] } = useQuery({
    queryKey: ['ventas-area-campanas'],
    queryFn: () => ventasAreaService.getCampanas(),
  })

  const cambiarTipo = (t: MetaTipo) => {
    setTipo(t)
    setPeriodo(t === 'diaria' ? hoyDia() : hoyMes())
  }

  const crear = useMutation({
    mutationFn: () => ventasAreaService.createMeta({
      asesorId: alcance === 'asesor' ? Number(asesorId) : undefined,
      campanaId: campanaId === '' ? undefined : Number(campanaId),
      periodo, tipo, alcance,
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

  const puedeCrear =
    (alcance === 'asesor' ? asesorId !== '' : campanaId !== '')
    && (metaMonto !== '' || metaUnidades !== '')

  return (
    <Modal isOpen onClose={onClose} title="Nueva meta" size="md">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Periodicidad</label>
            <div className="flex rounded-xl border border-gray-200 p-1">
              {(['diaria', 'mensual'] as MetaTipo[]).map((t) => (
                <button key={t} type="button" onClick={() => cambiarTipo(t)}
                  className={clsx('flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors',
                    tipo === t ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Alcance</label>
            <div className="flex rounded-xl border border-gray-200 p-1">
              {([['asesor', 'Asesor'], ['campana', 'Campaña']] as [MetaAlcance, string][]).map(([a, label]) => (
                <button key={a} type="button" onClick={() => setAlcance(a)}
                  className={clsx('flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                    alcance === a ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-gray-700')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {tipo === 'diaria' ? 'Día' : 'Mes'}
          </label>
          <input
            type={tipo === 'diaria' ? 'date' : 'month'}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="field"
          />
        </div>

        {alcance === 'asesor' ? (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asesor</label>
            <select value={asesorId} onChange={(e) => setAsesorId(e.target.value ? Number(e.target.value) : '')} className="field">
              <option value="">Selecciona un asesor</option>
              {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaña</label>
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value ? Number(e.target.value) : '')} className="field">
              <option value="">Selecciona una campaña</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <p className="mt-1 text-[0.68rem] text-gray-400">La meta se compara contra el total de ventas de la campaña.</p>
          </div>
        )}

        {alcance === 'asesor' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaña (opcional)</label>
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value ? Number(e.target.value) : '')} className="field">
              <option value="">Todas sus campañas</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

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
  const { can } = useActionAccess()
  const puedeGestionar = can('ventas-area', 'gestionar-metas')
  const qc = useQueryClient()
  const [tipoFiltro, setTipoFiltro] = useState<MetaTipo>('diaria')
  const [periodo, setPeriodo] = useState(hoyDia())
  const [showCrear, setShowCrear] = useState(false)

  const cambiarTipoFiltro = (t: MetaTipo) => {
    setTipoFiltro(t)
    setPeriodo(t === 'diaria' ? hoyDia() : hoyMes())
  }

  const { data: metasTodas = [], isLoading } = useQuery({
    queryKey: ['ventas-area-metas', periodo],
    queryFn: () => ventasAreaService.getMetas(periodo),
  })
  const metas = metasTodas.filter((m) => m.tipo === tipoFiltro)

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
          <p className="text-xs text-gray-500 mt-0.5">Metas diarias y mensuales por asesor o por campaña</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 p-1">
            {(['diaria', 'mensual'] as MetaTipo[]).map((t) => (
              <button key={t} onClick={() => cambiarTipoFiltro(t)}
                className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  tipoFiltro === t ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700')}>
                {t}
              </button>
            ))}
          </div>
          <input
            type={tipoFiltro === 'diaria' ? 'date' : 'month'}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="field"
          />
          {puedeGestionar && (
            <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nueva meta</Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : metas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Target className="h-8 w-8" />
          <p className="text-sm">Sin metas {tipoFiltro === 'diaria' ? 'diarias' : 'mensuales'} para este periodo</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metas.map((m) => <MetaCard key={m.id} meta={m} puedeGestionar={puedeGestionar} onDelete={(id) => eliminar.mutate(id)} />)}
        </div>
      )}

      {showCrear && <CrearMetaModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
