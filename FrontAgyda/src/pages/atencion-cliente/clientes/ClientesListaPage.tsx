import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users, Search, Plus, ChevronLeft, Building2 } from 'lucide-react'
import { clsx } from 'clsx'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevoClienteModal } from './NuevoClienteModal'

export function ClientesListaPage() {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'clientes-gestionar')
  const [busqueda, setBusqueda] = useState('')
  const [showNuevo, setShowNuevo] = useState(false)

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes-lista'],
    queryFn: () => crmService.getClientes(),
    staleTime: 30_000,
  })

  const filtrados = busqueda
    ? clientes.filter((c) => `${c.nombre} ${c.empresa ?? ''} ${c.correo ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()))
    : clientes

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Seguimiento de clientes</h1>
                <p className="mt-0.5 text-xs text-blue-100/80">
                  {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {puedeGestionar && (
              <button
                onClick={() => setShowNuevo(true)}
                className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[0.78rem] font-semibold text-brand shadow-sm hover:bg-blue-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nuevo cliente
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente por nombre, empresa o correo..."
          className="w-full rounded-xl border border-gray-200 bg-card pl-10 pr-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="card p-4 animate-pulse h-24" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <Users className="h-7 w-7 text-blue-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin clientes registrados</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {puedeGestionar ? 'Usa el botón para dar de alta el primer cliente.' : 'No hay clientes registrados todavía.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((c) => {
            const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === c.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/atencion-cliente/clientes/${c.id}`)}
                className="flex flex-col gap-2 rounded-2xl border border-gray-200/60 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</p>
                  {c.esCliente ? (
                    <span className={clsx('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', cfg.bg, cfg.text)}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                      {cfg.label}
                    </span>
                  ) : (
                    <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Sin alta formal
                    </span>
                  )}
                </div>
                {c.empresa && (
                  <p className="flex items-center gap-1 text-xs text-gray-400 truncate">
                    <Building2 className="h-3 w-3" /> {c.empresa}
                  </p>
                )}
                {c.productoServicio && <p className="text-xs text-gray-500 truncate">{c.productoServicio}</p>}
              </button>
            )
          })}
        </div>
      )}

      {showNuevo && <NuevoClienteModal onClose={() => setShowNuevo(false)} onCreated={(id) => navigate(`/atencion-cliente/clientes/${id}`)} />}
    </div>
  )
}
