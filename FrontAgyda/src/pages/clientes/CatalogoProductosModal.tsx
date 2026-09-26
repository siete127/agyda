import { useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Search, X, Package, Sparkles, Check, Mail, Headphones, Send, Loader2, PackageSearch, CheckSquare, Square } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { ProductoServicio, ProductoServicioRecurrencia, ProductoServicioTipo } from '@/services/productoServicio.service'
import { RECURRENCIA_CHIP, RECURRENCIA_LABEL, RECURRENCIA_SUFIJO, money } from './productoServicioUi'

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

type FiltroTipo = 'todos' | ProductoServicioTipo
type FiltroCobro = 'todos' | 'recurrente' | 'UNICO'

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('rounded-full px-3 py-1.5 text-[0.75rem] font-semibold transition',
        activo ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/25' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-violet-50 hover:text-violet-700')}>
      {children}
    </button>
  )
}

// Total de lo seleccionado agrupado por forma de cobro (ej. "$4,700/mes · $7,500 único").
function resumenPrecios(items: ProductoServicio[]): string {
  const porCobro = new Map<ProductoServicioRecurrencia, number>()
  for (const p of items) if (p.precio > 0) porCobro.set(p.recurrencia, (porCobro.get(p.recurrencia) ?? 0) + p.precio)
  return [...porCobro.entries()]
    .map(([r, total]) => `${money(total)}${RECURRENCIA_SUFIJO[r] || ' único'}`)
    .join(' · ')
}

