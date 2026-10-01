import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Ban, ChevronDown, Table2, ChevronLeft, Headset, LayoutGrid, List, Megaphone, Pencil, Plus, Power, Search, ShoppingCart, Sparkles, UserMinus, UserX, Users, UsersRound } from 'lucide-react'
import { api } from '@/lib/axios'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import { SelectorAgente } from '@/components/ui/SelectorAgente'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useActionAccess } from '@/hooks/useActionAccess'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { EditorCampanaVentas } from '@/components/ventas/EditorCampanaVentas'
import { campanasVentasService } from '@/services/campanasVentas.service'
import { ccService } from '@/services/cc.service'
import { AsistenteCampania } from '@/pages/configuracion/AsistenteCampania'
import type { CCCampania } from '@/types/cc.types'
import { GruposContactCenter } from './GruposCampanas'
import { gruposDetalleQuery, type GrupoDetalle } from './gruposDetalle'

// Editar una campaña abre el asistente "Crear grupo" en su paso de campañas
// (Configuración), y al salir regresa aquí.
const RUTA_AQUI = '/operaciones/campanas'
const rutaEditar = (tipo: 'cc' | 'ventas', id: number) => `/configuracion?asistente=grupo&editar=${tipo}:${id}&volver=${encodeURIComponent(RUTA_AQUI)}`

interface AgenteCampana {
  neusId: number
  nombre: string
  campanaId: number | null
  campanaNombre: string | null
  fechaAsignacion: string | null
}

interface CampanaDisponible {
  id: number
  nombre: string
  color: string | null
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// "ANGELICA VILLEGAS LUNA" → "Angelica Villegas Luna" (solo si viene todo en mayúsculas).
const nombreBonito = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ')
  return t !== t.toUpperCase() ? t : t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, e: string, l: string) => e + l.toUpperCase())
}

