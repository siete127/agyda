import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  Building2, FileText, Globe, Headset, Layers, Megaphone, MessageCircle, MessagesSquare, Pencil, Phone, ShoppingCart, Tags, UsersRound,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { gruposService } from '@/services/grupos.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useAuthStore } from '@/stores/auth.store'
import { ConfigGrupo, MiembrosGrupo, ClientesDelGrupo } from '@/pages/configuracion/GruposTab'
import { gruposDetalleQuery, type GrupoDetalle, type Ref } from './gruposDetalle'

// Pestaña "Grupos" de Operaciones → Campañas: solo los grupos de Contact
// Center, cada uno con todo lo que tiene enlazado (campañas, Ventas, marcador,
// skills, canales, formularios, tipificaciones, supervisores y agentes), en
// tarjetas o en tabla. Editar abre la misma configuración de Configuración.

const MODALIDAD: Record<string, { txt: string; icon: typeof Phone; cls: string }> = {
  omnicanal: { txt: 'Omnicanal', icon: MessagesSquare, cls: 'bg-sky-50 text-sky-700' },
  marcador: { txt: 'Marcador', icon: Phone, cls: 'bg-amber-50 text-amber-700' },
  ambos: { txt: 'Marcador + omnicanal', icon: Headset, cls: 'bg-violet-50 text-violet-700' },
}
const iconoCanal = (tipo: string) => (/whats/i.test(tipo) ? MessageCircle : /web/i.test(tipo) ? Globe : /llam|voz|tel/i.test(tipo) ? Phone : MessagesSquare)
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const nombreBonito = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ')
  return t !== t.toUpperCase() ? t : t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, e: string, l: string) => e + l.toUpperCase())
}
const coincide = (g: GrupoDetalle, q: string) => !q || sinAcentos([
  g.nombre, g.descripcion ?? '', g.ventas?.nombre ?? '', ...g.campanias.map((c) => c.nombre), ...g.agentes.map((a) => a.nombre), ...g.supervisores.map((s) => s.nombre),
].join(' ')).includes(q)

export function GruposContactCenter({ vista, busqueda }: { vista: 'tarjetas' | 'tabla'; busqueda: string }) {
  const { data: grupos = [], isLoading } = useQuery(gruposDetalleQuery)
  const [editar, setEditar] = useState<GrupoDetalle | null>(null)
  const q = sinAcentos(busqueda.trim())
  const visibles = grupos.filter((g) => coincide(g, q))

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!grupos.length) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50"><UsersRound className="h-7 w-7 text-violet-400" /></div>
        <p className="text-sm font-semibold text-gray-700">Aún no hay grupos de Contact Center</p>
        <p className="text-[0.75rem] text-gray-400">Créalo con "Crear grupo paso a paso".</p>
      </div>
    )
  }

  return (
    <>
      <ResumenGrupos grupos={grupos} />
      {visibles.length === 0 ? (
        <p className="card px-4 py-10 text-center text-[0.8rem] text-gray-400">Ningún grupo coincide con la búsqueda</p>
      ) : vista === 'tabla' ? (
        <TablaGrupos grupos={visibles} onEditar={setEditar} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibles.map((g) => <TarjetaGrupo key={g.id} g={g} onEditar={() => setEditar(g)} />)}
        </div>
      )}
      {editar && <EditarGrupoModal grupo={editar} onClose={() => setEditar(null)} />}
    </>
  )
}

