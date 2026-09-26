import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { TrendingUp, Plus, Trash2, Receipt, ArrowUpRight } from 'lucide-react'
import { finanzasService } from '@/services/finanzas.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function CrearIngresoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState<number | ''>('')
  const [fecha, setFecha] = useState(hoy())
  const [categoria, setCategoria] = useState('')

  const crear = useMutation({
    mutationFn: () => finanzasService.createIngreso({
      concepto: concepto.trim(),
      monto: Number(monto),
      fecha,
      categoria: categoria.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-ingresos'] })
      qc.invalidateQueries({ queryKey: ['finanzas-dashboard'] })
      toast.success('Ingreso registrado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar el ingreso'),
  })

  const puedeCrear = concepto.trim() !== '' && monto !== '' && Number(monto) > 0

  return (
    <Modal isOpen onClose={onClose} title="Nuevo ingreso" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Concepto</label>
          <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} className="field" placeholder="Ej. Pago de cliente X" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Monto ($)</label>
            <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" max={hoy()} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría (opcional)</label>
          <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field" placeholder="Ej. Ventas, Servicios, Otros" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar ingreso</Button>
        </div>
      </div>
    </Modal>
  )
}

export function IngresosPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)

  const navigate = useNavigate()

  const { data: ingresos = [], isLoading } = useQuery({
    queryKey: ['finanzas-ingresos'],
    queryFn: () => finanzasService.getIngresos(),
  })

  // Lo que está por cobrar (p. ej. productos asignados a clientes): entra aquí
  // en cuanto se marca como cobrado en Cuentas por cobrar.
  const { data: cuentas = [] } = useQuery({
    queryKey: ['finanzas-cxc'],
    queryFn: () => finanzasService.getCxc(),
  })
  const porCobrar = cuentas.filter((c) => c.estatus === 'pendiente')
  const totalPorCobrar = porCobrar.reduce((sum, c) => sum + c.monto, 0)

  const eliminar = useMutation({
    mutationFn: (i: { id: number; cxcId?: number | null }) => finanzasService.deleteIngreso(i.id),
    onSuccess: (_r, i) => {
      qc.invalidateQueries({ queryKey: ['finanzas-ingresos'] })
      qc.invalidateQueries({ queryKey: ['finanzas-dashboard'] })
      qc.invalidateQueries({ queryKey: ['finanzas-cxc'] })
      qc.invalidateQueries({ queryKey: ['cliente-finanzas'] })
      qc.invalidateQueries({ queryKey: ['facturas-todas'] })
      toast.success(i.cxcId ? 'Ingreso eliminado · su cuenta por cobrar volvió a pendiente' : 'Ingreso eliminado')
    },
    onError: () => toast.error('Error al eliminar el ingreso'),
  })

  const total = ingresos.reduce((sum, i) => sum + i.monto, 0)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand" /> Ingresos
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Registro de ingresos de la empresa</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nuevo ingreso</Button>
        )}
      </div>

      {porCobrar.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-amber-100 bg-amber-50/50 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-amber-700">{formatMonto(totalPorCobrar)} por cobrar</p>
            <p className="text-xs text-gray-500">
              {porCobrar.length} cuenta{porCobrar.length !== 1 ? 's' : ''} pendiente{porCobrar.length !== 1 ? 's' : ''}. Se registran aquí como ingreso al marcarlas como cobradas.
            </p>
          </div>
          <button
            onClick={() => navigate('/finanzas/cuentas-cobrar')}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-amber-700 transition-colors hover:bg-amber-50"
          >
            Ver cuentas por cobrar <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : ingresos.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <TrendingUp className="h-8 w-8" />
          <p className="text-sm">Sin ingresos registrados todavía</p>
        </div>
      ) : (
        <>
          <div className="card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">{formatMonto(total)}</p>
              <p className="text-xs text-gray-500">Total de {ingresos.length} ingreso{ingresos.length !== 1 ? 's' : ''} registrado{ingresos.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">Concepto</th>
                  <th className="px-4 py-2.5 font-semibold">Categoría</th>
                  <th className="px-4 py-2.5 font-semibold">Fecha</th>
                  <th className="px-4 py-2.5 font-semibold">Monto</th>
                  {isAdmin && <th className="px-4 py-2.5 font-semibold"></th>}
                </tr>
              </thead>
              <tbody>
                {ingresos.map((i) => (
                  <tr key={i.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {i.concepto}
                      {i.cxcId && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-700">Cobro de CxC</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{i.categoria ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatFecha(i.fecha)}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-600">{formatMonto(i.monto)}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => eliminar.mutate(i)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 ml-auto">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showCrear && <CrearIngresoModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
