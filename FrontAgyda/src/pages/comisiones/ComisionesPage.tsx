import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Percent, Target, Plus, Info, Trash2, Pencil, Power, FlaskConical } from 'lucide-react'
import { comisionesService } from '@/services/comisiones.service'
import { ventasAreaService } from '@/services/ventasArea.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { ReglaComision } from '@/types/comisiones.types'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function hoyPeriodo() {
  return new Date().toISOString().slice(0, 7)
}

const VARIABLES_AYUDA = [
  { nombre: 'ventas', desc: 'Ventas totales del asesor en el periodo' },
  { nombre: 'meta', desc: 'Meta de unidades definida en Metas' },
  { nombre: 'pctCumplimiento', desc: '% de cumplimiento (ventas / meta * 100)' },
]

function AyudaFormula() {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Variables disponibles</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {VARIABLES_AYUDA.map((v) => (
          <p key={v.nombre} className="text-[0.68rem] text-blue-700"><code className="font-mono font-semibold">{v.nombre}</code> — {v.desc}</p>
        ))}
      </div>
      <p className="text-[0.68rem] text-blue-700">
        Operadores: <code className="font-mono">{'+ - * / ( )'}</code> y comparadores <code className="font-mono">{'> >= < <= == !='}</code>.
        Funciones: <code className="font-mono">IF(condicion, siVerdadero, siFalso)</code>, <code className="font-mono">MIN(a,b)</code>, <code className="font-mono">MAX(a,b)</code>, <code className="font-mono">ROUND(a)</code>.
      </p>
      <p className="text-[0.68rem] text-blue-700">
        Ejemplos: <code className="font-mono">{'IF(pctCumplimiento >= 100, ventas * 100, ventas * 50)'}</code> · <code className="font-mono">ventas * 75</code>
      </p>
    </div>
  )
}

