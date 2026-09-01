import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Target, Plus, Trash2, User, Users, X, CalendarDays, Calendar, Megaphone,
  BarChart3, DollarSign, Save, ChevronDown,
} from 'lucide-react'
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

/* ── Campo con icono en pill de color ── */
function CampoIcono({ label, icon: Icon, tono, children }: {
  label: string; icon: typeof Calendar; tono: 'blue' | 'violet' | 'emerald'; children: React.ReactNode
}) {
  const tonos = {
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  }
  return (
    <div>
      <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">{label}</label>
      <div className="relative">
        <span className={clsx('pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg', tonos[tono])}>
          <Icon className="h-4 w-4" />
        </span>
        {children}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-11 pr-3 text-[0.9rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'
const selectCls = inputCls + ' appearance-none pr-9 cursor-pointer'

function Toggle({ opciones, valor, onChange, activoCls }: {
  opciones: { key: string; label: string; icon: typeof Calendar }[]
  valor: string; onChange: (k: string) => void; activoCls: string
}) {
  return (
    <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
      {opciones.map((o) => {
        const activo = valor === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[0.82rem] font-semibold transition-all',
              activo ? `${activoCls} shadow-sm` : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <o.icon className="h-4 w-4" /> {o.label}
          </button>
        )
      })}
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
  const [periodoFin, setPeriodoFin] = useState(hoyDia())
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
    const hoy = t === 'diaria' ? hoyDia() : hoyMes()
    setPeriodo(hoy)
    setPeriodoFin(hoyDia())
  }

  const rangoDias = tipo === 'diaria' && periodoFin > periodo
    ? Math.round((new Date(periodoFin + 'T00:00:00').getTime() - new Date(periodo + 'T00:00:00').getTime()) / 86400000) + 1
    : 1

  const crear = useMutation({
    mutationFn: () => ventasAreaService.createMeta({
      asesorId: alcance === 'asesor' ? Number(asesorId) : undefined,
      campanaId: campanaId === '' ? undefined : Number(campanaId),
      periodo, tipo, alcance,
      periodoFin: tipo === 'diaria' && periodoFin > periodo ? periodoFin : undefined,
      metaMonto: metaMonto === '' ? undefined : Number(metaMonto),
      metaUnidades: metaUnidades === '' ? undefined : Number(metaUnidades),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-metas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-dashboard'] })
      toast.success(rangoDias > 1 ? `${rangoDias} metas creadas (una por día)` : 'Meta guardada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar la meta'),
  })

  const puedeCrear =
    (alcance === 'asesor' ? asesorId !== '' : campanaId !== '')
    && (metaMonto !== '' || metaUnidades !== '')

  return (
    <Modal isOpen onClose={onClose} size="lg">
      {/* Header propio */}
      <div className="-m-5 mb-5 flex items-start justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[1.15rem] font-bold text-gray-900">Nueva meta</h2>
            <p className="text-[0.8rem] text-gray-400">Define los detalles de tu nueva meta</p>
          </div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">Periodicidad</label>
            <Toggle
              opciones={[
                { key: 'diaria', label: 'Diaria', icon: CalendarDays },
                { key: 'mensual', label: 'Mensual', icon: Calendar },
              ]}
              valor={tipo}
              onChange={(k) => cambiarTipo(k as MetaTipo)}
              activoCls="bg-blue-600 text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">Alcance</label>
            <Toggle
              opciones={[
                { key: 'asesor', label: 'Asesor', icon: User },
                { key: 'campana', label: 'Campaña', icon: Users },
              ]}
              valor={alcance}
              onChange={(k) => setAlcance(k as MetaAlcance)}
              activoCls="bg-violet-600 text-white"
            />
          </div>
        </div>

        {tipo === 'diaria' ? (
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">Rango de fechas</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Calendar className="h-4 w-4" />
                </span>
                <input
                  type="date"
                  value={periodo}
                  max={periodoFin}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Calendar className="h-4 w-4" />
                </span>
                <input
                  type="date"
                  value={periodoFin}
                  min={periodo}
                  onChange={(e) => setPeriodoFin(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {rangoDias > 1 && (
              <p className="mt-1.5 text-[0.72rem] text-gray-400">
                Se creará la misma meta para <b className="text-gray-600">{rangoDias} días</b> (una por cada fecha del rango).
              </p>
            )}
          </div>
        ) : (
          <CampoIcono label="Mes" icon={Calendar} tono="blue">
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className={inputCls}
            />
          </CampoIcono>
        )}

        {alcance === 'asesor' ? (
          <CampoIcono label="Asesor" icon={User} tono="violet">
            <select value={asesorId} onChange={(e) => setAsesorId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
              <option value="">Selecciona un asesor</option>
              {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </CampoIcono>
        ) : (
          <CampoIcono label="Campaña" icon={Megaphone} tono="violet">
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
              <option value="">Selecciona una campaña</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </CampoIcono>
        )}

        {alcance === 'asesor' && (
          <CampoIcono label="Campaña (opcional)" icon={Megaphone} tono="violet">
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
              <option value="">Todas sus campañas</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </CampoIcono>
        )}

        {alcance === 'campana' && (
          <p className="-mt-2 text-[0.72rem] text-gray-400">La meta se compara contra el total de ventas de la campaña.</p>
        )}

        <CampoIcono label="Meta de unidades vendidas" icon={BarChart3} tono="blue">
          <input type="number" min={0} value={metaUnidades} onChange={(e) => setMetaUnidades(e.target.value ? Number(e.target.value) : '')} className={inputCls} placeholder="Ej. 20" />
        </CampoIcono>
        <CampoIcono label="Meta de monto ($)" icon={DollarSign} tono="emerald">
          <input type="number" min={0} value={metaMonto} onChange={(e) => setMetaMonto(e.target.value ? Number(e.target.value) : '')} className={inputCls} placeholder="Ej. 50000" />
        </CampoIcono>

        <div className="-mx-5 mt-2 flex justify-end gap-2 border-t border-gray-100 px-5 pt-4">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-[0.85rem] font-semibold text-gray-600 transition-colors hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => crear.mutate()}
            disabled={!puedeCrear || crear.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.85rem] font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Guardar meta
          </button>
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
