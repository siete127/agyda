import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, ArrowRight, Check, Building2, LayoutGrid, ShieldCheck, IdCard, Users, Rocket, X, Loader2,
  Plus, Trash2, Pencil, Upload, Download, UserPlus, Copy, AlertTriangle, KeyRound, ChevronDown,
} from 'lucide-react'
import {
  empresasAsistenteService as svc,
  type CatalogoAsistente, type EstadoEmpresa, type RolEmpresa, type PerfilEmpresa,
  type FilaImportar, type VistaPreviaImportar, type UsuarioCreado,
} from '@/services/empresasAsistente.service'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50 disabled:text-ink-tertiary'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
const btnPrim = 'flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50'
const btnSec = 'flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[0.8rem] font-semibold text-ink-secondary hover:bg-gray-50 disabled:opacity-50'
type ErrApi = { response?: { data?: { message?: string } } }
const msgError = (e: unknown, fallback: string) => (e as ErrApi)?.response?.data?.message ?? fallback

type Guardar = { current: (() => Promise<boolean>) | null }

// Asistente "Crear empresa" (tarjeta de la portada de Configuración y botón
// "Continuar" en Empresas). Crea la empresa y configura sus módulos, roles,
// perfiles y usuarios; cada paso guarda al avanzar y se puede retomar después.
// Solo lo ve quien tiene accesos/crear-empresas en Ardaby Tec.
export function AsistenteEmpresa({ empKeyInicial, onSalir }: { empKeyInicial?: string | null; onSalir: () => void }) {
  const qc = useQueryClient()
  const [empKey, setEmpKey] = useState<string | null>(empKeyInicial ?? null)
  const [paso, setPaso] = useState(0)
  const guardarRef = useRef<(() => Promise<boolean>) | null>(null) as Guardar
  const [cambiando, setCambiando] = useState(false)
  const pasoRestaurado = useRef(false)

  const { data: catalogo } = useQuery({ queryKey: ['empresa-asistente-catalogo'], queryFn: svc.catalogo, staleTime: 5 * 60_000 })
  const { data: estado, refetch } = useQuery({
    queryKey: ['empresa-asistente', empKey],
    queryFn: () => svc.estado(empKey!),
    enabled: !!empKey,
    // Mientras se prepara la BD (≈1 min) se consulta seguido.
    refetchInterval: (q) => (q.state.data?.preparacion.estado === 'listo' ? false : 2500),
  })
  const listo = estado?.preparacion.estado === 'listo'

  // Al retomar una empresa, volver al paso donde se quedó.
  useEffect(() => {
    if (pasoRestaurado.current || !estado) return
    pasoRestaurado.current = true
    if (empKeyInicial && estado.asistente?.paso) setPaso(Math.min(estado.asistente.paso, 5))
  }, [estado, empKeyInicial])

  const PASOS = [
    { key: 'empresa', titulo: 'Empresa', desc: 'Nombre y código', icon: Building2 },
    { key: 'modulos', titulo: 'Módulos', desc: 'Qué partes del sistema tendrá', icon: LayoutGrid },
    { key: 'roles', titulo: 'Roles', desc: 'Qué puede hacer cada tipo de usuario', icon: ShieldCheck },
    { key: 'perfiles', titulo: 'Perfiles', desc: 'Plantillas para dar de alta usuarios', icon: IdCard },
    { key: 'usuarios', titulo: 'Usuarios', desc: 'Administrador y equipo (o Excel)', icon: Users },
    { key: 'listo', titulo: 'Listo', desc: 'Resumen', icon: Rocket },
  ]
  const actual = PASOS[paso]
  const completos = new Set(estado?.asistente?.completos ?? [])
  const tieneAdmin = (estado?.usuarios ?? []).some((u) => u.tipo === 'AD')
  const completo: Record<string, boolean> = {
    empresa: !!empKey,
    modulos: completos.has('modulos'),
    roles: listo && (estado?.roles?.length ?? 0) > 0 && completos.has('modulos'),
    perfiles: (estado?.perfiles?.length ?? 0) > 0,
    usuarios: tieneAdmin,
    listo: !!estado?.asistente?.terminado,
  }
  // Roles, perfiles y usuarios viven en la BD de la empresa: esperan a que esté lista.
  const bloqueado = (i: number) => (i > 0 && !empKey) || (i >= 2 && !listo)

  const irA = async (i: number) => {
    if (i === paso || bloqueado(i)) return
    if (guardarRef.current) {
      setCambiando(true)
      const ok = await guardarRef.current().finally(() => setCambiando(false))
      if (!ok) return
    }
    guardarRef.current = null
    setPaso(i)
    if (empKey) svc.guardarAvance(empKey, { paso: i }).catch(() => { /* el avance es de conveniencia */ })
  }

  const recargar = () => { refetch(); qc.invalidateQueries({ queryKey: ['accesos-empresas'] }) }

  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={onSalir} title="Salir del asistente (se guarda lo avanzado)"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear empresa</p>
          <h2 className="truncate text-base font-bold text-ink">{estado?.empresa.nombre || 'Empresa nueva'}</h2>
        </div>
        {empKey && !listo && (
          <span className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[0.7rem] font-semibold text-amber-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando la base de datos…
          </span>
        )}
        <span className="flex-shrink-0 text-[0.72rem] text-ink-tertiary">Paso {paso + 1} de {PASOS.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <nav className={clsx(card, 'h-fit space-y-1 !p-3')}>
          {PASOS.map((p, i) => {
            const activo = i === paso
            const hecho = completo[p.key]
            return (
              <button key={p.key} disabled={bloqueado(i) || cambiando} onClick={() => irA(i)}
                className={clsx('flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                  activo ? 'bg-violet-50' : 'hover:bg-gray-50')}>
                <span className={clsx('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold',
                  hecho ? 'bg-emerald-500 text-white' : activo ? 'bg-violet-600 text-white' : 'bg-gray-100 text-ink-tertiary')}>
                  {hecho ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={clsx('block text-[0.8rem] font-semibold', activo ? 'text-violet-700' : 'text-ink')}>{p.titulo}</span>
                  <span className="block text-[0.66rem] leading-snug text-ink-tertiary">{p.desc}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2.5 px-1">
            <actual.icon className="h-5 w-5 text-violet-600" />
            <div>
              <p className="text-sm font-bold text-ink">{actual.titulo}</p>
              <p className="text-[0.72rem] text-ink-tertiary">{actual.desc}</p>
            </div>
          </div>

          {actual.key === 'empresa' && (
            <PasoEmpresa estado={estado ?? null} onCreada={(k) => { setEmpKey(k); setPaso(1); qc.invalidateQueries({ queryKey: ['accesos-empresas'] }) }} onContinuar={() => irA(1)} />
          )}
          {empKey && estado && catalogo && actual.key === 'modulos' && (
            <PasoModulos empKey={empKey} estado={estado} catalogo={catalogo} guardarRef={guardarRef} onGuardado={recargar} />
          )}
          {listo && estado && catalogo && actual.key === 'roles' && (
            <PasoRoles empKey={empKey!} estado={estado} catalogo={catalogo} onCambio={recargar} />
          )}
          {listo && estado && actual.key === 'perfiles' && (
            <PasoPerfiles empKey={empKey!} estado={estado} onCambio={recargar} />
          )}
          {listo && estado && actual.key === 'usuarios' && (
            <PasoUsuarios empKey={empKey!} estado={estado} onCambio={recargar} />
          )}
          {estado && actual.key === 'listo' && (
            <PasoListo empKey={empKey!} estado={estado} completo={completo} onTerminar={onSalir} />
          )}
          {empKey && !estado && actual.key !== 'empresa' && (
            <div className={clsx(card, 'flex justify-center py-8')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
          )}

          {paso > 0 && (
            <div className="flex justify-between">
              <button onClick={() => irA(paso - 1)} disabled={cambiando} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-gray-50">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </button>
              {paso < PASOS.length - 1 && (
                <button onClick={() => irA(paso + 1)} disabled={cambiando || bloqueado(paso + 1)} title={bloqueado(paso + 1) ? 'Espera a que termine de prepararse la base de datos' : undefined}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {cambiando ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <>Siguiente <ArrowRight className="h-4 w-4" /></>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────── Paso 1: Empresa ─────────────── */
function PasoEmpresa({ estado, onCreada, onContinuar }: { estado: EstadoEmpresa | null; onCreada: (key: string) => void; onContinuar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoEditado, setCodigoEditado] = useState(false)

  // Sugerir un código libre a partir del nombre (mientras no se edite a mano).
  useEffect(() => {
    if (estado || codigoEditado || !nombre.trim()) return
    const t = setTimeout(() => { svc.sugerirCodigo(nombre).then((r) => setCodigo(r.codigo)).catch(() => {}) }, 350)
    return () => clearTimeout(t)
  }, [nombre, codigoEditado, estado])

  const crear = useMutation({
    mutationFn: () => svc.crear(nombre.trim(), codigo.trim()),
    onSuccess: (r) => { toast.success('Empresa creada. Preparando su base de datos…'); onCreada(r.key) },
    onError: (e) => toast.error(msgError(e, 'No se pudo crear la empresa')),
  })

  if (estado) {
    return (
      <div className={clsx(card, 'space-y-3')}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Building2 className="h-5 w-5" /></div>
          <div>
            <p className="text-[0.95rem] font-bold text-ink">{estado.empresa.nombre}</p>
            <p className="text-[0.72rem] text-ink-tertiary">Código <b>{estado.empresa.key}</b> · base de datos intranet_{estado.empresa.key}</p>
          </div>
        </div>
        {estado.preparacion.estado !== 'listo' && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-800">
            <Loader2 className="h-4 w-4 animate-spin" /> Se está preparando la base de datos de la empresa (tarda cerca de un minuto). Mientras, puedes elegir sus módulos.
          </p>
        )}
        <div className="flex justify-end"><button onClick={onContinuar} className={btnPrim}>Continuar <ArrowRight className="h-4 w-4" /></button></div>
      </div>
    )
  }

  return (
    <div className={clsx(card, 'space-y-4')}>
      <label className="block">
        <span className={label}>Nombre de la empresa</span>
        <input className={field} value={nombre} autoFocus onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Fuzion Contact" />
      </label>
      <label className="block">
        <span className={label}>Código</span>
        <input className={clsx(field, 'font-mono')} value={codigo}
          onChange={(e) => { setCodigoEditado(true); setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')) }} placeholder="se genera del nombre" />
        <span className="mt-1 block text-[0.68rem] text-ink-tertiary">
          Identifica a la empresa en el sistema y en el nombre de su base de datos. Solo minúsculas, números y guion bajo; no se puede cambiar después.
        </span>
      </label>
      <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-[0.72rem] text-ink-secondary">
        Al crearla se genera su base de datos con los 6 roles de sistema (Administrador, Tecnología, Call Center, Staff, Ventas y Cliente). El administrador de la empresa lo das de alta en el paso de Usuarios.
      </div>
      <div className="flex justify-end">
        <button onClick={() => crear.mutate()} disabled={!nombre.trim() || codigo.length < 2 || crear.isPending} className={btnPrim}>
          {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Crear empresa y continuar
        </button>
      </div>
    </div>
  )
}

/* ─────────────── Paso 2: Módulos ─────────────── */
function PasoModulos({ empKey, estado, catalogo, guardarRef, onGuardado }: {
  empKey: string; estado: EstadoEmpresa; catalogo: CatalogoAsistente; guardarRef: Guardar; onGuardado: () => void
}) {
  const yaGuardados = (estado.asistente?.completos ?? []).includes('modulos')
  // Si aún no se eligieron, se propone la plantilla Contact Center.
  const inicial = yaGuardados && estado.modulos ? estado.modulos : (catalogo.plantillas.find((p) => p.key === 'contact-center')?.modulos ?? [])
  const [sel, setSel] = useState<Set<string>>(() => new Set(inicial))
  const [sucio, setSucio] = useState(!yaGuardados)
  const [copiarDe, setCopiarDe] = useState('')

  const guardar = useMutation({
    mutationFn: () => svc.guardarModulos(empKey, [...sel]),
    onSuccess: () => { setSucio(false); onGuardado() },
  })

  // Al avanzar se guardan los módulos si hubo cambios (o si nunca se guardaron).
  useEffect(() => {
    guardarRef.current = async () => {
      if (!sucio) return true
      if (sel.size === 0) { toast.error('Elige al menos un módulo'); return false }
      try { await guardar.mutateAsync(); toast.success('Módulos guardados'); return true } catch (e) { toast.error(msgError(e, 'No se pudieron guardar los módulos')); return false }
    }
    return () => { guardarRef.current = null }
  })

  const aplicar = (mods: string[]) => { setSel(new Set(mods)); setSucio(true) }
  const toggle = (k: string) => { setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n }); setSucio(true) }
  const otrasEmpresas = catalogo.empresas.filter((e) => e.key !== empKey)

  return (
    <div className="space-y-4">
      <div className={card}>
        <span className={label}>Empieza con una plantilla</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {catalogo.plantillas.map((p) => (
            <button key={p.key} onClick={() => aplicar(p.modulos)}
              className="rounded-xl border border-gray-100 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/40">
              <span className="block text-[0.85rem] font-semibold text-ink">{p.nombre}</span>
              <span className="block text-[0.68rem] leading-snug text-ink-tertiary">{p.descripcion}</span>
              <span className="mt-1.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[0.62rem] font-semibold text-ink-secondary">{p.modulos.length} módulos</span>
            </button>
          ))}
        </div>
        {otrasEmpresas.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Copy className="h-4 w-4 text-ink-tertiary" />
            <span className="text-[0.75rem] text-ink-secondary">O copia los módulos de otra empresa:</span>
            <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className="rounded-lg border border-gray-200 bg-card px-2 py-1 text-[0.78rem]">
              <option value="">Elegir…</option>
              {otrasEmpresas.map((e) => <option key={e.key} value={e.key}>{e.nombre} ({e.modulos.length})</option>)}
            </select>
            <button disabled={!copiarDe} onClick={() => { const e = otrasEmpresas.find((x) => x.key === copiarDe); if (e) aplicar(e.modulos) }} className={btnSec}>Copiar</button>
          </div>
        )}
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.8rem] font-semibold text-ink">{sel.size} de {catalogo.modulos.length} módulos activos</span>
          <span className={clsx('text-[0.7rem] font-semibold', sucio ? 'text-amber-600' : 'text-emerald-600')}>
            {sucio ? 'Se guardan al pulsar Siguiente' : 'Guardado'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {catalogo.modulos.map((m) => {
            const on = sel.has(m.key)
            return (
              <button key={m.key} onClick={() => toggle(m.key)} title={m.descripcion}
                className={clsx('flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition', on ? 'border-violet-200 bg-violet-50/60' : 'border-gray-100 hover:border-gray-200')}>
                <span className={clsx('mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', on ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300')}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.78rem] font-semibold text-ink">{m.nombre}</span>
                  <span className="block truncate text-[0.64rem] text-ink-tertiary">{m.descripcion}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[0.68rem] text-ink-tertiary">
          Los módulos que no marques quedan apagados para toda la empresa, igual que los que se agreguen al sistema en el futuro: se encienden aquí o en Empresas cuando se necesiten.
        </p>
      </div>
    </div>
  )
}

/* ─────────────── Paso 3: Roles ─────────────── */
function PasoRoles({ empKey, estado, catalogo, onCambio }: { empKey: string; estado: EstadoEmpresa; catalogo: CatalogoAsistente; onCambio: () => void }) {
  const [editando, setEditando] = useState<RolEmpresa | 'nuevo' | null>(null)
  const activos = new Set(estado.modulos ?? [])
  const eliminar = useMutation({
    mutationFn: (rolId: number) => svc.eliminarRol(empKey, rolId),
    onSuccess: () => { toast.success('Rol eliminado'); onCambio() },
    onError: (e) => toast.error(msgError(e, 'No se pudo eliminar el rol')),
  })

  if (editando) {
    return <RolEditor empKey={empKey} rol={editando === 'nuevo' ? null : editando} estado={estado} catalogo={catalogo}
      onListo={() => { setEditando(null); onCambio() }} onCancelar={() => setEditando(null)} />
  }

  return (
    <div className={clsx(card, 'space-y-3')}>
      <p className="text-[0.75rem] text-ink-secondary">
        Un rol define qué módulos y acciones tiene quien lo recibe. La empresa ya trae los roles de sistema; ajusta sus permisos o crea roles propios. Solo se guardan permisos de los módulos activos.
      </p>
      <div className="divide-y divide-gray-50 rounded-xl border border-gray-100">
        {(estado.roles ?? []).map((r) => {
          const mods = r.modulos.filter((m) => activos.has(m))
          return (
            <div key={r.rolId} className="flex items-center gap-3 px-3 py-2.5">
              <ShieldCheck className={clsx('h-4 w-4 flex-shrink-0', r.esSistema ? 'text-violet-500' : 'text-emerald-500')} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.82rem] font-semibold text-ink">{r.nombre} {r.esSistema && <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-ink-tertiary">sistema</span>}</p>
                <p className="truncate text-[0.68rem] text-ink-tertiary">{mods.length ? `${mods.length} módulo(s): ${mods.slice(0, 5).join(', ')}${mods.length > 5 ? '…' : ''}` : 'Sin módulos de esta empresa'}</p>
              </div>
              <button onClick={() => setEditando(r)} className={btnSec}><Pencil className="h-3.5 w-3.5" /> Permisos</button>
              {!r.esSistema && (
                <button onClick={() => eliminar.mutate(r.rolId)} title="Eliminar rol" className="rounded-lg p-2 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          )
        })}
      </div>
      <button onClick={() => setEditando('nuevo')} className={btnSec}><Plus className="h-3.5 w-3.5" /> Nuevo rol</button>
    </div>
  )
}

function RolEditor({ empKey, rol, estado, catalogo, onListo, onCancelar }: {
  empKey: string; rol: RolEmpresa | null; estado: EstadoEmpresa; catalogo: CatalogoAsistente; onListo: () => void; onCancelar: () => void
}) {
  const activos = catalogo.modulos.filter((m) => (estado.modulos ?? []).includes(m.key))
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [mods, setMods] = useState<Set<string>>(() => new Set((rol?.modulos ?? []).filter((m) => (estado.modulos ?? []).includes(m))))
  const [acciones, setAcciones] = useState<Record<string, string[]>>(() => ({ ...(rol?.acciones ?? {}) }))
  const [abierto, setAbierto] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: async () => {
      const d = { nombre: nombre.trim(), descripcion: descripcion.trim(), modulos: [...mods], acciones: Object.fromEntries(Object.entries(acciones).filter(([m]) => mods.has(m))) }
      if (rol) await svc.actualizarRol(empKey, rol.rolId, d)
      else await svc.crearRol(empKey, d)
    },
    onSuccess: () => { toast.success(rol ? 'Permisos guardados' : 'Rol creado'); onListo() },
    onError: (e) => toast.error(msgError(e, 'No se pudo guardar el rol')),
  })

  const toggleMod = (k: string) => setMods((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleAcc = (m: string, a: string) => setAcciones((s) => {
    const lista = new Set(s[m] ?? [])
    if (lista.has(a)) lista.delete(a); else lista.add(a)
    return { ...s, [m]: [...lista] }
  })

  return (
    <div className={clsx(card, 'space-y-4')}>
      <div className="flex items-center justify-between">
        <p className="text-[0.9rem] font-bold text-ink">{rol ? `Permisos de ${rol.nombre}` : 'Nuevo rol'}</p>
        <button onClick={onCancelar} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>
      {!rol?.esSistema && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Nombre</span><input className={field} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Supervisor" /></label>
          <label className="block"><span className={label}>Descripción (opcional)</span><input className={field} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
        </div>
      )}
      <div className="space-y-1.5">
        {activos.map((m) => {
          const on = mods.has(m.key)
          const lista = catalogo.acciones[m.key] ?? []
          const marcadas = acciones[m.key] ?? []
          return (
            <div key={m.key} className={clsx('rounded-xl border', on ? 'border-violet-200' : 'border-gray-100')}>
              <div className="flex items-center gap-2.5 px-3 py-2">
                <button onClick={() => toggleMod(m.key)} className={clsx('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', on ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300')}>
                  {on && <Check className="h-3 w-3" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8rem] font-semibold text-ink">{m.nombre}</span>
                  {on && lista.length > 0 && (
                    <span className="block text-[0.64rem] text-ink-tertiary">{marcadas.length ? `${marcadas.length} acción(es) específicas` : 'Todas las acciones del módulo'}</span>
                  )}
                </span>
                {on && lista.length > 0 && (
                  <button onClick={() => setAbierto(abierto === m.key ? null : m.key)} className="flex items-center gap-1 text-[0.7rem] font-semibold text-violet-600">
                    Acciones <ChevronDown className={clsx('h-3.5 w-3.5 transition', abierto === m.key && 'rotate-180')} />
                  </button>
                )}
              </div>
              {on && abierto === m.key && (
                <div className="grid grid-cols-1 gap-1 border-t border-gray-50 px-3 py-2 sm:grid-cols-2">
                  <p className="text-[0.64rem] text-ink-tertiary sm:col-span-2">Si no marcas ninguna, el rol puede hacer todo dentro de este módulo.</p>
                  {lista.map((a) => (
                    <label key={a.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-gray-50" title={a.descripcion}>
                      <input type="checkbox" checked={marcadas.includes(a.key)} onChange={() => toggleAcc(m.key, a.key)} className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-violet-600" />
                      <span className="text-[0.72rem] text-ink-secondary">{a.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {activos.length === 0 && <p className="text-[0.75rem] text-ink-tertiary">La empresa no tiene módulos activos. Vuelve al paso de Módulos.</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className={btnSec}>Cancelar</button>
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending || (!rol && !nombre.trim())} className={btnPrim}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar rol
        </button>
      </div>
    </div>
  )
}

/* ─────────────── Paso 4: Perfiles ─────────────── */
function PasoPerfiles({ empKey, estado, onCambio }: { empKey: string; estado: EstadoEmpresa; onCambio: () => void }) {
  const roles = estado.roles ?? []
  const vacio = { nombre: '', descripcion: '', rolId: null as number | null, puesto: '', departamento: '', idHorario: null as number | null }
  const [form, setForm] = useState(vacio)
  const [editId, setEditId] = useState<number | null>(null)
  const rolDeBase = (b: string) => roles.find((r) => r.esSistema && r.rolBase === b)?.rolId ?? null
  const sugerencias = [
    { nombre: 'Agente', descripcion: 'Agente de Call Center', rolId: rolDeBase('CC'), puesto: 'Agente' },
    { nombre: 'Administrador', descripcion: 'Administra la empresa', rolId: rolDeBase('AD'), puesto: 'Administrador' },
  ].filter((s) => s.rolId && !(estado.perfiles ?? []).some((p) => p.nombre.toLowerCase() === s.nombre.toLowerCase()))

  const guardar = useMutation({
    mutationFn: (d: typeof vacio) => svc.guardarPerfil(empKey, { ...d, rolId: d.rolId }, editId ?? undefined),
    onSuccess: () => { toast.success(editId ? 'Perfil actualizado' : 'Perfil creado'); setForm(vacio); setEditId(null); onCambio() },
    onError: (e) => toast.error(msgError(e, 'No se pudo guardar el perfil')),
  })
  const eliminar = useMutation({
    mutationFn: (id: number) => svc.eliminarPerfil(empKey, id),
    onSuccess: () => { toast.success('Perfil eliminado'); onCambio() },
    onError: (e) => toast.error(msgError(e, 'No se pudo eliminar el perfil')),
  })
  const editar = (p: PerfilEmpresa) => {
    setEditId(p.perfilId)
    setForm({ nombre: p.nombre, descripcion: p.descripcion ?? '', rolId: p.rolId, puesto: p.puesto ?? '', departamento: p.departamento ?? '', idHorario: p.idHorario })
  }

  return (
    <div className="space-y-4">
      <div className={clsx(card, 'space-y-3')}>
        <p className="text-[0.75rem] text-ink-secondary">
          Un perfil es la plantilla con la que se da de alta a un usuario: su rol (permisos), puesto, departamento y horario. En el paso de Usuarios y en el Excel solo eliges el perfil.
        </p>
        {sugerencias.length > 0 && !editId && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.72rem] text-ink-tertiary">Sugeridos:</span>
            {sugerencias.map((s) => (
              <button key={s.nombre} onClick={() => guardar.mutate({ ...vacio, ...s })} disabled={guardar.isPending} className={btnSec}>
                <Plus className="h-3.5 w-3.5" /> {s.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Nombre del perfil</span><input className={field} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Supervisor de turno" /></label>
          <label className="block"><span className={label}>Rol (permisos)</span>
            <select className={field} value={form.rolId ?? ''} onChange={(e) => setForm({ ...form, rolId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Elegir…</option>
              {roles.map((r) => <option key={r.rolId} value={r.rolId}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="block"><span className={label}>Puesto (opcional)</span><input className={field} value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} /></label>
          <label className="block"><span className={label}>Departamento (opcional)</span><input className={field} value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} /></label>
          {(estado.horarios ?? []).length > 0 && (
            <label className="block"><span className={label}>Horario (opcional)</span>
              <select className={field} value={form.idHorario ?? ''} onChange={(e) => setForm({ ...form, idHorario: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sin horario</option>
                {(estado.horarios ?? []).map((h) => <option key={h.id} value={h.id}>{h.horario} ({h.nomenclatura})</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {editId && <button onClick={() => { setEditId(null); setForm(vacio) }} className={btnSec}>Cancelar</button>}
          <button onClick={() => guardar.mutate(form)} disabled={!form.nombre.trim() || !form.rolId || guardar.isPending} className={btnPrim}>
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {editId ? 'Guardar cambios' : 'Agregar perfil'}
          </button>
        </div>
      </div>

      {(estado.perfiles ?? []).length > 0 && (
        <div className={clsx(card, 'divide-y divide-gray-50 !p-0')}>
          {(estado.perfiles ?? []).map((p) => (
            <div key={p.perfilId} className="flex items-center gap-3 px-4 py-2.5">
              <IdCard className="h-4 w-4 flex-shrink-0 text-violet-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.82rem] font-semibold text-ink">{p.nombre}</p>
                <p className="truncate text-[0.68rem] text-ink-tertiary">Rol {p.rolNombre ?? '—'}{p.puesto ? ` · ${p.puesto}` : ''}{p.departamento ? ` · ${p.departamento}` : ''}</p>
              </div>
              <button onClick={() => editar(p)} className="rounded-lg p-2 text-ink-tertiary hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => eliminar.mutate(p.perfilId)} className="rounded-lg p-2 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────── Paso 5: Usuarios ─────────────── */
function descargarCredenciales(creados: UsuarioCreado[], empresa: string) {
  const ws = XLSX.utils.json_to_sheet(creados.map((c) => ({
    Nombre: c.nombre, Usuario: c.usuario, 'Contraseña temporal': c.contraTemporal ?? '(la que se escribió)', Perfil: c.perfil ?? '',
  })))
  ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Credenciales')
  XLSX.writeFile(wb, `credenciales_${empresa}.xlsx`)
}

function Credenciales({ creados, empresa, onCerrar }: { creados: UsuarioCreado[]; empresa: string; onCerrar: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.82rem] font-bold text-emerald-800"><KeyRound className="h-4 w-4" /> {creados.length} usuario(s) creado(s)</p>
        <div className="flex gap-2">
          <button onClick={() => descargarCredenciales(creados, empresa)} className={btnSec}><Download className="h-3.5 w-3.5" /> Descargar credenciales</button>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="mb-2 text-[0.7rem] text-emerald-700">Las contraseñas temporales solo se muestran ahora. Al entrar por primera vez, cada usuario debe cambiarla.</p>
      <div className="max-h-56 overflow-y-auto rounded-xl bg-card">
        <table className="w-full text-[0.75rem]">
          <tbody className="divide-y divide-gray-50">
            {creados.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-1.5 font-medium text-ink">{c.nombre}</td>
                <td className="px-3 py-1.5 font-mono text-ink-secondary">{c.usuario}</td>
                <td className="px-3 py-1.5 font-mono text-ink">{c.contraTemporal ?? '—'}</td>
                <td className="px-3 py-1.5 text-ink-tertiary">{c.perfil ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PasoUsuarios({ empKey, estado, onCambio }: { empKey: string; estado: EstadoEmpresa; onCambio: () => void }) {
  const [creados, setCreados] = useState<UsuarioCreado[]>([])
  const perfiles = estado.perfiles ?? []
  const admins = (estado.usuarios ?? []).filter((u) => u.tipo === 'AD')
  const rolAdmin = (estado.roles ?? []).find((r) => r.esSistema && r.rolBase === 'AD')
  const [admin, setAdmin] = useState({ nombres: '', usuario: '', correo: '', contra: '' })
  const [nuevo, setNuevo] = useState({ nombres: '', usuario: '', correo: '', perfilId: '' })

  const agregarCreado = (u: UsuarioCreado) => setCreados((c) => [u, ...c])

  const crearAdmin = useMutation({
    mutationFn: () => svc.crearUsuario(empKey, { nombres: admin.nombres, usuario: admin.usuario, correo: admin.correo || undefined, contra: admin.contra || undefined, rolId: rolAdmin?.rolId }),
    onSuccess: (u) => { agregarCreado(u); setAdmin({ nombres: '', usuario: '', correo: '', contra: '' }); onCambio(); toast.success('Administrador creado') },
    onError: (e) => toast.error(msgError(e, 'No se pudo crear el administrador')),
  })
  const crearUno = useMutation({
    mutationFn: () => svc.crearUsuario(empKey, { nombres: nuevo.nombres, usuario: nuevo.usuario, correo: nuevo.correo || undefined, perfilId: Number(nuevo.perfilId) }),
    onSuccess: (u) => { agregarCreado(u); setNuevo({ nombres: '', usuario: '', correo: '', perfilId: nuevo.perfilId }); onCambio(); toast.success('Usuario creado') },
    onError: (e) => toast.error(msgError(e, 'No se pudo crear el usuario')),
  })

  return (
    <div className="space-y-4">
      {creados.length > 0 && <Credenciales creados={creados} empresa={estado.empresa.key} onCerrar={() => setCreados([])} />}

      {/* Primer administrador */}
      <div className={clsx(card, 'space-y-3')}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-600" />
          <p className="text-[0.85rem] font-bold text-ink">Administrador de la empresa</p>
          {admins.length > 0
            ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">{admins.map((a) => a.usuario).join(', ')}</span>
            : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">Obligatorio</span>}
        </div>
        <p className="text-[0.72rem] text-ink-tertiary">Quien administra la empresa desde dentro (sus usuarios, accesos y configuración). Recibe el rol Administrador.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className={field} placeholder="Nombre completo" value={admin.nombres} onChange={(e) => setAdmin({ ...admin, nombres: e.target.value })} />
          <input className={field} placeholder="Usuario (para iniciar sesión)" value={admin.usuario} onChange={(e) => setAdmin({ ...admin, usuario: e.target.value.trim() })} />
          <input className={field} placeholder="Correo (opcional)" value={admin.correo} onChange={(e) => setAdmin({ ...admin, correo: e.target.value })} />
          <input className={field} placeholder="Contraseña (vacío = se genera una temporal)" value={admin.contra} onChange={(e) => setAdmin({ ...admin, contra: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <button onClick={() => crearAdmin.mutate()} disabled={!admin.nombres.trim() || !admin.usuario || !rolAdmin || crearAdmin.isPending} className={btnPrim}>
            {crearAdmin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {admins.length ? 'Agregar otro administrador' : 'Crear administrador'}
          </button>
        </div>
      </div>

      {/* Usuario por usuario */}
      <div className={clsx(card, 'space-y-3')}>
        <p className="flex items-center gap-2 text-[0.85rem] font-bold text-ink"><UserPlus className="h-4 w-4 text-violet-600" /> Agregar un usuario</p>
        {perfiles.length === 0 ? (
          <p className="text-[0.75rem] text-amber-700">Primero crea al menos un perfil en el paso anterior.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input className={clsx(field, 'sm:col-span-2')} placeholder="Nombre completo" value={nuevo.nombres} onChange={(e) => setNuevo({ ...nuevo, nombres: e.target.value })} />
              <input className={field} placeholder="Usuario" value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value.trim() })} />
              <select className={field} value={nuevo.perfilId} onChange={(e) => setNuevo({ ...nuevo, perfilId: e.target.value })}>
                <option value="">Perfil…</option>
                {perfiles.map((p) => <option key={p.perfilId} value={p.perfilId}>{p.nombre}</option>)}
              </select>
              <input className={clsx(field, 'sm:col-span-2')} placeholder="Correo (opcional)" value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <button onClick={() => crearUno.mutate()} disabled={!nuevo.nombres.trim() || !nuevo.usuario || !nuevo.perfilId || crearUno.isPending} className={btnPrim}>
                {crearUno.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
              </button>
            </div>
          </>
        )}
      </div>

      {/* Excel */}
      {perfiles.length > 0 && <ImportarExcel empKey={empKey} estado={estado} onCreados={(lista) => { setCreados((c) => [...lista, ...c]); onCambio() }} />}

      {(estado.usuarios ?? []).length > 0 && (
        <div className={clsx(card, '!p-0')}>
          <p className="border-b border-gray-50 px-4 py-2.5 text-[0.78rem] font-semibold text-ink">{estado.usuarios!.length} usuario(s) en la empresa</p>
          <div className="max-h-64 divide-y divide-gray-50 overflow-y-auto">
            {estado.usuarios!.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2 text-[0.75rem]">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{u.nombre}</span>
                <span className="font-mono text-ink-tertiary">{u.usuario}</span>
                <span className="w-10 rounded-full bg-gray-100 px-1.5 py-0.5 text-center text-[0.62rem] font-semibold text-ink-secondary">{u.tipo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Encabezados aceptados en el Excel (sin acentos, minúsculas).
const COLUMNAS: Record<string, keyof FilaImportar> = {
  nombre: 'nombres', nombres: 'nombres', 'nombre completo': 'nombres',
  usuario: 'usuario', user: 'usuario',
  correo: 'correo', email: 'correo', 'correo electronico': 'correo',
  perfil: 'perfil',
  contrasena: 'contra', password: 'contra',
}
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function ImportarExcel({ empKey, estado, onCreados }: { empKey: string; estado: EstadoEmpresa; onCreados: (c: UsuarioCreado[]) => void }) {
  const [filas, setFilas] = useState<FilaImportar[] | null>(null)
  const [archivo, setArchivo] = useState('')
  const [vista, setVista] = useState<VistaPreviaImportar | null>(null)
  const [soloErrores, setSoloErrores] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const perfiles = estado.perfiles ?? []

  const plantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Usuario', 'Correo', 'Perfil'],
      ['Ana López Pérez', 'alopez', 'ana@empresa.com', perfiles[0]?.nombre ?? 'Agente'],
    ])
    ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 20 }]
    const wsP = XLSX.utils.aoa_to_sheet([['Perfiles disponibles'], ...perfiles.map((p) => [p.nombre])])
    wsP['!cols'] = [{ wch: 28 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')
    XLSX.utils.book_append_sheet(wb, wsP, 'Perfiles')
    XLSX.writeFile(wb, `plantilla_usuarios_${estado.empresa.key}.xlsx`)
  }

  const revisar = useMutation({
    mutationFn: (f: FilaImportar[]) => svc.revisarImportacion(empKey, f),
    onSuccess: setVista,
    onError: (e) => toast.error(msgError(e, 'No se pudo revisar el archivo')),
  })
  const confirmar = useMutation({
    mutationFn: () => svc.confirmarImportacion(empKey, filas!),
    onSuccess: (r) => {
      onCreados(r.creados)
      toast.success(`${r.creados.length} usuario(s) creados${r.omitidos ? ` · ${r.omitidos} con error se omitieron` : ''}`)
      if (r.fallidos.length) toast.error(`${r.fallidos.length} no se pudieron crear: ${r.fallidos.map((f) => f.usuario).join(', ')}`)
      setFilas(null); setVista(null); setArchivo('')
    },
    onError: (e) => toast.error(msgError(e, 'No se pudo importar')),
  })

  const leer = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const hoja = wb.Sheets[wb.SheetNames[0]]
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' })
      const convertidas = crudas.map((r) => {
        const f: FilaImportar = { nombres: '', usuario: '' }
        for (const [k, v] of Object.entries(r)) {
          const campo = COLUMNAS[normal(k)]
          if (campo) f[campo] = String(v ?? '').trim()
        }
        return f
      }).filter((f) => f.nombres || f.usuario)
      if (!convertidas.length) { toast.error('No se encontraron filas. Usa la plantilla: Nombre, Usuario, Correo, Perfil'); return }
      setArchivo(file.name)
      setFilas(convertidas)
      setVista(null)
      revisar.mutate(convertidas)
    } catch {
      toast.error('No se pudo leer el archivo. Debe ser Excel (.xlsx) o CSV')
    }
  }

  const visibles = vista ? vista.filas.filter((f) => !soloErrores || f.errores.length) : []

  return (
    <div className={clsx(card, 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[0.85rem] font-bold text-ink"><Upload className="h-4 w-4 text-violet-600" /> Importar usuarios desde Excel</p>
        <button onClick={plantilla} className={btnSec}><Download className="h-3.5 w-3.5" /> Descargar plantilla</button>
      </div>
      <p className="text-[0.72rem] text-ink-tertiary">
        Llena la plantilla con una fila por persona (Nombre, Usuario, Correo y Perfil) y súbela. Antes de crear nada se revisa cada fila y se marcan los errores; a cada usuario se le genera una contraseña temporal.
      </p>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = '' }} />
      <button onClick={() => input.current?.click()} disabled={revisar.isPending || confirmar.isPending}
        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-center transition hover:border-violet-300 hover:bg-violet-50/30">
        {revisar.isPending ? <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> : <Upload className="h-5 w-5 text-ink-tertiary" />}
        <span className="text-[0.8rem] font-semibold text-ink">{archivo || 'Elegir archivo'}</span>
        <span className="text-[0.66rem] text-ink-tertiary">.xlsx, .xls o .csv · máximo 1000 filas</span>
      </button>

      {vista && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem]">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-ink-secondary">{vista.total} filas</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{vista.validas} listas</span>
            {vista.conError > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-600">{vista.conError} con error</span>}
            {vista.conError > 0 && (
              <label className="ml-auto flex items-center gap-1.5 text-ink-secondary">
                <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" /> Ver solo errores
              </label>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100">
            <table className="w-full text-[0.72rem]">
              <thead className="sticky top-0 bg-gray-50 text-left text-[0.64rem] font-semibold uppercase text-ink-tertiary">
                <tr><th className="px-2 py-1.5">Fila</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Usuario</th><th className="px-2 py-1.5">Perfil</th><th className="px-2 py-1.5">Estado</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibles.map((f) => (
                  <tr key={f.fila} className={f.errores.length ? 'bg-red-50/40' : ''}>
                    <td className="px-2 py-1.5 text-ink-tertiary">{f.fila}</td>
                    <td className="px-2 py-1.5 text-ink">{f.nombres || '—'}</td>
                    <td className="px-2 py-1.5 font-mono text-ink-secondary">{f.usuario || '—'}</td>
                    <td className="px-2 py-1.5 text-ink-secondary">{f.perfil ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      {f.errores.length
                        ? <span className="flex items-start gap-1 text-red-600"><AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" /> {f.errores.join(' · ')}</span>
                        : <span className="text-emerald-600">Lista</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setFilas(null); setVista(null); setArchivo('') }} className={btnSec}>Descartar</button>
            <button onClick={() => confirmar.mutate()} disabled={!vista.validas || confirmar.isPending} className={btnPrim}>
              {confirmar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Crear {vista.validas} usuario(s){vista.conError ? ` (se omiten ${vista.conError})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────── Paso 6: Listo ─────────────── */
function PasoListo({ empKey, estado, completo, onTerminar }: { empKey: string; estado: EstadoEmpresa; completo: Record<string, boolean>; onTerminar: () => void }) {
  const qc = useQueryClient()
  const terminar = useMutation({
    mutationFn: () => svc.guardarAvance(empKey, { terminado: true, completos: ['listo'] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accesos-empresas'] }); toast.success('Empresa lista'); onTerminar() },
    onError: (e) => toast.error(msgError(e, 'No se pudo terminar')),
  })
  const resumen = useMemo(() => [
    { key: 'modulos', texto: `${estado.modulos?.length ?? 0} módulos activos` },
    { key: 'roles', texto: `${estado.roles?.length ?? 0} roles` },
    { key: 'perfiles', texto: `${estado.perfiles?.length ?? 0} perfiles` },
    { key: 'usuarios', texto: `${estado.usuarios?.length ?? 0} usuarios (${(estado.usuarios ?? []).filter((u) => u.tipo === 'AD').length} administrador)` },
  ], [estado])

  return (
    <div className={clsx(card, 'space-y-4')}>
      <div>
        <p className="text-base font-bold text-ink">{estado.empresa.nombre}</p>
        <p className="text-[0.75rem] text-ink-tertiary">Código {estado.empresa.key}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {resumen.map((r) => (
          <div key={r.key} className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.78rem]',
            completo[r.key] ? 'border-emerald-100 bg-emerald-50/60 text-emerald-700' : 'border-amber-100 bg-amber-50/60 text-amber-700')}>
            {completo[r.key] ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {r.texto}
          </div>
        ))}
      </div>
      {!completo.usuarios && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-800">Falta el administrador de la empresa: sin él nadie de la empresa puede administrarla.</p>
      )}
      <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-ink-secondary">
        <p>Para entrar, en el inicio de sesión se elige la empresa <b>{estado.empresa.nombre}</b>. Los usuarios entran con la contraseña temporal y el sistema les pide cambiarla.</p>
        <p className="mt-1">Los módulos se pueden cambiar después en Configuración → Empresas. Los permisos finos por usuario, la marca (logo y colores), los datos fiscales y el correo se ajustan dentro de la empresa, en su Configuración.</p>
      </div>
      <div className="flex justify-end">
        <button onClick={() => terminar.mutate()} disabled={terminar.isPending} className={btnPrim}>
          {terminar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Terminar
        </button>
      </div>
    </div>
  )
}