function GuardarReglaModal({ regla, onClose }: { regla: ReglaComision | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(regla?.nombre ?? '')
  const [formula, setFormula] = useState(regla?.formula ?? '')
  const [probando, setProbando] = useState(false)
  const [resultadoPrueba, setResultadoPrueba] = useState<number | null>(null)
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null)
  const [ventasPrueba, setVentasPrueba] = useState(30)
  const [metaPrueba, setMetaPrueba] = useState(20)

  const guardar = useMutation({
    mutationFn: () => regla
      ? comisionesService.actualizarRegla(regla.id, { nombre: nombre.trim(), formula: formula.trim(), activa: regla.activa })
      : comisionesService.crearRegla({ nombre: nombre.trim(), formula: formula.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones-reglas'] })
      toast.success(regla ? 'Fórmula actualizada' : 'Fórmula creada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar la fórmula'),
  })

  const probar = async () => {
    setProbando(true)
    setErrorPrueba(null)
    setResultadoPrueba(null)
    try {
      const pctCumplimiento = metaPrueba > 0 ? Math.round((ventasPrueba / metaPrueba) * 1000) / 10 : 0
      const resultado = await comisionesService.probarFormula(formula, { ventas: ventasPrueba, meta: metaPrueba, pctCumplimiento })
      setResultadoPrueba(resultado)
    } catch (e) {
      setErrorPrueba((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al evaluar la fórmula')
    } finally {
      setProbando(false)
    }
  }

  const puedeGuardar = nombre.trim() !== '' && formula.trim() !== ''

  return (
    <Modal isOpen onClose={onClose} title={regla ? 'Editar fórmula de comisión' : 'Nueva fórmula de comisión'} size="lg">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Ej. Comisión por venta formalizada" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fórmula</label>
          <textarea
            value={formula}
            onChange={(e) => { setFormula(e.target.value); setResultadoPrueba(null); setErrorPrueba(null) }}
            className="field font-mono text-xs"
            rows={3}
            placeholder="Ej. ventas * 100"
          />
        </div>

        <AyudaFormula />

        <div className="rounded-xl border border-gray-100 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> Probar con valores de ejemplo</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold text-gray-500 uppercase">Ventas de ejemplo</label>
              <input type="number" min={0} value={ventasPrueba} onChange={(e) => setVentasPrueba(Number(e.target.value) || 0)} className="field" />
            </div>
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold text-gray-500 uppercase">Meta de ejemplo</label>
              <input type="number" min={0} value={metaPrueba} onChange={(e) => setMetaPrueba(Number(e.target.value) || 0)} className="field" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" isLoading={probando} disabled={!formula.trim()} onClick={probar}>Probar fórmula</Button>
            {resultadoPrueba !== null && (
              <span className="text-sm font-bold text-emerald-600">Resultado: {formatMonto(resultadoPrueba)}</span>
            )}
            {errorPrueba && <span className="text-xs font-medium text-red-600">{errorPrueba}</span>}
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

function ReglasSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'crear' | ReglaComision | null>(null)

  const { data: reglas = [], isLoading } = useQuery({
    queryKey: ['ventas-area-comisiones-reglas'],
    queryFn: () => comisionesService.listReglas(),
  })

  const toggleActiva = useMutation({
    mutationFn: (r: ReglaComision) => comisionesService.actualizarRegla(r.id, { nombre: r.nombre, formula: r.formula, activa: !r.activa }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones-reglas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones'] })
      toast.success('Fórmula actualizada')
    },
    onError: () => toast.error('Error al actualizar la fórmula'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => comisionesService.eliminarRegla(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones-reglas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-comisiones'] })
      toast.success('Fórmula eliminada')
    },
    onError: () => toast.error('Error al eliminar la fórmula'),
  })

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Fórmulas de comisión</h2>
          <p className="text-[0.68rem] text-gray-500">Todas las fórmulas activas se evalúan y se suman por asesor. Reemplazan el monto capturado en Nómina para esta pantalla.</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setModal('crear')}><Plus className="h-3.5 w-3.5" /> Nueva fórmula</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : reglas.length === 0 ? (
        <p className="text-xs text-ink-tertiary py-6 text-center">Sin fórmulas definidas — crea la primera para empezar a calcular comisiones.</p>
      ) : (
        <div className="space-y-2">
          {reglas.map((r) => (
            <div key={r.id} className={clsx('rounded-xl border p-3', r.activa ? 'border-gray-100' : 'border-gray-100 opacity-50')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.nombre}</p>
                  <code className="text-[0.7rem] font-mono text-gray-600 break-all">{r.formula}</code>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => toggleActiva.mutate(r)} title={r.activa ? 'Desactivar' : 'Activar'} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setModal(r)} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => eliminar.mutate(r.id)} className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <GuardarReglaModal regla={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
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
      tipo: 'mensual',
      alcance: 'asesor',
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

      <ReglasSection isAdmin={isAdmin} />

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 text-blue-500 mt-0.5" />
            <p className="text-xs text-blue-700">
              El conteo de ventas de quincenas ya calculadas por Nómina se muestra como dato confirmado.
              {data.rangoProvisional && (
                <> Los días del {data.rangoProvisional.desde} al {data.rangoProvisional.hasta} aún no tienen quincena calculada en Nómina — se cuentan aquí como <strong>provisional</strong> y pueden ajustarse cuando Nómina calcule esa quincena.</>
              )}
              {' '}El monto de comisión se calcula con las fórmulas activas de arriba, no con lo capturado en Nómina.
            </p>
          </div>

          <DashboardStatRow
            stats={[
              { key: 'nomina', icon: Percent, label: 'Ventas confirmadas (Nómina)', value: data.totales.ventasNomina, tone: 'success' },
              { key: 'provisional', icon: Percent, label: 'Ventas provisionales', value: data.totales.ventasProvisionales, tone: 'warn' },
              { key: 'comision', icon: Percent, label: 'Comisión total (calculada)', value: formatMonto(data.totales.montoComision), tone: 'brand' },
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
                    <th className="px-4 py-2.5 font-semibold">Meta</th>
                    <th className="px-4 py-2.5 font-semibold">Cumplimiento</th>
                    <th className="px-4 py-2.5 font-semibold">Fórmulas aplicadas</th>
                    <th className="px-4 py-2.5 font-semibold">Comisión</th>
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
                        <td className="px-4 py-2.5 text-gray-600">
                          {a.desglose.length === 0 ? '—' : a.desglose.map((d) => `${d.nombre} (${formatMonto(d.monto)})`).join(', ')}
                        </td>
                        <td className="px-4 py-2.5 font-bold">
                          {a.montoComision > 0 ? (
                            <span className="text-emerald-600">{formatMonto(a.montoComision)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
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
