import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Wallet, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { finanzasService } from '@/services/finanzas.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { CuentaPorCobrar } from '@/services/finanzas.service'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function estaVencida(cxc: CuentaPorCobrar) {
  if (cxc.estatus !== 'pendiente' || !cxc.fechaVencimiento) return false
  return new Date(cxc.fechaVencimiento).getTime() < Date.now()
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function CrearCxcModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [cliente, setCliente] = useState('')
  const [monto, setMonto] = useState<number | ''>('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')

  const crear = useMutation({
    mutationFn: () => finanzasService.createCxc({ cliente: cliente.trim(), monto: Number(monto), fechaVencimiento: fechaVencimiento || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-cxc'] })
      qc.invalidateQueries({ queryKey: ['finanzas-dashboard'] })
      toast.success('Cuenta por cobrar registrada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar la cuenta'),
  })

  const puedeCrear = cliente.trim() !== '' && monto !== '' && Number(monto) > 0

  return (
    <Modal isOpen onClose={onClose} title="Nueva cuenta por cobrar" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
          <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="field" placeholder="Nombre del cliente" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Monto ($)</label>
            <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Vencimiento (opcional)</label>
            <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="field" min={hoy()} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

export function CuentasCobrarPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ['finanzas-cxc'],
    queryFn: () => finanzasService.getCxc(),
  })

  const cambiarEstatus = useMutation({
    mutationFn: ({ id, estatus }: { id: number; estatus: 'pendiente' | 'pagada' }) => finanzasService.actualizarEstatusCxc(id, estatus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-cxc'] })
      qc.invalidateQueries({ queryKey: ['finanzas-dashboard'] })
      toast.success('Estatus actualizado')
    },
    onError: () => toast.error('Error al actualizar el estatus'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => finanzasService.deleteCxc(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-cxc'] })
      qc.invalidateQueries({ queryKey: ['finanzas-dashboard'] })
      toast.success('Cuenta eliminada')
    },
    onError: () => toast.error('Error al eliminar la cuenta'),
  })

  const pendientes = cuentas.filter((c) => c.estatus === 'pendiente')
  const totalPendiente = pendientes.reduce((sum, c) => sum + c.monto, 0)
  const vencidas = pendientes.filter(estaVencida).length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-brand" /> Cuentas por cobrar
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Saldos pendientes de clientes</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nueva cuenta</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : cuentas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Wallet className="h-8 w-8" />
          <p className="text-sm">Sin cuentas por cobrar registradas todavía</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card p-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Wallet className="h-4 w-4" /></div>
              <div><p className="text-base font-bold text-gray-900 leading-tight">{formatMonto(totalPendiente)}</p><p className="text-[0.68rem] text-gray-500">Pendiente</p></div>
            </div>
            <div className="card p-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><Wallet className="h-4 w-4" /></div>
              <div><p className="text-base font-bold text-gray-900 leading-tight">{pendientes.length}</p><p className="text-[0.68rem] text-gray-500">Cuentas pendientes</p></div>
            </div>
            <div className="card p-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600"><AlertTriangle className="h-4 w-4" /></div>
              <div><p className="text-base font-bold text-gray-900 leading-tight">{vencidas}</p><p className="text-[0.68rem] text-gray-500">Vencidas</p></div>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">Monto</th>
                  <th className="px-4 py-2.5 font-semibold">Vencimiento</th>
                  <th className="px-4 py-2.5 font-semibold">Estatus</th>
                  {isAdmin && <th className="px-4 py-2.5 font-semibold"></th>}
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => {
                  const vencida = estaVencida(c)
                  return (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{c.cliente}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{formatMonto(c.monto)}</td>
                      <td className={clsx('px-4 py-2.5', vencida ? 'text-red-600 font-semibold' : 'text-gray-600')}>{formatFecha(c.fechaVencimiento)}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx(
                          'inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold',
                          c.estatus === 'pagada' ? 'bg-emerald-100 text-emerald-700' : vencida ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
                        )}>
                          {c.estatus === 'pagada' ? 'Pagada' : vencida ? 'Vencida' : 'Pendiente'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {c.estatus === 'pendiente' && (
                              <button
                                onClick={() => cambiarEstatus.mutate({ id: c.id, estatus: 'pagada' })}
                                title="Marcar como pagada"
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={() => eliminar.mutate(c.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showCrear && <CrearCxcModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
