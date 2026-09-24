import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Percent, Plus, Trash2, Pencil, Power, FlaskConical, Info } from 'lucide-react'
import { comisionesService } from '@/services/comisiones.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { ReglaComision } from '@/types/comisiones.types'
import { EstatusContadosCard } from './EstatusContadosCard'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
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

export function ComisionesConfigTab() {
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Percent className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Comisiones</h2>
            <p className="text-[0.82rem] text-gray-400">
              Fórmulas que calculan el monto de comisión mostrado en CRM → Comisiones. Reemplazan lo capturado en Nómina para esa pantalla.
            </p>
          </div>
        </div>
      </div>

      <EstatusContadosCard uso="comisiones" />

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-ink">Fórmulas de comisión</h3>
            <p className="text-[0.68rem] text-gray-500">Todas las fórmulas activas se evalúan y se suman por asesor.</p>
          </div>
          <Button size="sm" onClick={() => setModal('crear')}><Plus className="h-3.5 w-3.5" /> Nueva fórmula</Button>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          También puedes gestionar estas fórmulas directamente desde CRM → Comisiones.
        </p>
      </div>

      {modal && <GuardarReglaModal regla={modal === 'crear' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
}