// Catálogo para asignar productos/servicios a un cliente: buscador, filtros por
// tipo y forma de cobro, tarjetas con descripción y precio, selección múltiple
// y un resumen de lo que recibirá el cliente (un solo aviso por correo y en su
// portal con el botón "Soporte técnico", con todo lo asignado).
export function CatalogoProductosModal({ disponibles, clienteNombre, asignando, onAsignar, onClose }: {
  disponibles: ProductoServicio[]
  clienteNombre: string
  asignando: boolean
  onAsignar: (psIds: number[]) => void
  onClose: () => void
}) {
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [cobro, setCobro] = useState<FiltroCobro>('todos')
  const [sel, setSel] = useState<number[]>([])

  const filtrados = useMemo(() => {
    const q = sinAcentos(busca.trim())
    return disponibles
      .filter((p) => tipo === 'todos' || p.tipo === tipo)
      .filter((p) => cobro === 'todos' || (cobro === 'UNICO' ? p.recurrencia === 'UNICO' : p.recurrencia !== 'UNICO'))
      .filter((p) => !q || sinAcentos(`${p.nombre} ${p.descripcion ?? ''}`).includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [disponibles, busca, tipo, cobro])

  const seleccionados = disponibles.filter((p) => sel.includes(p.id))
  const cuenta = (t: FiltroTipo) => disponibles.filter((p) => t === 'todos' || p.tipo === t).length
  const alternar = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const todosVisiblesMarcados = filtrados.length > 0 && filtrados.every((p) => sel.includes(p.id))
  const alternarVisibles = () => setSel((s) => (todosVisiblesMarcados
    ? s.filter((id) => !filtrados.some((p) => p.id === id))
    : [...new Set([...s, ...filtrados.map((p) => p.id)])]))

  return (
    <Modal isOpen onClose={onClose} size="xl" elevated bare>
      {/* Encabezado */}
      <div className="relative flex-shrink-0 overflow-hidden bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-500 px-6 py-5 text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute right-24 -bottom-12 h-28 w-28 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><PackageSearch className="h-5 w-5" /></div>
            <div>
              <h2 className="text-[1.1rem] font-bold">Asignar productos y servicios</h2>
              <p className="text-[0.78rem] text-white/80">Para <b>{clienteNombre || 'este cliente'}</b> · {disponibles.length} disponibles · puedes elegir varios</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-300" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o descripción…"
            className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-9 text-sm text-gray-900 shadow-lg outline-none ring-2 ring-transparent placeholder:text-gray-400 focus:ring-white/60" />
          {busca && <button onClick={() => setBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-6 py-3">
        <Chip activo={tipo === 'todos'} onClick={() => setTipo('todos')}>Todos · {cuenta('todos')}</Chip>
        <Chip activo={tipo === 'PRODUCTO'} onClick={() => setTipo('PRODUCTO')}>Productos · {cuenta('PRODUCTO')}</Chip>
        <Chip activo={tipo === 'SERVICIO'} onClick={() => setTipo('SERVICIO')}>Servicios · {cuenta('SERVICIO')}</Chip>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <Chip activo={cobro === 'todos'} onClick={() => setCobro('todos')}>Cualquier cobro</Chip>
        <Chip activo={cobro === 'recurrente'} onClick={() => setCobro('recurrente')}>Recurrente</Chip>
        <Chip activo={cobro === 'UNICO'} onClick={() => setCobro('UNICO')}>Pago único</Chip>
        {filtrados.length > 0 && (
          <button type="button" onClick={alternarVisibles}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.75rem] font-semibold text-violet-600 hover:bg-violet-50">
            {todosVisiblesMarcados ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {todosVisiblesMarcados ? 'Quitar los mostrados' : 'Seleccionar los mostrados'}
          </button>
        )}
      </div>

      {/* Tarjetas (única zona con scroll) */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-4">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-400"><PackageSearch className="h-6 w-6" /></div>
            <p className="text-sm font-semibold text-gray-700">{disponibles.length ? 'Nada coincide con tu búsqueda' : 'Este cliente ya tiene todo el catálogo'}</p>
            {disponibles.length > 0 && <button onClick={() => { setBusca(''); setTipo('todos'); setCobro('todos') }} className="text-xs font-semibold text-violet-600 hover:underline">Limpiar filtros</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map((p) => {
              const activo = sel.includes(p.id)
              const esServicio = p.tipo === 'SERVICIO'
              return (
                <button key={p.id} type="button" onClick={() => alternar(p.id)}
                  className={clsx('group relative flex flex-col rounded-2xl border bg-white p-4 text-left transition-all',
                    activo ? 'border-violet-500 bg-violet-50/30 shadow-lg shadow-violet-500/15 ring-2 ring-violet-500/20'
                      : 'border-gray-100 shadow-sm hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md')}>
                  <span className={clsx('absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
                    activo ? 'border-violet-600 bg-violet-600 text-white shadow' : 'border-gray-200 bg-white text-transparent group-hover:border-violet-300')}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div className={clsx('mb-3 flex h-10 w-10 items-center justify-center rounded-xl',
                    esServicio ? 'bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-600' : 'bg-gradient-to-br from-sky-100 to-indigo-100 text-indigo-600')}>
                    {esServicio ? <Sparkles className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                  </div>
                  <p className="pr-7 text-[0.88rem] font-bold leading-snug text-gray-900">{p.nombre}</p>
                  <p className="mt-1 line-clamp-2 min-h-[2.1em] text-[0.72rem] leading-snug text-gray-500">
                    {p.descripcion?.trim() || (esServicio ? 'Servicio del catálogo' : 'Producto del catálogo')}
                  </p>
                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-gray-50 pt-3">
                    <span className={clsx('chip text-[0.62rem]', RECURRENCIA_CHIP[p.recurrencia])}>{RECURRENCIA_LABEL[p.recurrencia]}</span>
                    {p.precio > 0 ? (
                      <span className="text-[0.95rem] font-extrabold tabular-nums text-gray-900">
                        {money(p.precio)}<span className="text-[0.62rem] font-medium text-gray-400">{RECURRENCIA_SUFIJO[p.recurrencia]}</span>
                      </span>
                    ) : <span className="text-[0.7rem] font-medium text-gray-400">A cotizar</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Resumen y acción */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {seleccionados.length ? (
            <>
              <p className="text-[0.85rem] font-semibold text-gray-800">
                {seleccionados.length} seleccionado{seleccionados.length === 1 ? '' : 's'}
                {resumenPrecios(seleccionados) && <span className="font-normal text-gray-500"> · {resumenPrecios(seleccionados)}</span>}
                <button type="button" onClick={() => setSel([])} className="ml-2 text-[0.72rem] font-semibold text-violet-600 hover:underline">Limpiar</button>
              </p>
              <p className="mt-0.5 truncate text-[0.7rem] text-gray-500">{seleccionados.map((p) => p.nombre).join(', ')}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.7rem] text-gray-500">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-violet-500" /> Un solo aviso por correo y en su portal</span>
                <span className="flex items-center gap-1"><Headphones className="h-3 w-3 text-violet-500" /> con el botón Soporte técnico</span>
              </p>
            </>
          ) : (
            <p className="text-[0.8rem] text-gray-400">Elige uno o varios productos o servicios.</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button disabled={!sel.length || asignando} onClick={() => onAsignar(sel)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.82rem] font-semibold text-white shadow-sm shadow-violet-600/25 transition hover:bg-violet-700 disabled:opacity-40">
            {asignando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Asignar y avisar{sel.length > 1 ? ` (${sel.length})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}
