import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Landmark, Plus, Trash2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { bancosService } from '@/services/bancos.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EnConstruccion } from '@/components/ui/EnConstruccion'
import type { TipoMovimiento } from '@/types/bancos.types'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function CrearCuentaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [banco, setBanco] = useState('')
  const [alias, setAlias] = useState('')
  const [numero, setNumero] = useState('')
  const [saldoInicial, setSaldoInicial] = useState<number | ''>('')

  const crear = useMutation({
    mutationFn: () => bancosService.crearCuenta({ banco: banco.trim(), alias: alias.trim(), numero: numero.trim() || undefined, saldoInicial: saldoInicial === '' ? undefined : Number(saldoInicial) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-bancos-cuentas'] })
      toast.success('Cuenta registrada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar la cuenta'),
  })

  const puedeCrear = banco.trim() !== '' && alias.trim() !== ''

  return (
    <Modal isOpen onClose={onClose} title="Nueva cuenta bancaria" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Banco</label>
          <input type="text" value={banco} onChange={(e) => setBanco(e.target.value)} className="field" placeholder="Ej. BBVA" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Alias / descripción</label>
          <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} className="field" placeholder="Ej. Cuenta principal" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Número (opcional)</label>
            <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className="field" placeholder="****1234" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Saldo inicial ($)</label>
            <input type="number" min={0} step="0.01" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="0.00" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar cuenta</Button>
        </div>
      </div>
    </Modal>
  )
}

