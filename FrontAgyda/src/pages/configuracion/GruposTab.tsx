import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  UsersRound, BellRing, Headset, Wrench, MessagesSquare, ShieldCheck, Plus, Trash2, Search, X, Loader2,
  UserPlus, Lock, ArrowRightLeft, Eye, ChevronRight, Building2, Phone, Link2, Copy,
} from 'lucide-react'
import { gruposService, type TipoGrupo, type GrupoUsuarios, type ModalidadGrupo, type ConfigSkill, type ConfigEquipo, type SeleccionBorrar } from '@/services/grupos.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useAuthStore } from '@/stores/auth.store'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { AsistenteCampania } from './AsistenteCampania'

const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
type ErrApi = { response?: { data?: { message?: string } } }
const msg = (e: ErrApi, def: string) => e?.response?.data?.message ?? def

const ICONO_SEGMENTO: Record<string, typeof UsersRound> = {
  equipos: BellRing, 'contact-center': Headset, soporte: Wrench, comunicacion: MessagesSquare, acceso: ShieldCheck, 'cc-detalle': Eye,
}

type Seleccion = { tipo: string; id: number | string } | null

// Configuración → Usuarios y Seguridad → Grupos. Todos los grupos de usuarios
// de AGYDA, de distintos módulos, en un solo lugar: se consultan, se crean y
// se cambian sus miembros. Cada cambio se guarda en las mismas tablas de su
// módulo, así que se ve igual desde allá.
export function GruposTab() {
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const rol = (useAuthStore((s) => s.user?.tipoUsuario) ?? '').toUpperCase()
  const puedeEditar = ['AD', 'TI'].includes(rol) && can('usuarios', 'editar')

  const { data, isLoading } = useQuery({ queryKey: ['grupos-resumen'], queryFn: () => gruposService.resumen() })
  const segmentos = data?.segmentos ?? []
  const tipos = useMemo(() => data?.tipos ?? [], [data])
  const [segmento, setSegmento] = useState('equipos')
  const [sel, setSel] = useState<Seleccion>(null)
  const [creando, setCreando] = useState<string | null>(null)

  const tiposSeg = tipos.filter((t) => t.segmento === segmento)
  const tipoSel = sel ? tipos.find((t) => t.key === sel.tipo) ?? null : null
  const grupoSel = tipoSel?.grupos.find((g) => String(g.id) === String(sel?.id)) ?? null
  const inval = () => qc.invalidateQueries({ queryKey: ['grupos-resumen'] })

  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-start gap-3.5')}>
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><UsersRound className="h-5 w-5" /></div>
        <div>
          <h2 className="text-base font-bold text-ink">Grupos de usuarios</h2>
          <p className="mt-0.5 text-[0.8rem] text-ink-tertiary">
            Todos los grupos de AGYDA en un solo lugar: equipos y avisos, skills y supervisores del Contact Center, niveles de
            soporte, grupos de Mensajería y más. Lo que cambies aquí se aplica en su módulo.
          </p>
        </div>
      </div>

      {/* Segmentos */}
      <div className="flex flex-wrap gap-2">
        {segmentos.map((s) => {
          const Icon = ICONO_SEGMENTO[s.key] ?? UsersRound
          const n = tipos.filter((t) => t.segmento === s.key).reduce((acc, t) => acc + t.grupos.length, 0)
          return (
            <button key={s.key} onClick={() => { setSegmento(s.key); setSel(null); setCreando(null) }} title={s.descripcion}
              className={clsx('flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
                segmento === s.key ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-gray-100 bg-card text-ink-secondary hover:border-gray-200')}>
              <Icon className="h-4 w-4" /> {s.nombre}
              <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold', segmento === s.key ? 'bg-violet-100' : 'bg-gray-100 text-ink-tertiary')}>{n}</span>
            </button>
          )
        })}
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Tipos del segmento con sus grupos */}
          <div className="space-y-3">
            <p className="px-1 text-[0.75rem] text-ink-tertiary">{segmentos.find((s) => s.key === segmento)?.descripcion}</p>
            {tiposSeg.map((t) => (
              <div key={t.key} className={clsx(card, '!p-4')}>
                <div className="mb-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                      {t.nombre}
                      {!t.puedeEditarMiembros && <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.6rem] font-semibold text-ink-tertiary"><Eye className="h-3 w-3" /> Solo consulta</span>}
                      {t.unico && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-700" title="Un usuario solo puede estar en un grupo de este tipo"><ArrowRightLeft className="h-3 w-3" /> Uno por usuario</span>}
                    </p>
                    <p className="mt-0.5 text-[0.72rem] text-ink-tertiary">{t.descripcion}</p>
                  </div>
                  {puedeEditar && t.puedeCrear && (
                    <button onClick={() => setCreando(creando === t.key ? null : t.key)} title="Crear grupo"
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-violet-700">
                      <Plus className="h-3.5 w-3.5" /> Nuevo
                    </button>
                  )}
                </div>
                {creando === t.key && <CrearGrupo tipo={t} onCreado={(id) => { setCreando(null); inval(); setSel({ tipo: t.key, id }) }} onCancelar={() => setCreando(null)} />}
                {t.error ? <p className="text-xs text-red-500">No se pudo cargar este tipo de grupo.</p>
                  : t.grupos.length === 0 ? <p className="py-2 text-[0.75rem] text-ink-tertiary">Sin grupos todavía.</p> : (
                    <div className="space-y-1">
                      {t.grupos.map((g) => {
                        const activo = sel?.tipo === t.key && String(sel.id) === String(g.id)
                        return (
                          <button key={String(g.id)} onClick={() => setSel({ tipo: t.key, id: g.id })}
                            className={clsx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition', activo ? 'bg-violet-50' : 'hover:bg-gray-50')}>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 truncate text-[0.82rem] font-semibold text-ink">
                                {g.nombre} {g.sistema && <Lock className="h-3 w-3 flex-shrink-0 text-ink-tertiary" />}
                              </span>
                              {g.contexto && <span className="block truncate text-[0.66rem] text-ink-tertiary">{g.contexto}</span>}
                            </span>
                            <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold', g.miembros ? 'bg-violet-100 text-violet-700' : 'bg-amber-50 text-amber-600')}
                              title={g.miembros ? `${g.miembros} ${t.miembroLabel.toLowerCase()}` : 'Sin miembros'}>
                              {g.miembros}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                          </button>
                        )
                      })}
                    </div>
                  )}
              </div>
            ))}
          </div>

          {/* Detalle del grupo */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            {tipoSel && grupoSel ? (
              <DetalleGrupo key={`${tipoSel.key}-${grupoSel.id}`} tipo={tipoSel} grupo={grupoSel} puedeEditar={puedeEditar}
                onCambio={inval} onEliminado={() => { setSel(null); inval() }} />
            ) : (
              <div className={clsx(card, 'flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary')}>
                <UsersRound className="h-8 w-8 opacity-30" />
                <p className="text-sm">Elige un grupo para ver y administrar sus miembros.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CrearGrupo({ tipo, onCreado, onCancelar }: { tipo: TipoGrupo; onCreado: (id: number) => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [campaniaId, setCampaniaId] = useState<number | ''>('')
  const pideCampania = tipo.crearCampos.includes('campaniaId')
  const { data: opciones } = useQuery({ queryKey: ['grupos-opciones'], queryFn: () => gruposService.opciones(), enabled: pideCampania })

  const crear = useMutation({
    mutationFn: () => gruposService.crear(tipo.key, { nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, campaniaId: campaniaId || undefined }),
    onSuccess: (r) => { toast.success('Grupo creado'); onCreado(r.data.id) },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo crear')),
  })
  const listo = nombre.trim() && (!pideCampania || campaniaId)

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <input className={field} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del grupo" autoFocus />
      {pideCampania && (
        <select className={field} value={campaniaId} onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Campaña…</option>
          {(opciones?.campanias ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
      {tipo.crearCampos.includes('descripcion') && (
        <input className={field} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" />
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold text-ink-tertiary hover:bg-gray-100">Cancelar</button>
        <button onClick={() => crear.mutate()} disabled={!listo || crear.isPending}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {crear.isPending ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </div>
  )
}

function DetalleGrupo({ tipo, grupo, puedeEditar, onCambio, onEliminado }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; puedeEditar: boolean; onCambio: () => void; onEliminado: () => void
}) {
  const qc = useQueryClient()
  const editable = puedeEditar && tipo.puedeEditarMiembros
  const qk = ['grupos-miembros', tipo.key, String(grupo.id)]
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const eliminar = useMutation({
    mutationFn: () => gruposService.eliminar(tipo.key, grupo.id),
    onSuccess: () => { toast.success('Grupo eliminado'); onEliminado() },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo eliminar')),
  })

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">{tipo.nombre}</p>
        <div className="mt-0.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1.5 text-base font-bold text-ink">{grupo.nombre} {grupo.sistema && <Lock className="h-3.5 w-3.5 text-ink-tertiary" />}</h3>
            {grupo.contexto && <p className="text-[0.75rem] text-ink-tertiary">{grupo.contexto}</p>}
          </div>
          {puedeEditar && tipo.puedeEliminar && !grupo.sistema && (
            <button onClick={() => { if (tipo.conEnlaces) setConfirmarBorrado(true); else if (window.confirm(`¿Eliminar "${grupo.nombre}"?`)) eliminar.mutate() }} title="Eliminar grupo"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {grupo.descripcion && <p className="mt-2 text-[0.8rem] text-ink-secondary">{grupo.descripcion}</p>}
        {!tipo.puedeEditarMiembros && <p className="mt-2 text-[0.72rem] text-ink-tertiary">Se administra desde su propio módulo; aquí solo se consulta.</p>}
        {tipo.unico && editable && <p className="mt-2 text-[0.72rem] text-amber-600">Cada usuario está en un solo grupo de este tipo: si agregas a alguien que ya está en otro, se mueve aquí.</p>}
      </div>

      {tipo.conConfig && <ConfigGrupo tipo={tipo} grupo={grupo} editable={puedeEditar} onCambio={() => { qc.invalidateQueries({ queryKey: qk }); onCambio() }} />}

      <MiembrosGrupo tipo={tipo} grupo={grupo} puedeEditar={puedeEditar} onCambio={onCambio} />

      {confirmarBorrado && (
        <EliminarGrupoModal tipo={tipo} grupo={grupo} onClose={() => setConfirmarBorrado(false)}
          onEliminado={() => { setConfirmarBorrado(false); onEliminado() }} />
      )}

      {tipo.conClientes && <ClientesDelGrupo tipo={tipo} grupo={grupo} editable={puedeEditar} onCambio={onCambio} />}
    </div>
  )
}

type SeccionBorrar = keyof SeleccionBorrar
const SECCIONES_BORRAR: { key: SeccionBorrar; titulo: string; nota: string }[] = [
  { key: 'campanias', titulo: 'Campañas', nota: 'Se eliminan (sus datos e historial se conservan).' },
  { key: 'skills', titulo: 'Skills', nota: 'Se desactivan y sus agentes dejan de recibir sus conversaciones.' },
  { key: 'canales', titulo: 'Canales', nota: 'Se borran; los que tienen conversaciones solo se apagan.' },
  { key: 'formularios', titulo: 'Formularios', nota: 'Se archivan.' },
]

// Eliminar un grupo de Contact Center / atención: muestra lo enlazado y deja
// elegir qué borrar también (todo marcado por defecto). Agentes y supervisores
// nunca se borran: solo salen del grupo. Lo que usa otro grupo no se puede borrar aquí.
function EliminarGrupoModal({ tipo, grupo, onClose, onEliminado }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; onClose: () => void; onEliminado: () => void
}) {
  const qc = useQueryClient()
  const { data: enl, isLoading } = useQuery({ queryKey: ['grupos-enlaces', tipo.key, String(grupo.id)], queryFn: () => gruposService.enlaces(tipo.key, grupo.id) })
  // null = aún no se toca: todo lo que se puede borrar queda marcado.
  const [sel, setSel] = useState<SeleccionBorrar | null>(null)
  const libres = (k: SeccionBorrar) => (enl?.[k] ?? []).filter((x) => !x.bloqueado).map((x) => x.id)
  const actual: SeleccionBorrar = sel ?? { campanias: libres('campanias'), skills: libres('skills'), canales: libres('canales'), formularios: libres('formularios') }
  const total = Object.values(actual).reduce((n, l) => n + l.length, 0)
  const toggle = (k: SeccionBorrar, id: number) => setSel({ ...actual, [k]: actual[k].includes(id) ? actual[k].filter((x) => x !== id) : [...actual[k], id] })
  const todos = (marcar: boolean) => setSel(marcar
    ? { campanias: libres('campanias'), skills: libres('skills'), canales: libres('canales'), formularios: libres('formularios') }
    : { campanias: [], skills: [], canales: [], formularios: [] })

  const eliminar = useMutation({
    mutationFn: (conEnlazados: boolean) => gruposService.eliminar(tipo.key, grupo.id, conEnlazados ? actual : undefined),
    onSuccess: (r) => {
      const b = r.data?.borrado
      const partes = b ? [
        b.campanias ? `${b.campanias} campaña(s)` : '', b.skills ? `${b.skills} skill(s)` : '',
        (b.canalesBorrados || b.canalesApagados) ? `${(b.canalesBorrados || 0) + (b.canalesApagados || 0)} canal(es)` : '',
        b.formularios ? `${b.formularios} formulario(s)` : '',
      ].filter(Boolean) : []
      toast.success(partes.length ? `Grupo eliminado junto con ${partes.join(', ')}` : 'Grupo eliminado')
      ;['grupos-resumen', 'grupos-config', 'ccf-formularios', 'cc-campanias', 'cc-canales'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      onEliminado()
    },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo eliminar')),
  })
  const hayEnlazados = !!enl && SECCIONES_BORRAR.some(({ key }) => enl[key].length > 0)

  return (
    <Modal isOpen onClose={onClose} title={`Eliminar "${grupo.nombre}"`} size="lg" elevated>
      {isLoading || !enl ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div> : (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-[0.78rem] text-ink-secondary">
            <b>{enl.agentes} {tipo.miembroLabel.toLowerCase()}</b> y <b>{enl.supervisores} supervisor(es)</b> no se borran: solo salen del grupo
            (dejan sus skills y la supervisión){enl.clientes ? <>; sus <b>{enl.clientes} cliente(s)</b> quedan sin grupo</> : null}.
          </div>

          {hayEnlazados ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-ink">¿Qué más se borra con el grupo?</p>
                <div className="flex gap-3 text-[0.72rem] font-semibold">
                  <button onClick={() => todos(true)} className="text-violet-600 hover:underline">Marcar todo</button>
                  <button onClick={() => todos(false)} className="text-ink-tertiary hover:underline">Nada</button>
                </div>
              </div>
              <div className="max-h-[22rem] space-y-3 overflow-y-auto">
                {SECCIONES_BORRAR.filter(({ key }) => enl[key].length).map(({ key, titulo, nota }) => (
                  <div key={key}>
                    <p className="text-[0.75rem] font-bold text-ink">{titulo} <span className="font-normal text-ink-tertiary">— {nota}</span></p>
                    <div className="mt-1 space-y-1">
                      {enl[key].map((x) => (
                        <label key={x.id} className={clsx('flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[0.8rem]',
                          x.bloqueado ? 'border-gray-100 bg-gray-50 text-ink-tertiary' : actual[key].includes(x.id) ? 'border-red-200 bg-red-50/50' : 'border-gray-100',
                          !x.bloqueado && 'cursor-pointer')}>
                          <input type="checkbox" disabled={!!x.bloqueado} checked={!x.bloqueado && actual[key].includes(x.id)} onChange={() => toggle(key, x.id)} className="accent-red-600" />
                          <span className="min-w-0 flex-1 truncate">
                            {x.nombre}
                            {x.campania ? <span className="text-ink-tertiary"> · {x.campania}</span> : null}
                            {x.skill ? <span className="text-ink-tertiary"> · {x.skill}</span> : null}
                          </span>
                          {!!x.conversaciones && <span className="text-[0.62rem] text-amber-600">{x.conversaciones} conversación(es)</span>}
                          {x.bloqueado && <span className="text-[0.62rem] text-ink-tertiary">{x.bloqueado}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-[0.8rem] text-ink-tertiary">El grupo no tiene campañas, skills, canales ni formularios enlazados.</p>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-gray-100">Cancelar</button>
            {hayEnlazados && (
              <button onClick={() => eliminar.mutate(false)} disabled={eliminar.isPending}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-gray-50 disabled:opacity-50">
                Eliminar solo el grupo
              </button>
            )}
            <button onClick={() => eliminar.mutate(hayEnlazados)} disabled={eliminar.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {eliminar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {hayEnlazados && total ? `Eliminar grupo y ${total} enlazado(s)` : 'Eliminar grupo'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Agentes / asesores / miembros del grupo: buscar y agregar, quitar. Lo usan
// el detalle del grupo y el asistente "Crear grupo".
export function MiembrosGrupo({ tipo, grupo, puedeEditar, onCambio }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; puedeEditar: boolean; onCambio: () => void
}) {
  const qc = useQueryClient()
  const editable = puedeEditar && tipo.puedeEditarMiembros
  const qk = ['grupos-miembros', tipo.key, String(grupo.id)]
  const { data: miembros = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => gruposService.miembros(tipo.key, grupo.id) })
  const { data: opciones } = useQuery({ queryKey: ['grupos-opciones'], queryFn: () => gruposService.opciones(), enabled: editable })
  const [busca, setBusca] = useState('')
  const recargar = () => { qc.invalidateQueries({ queryKey: qk }); onCambio() }

  const candidatos = useMemo(() => {
    const ya = new Set(miembros.map((m) => m.usuarioId))
    const t = busca.trim().toLowerCase()
    return (opciones?.usuarios ?? []).filter((u) => !ya.has(u.id) && (!t || `${u.nombre} ${u.puesto ?? ''}`.toLowerCase().includes(t))).slice(0, 8)
  }, [opciones, miembros, busca])

  const agregar = useMutation({
    mutationFn: (usuarioId: number) => gruposService.agregarMiembros(tipo.key, grupo.id, [usuarioId]),
    onSuccess: () => { setBusca(''); recargar(); toast.success(tipo.unico ? 'Agregado (si estaba en otro grupo de este tipo, se movió)' : tipo.conConfig && tipo.key === 'cc-equipos' ? 'Agregado · ya tiene las campañas, skills y marcador del grupo' : 'Agregado') },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo agregar')),
  })
  const quitar = useMutation({
    mutationFn: (usuarioId: number) => gruposService.quitarMiembro(tipo.key, grupo.id, usuarioId),
    onSuccess: recargar,
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo quitar')),
  })

  return (
    <div className={card}>
      <p className="mb-3 text-sm font-bold text-ink">{tipo.key === 'cc-equipos' || tipo.key === 'atencion-clientes' ? '4. ' : ''}{tipo.miembroLabel} ({miembros.length})</p>
      {editable && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input className={clsx(field, 'pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un usuario para agregar…" />
          {busca.trim() && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
              {candidatos.length === 0 ? <p className="px-3 py-2.5 text-xs text-ink-tertiary">Sin resultados</p> : candidatos.map((u) => (
                <button key={u.id} onClick={() => agregar.mutate(u.id)} disabled={agregar.isPending}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-violet-50">
                  <UserPlus className="h-4 w-4 flex-shrink-0 text-violet-500" />
                  <span className="min-w-0 flex-1 truncate">{u.nombre}</span>
                  <span className="text-[0.65rem] text-ink-tertiary">{u.puesto || u.tipo}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
        : miembros.length === 0 ? <p className="py-4 text-center text-sm text-ink-tertiary">Este grupo no tiene {tipo.miembroLabel.toLowerCase()}.</p> : (
          <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
            {miembros.map((m) => (
              <div key={m.usuarioId} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
                <Avatar name={m.nombre} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{m.nombre}</p>
                  {m.extra && <p className="truncate text-[0.7rem] text-ink-tertiary">{m.extra}</p>}
                </div>
                {editable && (
                  <button onClick={() => quitar.mutate(m.usuarioId)} title="Quitar" disabled={quitar.isPending}
                    className="rounded-lg p-1.5 text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

const MODALIDADES: { key: ModalidadGrupo; nombre: string; desc: string; icon: typeof Headset }[] = [
  { key: 'omnicanal', nombre: 'Omnicanal', desc: 'Conversaciones de los canales de sus skills', icon: MessagesSquare },
  { key: 'marcador', nombre: 'Marcador', desc: 'Solo llamadas con el marcador', icon: Phone },
  { key: 'ambos', nombre: 'Ambos', desc: 'Conversaciones y marcador', icon: Headset },
]
const iguales = (a: number[], b: number[]) => [...a].sort().join() === [...b].sort().join()

// Configuración propia del grupo: equipos de Contact Center (todas sus
// asignaciones) o skills (sus canales).
export function ConfigGrupo({ tipo, grupo, editable, onCambio }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; editable: boolean; onCambio: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['grupos-config', tipo.key, String(grupo.id)],
    queryFn: () => gruposService.leerConfig(tipo.key, grupo.id),
  })
  if (isLoading || !data) return <div className={clsx(card, 'flex justify-center py-6')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
  const clave = JSON.stringify(data)
  return 'campanias' in data
    ? <FormEquipo key={clave} tipo={tipo} grupo={grupo} config={data as ConfigEquipo} editable={editable} onCambio={onCambio} />
    : <FormSkill key={clave} tipo={tipo} grupo={grupo} config={data as ConfigSkill} editable={editable} onCambio={onCambio} />
}

// Grupo de Contact Center, en orden: 1) campañas (con su formulario y link del
// marcador), 2) skills y forma de comunicación (marcador, campaña de ventas),
// 3) supervisores; los agentes van abajo (miembros). Al guardar se aplica a
// todos sus integrantes.
function Paso({ n, titulo, children, sub, accion }: { n: number; titulo: string; sub?: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <p className="flex flex-1 items-center gap-2 text-[0.85rem] font-bold text-ink">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[0.65rem] font-bold text-white">{n}</span> {titulo}
        </p>
        {accion}
      </div>
      {sub && <p className="mb-2 ml-7 mt-0.5 text-[0.7rem] text-ink-tertiary">{sub}</p>}
      <div className="ml-7 mt-2">{children}</div>
    </div>
  )
}

function FormEquipo({ tipo, grupo, config, editable, onCambio }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; config: ConfigEquipo; editable: boolean; onCambio: () => void
}) {
  // Grupo de atención a clientes: el mismo grupo, con asesores y clientes.
  const atencion = tipo.conClientes
  const gente = atencion ? 'asesores' : 'agentes'
  const qc = useQueryClient()
  const [campanias, setCampanias] = useState<{ id: number; formularioId: number | null }[]>(
    config.campanias.filter((c) => c.asignada).map((c) => ({ id: c.id, formularioId: c.formularioId })))
  const [modalidad, setModalidad] = useState<ModalidadGrupo>(config.modalidad)
  const [skillIds, setSkillIds] = useState<number[]>(config.skillIds)
  const [supervisores, setSupervisores] = useState(config.supervisores)
  const [vista, setVista] = useState<number | ''>(config.webphoneVistaId ?? '')
  const [ventas, setVentas] = useState<number | ''>(config.ventasCampanaId ?? '')
  const [busca, setBusca] = useState('')
  const [nuevoSkill, setNuevoSkill] = useState<{ campaniaId: number; nombre: string } | null>(null)
  // "Nuevo +" de campañas: el asistente de nueva campaña encima del grupo.
  const [asistente, setAsistente] = useState(false)
  // "Nuevo +" de skills: formulario rápido (campaña del grupo + nombre).
  const [skillRapido, setSkillRapido] = useState<{ campaniaId: number | ''; nombre: string } | null>(null)
  const { can } = useActionAccess()
  const puedeCrearCampania = editable && can('contact-center', 'gestionar-skills')
  const { data: opciones } = useQuery({ queryKey: ['grupos-opciones'], queryFn: () => gruposService.opciones(), enabled: editable })

  const campIds = campanias.map((c) => c.id)
  const usaSkills = modalidad !== 'marcador'
  const usaMarcador = modalidad !== 'omnicanal'
  const supIds = supervisores.map((s) => s.usuarioId)
  // Solo cuentan los skills de las campañas elegidas.
  const skillsValidos = skillIds.filter((s) => config.campanias.some((c) => campIds.includes(c.id) && c.skills.some((k) => k.id === s)))
  const cambio = JSON.stringify(campanias) !== JSON.stringify(config.campanias.filter((c) => c.asignada).map((c) => ({ id: c.id, formularioId: c.formularioId })))
    || modalidad !== config.modalidad || !iguales(skillsValidos, config.skillIds) || !iguales(supIds, config.supervisorIds)
    || (vista || null) !== config.webphoneVistaId || (ventas || null) !== config.ventasCampanaId
  const falta = !campanias.length ? 'Asigna al menos una campaña'
    : usaSkills && !skillsValidos.length ? 'Elige al menos un skill'
      : usaMarcador && !vista ? 'Elige el marcador' : null

  const textoBusca = busca.trim().toLowerCase()
  const candidatos = (opciones?.usuarios ?? [])
    .filter((u) => !supIds.includes(u.id) && (!textoBusca || u.nombre.toLowerCase().includes(textoBusca))).slice(0, 6)

  const recargar = () => { qc.invalidateQueries({ queryKey: ['grupos-config', tipo.key, String(grupo.id)] }); onCambio() }
  const guardar = useMutation({
    mutationFn: () => gruposService.guardarConfig(tipo.key, grupo.id, {
      campanias, modalidad, skillIds: usaSkills ? skillsValidos : [], supervisorIds: supIds,
      webphoneVistaId: usaMarcador ? Number(vista) || null : null, ventasCampanaId: Number(ventas) || null,
    }),
    onSuccess: (r) => {
      recargar()
      const d = r.data
      toast.success(`Aplicado: ${d.campanias ?? 0} campaña(s), ${d.skills ?? 0} skill(s), ${d.agentes ?? 0} agente(s), ${d.supervisores ?? 0} supervisor(es)${d.conMarcador ? ` · marcador a ${d.conMarcador}` : ''}`)
    },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo guardar')),
  })
  const crearSkill = useMutation({
    mutationFn: (s: { campaniaId: number; nombre: string }) => gruposService.crear('cc-skills', { nombre: s.nombre, campaniaId: s.campaniaId }),
    onSuccess: (r) => { setSkillIds((xs) => [...xs, r.data.id]); setNuevoSkill(null); setSkillRapido(null); qc.invalidateQueries({ queryKey: ['grupos-config', tipo.key, String(grupo.id)] }); toast.success('Skill creado (queda marcado)') },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo crear el skill')),
  })
  const toggleCampania = (id: number) => setCampanias((xs) => (xs.some((x) => x.id === id) ? xs.filter((x) => x.id !== id) : [...xs, { id, formularioId: null }]))
  const copiar = (ruta: string) => {
    const link = `${window.location.origin}${ruta}`
    navigator.clipboard?.writeText(link).then(() => toast.success('Link copiado')).catch(() => toast.error('No se pudo copiar'))
  }
  const chk = (marcado: boolean) => clsx('flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[0.8rem]', marcado ? 'border-violet-200 bg-violet-50/50' : 'border-gray-100', editable && 'cursor-pointer')
  const asignadas = config.campanias.filter((c) => campIds.includes(c.id))

  return (
    <div className={clsx(card, 'space-y-4')}>
      <div>
        <p className="text-sm font-bold text-ink">Asignaciones del grupo</p>
        <p className="mt-0.5 text-[0.72rem] text-ink-tertiary">Todo lo de aquí lo reciben automáticamente sus supervisores y {gente}; quien sale del grupo lo pierde.</p>
      </div>

      <Paso n={1} titulo={`Campañas (${campanias.length})`} sub="Sus supervisores supervisan estas campañas. Cada una da su link del marcador para este grupo."
        accion={puedeCrearCampania ? <button type="button" onClick={() => setAsistente(true)} title="Crear una campaña nueva"
          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white hover:bg-violet-700">
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button> : undefined}>
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {config.campanias.map((c) => {
            const marcado = campIds.includes(c.id)
            return (
              <label key={c.id} className={chk(marcado)}>
                <input type="checkbox" disabled={!editable} checked={marcado} className="accent-violet-600" onChange={() => toggleCampania(c.id)} />
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                <span className="text-[0.62rem] text-ink-tertiary">{c.skills.length} skill(s)</span>
                {c.otrosGrupos && <span className="text-[0.62rem] text-amber-600" title="La comparten: sus supervisores serán los de ambos grupos">también {c.otrosGrupos}</span>}
              </label>
            )
          })}
        </div>
      </Paso>

      <Paso n={2} titulo="Skills y comunicación" sub="Cómo trabaja el grupo: conversaciones de los canales de sus skills, marcador o ambos."
        accion={editable && asignadas.length ? <button type="button" onClick={() => setSkillRapido({ campaniaId: asignadas.length === 1 ? asignadas[0].id : '', nombre: '' })} title="Crear un skill nuevo"
          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white hover:bg-violet-700">
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button> : undefined}>
        {skillRapido && (
          <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-violet-100 bg-violet-50/40 p-2.5">
            <select className={clsx(field, '!w-auto !py-1.5')} value={skillRapido.campaniaId}
              onChange={(e) => setSkillRapido({ ...skillRapido, campaniaId: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Campaña…</option>
              {asignadas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <input className={clsx(field, 'min-w-[10rem] flex-1 !py-1.5')} autoFocus value={skillRapido.nombre} placeholder="Nombre del skill"
              onChange={(e) => setSkillRapido({ ...skillRapido, nombre: e.target.value })} />
            <button onClick={() => crearSkill.mutate({ campaniaId: Number(skillRapido.campaniaId), nombre: skillRapido.nombre.trim() })}
              disabled={!skillRapido.campaniaId || !skillRapido.nombre.trim() || crearSkill.isPending}
              className="rounded-lg bg-violet-600 px-3 text-[0.72rem] font-semibold text-white disabled:opacity-50">Crear</button>
            <button onClick={() => setSkillRapido(null)} className="rounded-lg px-2 text-ink-tertiary hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
        )}
        {!asignadas.length ? <p className="text-[0.72rem] text-ink-tertiary">Primero elige sus campañas.</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {MODALIDADES.map(({ key, nombre, desc, icon: Icon }) => (
                <button key={key} type="button" disabled={!editable} onClick={() => setModalidad(key)}
                  className={clsx('rounded-xl border p-2.5 text-left transition disabled:cursor-default',
                    modalidad === key ? 'border-violet-300 bg-violet-50' : 'border-gray-100 hover:border-gray-200')}>
                  <Icon className={clsx('mb-1 h-4 w-4', modalidad === key ? 'text-violet-600' : 'text-ink-tertiary')} />
                  <p className="text-[0.8rem] font-semibold text-ink">{nombre}</p>
                  <p className="text-[0.65rem] leading-tight text-ink-tertiary">{desc}</p>
                </button>
              ))}
            </div>

            {asignadas.map((c) => {
              const sel = campanias.find((x) => x.id === c.id)
              return (
                <div key={c.id} className="rounded-xl border border-gray-100 p-3">
                  <p className="mb-2 text-[0.8rem] font-bold text-ink">{c.nombre}</p>
                  {usaSkills && (
                    <div className="mb-2">
                      <p className="mb-1 text-[0.7rem] font-semibold text-ink-secondary">Skills</p>
                      {c.skills.length === 0 && <p className="text-[0.7rem] text-ink-tertiary">Esta campaña aún no tiene skills.</p>}
                      <div className="space-y-1">
                        {c.skills.map((s) => {
                          const marcado = skillIds.includes(s.id)
                          return (
                            <label key={s.id} className={chk(marcado)}>
                              <input type="checkbox" disabled={!editable} checked={marcado} className="accent-violet-600"
                                onChange={() => setSkillIds((xs) => (marcado ? xs.filter((x) => x !== s.id) : [...xs, s.id]))} />
                              <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                              <span className="text-[0.62rem] text-ink-tertiary">{s.canales} canal(es)</span>
                              {s.otrosGrupos && <span className="text-[0.62rem] text-amber-600">también {s.otrosGrupos}</span>}
                            </label>
                          )
                        })}
                      </div>
                      {editable && (nuevoSkill?.campaniaId === c.id ? (
                        <div className="mt-1.5 flex gap-2">
                          <input className={clsx(field, '!py-1.5')} autoFocus value={nuevoSkill.nombre} placeholder="Nombre del skill"
                            onChange={(e) => setNuevoSkill({ campaniaId: c.id, nombre: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && nuevoSkill.nombre.trim()) crearSkill.mutate({ campaniaId: c.id, nombre: nuevoSkill.nombre.trim() }) }} />
                          <button onClick={() => crearSkill.mutate({ campaniaId: c.id, nombre: nuevoSkill.nombre.trim() })} disabled={!nuevoSkill.nombre.trim() || crearSkill.isPending}
                            className="rounded-lg bg-violet-600 px-3 text-[0.72rem] font-semibold text-white disabled:opacity-50">Crear</button>
                          <button onClick={() => setNuevoSkill(null)} className="rounded-lg px-2 text-ink-tertiary hover:bg-gray-100"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setNuevoSkill({ campaniaId: c.id, nombre: '' })} className="mt-1.5 flex items-center gap-1 text-[0.7rem] font-semibold text-violet-600 hover:underline">
                          <Plus className="h-3 w-3" /> Nuevo skill en esta campaña
                        </button>
                      ))}
                    </div>
                  )}
                  {usaMarcador && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <label className="block">
                        <span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Formulario del marcador</span>
                        <select className={clsx(field, '!py-1.5')} disabled={!editable} value={sel?.formularioId ?? ''}
                          onChange={(e) => setCampanias((xs) => xs.map((x) => (x.id === c.id ? { ...x, formularioId: e.target.value ? Number(e.target.value) : null } : x)))}>
                          <option value="">El de la campaña</option>
                          {c.formularios.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                        {c.formularios.length === 0 && config.campaniaIds.includes(c.id) && <span className="text-[0.65rem] text-amber-600">La campaña no tiene formularios externos publicados.</span>}
                        {!config.campaniaIds.includes(c.id) && <span className="text-[0.65rem] text-ink-tertiary">Guarda para ver sus formularios.</span>}
                      </label>
                      <div>
                        <span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Link del marcador</span>
                        {c.linkMarcador ? (
                          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                            <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
                            <span className="min-w-0 flex-1 truncate font-mono text-[0.66rem] text-ink-secondary">{c.linkMarcador}</span>
                            <button onClick={() => copiar(c.linkMarcador!)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.66rem] font-semibold text-violet-600 hover:bg-violet-50">
                              <Copy className="h-3 w-3" /> Copiar
                            </button>
                          </div>
                        ) : <p className="text-[0.66rem] text-amber-600">La campaña no tiene URL del marcador (configúrala en su ficha).</p>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {usaMarcador && (
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Marcador (Webphone) de los agentes</span>
                  <select className={field} value={vista} disabled={!editable} onChange={(e) => setVista(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Elige el marcador…</option>
                    {config.vistas.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Campaña de ventas (opcional)</span>
                <select className={field} value={ventas} disabled={!editable} onChange={(e) => setVentas(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Sin campaña de ventas</option>
                  {config.campanasVentas.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
      </Paso>

      {asistente && (
        <Modal isOpen onClose={() => setAsistente(false)} title="Nueva campaña" size="full" elevated>
          <AsistenteCampania onSalir={() => { setAsistente(false); qc.invalidateQueries({ queryKey: ['grupos-config', tipo.key, String(grupo.id)] }); toast('Si creaste la campaña, ya puedes marcarla en el paso 1') }} />
        </Modal>
      )}

      <Paso n={3} titulo={`Supervisores (${supervisores.length})`} sub={atencion ? 'Supervisan sus campañas y skills, reciben los avisos de sus clientes y ven sus chats.' : 'Supervisan las campañas y los skills del grupo.'}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {supervisores.length === 0 && <span className="text-[0.72rem] text-ink-tertiary">Sin supervisor.</span>}
          {supervisores.map((s) => (
            <span key={s.usuarioId} className="flex items-center gap-1 rounded-full bg-violet-50 py-0.5 pl-2.5 pr-1 text-[0.72rem] font-semibold text-violet-700">
              {s.nombre}
              {editable && <button onClick={() => setSupervisores((xs) => xs.filter((x) => x.usuarioId !== s.usuarioId))} className="rounded-full p-0.5 hover:bg-violet-100"><X className="h-3 w-3" /></button>}
            </span>
          ))}
        </div>
        {editable && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input className={clsx(field, 'pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Agregar supervisor…" />
            {busca.trim() && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
                {candidatos.length === 0 ? <p className="px-3 py-2.5 text-xs text-ink-tertiary">Sin resultados</p> : candidatos.map((u) => (
                  <button key={u.id} onClick={() => { setSupervisores((xs) => [...xs, { usuarioId: u.id, nombre: u.nombre }]); setBusca('') }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-violet-50">
                    <UserPlus className="h-4 w-4 flex-shrink-0 text-violet-500" /> <span className="truncate">{u.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Paso>

      <p className="flex items-center gap-2 border-t border-gray-100 pt-4 text-[0.85rem] font-bold text-ink">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[0.65rem] font-bold text-white">4</span> {atencion ? 'Asesores' : 'Agentes'}
        <span className="text-[0.7rem] font-normal text-ink-tertiary">— se agregan abajo y reciben todo lo anterior al entrar.{atencion ? ' Después, en el paso 5, asigna sus clientes.' : ''}</span>
      </p>

      {editable && (
        <div className="flex items-center justify-end gap-3">
          {falta && <span className="text-[0.7rem] text-amber-600">{falta}</span>}
          <button onClick={() => guardar.mutate()} disabled={!cambio || !!falta || guardar.isPending}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {guardar.isPending ? 'Aplicando…' : 'Guardar y aplicar'}
          </button>
        </div>
      )}
    </div>
  )
}

// Skill: qué canales del omnicanal entran a él.
function FormSkill({ tipo, grupo, config, editable, onCambio }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; config: ConfigSkill; editable: boolean; onCambio: () => void
}) {
  const qc = useQueryClient()
  const [canalIds, setCanalIds] = useState<number[]>(config.canalIds)
  const guardar = useMutation({
    mutationFn: () => gruposService.guardarConfig(tipo.key, grupo.id, { canalIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos-config', tipo.key, String(grupo.id)] }); onCambio(); toast.success('Canales guardados') },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo guardar')),
  })

  return (
    <div className={card}>
      <p className="text-sm font-bold text-ink">Canales del skill ({canalIds.length})</p>
      <p className="mb-3 mt-0.5 text-[0.72rem] text-ink-tertiary">
        {config.equipos.length
          ? <>Lo controla el grupo <b>{config.equipos.map((e) => e.nombre).join(', ')}</b>: sus agentes y supervisores se cambian desde el grupo.</>
          : 'Las conversaciones de estos canales se rutean a los agentes del skill.'}
      </p>
      {config.canales.length === 0 ? <p className="text-[0.72rem] text-ink-tertiary">La campaña no tiene canales configurados.</p> : (
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {config.canales.map((c) => {
            const marcado = canalIds.includes(c.id)
            const deOtro = c.grupoId && c.grupoId !== config.id
            return (
              <label key={c.id} className={clsx('flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[0.8rem]', marcado ? 'border-violet-200 bg-violet-50/50' : 'border-gray-100', editable && 'cursor-pointer')}>
                <input type="checkbox" disabled={!editable} checked={marcado} className="accent-violet-600"
                  onChange={() => setCanalIds((xs) => (marcado ? xs.filter((x) => x !== c.id) : [...xs, c.id]))} />
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                <span className="text-[0.62rem] uppercase text-ink-tertiary">{c.tipo}</span>
                {!c.habilitado && <span className="text-[0.62rem] text-amber-600">apagado</span>}
                {deOtro && !marcado && <span className="text-[0.62rem] text-amber-600" title="Se moverá a este skill">en {c.grupoNombre}</span>}
              </label>
            )
          })}
        </div>
      )}
      {editable && (
        <div className="mt-4 flex justify-end">
          <button onClick={() => guardar.mutate()} disabled={iguales(canalIds, config.canalIds) || guardar.isPending}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}

// Clientes que atiende el grupo (grupos de atención a clientes). Cada cliente
// está en un solo grupo: asignarlo aquí lo mueve si ya tenía otro.
export function ClientesDelGrupo({ tipo, grupo, editable, onCambio }: {
  tipo: TipoGrupo; grupo: GrupoUsuarios; editable: boolean; onCambio: () => void
}) {
  const qc = useQueryClient()
  const qk = ['grupos-clientes', tipo.key, String(grupo.id)]
  const { data: clientes = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => gruposService.clientes(tipo.key, grupo.id) })
  const { data: opciones } = useQuery({ queryKey: ['grupos-opciones'], queryFn: () => gruposService.opciones(), enabled: editable })
  const [busca, setBusca] = useState('')
  const recargar = () => { qc.invalidateQueries({ queryKey: qk }); qc.invalidateQueries({ queryKey: ['grupos-opciones'] }); onCambio() }

  const candidatos = useMemo(() => {
    const ya = new Set(clientes.map((c) => c.clienteId))
    const t = busca.trim().toLowerCase()
    return (opciones?.clientes ?? []).filter((c) => !ya.has(c.id) && (!t || c.nombre.toLowerCase().includes(t))).slice(0, 8)
  }, [opciones, clientes, busca])

  const agregar = useMutation({
    mutationFn: (clienteId: number) => gruposService.agregarClientes(tipo.key, grupo.id, [clienteId]),
    onSuccess: () => { setBusca(''); recargar(); toast.success('Cliente asignado al grupo') },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo asignar')),
  })
  const quitar = useMutation({
    mutationFn: (clienteId: number) => gruposService.quitarCliente(tipo.key, grupo.id, clienteId),
    onSuccess: recargar,
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo quitar')),
  })

  return (
    <div className={card}>
      <p className="text-sm font-bold text-ink">5. Clientes que atiende ({clientes.length})</p>
      <p className="mb-3 mt-0.5 text-[0.72rem] text-ink-tertiary">
        Si un cliente tiene asesor individual, sigue hablando con él; si no, su portal chatea con todo este grupo.
      </p>
      {editable && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input className={clsx(field, 'pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un cliente para asignar…" />
          {busca.trim() && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
              {candidatos.length === 0 ? <p className="px-3 py-2.5 text-xs text-ink-tertiary">Sin resultados</p> : candidatos.map((c) => (
                <button key={c.id} onClick={() => agregar.mutate(c.id)} disabled={agregar.isPending}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-violet-50">
                  <Building2 className="h-4 w-4 flex-shrink-0 text-violet-500" />
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  {c.grupo && <span className="text-[0.65rem] text-amber-600" title="Se moverá a este grupo">en {c.grupo}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
        : clientes.length === 0 ? <p className="py-4 text-center text-sm text-ink-tertiary">Este grupo aún no atiende a ningún cliente.</p> : (
          <div className="max-h-[22rem] space-y-1.5 overflow-y-auto">
            {clientes.map((c) => (
              <div key={c.clienteId} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-500"><Building2 className="h-3.5 w-3.5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.nombre}</p>
                  {c.extra && <p className="truncate text-[0.7rem] text-ink-tertiary">{c.extra}</p>}
                </div>
                {editable && (
                  <button onClick={() => quitar.mutate(c.clienteId)} title="Quitar del grupo" disabled={quitar.isPending}
                    className="rounded-lg p-1.5 text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