function ResumenGrupos({ grupos }: { grupos: GrupoDetalle[] }) {
  const agentes = new Set(grupos.flatMap((g) => g.agentes.map((a) => a.id))).size
  const supervisores = new Set(grupos.flatMap((g) => g.supervisores.map((a) => a.id))).size
  const campanias = new Set(grupos.flatMap((g) => g.campanias.map((a) => a.id))).size
  const datos = [
    { label: 'Grupos', valor: grupos.length, icon: UsersRound },
    { label: 'Campañas enlazadas', valor: campanias, icon: Megaphone },
    { label: 'Supervisores', valor: supervisores, icon: UsersRound },
    { label: 'Agentes', valor: agentes, icon: Headset },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {datos.map((d) => (
        <div key={d.label} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-card p-3.5 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><d.icon className="h-4.5 w-4.5" /></div>
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">{d.label}</p>
            <p className="text-lg font-bold leading-tight text-gray-900">{d.valor}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Chips({ items, vacio, max = 6, tono = 'bg-gray-100 text-gray-600' }: { items: { key: string | number; txt: string; icon?: typeof Phone; apagado?: boolean }[]; vacio: string; max?: number; tono?: string }) {
  if (!items.length) return <span className="text-[0.72rem] italic text-gray-300">{vacio}</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map((i) => (
        <span key={i.key} className={clsx('inline-flex max-w-[12rem] items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium', tono, i.apagado && 'opacity-50 line-through')}>
          {i.icon && <i.icon className="h-3 w-3 flex-shrink-0" />}<span className="truncate">{i.txt}</span>
        </span>
      ))}
      {items.length > max && <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[0.68rem] font-semibold text-gray-400" title={items.slice(max).map((i) => i.txt).join(', ')}>+{items.length - max}</span>}
    </div>
  )
}

function Fila({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1.5">
      <span className="flex items-center gap-1.5 pt-0.5 text-[0.7rem] font-semibold text-gray-400"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Personas({ lista, max = 5 }: { lista: Ref[]; max?: number }) {
  if (!lista.length) return <span className="text-[0.72rem] italic text-gray-300">Ninguno</span>
  return (
    <div className="flex items-center gap-2" title={lista.map((p) => nombreBonito(p.nombre)).join(', ')}>
      <div className="flex -space-x-2">
        {lista.slice(0, max).map((p) => <Avatar key={p.id} name={nombreBonito(p.nombre)} size="sm" />)}
        {lista.length > max && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[0.62rem] font-bold text-gray-500 ring-2 ring-white">+{lista.length - max}</span>}
      </div>
      {lista.length <= 2 && <span className="truncate text-[0.75rem] text-gray-600">{lista.map((p) => nombreBonito(p.nombre)).join(', ')}</span>}
    </div>
  )
}

function TarjetaGrupo({ g, onEditar }: { g: GrupoDetalle; onEditar: () => void }) {
  const m = MODALIDAD[g.modalidad] ?? MODALIDAD.omnicanal
  const usaCanales = g.modalidad !== 'marcador'
  const usaMarcador = g.modalidad !== 'omnicanal'
  return (
    <div className="group/tarjeta flex flex-col rounded-2xl border border-gray-200 bg-card shadow-sm transition hover:shadow-md">
      <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-violet-500 to-fuchsia-400" />
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><UsersRound className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-bold text-gray-900">{g.nombre}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.64rem] font-semibold', m.cls)}><m.icon className="h-3 w-3" /> {m.txt}</span>
            {g.atiendeClientes && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.64rem] font-semibold text-emerald-700"><Building2 className="h-3 w-3" /> Atención a clientes</span>}
          </div>
          {g.descripcion && <p className="mt-1 line-clamp-1 text-[0.72rem] text-gray-400">{g.descripcion}</p>}
        </div>
        <button onClick={onEditar} className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-600 transition hover:border-violet-300 hover:text-violet-700">
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>

      <div className="mx-4 mt-3 divide-y divide-gray-50 rounded-xl border border-gray-100 px-3 py-1">
        <Fila icon={Megaphone} label="Campañas"><Chips items={g.campanias.map((c) => ({ key: c.id, txt: c.nombre }))} vacio="Sin campañas" tono="bg-violet-50 text-violet-700" /></Fila>
        <Fila icon={ShoppingCart} label="Ventas">{g.ventas ? <Chips items={[{ key: g.ventas.id, txt: g.ventas.nombre }]} vacio="" tono="bg-amber-50 text-amber-700" /> : <span className="text-[0.72rem] italic text-gray-300">Sin campaña de Ventas</span>}</Fila>
        {usaMarcador && <Fila icon={Phone} label="Marcador">{g.marcador ? <span className="text-[0.75rem] font-medium text-gray-700">{g.marcador}</span> : <span className="text-[0.72rem] italic text-amber-600">Falta elegirlo</span>}</Fila>}
        {usaCanales && <Fila icon={Layers} label="Skills"><Chips items={g.skills.map((s) => ({ key: s.id, txt: s.nombre }))} vacio="Sin skills" /></Fila>}
        {usaCanales && <Fila icon={MessagesSquare} label="Canales"><Chips items={g.canales.map((c) => ({ key: c.id, txt: c.nombre, icon: iconoCanal(c.tipo), apagado: !c.habilitado }))} vacio="Sin canales" tono="bg-sky-50 text-sky-700" /></Fila>}
        <Fila icon={FileText} label="Formularios"><Chips items={g.formularios.map((f) => ({ key: f.id, txt: f.nombre }))} vacio="Sin formulario" /></Fila>
        <Fila icon={Tags} label="Tipificaciones"><Chips items={g.tipificaciones.map((t) => ({ key: t, txt: t }))} vacio="Sin tipificaciones" max={5} /></Fila>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 px-4 py-3.5">
        <div>
          <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Supervisores · {g.supervisores.length}</p>
          <Personas lista={g.supervisores} />
        </div>
        <div>
          <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Agentes · {g.agentes.length}{g.atiendeClientes ? ` · ${g.clientes} clientes` : ''}</p>
          <Personas lista={g.agentes} />
        </div>
      </div>
    </div>
  )
}

function TablaGrupos({ grupos, onEditar }: { grupos: GrupoDetalle[]; onEditar: (g: GrupoDetalle) => void }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-[0.8rem]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60 text-[0.66rem] font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3">Grupo</th>
            <th className="px-3 py-3">Modo</th>
            <th className="px-3 py-3">Campañas</th>
            <th className="px-3 py-3">Ventas · marcador</th>
            <th className="px-3 py-3">Skills · canales</th>
            <th className="px-3 py-3 text-center">Formularios</th>
            <th className="px-3 py-3 text-center">Tipificaciones</th>
            <th className="px-3 py-3">Supervisores</th>
            <th className="px-3 py-3">Agentes</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {grupos.map((g) => {
            const m = MODALIDAD[g.modalidad] ?? MODALIDAD.omnicanal
            return (
              <tr key={g.id} className="align-top transition-colors hover:bg-violet-50/30">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{g.nombre}</p>
                  {g.descripcion && <p className="line-clamp-1 max-w-[14rem] text-[0.7rem] text-gray-400">{g.descripcion}</p>}
                  {g.atiendeClientes && <p className="text-[0.66rem] font-semibold text-emerald-600">Atención a clientes · {g.clientes} clientes</p>}
                </td>
                <td className="px-3 py-3"><span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.66rem] font-semibold', m.cls)}><m.icon className="h-3 w-3" /> {m.txt}</span></td>
                <td className="px-3 py-3"><Chips items={g.campanias.map((c) => ({ key: c.id, txt: c.nombre }))} vacio="—" max={3} tono="bg-violet-50 text-violet-700" /></td>
                <td className="px-3 py-3 text-[0.75rem]">
                  <p className={g.ventas ? 'font-medium text-amber-700' : 'text-gray-300'}>{g.ventas?.nombre ?? 'Sin Ventas'}</p>
                  {g.modalidad !== 'omnicanal' && <p className={g.marcador ? 'text-gray-500' : 'text-amber-600'}>{g.marcador ?? 'Sin marcador'}</p>}
                </td>
                <td className="px-3 py-3 text-[0.75rem] text-gray-600">
                  {g.modalidad === 'marcador' ? <span className="text-gray-300">No aplica</span> : <>{g.skills.length} skill{g.skills.length !== 1 ? 's' : ''} · {g.canales.length} canal{g.canales.length !== 1 ? 'es' : ''}</>}
                </td>
                <td className="px-3 py-3 text-center font-semibold text-gray-700" title={g.formularios.map((f) => f.nombre).join(', ')}>{g.formularios.length}</td>
                <td className="px-3 py-3 text-center font-semibold text-gray-700" title={g.tipificaciones.join(', ')}>{g.tipificaciones.length}</td>
                <td className="px-3 py-3"><Personas lista={g.supervisores} max={3} /></td>
                <td className="px-3 py-3"><Personas lista={g.agentes} max={4} /></td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => onEditar(g)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-700">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Misma configuración y miembros que Configuración → Grupos, en un modal.
function EditarGrupoModal({ grupo, onClose }: { grupo: GrupoDetalle; onClose: () => void }) {
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const rol = (useAuthStore((s) => s.user?.tipoUsuario) ?? '').toUpperCase()
  const puedeEditar = ['AD', 'TI'].includes(rol) && can('usuarios', 'editar')
  const { data, isLoading } = useQuery({ queryKey: ['grupos-resumen'], queryFn: () => gruposService.resumen() })
  const tipo = data?.tipos.find((t) => t.key === (grupo.atiendeClientes ? 'atencion-clientes' : 'cc-equipos'))
  const g = tipo?.grupos.find((x) => String(x.id) === String(grupo.id))
  const cambio = () => {
    qc.invalidateQueries({ queryKey: ['campanas-grupos'] })
    qc.invalidateQueries({ queryKey: ['grupos-resumen'] })
    qc.invalidateQueries({ queryKey: ['campanas-agentes'] })
  }
  return (
    <Modal isOpen onClose={onClose} title={`Grupo ${grupo.nombre}`} size="full" elevated>
      {isLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : !tipo || !g ? <p className="py-12 text-center text-sm text-gray-500">No se encontró el grupo.</p>
          : (
            <div className="space-y-4">
              {!puedeEditar && <p className="rounded-xl bg-gray-50 px-3 py-2 text-[0.75rem] text-gray-500">Solo consulta: editar grupos requiere ser AD/TI con permiso de editar usuarios.</p>}
              <ConfigGrupo tipo={tipo} grupo={g} editable={puedeEditar} onCambio={cambio} />
              <MiembrosGrupo tipo={tipo} grupo={g} puedeEditar={puedeEditar} onCambio={cambio} />
              {tipo.conClientes && <ClientesDelGrupo tipo={tipo} grupo={g} editable={puedeEditar} onCambio={cambio} />}
            </div>
          )}
    </Modal>
  )
}