// Vista "Por campaña": una tarjeta por campaña de Ventas con sus agentes,
// para ver de un vistazo cómo está repartido el equipo y moverlo desde ahí.
function VistaPorCampana({ agentes, campanas, busqueda, puedeGestionar, onAsignar, onQuitar, ocupado, onEditarCampana, onDeshabilitarCampana, extra }: {
  agentes: AgenteCampana[]
  campanas: CampanaDisponible[]
  busqueda: string
  puedeGestionar: boolean
  onAsignar: (neusId: number, campanaId: number) => void
  onQuitar: (neusId: number) => void
  ocupado: boolean
  onEditarCampana?: (c: CampanaDisponible) => void
  onDeshabilitarCampana?: (c: CampanaDisponible) => void
  extra?: ReactNode
}) {
  const q = sinAcentos(busqueda.trim())
  const coincide = (a: AgenteCampana) => !q || sinAcentos(a.nombre).includes(q)
  // Campañas disponibles + las que tienen agentes aunque ya no estén activas.
  const todas: CampanaDisponible[] = [
    ...campanas,
    ...agentes
      .filter((a) => a.campanaId && !campanas.some((c) => c.id === a.campanaId))
      .map((a) => ({ id: a.campanaId!, nombre: a.campanaNombre ?? `Campaña #${a.campanaId}`, color: null }))
      .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i),
  ]
  const deCampana = (id: number | null) => agentes.filter((a) => (id == null ? !a.campanaId : a.campanaId === id))
  const sinCampana = deCampana(null)
  const total = Math.max(1, agentes.length)
  const ordenadas = [...todas].sort((a, b) => deCampana(b.id).length - deCampana(a.id).length || a.nombre.localeCompare(b.nombre))

  return (
    <div className="space-y-4">
      {/* Reparto del equipo */}
      {agentes.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">Reparto del equipo</p>
            <p className="text-[0.72rem] text-gray-400">{agentes.length} agentes</p>
          </div>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-gray-100">
            {ordenadas.map((c) => {
              const n = deCampana(c.id).length
              return n > 0 && <div key={c.id} title={`${c.nombre}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: c.color ?? '#f59e0b' }} />
            })}
            {sinCampana.length > 0 && <div title={`Sin campaña: ${sinCampana.length}`} className="bg-gray-300" style={{ width: `${(sinCampana.length / total) * 100}%` }} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {ordenadas.filter((c) => deCampana(c.id).length > 0).map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 text-[0.72rem] text-gray-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color ?? '#f59e0b' }} />
                {c.nombre} <b className="text-gray-800">{deCampana(c.id).length}</b>
              </span>
            ))}
            {sinCampana.length > 0 && (
              <span className="flex items-center gap-1.5 text-[0.72rem] text-gray-600">
                <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" /> Sin campaña <b className="text-gray-800">{sinCampana.length}</b>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-1 pt-1">
        <ShoppingCart className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-bold text-gray-800">Campañas de Ventas</h2>
        <span className="text-[0.7rem] text-gray-400">· la campaña del sistema de Ventas de cada agente</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordenadas.map((c) => (
          <TarjetaCampana key={c.id} campana={c} agentes={deCampana(c.id)} visibles={deCampana(c.id).filter(coincide)}
            candidatos={agentes.filter((a) => a.campanaId !== c.id)} campanas={todas}
            puedeGestionar={puedeGestionar} onAsignar={onAsignar} onQuitar={onQuitar} ocupado={ocupado} buscando={!!q}
            onEditar={onEditarCampana && campanas.some((x) => x.id === c.id) ? () => onEditarCampana(c) : undefined}
            onDeshabilitar={onDeshabilitarCampana && campanas.some((x) => x.id === c.id) ? () => onDeshabilitarCampana(c) : undefined} />
        ))}
        {(sinCampana.length > 0 || !todas.length) && (
          <TarjetaCampana campana={null} agentes={sinCampana} visibles={sinCampana.filter(coincide)} candidatos={[]} campanas={todas}
            puedeGestionar={puedeGestionar} onAsignar={onAsignar} onQuitar={onQuitar} ocupado={ocupado} buscando={!!q} />
        )}
      </div>
      {extra}
    </div>
  )
}

function TarjetaCampana({ campana, agentes, visibles, candidatos, campanas, puedeGestionar, onAsignar, onQuitar, ocupado, buscando, onEditar, onDeshabilitar }: {
  campana: CampanaDisponible | null
  agentes: AgenteCampana[]
  visibles: AgenteCampana[]
  candidatos: AgenteCampana[]
  campanas: CampanaDisponible[]
  puedeGestionar: boolean
  onAsignar: (neusId: number, campanaId: number) => void
  onQuitar: (neusId: number) => void
  ocupado: boolean
  buscando: boolean
  onEditar?: () => void
  onDeshabilitar?: () => void
}) {
  const color = campana ? campana.color ?? '#f59e0b' : '#9ca3af'
  const recientes = agentes.filter((a) => a.fechaAsignacion).sort((a, b) => (b.fechaAsignacion ?? '').localeCompare(a.fechaAsignacion ?? ''))[0]
  return (
    <div className={clsx('group/tarjeta flex flex-col rounded-2xl border bg-card shadow-sm transition hover:shadow-md', campana ? 'border-gray-200' : 'border-dashed border-gray-300')}>
      <div className="h-1.5 rounded-t-2xl" style={{ background: color }} />
      <div className="relative flex items-start gap-3 px-4 pt-3.5">
        {(onEditar || onDeshabilitar) && <AccionesTarjeta nombre={campana?.nombre ?? ''} onEditar={onEditar} onDeshabilitar={onDeshabilitar} />}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}22`, color }}>
          {campana ? <Megaphone className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-bold text-gray-900">{campana ? campana.nombre : 'Sin campaña'}</p>
          <p className="text-[0.7rem] text-gray-400">
            {agentes.length === 0 ? 'Sin agentes asignados' : `${agentes.length} agente${agentes.length !== 1 ? 's' : ''}`}
            {recientes?.fechaAsignacion && ` · último cambio ${fmtFecha(recientes.fechaAsignacion)}`}
          </p>
        </div>
        {agentes.length > 0 && (
          <div className="flex -space-x-2">
            {agentes.slice(0, 4).map((a) => <Avatar key={a.neusId} name={nombreBonito(a.nombre)} size="sm" />)}
            {agentes.length > 4 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[0.62rem] font-bold text-gray-500 ring-2 ring-white">+{agentes.length - 4}</span>
            )}
          </div>
        )}
      </div>

      <ul className="mt-3 max-h-72 flex-1 divide-y divide-gray-50 overflow-y-auto px-2">
        {visibles.length === 0 ? (
          <li className="px-2 py-6 text-center text-[0.75rem] text-gray-400">
            {buscando ? 'Ningún agente coincide' : campana ? 'Agrega agentes a esta campaña' : 'Todos los agentes tienen campaña'}
          </li>
        ) : visibles.map((a) => (
          <li key={a.neusId} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
            <Avatar name={nombreBonito(a.nombre)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8rem] font-medium text-gray-800">{nombreBonito(a.nombre)}</p>
              {a.fechaAsignacion && <p className="text-[0.65rem] text-gray-400">desde {fmtFecha(a.fechaAsignacion)}</p>}
            </div>
            {puedeGestionar && (
              <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                <select
                  value=""
                  disabled={ocupado}
                  onChange={(e) => e.target.value && onAsignar(a.neusId, Number(e.target.value))}
                  className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[0.68rem] text-gray-600 focus:border-brand focus:outline-none"
                  aria-label={`Mover a ${a.nombre} a otra campaña`}
                >
                  <option value="">{campana ? 'Mover a…' : 'Asignar a…'}</option>
                  {campanas.filter((c) => c.id !== campana?.id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {campana && (
                  <button onClick={() => onQuitar(a.neusId)} disabled={ocupado} title="Quitar de la campaña"
                    className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {puedeGestionar && campana && candidatos.length > 0 && (
        <div className="border-t border-gray-100 p-3">
          <SelectorAgente
            value=""
            placeholder="Agregar agente…"
            onChange={(id) => { if (id !== '') onAsignar(id, campana.id) }}
            vistas={[
              { id: 'sin', label: 'Sin campaña', agentes: candidatos.filter((a) => !a.campanaId).map((a) => ({ id: a.neusId, nombre: a.nombre })) },
              { id: 'otras', label: 'En otra campaña', agentes: candidatos.filter((a) => a.campanaId).map((a) => ({ id: a.neusId, nombre: `${a.nombre} · ${a.campanaNombre ?? ''}` })) },
            ]}
          />
        </div>
      )}
    </div>
  )
}

// Editar / deshabilitar en la esquina de una tarjeta (visibles al pasar el mouse).
function AccionesTarjeta({ nombre, onEditar, onDeshabilitar }: { nombre: string; onEditar?: () => void; onDeshabilitar?: () => void }) {
  return (
    <div className="absolute right-3 top-2.5 z-10 flex items-center gap-0.5 rounded-lg bg-card/95 p-0.5 opacity-100 shadow-sm ring-1 ring-gray-100 transition sm:opacity-0 sm:group-hover/tarjeta:opacity-100 sm:focus-within:opacity-100">
      {onEditar && (
        <button onClick={onEditar} title="Editar (abre el asistente de grupo en el paso de campañas)" aria-label={`Editar ${nombre}`}
          className="rounded-md p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-700"><Pencil className="h-3.5 w-3.5" /></button>
      )}
      {onDeshabilitar && (
        <button onClick={onDeshabilitar} title="Deshabilitar (se puede volver a habilitar)" aria-label={`Deshabilitar ${nombre}`}
          className="rounded-md p-1.5 text-gray-500 hover:bg-amber-50 hover:text-amber-700"><Ban className="h-3.5 w-3.5" /></button>
      )}
    </div>
  )
}

// Campañas de Contact Center (las de AGYDA: sus skills, canales y formulario).
function CampaniasContactCenter({ campanias, busqueda, onNueva, onEditar, onDeshabilitar }: {
  campanias: CCCampania[]
  busqueda: string
  onNueva: () => void
  onEditar: (c: CCCampania) => void
  onDeshabilitar: (c: CCCampania) => void
}) {
  const q = sinAcentos(busqueda.trim())
  const visibles = campanias.filter((c) => !q || sinAcentos(c.nombre).includes(q))
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-2 px-1">
        <Headset className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-bold text-gray-800">Campañas de Contact Center</h2>
        <span className="text-[0.7rem] text-gray-400">· skills, canales y formulario de AGYDA</span>
        <button onClick={onNueva} className="ml-auto flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[0.72rem] font-semibold text-white hover:bg-violet-700">
          <Plus className="h-3.5 w-3.5" /> Nueva
        </button>
      </div>
      {visibles.length === 0 ? (
        <p className="card px-4 py-8 text-center text-[0.8rem] text-gray-400">{q ? 'Ninguna campaña coincide' : 'Aún no hay campañas de Contact Center'}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => (
            <div key={c.id} className="group/tarjeta relative flex flex-col rounded-2xl border border-gray-200 bg-card p-4 shadow-sm transition hover:shadow-md">
              <AccionesTarjeta nombre={c.nombre} onEditar={() => onEditar(c)} onDeshabilitar={() => onDeshabilitar(c)} />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Headset className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1 pr-14">
                  <p className="truncate text-[0.95rem] font-bold text-gray-900">{c.nombre}</p>
                  <p className="truncate text-[0.7rem] text-gray-400">{c.gruposCC ? `Grupos: ${c.gruposCC}` : 'Sin grupo todavía'}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
                {([['Skills', c.skillsCount], ['Canales', c.canalesCount], ['Agentes', c.agentesCount]] as const).map(([l, n]) => (
                  <div key={l}>
                    <p className="text-base font-bold text-gray-800">{n}</p>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">{l}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => onEditar(c)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-1.5 text-[0.75rem] font-semibold text-gray-600 transition hover:border-violet-300 hover:text-violet-700">
                <Pencil className="h-3.5 w-3.5" /> Editar en el asistente de grupo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Campañas deshabilitadas de ambos tipos, para volver a habilitarlas.
function CampaniasDeshabilitadas({ puedeVentas, puedeCC }: { puedeVentas: boolean; puedeCC: boolean }) {
  const qc = useQueryClient()
  const [abierta, setAbierta] = useState(false)
  const { data: ventas = [] } = useQuery({ queryKey: ['campanas-ventas-todas'], queryFn: () => campanasVentasService.listar(), enabled: puedeVentas })
  const { data: cc = [] } = useQuery({ queryKey: ['cc-campanias-inactivas'], queryFn: () => ccService.getCampaniasInactivas(), enabled: puedeCC })
  const ventasOff = ventas.filter((v) => !v.activo)
  const habilitar = useMutation({
    mutationFn: (x: { tipo: 'ventas' | 'cc'; id: number }) => (x.tipo === 'ventas' ? campanasVentasService.activar(x.id) : ccService.reactivarCampania(x.id)),
    onSuccess: (_r, x) => {
      if (x.tipo === 'ventas') { qc.invalidateQueries({ queryKey: ['campanas-ventas-todas'] }); qc.invalidateQueries({ queryKey: ['campanas-disponibles'] }) }
      else { qc.invalidateQueries({ queryKey: ['cc-campanias-inactivas'] }); qc.invalidateQueries({ queryKey: ['cc-campanias'] }) }
      toast.success('Campaña habilitada')
    },
    onError: () => toast.error('No se pudo habilitar la campaña'),
  })
  const total = ventasOff.length + cc.length
  if (!total) return null
  const fila = (tipo: 'ventas' | 'cc', id: number, nombre: string, color: string | null, detalle: string) => (
    <li key={`${tipo}-${id}`} className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
        {tipo === 'ventas' ? <ShoppingCart className="h-4 w-4" style={color ? { color } : undefined} /> : <Headset className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.82rem] font-semibold text-gray-600">{nombre}</p>
        <p className="text-[0.66rem] text-gray-400">{tipo === 'ventas' ? 'Ventas' : 'Contact Center'} · {detalle}</p>
      </div>
      <button onClick={() => habilitar.mutate({ tipo, id })} disabled={habilitar.isPending}
        className="flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-[0.72rem] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50">
        <Power className="h-3.5 w-3.5" /> Habilitar
      </button>
    </li>
  )
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
        <Ban className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-bold text-gray-700">Deshabilitadas</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.66rem] font-bold text-gray-500">{total}</span>
        <span className="text-[0.7rem] text-gray-400">· no se ofrecen para asignar; su historial se conserva</span>
        <ChevronDown className={clsx('ml-auto h-4 w-4 text-gray-400 transition-transform', abierta && 'rotate-180')} />
      </button>
      {abierta && (
        <ul className="divide-y divide-gray-50 border-t border-gray-100">
          {ventasOff.map((v) => fila('ventas', v.id, v.nombre, v.color, `${v.ventas.toLocaleString('es-MX')} ventas`))}
          {cc.map((c) => fila('cc', c.id, c.nombre, null, `${c.interacciones.toLocaleString('es-MX')} interacciones`))}
        </ul>
      )}
    </div>
  )
}

// Vista "Tabla" de la pestaña Campañas: Ventas y Contact Center en una sola tabla.
function TablaCampanas({ agentes, ventas, cc, busqueda, onEditar, onDeshabilitarVentas, onDeshabilitarCC }: {
  agentes: AgenteCampana[]
  ventas: CampanaDisponible[]
  cc: CCCampania[]
  busqueda: string
  onEditar: (tipo: 'cc' | 'ventas', id: number) => void
  onDeshabilitarVentas?: (c: CampanaDisponible) => void
  onDeshabilitarCC?: (c: CCCampania) => void
}) {
  const { data: grupos = [] } = useQuery(gruposDetalleQuery)
  const { data: conteo = [] } = useQuery({ queryKey: ['campanas-ventas-todas'], queryFn: () => campanasVentasService.listar() })
  const q = sinAcentos(busqueda.trim())
  const ok = (n: string) => !q || sinAcentos(n).includes(q)
  const gruposDe = (pred: (g: GrupoDetalle) => boolean) => grupos.filter(pred).map((g) => g.nombre)
  type Fila = { clave: string; tipo: 'ventas' | 'cc'; id: number; nombre: string; color: string | null; agentes: AgenteCampana[] | number; detalle: string; grupos: string[]; editar: () => void; deshabilitar?: () => void }
  const filas: Fila[] = [
    ...ventas.filter((c) => ok(c.nombre)).map((c) => ({
      clave: `v${c.id}`, tipo: 'ventas' as const, id: c.id, nombre: c.nombre, color: c.color,
      agentes: agentes.filter((a) => a.campanaId === c.id),
      detalle: `${(conteo.find((x) => x.id === c.id)?.ventas ?? 0).toLocaleString('es-MX')} ventas registradas`,
      grupos: gruposDe((g) => g.ventas?.id === c.id),
      editar: () => onEditar('ventas', c.id),
      deshabilitar: onDeshabilitarVentas ? () => onDeshabilitarVentas(c) : undefined,
    })),
    ...cc.filter((c) => ok(c.nombre)).map((c) => ({
      clave: `c${c.id}`, tipo: 'cc' as const, id: c.id, nombre: c.nombre, color: null,
      agentes: new Set(grupos.filter((g) => g.campanias.some((x) => x.id === c.id)).flatMap((g) => g.agentes.map((a) => a.id))).size || c.agentesCount,
      detalle: `${c.skillsCount} skill${c.skillsCount !== 1 ? 's' : ''} · ${c.canalesCount} canal${c.canalesCount !== 1 ? 'es' : ''}`,
      grupos: gruposDe((g) => g.campanias.some((x) => x.id === c.id)),
      editar: () => onEditar('cc', c.id),
      deshabilitar: onDeshabilitarCC ? () => onDeshabilitarCC(c) : undefined,
    })),
  ]
  if (!filas.length) return <p className="card px-4 py-10 text-center text-[0.8rem] text-gray-400">{q ? 'Ninguna campaña coincide' : 'Sin campañas'}</p>
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-[0.8rem]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60 text-[0.66rem] font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3">Campaña</th>
            <th className="px-3 py-3">Tipo</th>
            <th className="px-3 py-3">Agentes</th>
            <th className="px-3 py-3">Detalle</th>
            <th className="px-3 py-3">Grupos</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filas.map((r) => (
            <tr key={r.clave} className="group transition-colors hover:bg-amber-50/30">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: r.tipo === 'ventas' ? `${r.color ?? '#f59e0b'}22` : '#ede9fe', color: r.tipo === 'ventas' ? r.color ?? '#f59e0b' : '#7c3aed' }}>
                    {r.tipo === 'ventas' ? <ShoppingCart className="h-4 w-4" /> : <Headset className="h-4 w-4" />}
                  </span>
                  <span className="font-semibold text-gray-900">{r.nombre}</span>
                </span>
              </td>
              <td className="px-3 py-3">
                <span className={clsx('rounded-full px-2 py-0.5 text-[0.66rem] font-semibold', r.tipo === 'ventas' ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700')}>
                  {r.tipo === 'ventas' ? 'Ventas' : 'Contact Center'}
                </span>
              </td>
              <td className="px-3 py-3">
                {Array.isArray(r.agentes) ? (
                  r.agentes.length ? (
                    <span className="flex items-center gap-2" title={r.agentes.map((a) => nombreBonito(a.nombre)).join(', ')}>
                      <span className="flex -space-x-2">{r.agentes.slice(0, 4).map((a) => <Avatar key={a.neusId} name={nombreBonito(a.nombre)} size="sm" />)}</span>
                      <span className="text-[0.75rem] font-semibold text-gray-700">{r.agentes.length}</span>
                    </span>
                  ) : <span className="text-[0.75rem] text-gray-300">0</span>
                ) : <span className="text-[0.75rem] font-semibold text-gray-700">{r.agentes}</span>}
              </td>
              <td className="px-3 py-3 text-[0.75rem] text-gray-600">{r.detalle}</td>
              <td className="px-3 py-3">
                {r.grupos.length ? (
                  <span className="flex flex-wrap gap-1">{r.grupos.map((g) => <span key={g} className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.66rem] font-medium text-gray-600">{g}</span>)}</span>
                ) : <span className="text-[0.72rem] italic text-gray-300">Sin grupo</span>}
              </td>
              <td className="px-3 py-3">
                <span className="flex items-center justify-end gap-1">
                  <button onClick={r.editar} title="Editar (abre el asistente de grupo en el paso de campañas)"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[0.7rem] font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-700">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  {r.deshabilitar && (
                    <button onClick={r.deshabilitar} title="Deshabilitar (se puede volver a habilitar)" aria-label={`Deshabilitar ${r.nombre}`}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-700"><Ban className="h-3.5 w-3.5" /></button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function CampanasPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const puedeGestionar = can('accesos', 'gestionar')
  const puedeCampaniasCC = can('contact-center', 'gestionar-skills')
  const [menuNueva, setMenuNueva] = useState<{ top: number; right: number } | null>(null)
  const [seccion, setSeccion] = useState<'campanas' | 'grupos'>(() => {
    try { return localStorage.getItem('campanas-seccion') === 'grupos' ? 'grupos' : 'campanas' } catch { return 'campanas' }
  })
  const cambiarSeccion = (v: 'campanas' | 'grupos') => {
    setSeccion(v)
    try { localStorage.setItem('campanas-seccion', v) } catch { /* sin almacenamiento */ }
  }
  const [nuevaVentas, setNuevaVentas] = useState(false)
  const [nuevaCC, setNuevaCC] = useState(false)
  const [borrarVentas, setBorrarVentas] = useState<CampanaDisponible | null>(null)
  const [borrarCC, setBorrarCC] = useState<CCCampania | null>(null)
  const { data: campaniasCC = [] } = useQuery({
    queryKey: ['cc-campanias'],
    queryFn: () => ccService.getCampanias(),
    staleTime: 60_000,
    enabled: puedeCampaniasCC,
  })
  const desactivarVentas = useMutation({
    mutationFn: (id: number) => campanasVentasService.desactivar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas-disponibles'] }); qc.invalidateQueries({ queryKey: ['campanas-ventas-todas'] }); setBorrarVentas(null); toast.success('Campaña de Ventas deshabilitada') },
    onError: () => toast.error('No se pudo deshabilitar la campaña'),
  })
  const eliminarCC = useMutation({
    mutationFn: (id: number) => ccService.deleteCampania(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-campanias'] }); qc.invalidateQueries({ queryKey: ['cc-campanias-inactivas'] }); setBorrarCC(null); toast.success('Campaña deshabilitada') },
    onError: () => toast.error('No se pudo deshabilitar la campaña'),
  })
  const [search, setSearch] = useState('')
  const [filtroCampana, setFiltroCampana] = useState('todas')
  const [vista, setVista] = useState<'campanas' | 'tabla' | 'agentes'>(() => {
    try { const v = localStorage.getItem('campanas-vista'); return v === 'agentes' || v === 'tabla' ? v : 'campanas' } catch { return 'campanas' }
  })
  const cambiarVista = (v: 'campanas' | 'tabla' | 'agentes') => {
    setVista(v)
    try { localStorage.setItem('campanas-vista', v) } catch { /* sin almacenamiento */ }
  }
  const [vistaGrupos, setVistaGrupos] = useState<'tarjetas' | 'tabla'>(() => {
    try { return localStorage.getItem('campanas-vista-grupos') === 'tabla' ? 'tabla' : 'tarjetas' } catch { return 'tarjetas' }
  })
  const cambiarVistaGrupos = (v: 'tarjetas' | 'tabla') => {
    setVistaGrupos(v)
    try { localStorage.setItem('campanas-vista-grupos', v) } catch { /* sin almacenamiento */ }
  }

  const { data: agentes = [], isLoading } = useQuery({
    queryKey: ['campanas-agentes'],
    queryFn: async () => {
      const { data } = await api.get('/campanas/agentes')
      return (data?.data ?? []) as AgenteCampana[]
    },
    staleTime: 30_000,
  })

  const { data: campanasDisponibles = [] } = useQuery({
    queryKey: ['campanas-disponibles'],
    queryFn: async () => {
      const { data } = await api.get('/campanas/disponibles')
      return (data?.data ?? []) as CampanaDisponible[]
    },
    staleTime: 60_000,
  })

  const asignar = useMutation({
    mutationFn: ({ neusId, campanaId }: { neusId: number; campanaId: number }) => {
      const campana = campanasDisponibles.find((c) => c.id === campanaId)
      return api.put(`/campanas/agentes/${neusId}`, { campanaId, campanaNombre: campana?.nombre ?? '' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas-agentes'] }); toast.success('Campaña asignada') },
    onError: () => toast.error('Error al asignar campaña'),
  })

  const quitar = useMutation({
    mutationFn: (neusId: number) => api.delete(`/campanas/agentes/${neusId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas-agentes'] }); toast.success('Campaña quitada') },
    onError: () => toast.error('Error al quitar campaña'),
  })

  const filtrados = agentes.filter((a) => {
    const matchSearch = a.nombre.toLowerCase().includes(search.toLowerCase())
    const matchCampana = filtroCampana === 'todas'
      || (filtroCampana === 'sin_campana' ? !a.campanaId : a.campanaNombre === filtroCampana)
    return matchSearch && matchCampana
  })

  const campanasEnUso = Array.from(new Set(agentes.map((a) => a.campanaNombre).filter(Boolean))) as string[]
  const sinCampana = agentes.filter((a) => !a.campanaId).length

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/operaciones')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Operaciones
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #713F12 0%, #CA8A04 25%, #FDE047 50%, #CA8A04 75%, #713F12 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Megaphone className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Campañas</h1>
                <p className="mt-0.5 text-xs text-yellow-100/90">
                  {campanasDisponibles.length} campaña{campanasDisponibles.length !== 1 ? 's' : ''} · {agentes.length} agente{agentes.length !== 1 ? 's' : ''} CC · {sinCampana} sin campaña
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
            {seccion === 'grupos' && (
              <button onClick={() => navigate(`/configuracion?asistente=grupo&volver=${encodeURIComponent(RUTA_AQUI)}`)}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[0.78rem] font-bold text-amber-800 shadow-sm transition hover:bg-amber-50">
                <Sparkles className="h-4 w-4" /> Crear grupo paso a paso
              </button>
            )}
            {seccion === 'campanas' && (puedeGestionar || puedeCampaniasCC) && (
              <div className="relative">
                <button onClick={(e) => {
                  // El encabezado recorta lo que se sale (overflow-hidden): el menú va en un
                  // portal sobre la página, anclado debajo del botón.
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenuNueva((v) => (v ? null : { top: r.bottom + 6, right: window.innerWidth - r.right }))
                }} aria-haspopup="menu" aria-expanded={!!menuNueva}
                  className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[0.78rem] font-bold text-amber-800 shadow-sm transition hover:bg-amber-50">
                  <Plus className="h-4 w-4" /> Nueva campaña <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', menuNueva && 'rotate-180')} />
                </button>
                {menuNueva && createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuNueva(null)} />
                    <div role="menu" style={{ top: menuNueva.top, right: menuNueva.right }}
                      className="fixed z-50 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-card p-1.5 shadow-xl">
                      {puedeGestionar && (
                        <button role="menuitem" onClick={() => { setMenuNueva(null); setNuevaVentas(true) }}
                          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50">
                          <ShoppingCart className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                          <span><span className="block text-[0.8rem] font-semibold text-gray-800">De Ventas</span>
                            <span className="block text-[0.68rem] text-gray-400">PlataCard, Amex… con sus estatus, en el sistema de Ventas</span></span>
                        </button>
                      )}
                      {puedeCampaniasCC && (
                        <button role="menuitem" onClick={() => { setMenuNueva(null); setNuevaCC(true) }}
                          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50">
                          <Headset className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
                          <span><span className="block text-[0.8rem] font-semibold text-gray-800">De Contact Center</span>
                            <span className="block text-[0.68rem] text-gray-400">Skills, canales, formulario y tipificaciones, paso a paso</span></span>
                        </button>
                      )}
                    </div>
                  </>,
                  document.body,
                )}
              </div>
            )}
            {seccion === 'campanas' && <div className="flex rounded-xl bg-white/15 p-1" role="tablist" aria-label="Vista">
              {([['campanas', 'Tarjetas', LayoutGrid], ['tabla', 'Tabla', Table2], ['agentes', 'Por agente', List]] as const).map(([id, label, Icon]) => (
                <button key={id} role="tab" aria-selected={vista === id} onClick={() => cambiarVista(id)}
                  className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition',
                    vista === id ? 'bg-white text-amber-800 shadow-sm' : 'text-white/90 hover:bg-white/10')}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>}
            {seccion === 'grupos' && <div className="flex rounded-xl bg-white/15 p-1" role="tablist" aria-label="Vista de grupos">
              {([['tarjetas', 'Tarjetas', LayoutGrid], ['tabla', 'Tabla', Table2]] as const).map(([id, label, Icon]) => (
                <button key={id} role="tab" aria-selected={vistaGrupos === id} onClick={() => cambiarVistaGrupos(id)}
                  className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition',
                    vistaGrupos === id ? 'bg-white text-amber-800 shadow-sm' : 'text-white/90 hover:bg-white/10')}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-4 pt-2" role="tablist" aria-label="Sección">
          {([['campanas', 'Campañas', Megaphone], ['grupos', 'Grupos', UsersRound]] as const).map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={seccion === id} onClick={() => cambiarSeccion(id)}
              className={clsx('-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[0.82rem] font-semibold transition',
                seccion === id ? 'border-amber-500 text-amber-800' : 'border-transparent text-gray-500 hover:text-gray-800')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {<div className="px-5 py-3.5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={seccion === 'grupos' ? 'Buscar grupo, campaña, supervisor o agente…' : vista === 'tabla' ? 'Buscar campaña…' : 'Buscar agente o campaña…'}
              className="field py-2 pl-9 text-sm"
            />
          </div>
        </div>}

        {seccion === 'campanas' && vista === 'agentes' && <div className="px-5 py-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFiltroCampana('todas')}
            className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors', filtroCampana === 'todas' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            Todas <span className="opacity-70">({agentes.length})</span>
          </button>
          <button
            onClick={() => setFiltroCampana('sin_campana')}
            className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors', filtroCampana === 'sin_campana' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            Sin campaña <span className="opacity-70">({sinCampana})</span>
          </button>
          {campanasEnUso.map((nombre) => {
            const count = agentes.filter((a) => a.campanaNombre === nombre).length
            const active = filtroCampana === nombre
            return (
              <button
                key={nombre}
                onClick={() => setFiltroCampana(nombre)}
                className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors', active ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
              >
                {nombre} <span className="opacity-70">({count})</span>
              </button>
            )
          })}
        </div>}
      </div>

      {seccion === 'grupos' ? (
        <div className="space-y-4"><GruposContactCenter vista={vistaGrupos} busqueda={search} /></div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : vista === 'campanas' ? (
        <VistaPorCampana
          agentes={agentes}
          campanas={campanasDisponibles}
          busqueda={search}
          puedeGestionar={puedeGestionar}
          onAsignar={(neusId, campanaId) => asignar.mutate({ neusId, campanaId })}
          onQuitar={(neusId) => quitar.mutate(neusId)}
          ocupado={asignar.isPending || quitar.isPending}
          onEditarCampana={puedeGestionar ? (c) => navigate(rutaEditar('ventas', c.id)) : undefined}
          onDeshabilitarCampana={puedeGestionar ? (c) => setBorrarVentas(c) : undefined}
          extra={<>
            {puedeCampaniasCC && (
              <CampaniasContactCenter campanias={campaniasCC} busqueda={search}
                onNueva={() => setNuevaCC(true)}
                onEditar={(c) => navigate(rutaEditar('cc', c.id))}
                onDeshabilitar={(c) => setBorrarCC(c)} />
            )}
            <CampaniasDeshabilitadas puedeVentas={puedeGestionar} puedeCC={puedeCampaniasCC} />
          </>}
        />
      ) : vista === 'tabla' ? (
        <TablaCampanas
          agentes={agentes}
          ventas={campanasDisponibles}
          cc={puedeCampaniasCC ? campaniasCC : []}
          busqueda={search}
          onEditar={(tipo, id) => navigate(rutaEditar(tipo, id))}
          onDeshabilitarVentas={puedeGestionar ? (c) => setBorrarVentas(c) : undefined}
          onDeshabilitarCC={puedeCampaniasCC ? (c) => setBorrarCC(c) : undefined}
        />
      ) : filtrados.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-50">
            <Users className="h-7 w-7 text-yellow-400" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agente</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaña</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignada</th>
                {puedeGestionar && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((a) => (
                <tr key={a.neusId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-[0.82rem] font-semibold text-gray-800">{a.nombre}</td>
                  <td className="px-4 py-3">
                    {a.campanaNombre ? (
                      <span className="chip text-[0.65rem] bg-amber-50 text-amber-700">{a.campanaNombre}</span>
                    ) : (
                      <span className="text-[0.75rem] text-gray-300 italic">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[0.75rem] text-gray-400">
                    {a.fechaAsignacion ? fmtFecha(a.fechaAsignacion) : '—'}
                  </td>
                  {puedeGestionar && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <select
                          value={a.campanaId ?? ''}
                          onChange={(e) => { if (e.target.value) asignar.mutate({ neusId: a.neusId, campanaId: Number(e.target.value) }) }}
                          className="field py-1.5 text-[0.75rem]"
                        >
                          <option value="">Selecciona…</option>
                          {campanasDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        {a.campanaId && (
                          <button
                            onClick={() => quitar.mutate(a.neusId)}
                            className="rounded-lg px-2 py-1.5 text-[0.68rem] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuevaVentas && (
        <EditorCampanaVentas campanaId={null} onClose={() => setNuevaVentas(false)}
          onSaved={() => { setNuevaVentas(false); qc.invalidateQueries({ queryKey: ['campanas-disponibles'] }) }} />
      )}
      {nuevaCC && (
        <Modal isOpen onClose={() => { setNuevaCC(false); toast('La campaña quedó a medias: con "Nueva campaña" sigues donde te quedaste') }} title="Nueva campaña de Contact Center" size="full" elevated>
          <AsistenteCampania onSalir={(creada) => {
            setNuevaCC(false)
            qc.invalidateQueries({ queryKey: ['cc-campanias'] })
            if (creada) toast.success('Campaña lista')
          }} />
        </Modal>
      )}
      <ConfirmDialog isOpen={!!borrarVentas} onClose={() => setBorrarVentas(null)} onConfirm={() => borrarVentas && desactivarVentas.mutate(borrarVentas.id)}
        title={`Deshabilitar la campaña de Ventas ${borrarVentas?.nombre ?? ''}`} confirmLabel="Deshabilitar" variant="warning" isPending={desactivarVentas.isPending}
        message={`Deja de ofrecerse para asignar agentes y grupos. Sus ventas, metas y estatus se conservan en el sistema de Ventas, y puedes volver a habilitarla en "Deshabilitadas".${borrarVentas && agentes.some((a) => a.campanaId === borrarVentas.id) ? ' Los agentes que la tienen asignada la conservan hasta que los muevas.' : ''}`} />
      <ConfirmDialog isOpen={!!borrarCC} onClose={() => setBorrarCC(null)} onConfirm={() => borrarCC && eliminarCC.mutate(borrarCC.id)}
        title={`Deshabilitar la campaña ${borrarCC?.nombre ?? ''}`} confirmLabel="Deshabilitar" variant="warning" isPending={eliminarCC.isPending}
        message={`Deja de aparecer en grupos, reportes y formularios; su historial (interacciones, registros) se conserva y puedes volver a habilitarla en "Deshabilitadas".${borrarCC?.gruposCC ? ` La usan los grupos: ${borrarCC.gruposCC}.` : ''}`} />
    </div>
  )
}
