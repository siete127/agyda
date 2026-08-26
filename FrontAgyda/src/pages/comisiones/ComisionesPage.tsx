import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Percent, Target, Plus, Info } from 'lucide-react'
import { comisionesService } from '@/services/comisiones.service'
import { ventasAreaService } from '@/services/ventasArea.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function hoyPeriodo() {
  return new Date().toISOString().slice(0, 7)
}

function PonerMetaModal({ periodo, onClose }: { periodo: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [asesorId, setAsesorId] = useState<number | ''>('')
  const [metaUnidades, setMetaUnidades] = useState<number | ''>('')
  const [metaMonto, setMetaMonto] = useState<number | ''>('')

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
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-metas'] })
      toast.success('Meta guardada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar la meta'),
  })

  const puedeCrear = asesorId !== '' && (metaUnidades !== '' || metaMonto !== '')

  return (
    <Modal isOpen onClose={onClose} title={`Poner meta — ${periodo}`} size="md">
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
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Meta de monto ($, opcional)</label>
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

export function ComisionesPage() {
  const isAdmin = useIsADorTI()
  const [periodo, setPeriodo] = useState(hoyPeriodo())
  const [showMeta, setShowMeta] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['ventas-area-comisiones', periodo],
    queryFn: () => comisionesService.get(periodo),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Percent className="h-5 w-5 text-brand" /> Comisiones
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Cálculo y seguimiento de comisiones</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="field" />
          {isAdmin && (
            <Button size="sm" onClick={() => setShowMeta(true)}><Plus className="h-3.5 w-3.5" /> Poner meta</Button>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 text-blue-500 mt-0.5" />
            <p className="text-xs text-blue-700">
              Las ventas de quincenas ya calculadas por Nómina se muestran como dato confirmado.
              {data.rangoProvisional && (
                <> Los días del {data.rangoProvisional.desde} al {data.rangoProvisional.hasta} aún no tienen quincena calculada en Nómina — se cuentan aquí como <strong>provisional</strong> y pueden ajustarse cuando Nómina calcule esa quincena.</>
              )}
            </p>
          </div>

          <DashboardStatRow
            stats={[
              { key: 'nomina', icon: Percent, label: 'Ventas confirmadas (Nómina)', value: data.totales.ventasNomina, tone: 'success' },
              { key: 'provisional', icon: Percent, label: 'Ventas provisionales', value: data.totales.ventasProvisionales, tone: 'warn' },
              { key: 'comision', icon: Percent, label: 'Comisión total (Nómina)', value: formatMonto(data.totales.montoComision), tone: 'brand' },
            ]}
          />

          {data.asesores.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
              <Target className="h-8 w-8" />
              <p className="text-sm">Sin datos de ventas ni metas para este periodo</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Asesor</th>
                    <th className="px-4 py-2.5 font-semibold">Ventas Nómina</th>
                    <th className="px-4 py-2.5 font-semibold">Provisionales</th>
                    <th className="px-4 py-2.5 font-semibold">Total</th>
                    <th className="px-4 py-2.5 font-semibold">Comisión</th>
                    <th className="px-4 py-2.5 font-semibold">Meta</th>
                    <th className="px-4 py-2.5 font-semibold">Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.asesores.map((a) => {
                    const cumplida = (a.pctCumplimiento ?? 0) >= 100
                    return (
                      <tr key={a.nombre} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{a.nombre}</td>
                        <td className="px-4 py-2.5 text-emerald-600 font-semibold">{a.ventasNomina}</td>
                        <td className="px-4 py-2.5 text-amber-600">{a.ventasProvisionales > 0 ? `+${a.ventasProvisionales}` : '—'}</td>
                        <td className="px-4 py-2.5 font-bold text-gray-900">{a.ventasTotal}</td>
                        <td className="px-4 py-2.5 text-gray-700">{a.montoComision > 0 ? formatMonto(a.montoComision) : '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{a.metaUnidades ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          {a.pctCumplimiento === null ? (
                            <span className="text-gray-400">Sin meta</span>
                          ) : (
                            <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', cumplida ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                              {a.pctCumplimiento}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showMeta && <PonerMetaModal periodo={periodo} onClose={() => setShowMeta(false)} />}
    </div>
  )
}
