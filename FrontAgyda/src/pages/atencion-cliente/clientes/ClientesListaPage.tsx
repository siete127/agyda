import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users, Search, Plus, ChevronLeft, Building2, SlidersHorizontal,
  Sparkles, Loader2, Eye, CheckCircle2, Flame, ClipboardList,
} from 'lucide-react'
import { clsx } from 'clsx'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES, type CRMContacto } from '@/types/crm.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevoClienteModal } from './NuevoClienteModal'

// Segmentos de la cartera. Se derivan del estatus de color + alta formal:
//   nuevos       → aún sin alta formal como cliente
//   proceso      → activo / pendiente de documentación / pendiente de pago
//   seguimiento  → en seguimiento (verde)
//   cerrados     → inactivo / finalizado
//   prioridad    → incidencia (rojo)  ·· transversal, no excluyente
type Segmento = 'todos' | 'nuevos' | 'proceso' | 'seguimiento' | 'cerrados' | 'prioridad'

const SEGMENTOS: {
  key: Segmento
  label: string
  icon: typeof Users
  dot: string
  activeBg: string
  activeText: string
  countActive: string
  match: (c: CRMContacto) => boolean
}[] = [
  {
    key: 'todos', label: 'Todos', icon: Users,
    dot: 'bg-blue-500', activeBg: 'bg-brand', activeText: 'text-white', countActive: 'bg-white/25 text-white',
    match: () => true,
  },
  {
    key: 'nuevos', label: 'Nuevos', icon: Sparkles,
    dot: 'bg-emerald-500', activeBg: 'bg-emerald-500', activeText: 'text-white', countActive: 'bg-white/25 text-white',
    match: (c) => !c.esCliente,
  },
  {
    key: 'proceso', label: 'En proceso', icon: Loader2,
    dot: 'bg-amber-500', activeBg: 'bg-amber-500', activeText: 'text-white', countActive: 'bg-white/25 text-white',
    match: (c) => c.esCliente && ['azul', 'amarillo', 'naranja'].includes(c.estatusCliente),
  },
  {
    key: 'seguimiento', label: 'En seguimiento', icon: Eye,
    dot: 'bg-purple-500', activeBg: 'bg-purple-500', activeText: 'text-white', countActive: 'bg-white/25 text-white',
    match: (c) => c.esCliente && c.estatusCliente === 'verde',
  },
  {
    key: 'cerrados', label: 'Cerrados', icon: CheckCircle2,
    dot: 'bg-gray-500', activeBg: 'bg-gray-600', activeText: 'text-white', countActive: 'bg-white/25 text-white',
    match: (c) => c.esCliente && ['negro', 'morado'].includes(c.estatusCliente),
  },
  {
    key: 'prioridad', label: 'Alta prioridad', icon: Flame,
    dot: 'bg-red-500', activeBg: 'bg-red-500', activeText: 'text-white', countActive: 'bg-white/25 text-white',
    match: (c) => c.estatusCliente === 'rojo',
  },
]

export function ClientesListaPage({ embedded = false, onAbrirCliente }: {
  embedded?: boolean
  onAbrirCliente?: (id: number) => void
}) {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'clientes-gestionar')
  const [busqueda, setBusqueda] = useState('')
  const [segmento, setSegmento] = useState<Segmento>('todos')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [showNuevo, setShowNuevo] = useState(false)

  const abrir = (id: number) => (onAbrirCliente ? onAbrirCliente(id) : navigate(`/atencion-cliente/clientes/${id}`))

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes-lista'],
    queryFn: () => crmService.getClientes(),
    staleTime: 30_000,
  })

  const conteos = useMemo(() => {
    const m = {} as Record<Segmento, number>
    for (const s of SEGMENTOS) m[s.key] = clientes.filter(s.match).length
    return m
  }, [clientes])

  const filtrados = useMemo(() => {
    const seg = SEGMENTOS.find((s) => s.key === segmento) ?? SEGMENTOS[0]
    const q = busqueda.trim().toLowerCase()
    return clientes
      .filter(seg.match)
      .filter((c) => (q ? `${c.nombre} ${c.empresa ?? ''} ${c.correo ?? ''}`.toLowerCase().includes(q) : true))
  }, [clientes, segmento, busqueda])

  const NuevoClienteBtn = ({ size = 'sm' }: { size?: 'sm' | 'lg' }) =>
    puedeGestionar ? (
      <button
        onClick={() => setShowNuevo(true)}
        className={clsx(
          'flex items-center gap-2 rounded-xl bg-brand font-bold text-white shadow-sm shadow-brand/25 transition-colors hover:bg-brand-dark',
          size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-3.5 py-2 text-[0.8rem]',
        )}
      >
        <Plus className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> Nuevo cliente
      </button>
    ) : null

  return (
    <div className="space-y-4 animate-fade-in">
      {!embedded && (
        <>
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
              <div className="relative flex items-center gap-3">
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
            </div>
          </div>
        </>
      )}

      {/* Segmentos + acción */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {SEGMENTOS.map((s) => {
            const activo = segmento === s.key
            const Icon = s.icon
            return (
              <button
                key={s.key}
                onClick={() => setSegmento(s.key)}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-all',
                  activo
                    ? clsx(s.activeBg, s.activeText, 'border-transparent shadow-sm')
                    : 'border-gray-200 bg-card text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                {activo
                  ? <Icon className={clsx('h-3.5 w-3.5', s.key === 'proceso' && 'animate-spin')} />
                  : <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />}
                {s.label}
                <span
                  className={clsx(
                    'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[0.7rem] font-bold tabular-nums',
                    activo ? s.countActive : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {conteos[s.key]}
                </span>
              </button>
            )
          })}
        </div>
        <div className="ml-auto">
          <NuevoClienteBtn />
        </div>
      </div>

      {/* Buscador + filtro */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente por nombre, empresa o correo..."
            className="w-full rounded-xl border border-gray-200 bg-card pl-10 pr-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>
        <button
          onClick={() => setFiltrosAbiertos((v) => !v)}
          className={clsx(
            'flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl border transition-colors',
            filtrosAbiertos
              ? 'border-brand bg-brand/10 text-brand'
              : 'border-gray-200 bg-card text-gray-500 hover:bg-gray-50',
          )}
          title="Filtros avanzados"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {filtrosAbiertos && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Ordenar por:</span>
          {['Nombre', 'Más recientes', 'Estatus'].map((o) => (
            <button key={o} className="rounded-full border border-gray-200 px-2.5 py-1 hover:bg-gray-50">{o}</button>
          ))}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="card p-4 animate-pulse h-24" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card relative flex flex-col items-center justify-center gap-4 overflow-hidden py-16 px-6">
          <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/5" />
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-purple-500/5" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-purple-500/15">
            <ClipboardList className="h-8 w-8 text-brand" />
          </div>
          <div className="relative text-center">
            <p className="text-base font-bold text-gray-800">
              {busqueda || segmento !== 'todos' ? 'Sin resultados' : 'Sin clientes registrados'}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {busqueda || segmento !== 'todos'
                ? 'Prueba con otro segmento o término de búsqueda.'
                : puedeGestionar
                  ? 'Usa el botón para dar de alta el primer cliente.'
                  : 'No hay clientes registrados todavía.'}
            </p>
          </div>
          {!busqueda && segmento === 'todos' && (
            <div className="relative">
              <NuevoClienteBtn size="lg" />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((c) => {
            const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === c.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
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

      {showNuevo && <NuevoClienteModal onClose={() => setShowNuevo(false)} onCreated={(id) => { setShowNuevo(false); abrir(id) }} />}
    </div>
  )
}