function CrearMovimientoModal({ cuentaId, onClose }: { cuentaId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoMovimiento>('deposito')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState<number | ''>('')
  const [fecha, setFecha] = useState(hoy())

  const crear = useMutation({
    mutationFn: () => bancosService.crearMovimiento(cuentaId, { tipo, concepto: concepto.trim(), monto: Number(monto), fecha }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-bancos-cuentas'] })
      qc.invalidateQueries({ queryKey: ['finanzas-bancos-movimientos', cuentaId] })
      toast.success('Movimiento registrado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar el movimiento'),
  })

  const puedeCrear = concepto.trim() !== '' && monto !== '' && Number(monto) > 0

  return (
    <Modal isOpen onClose={onClose} title="Nuevo movimiento" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
          <div className="flex gap-2">
            <button
              onClick={() => setTipo('deposito')}
              className={clsx('flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors', tipo === 'deposito' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              Depósito
            </button>
            <button
              onClick={() => setTipo('retiro')}
              className={clsx('flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors', tipo === 'retiro' ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              Retiro
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Concepto</label>
          <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} className="field" placeholder="Ej. Pago de proveedor" />
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
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar movimiento</Button>
        </div>
      </div>
    </Modal>
  )
}

export function BancosPage() {
  return <EnConstruccion titulo="Bancos" subtitulo="Cuentas y movimientos bancarios" />
}

function BancosPageContent() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [showCrearCuenta, setShowCrearCuenta] = useState(false)
  const [showCrearMovimiento, setShowCrearMovimiento] = useState(false)

  const { data: cuentas = [], isLoading: loadingCuentas } = useQuery({
    queryKey: ['finanzas-bancos-cuentas'],
    queryFn: () => bancosService.listCuentas(),
  })

  const cuentaSeleccionada = useMemo(() => {
    if (cuentaId !== '') return cuentaId
    return cuentas.length > 0 ? cuentas[0].id : ''
  }, [cuentaId, cuentas])

  const cuenta = cuentas.find((c) => c.id === cuentaSeleccionada) ?? null

  const { data: movimientos = [], isLoading: loadingMovimientos } = useQuery({
    queryKey: ['finanzas-bancos-movimientos', cuentaSeleccionada],
    queryFn: () => bancosService.listMovimientos(Number(cuentaSeleccionada)),
    enabled: cuentaSeleccionada !== '',
  })

  const eliminarCuenta = useMutation({
    mutationFn: (id: number) => bancosService.eliminarCuenta(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-bancos-cuentas'] })
      toast.success('Cuenta eliminada')
    },
    onError: () => toast.error('Error al eliminar la cuenta'),
  })

  const eliminarMovimiento = useMutation({
    mutationFn: (id: number) => bancosService.eliminarMovimiento(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finanzas-bancos-cuentas'] })
      qc.invalidateQueries({ queryKey: ['finanzas-bancos-movimientos', cuentaSeleccionada] })
      toast.success('Movimiento eliminado')
    },
    onError: () => toast.error('Error al eliminar el movimiento'),
  })

  const totalSaldo = cuentas.reduce((sum, c) => sum + c.saldoActual, 0)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-brand" /> Bancos
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Cuentas bancarias y movimientos</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCrearCuenta(true)}><Plus className="h-3.5 w-3.5" /> Nueva cuenta</Button>
        )}
      </div>

      {loadingCuentas ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : cuentas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Landmark className="h-8 w-8" />
          <p className="text-sm">Sin cuentas bancarias registradas todavía</p>
        </div>
      ) : (
        <>
          <div className="card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">{formatMonto(totalSaldo)}</p>
              <p className="text-xs text-gray-500">Saldo total en {cuentas.length} cuenta{cuentas.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cuentas.map((c) => (
              <button
                key={c.id}
                onClick={() => setCuentaId(c.id)}
                className={clsx('card p-4 text-left transition-all', cuentaSeleccionada === c.id ? 'border-brand ring-1 ring-brand' : 'hover:border-brand/30')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.alias}</p>
                    <p className="text-xs text-gray-500">{c.banco}{c.numero ? ` · ${c.numero}` : ''}</p>
                  </div>
                  {isAdmin && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); eliminarCuenta.mutate(c.id) }}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-base font-bold text-gray-900">{formatMonto(c.saldoActual)}</p>
              </button>
            ))}
          </div>

          {cuenta && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink">Movimientos — {cuenta.alias}</h2>
                {isAdmin && (
                  <Button size="sm" variant="secondary" onClick={() => setShowCrearMovimiento(true)}><Plus className="h-3.5 w-3.5" /> Nuevo movimiento</Button>
                )}
              </div>

              {loadingMovimientos ? (
                <div className="flex justify-center py-10"><Spinner size="lg" /></div>
              ) : movimientos.length === 0 ? (
                <div className="card flex flex-col items-center gap-2 py-10 text-gray-400">
                  <p className="text-sm">Sin movimientos registrados para esta cuenta</p>
                </div>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="px-4 py-2.5 font-semibold">Tipo</th>
                        <th className="px-4 py-2.5 font-semibold">Concepto</th>
                        <th className="px-4 py-2.5 font-semibold">Fecha</th>
                        <th className="px-4 py-2.5 font-semibold">Monto</th>
                        {isAdmin && <th className="px-4 py-2.5 font-semibold"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m) => (
                        <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                          <td className="px-4 py-2.5">
                            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', m.tipo === 'deposito' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                              {m.tipo === 'deposito' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                              {m.tipo === 'deposito' ? 'Depósito' : 'Retiro'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{m.concepto}</td>
                          <td className="px-4 py-2.5 text-gray-600">{formatFecha(m.fecha)}</td>
                          <td className={clsx('px-4 py-2.5 font-semibold', m.tipo === 'deposito' ? 'text-emerald-600' : 'text-red-600')}>
                            {m.tipo === 'deposito' ? '+' : '-'}{formatMonto(m.monto)}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => eliminarMovimiento.mutate(m.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 ml-auto">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showCrearCuenta && <CrearCuentaModal onClose={() => setShowCrearCuenta(false)} />}
      {showCrearMovimiento && cuenta && <CrearMovimientoModal cuentaId={cuenta.id} onClose={() => setShowCrearMovimiento(false)} />}
    </div>
  )
}
