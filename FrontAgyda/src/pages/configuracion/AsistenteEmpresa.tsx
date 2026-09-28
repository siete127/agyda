import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, ArrowRight, Check, Building2, LayoutGrid, ShieldCheck, IdCard, Users, Rocket, X, Loader2,
  Plus, Trash2, Pencil, Upload, Download, UserPlus, Copy, AlertTriangle, KeyRound, ChevronDown, CloudCheck,
  CircleDashed, RotateCcw, FileClock,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  empresasAsistenteService as svc,
  type CatalogoAsistente, type DatosBorrador, type RolBorrador, type PerfilBorrador, type UsuarioBorrador,
  type Pendiente, type Borrador, type BorradorResumen, type CredencialCreada,
} from '@/services/empresasAsistente.service'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50 disabled:text-ink-tertiary'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
const btnPrim = 'flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50'
const btnSec = 'flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[0.8rem] font-semibold text-ink-secondary hover:bg-gray-50 disabled:opacity-50'
type ErrApi = { response?: { data?: { message?: string; pendientes?: Pendiente[] } } }
const msgError = (e: unknown, fallback: string) => (e as ErrApi)?.response?.data?.message ?? fallback
const nuevaKey = (pref: string) => `${pref}:${Math.random().toString(36).slice(2, 10)}`

const PASOS = [
  { key: 'empresa', titulo: 'Empresa', desc: 'Nombre y código', icon: Building2 },
  { key: 'modulos', titulo: 'Módulos', desc: 'Qué partes del sistema tendrá', icon: LayoutGrid },
  { key: 'roles', titulo: 'Roles', desc: 'Qué puede hacer cada tipo de usuario', icon: ShieldCheck },
  { key: 'perfiles', titulo: 'Perfiles', desc: 'Plantillas para dar de alta usuarios', icon: IdCard },
  { key: 'usuarios', titulo: 'Usuarios', desc: 'Administrador y equipo (o Excel)', icon: Users },
  { key: 'revisar', titulo: 'Revisar y crear', desc: 'Todo se crea al final', icon: Rocket },
] as const

// ── Validaciones (mismas reglas que el backend, que es el que decide) ──
const USUARIO_RE = /^[A-Za-z0-9._-]{3,50}$/
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function errorPassword(p: string): string | null {
  if (p.length < 10) return 'Mínimo 10 caracteres'
  if (!/[A-Z]/.test(p)) return 'Falta una mayúscula'
  if (!/[a-z]/.test(p)) return 'Falta una minúscula'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Falta un carácter especial'
  for (let i = 0; i + 2 < p.length; i++) {
    const [a, b, c] = [p[i], p[i + 1], p[i + 2]]
    if (!/\d/.test(a) || !/\d/.test(b) || !/\d/.test(c)) continue
    const [x, y, z] = [Number(a), Number(b), Number(c)]
    if ((y === x + 1 && z === y + 1) || (y === x - 1 && z === y - 1) || (x === y && y === z)) return 'Sin 3 números seguidos o repetidos'
  }
  return null
}
function erroresUsuario(u: UsuarioBorrador, datos: DatosBorrador, repetido: boolean): string[] {
  const e: string[] = []
  if (!u.nombres.trim()) e.push('Falta el nombre')
  if (!USUARIO_RE.test(u.usuario.trim())) e.push('Usuario inválido')
  else if (repetido) e.push('Usuario repetido')
  if (u.correo && !CORREO_RE.test(u.correo.trim())) e.push('Correo inválido')
  if (!u.esAdmin && !datos.perfiles.some((p) => p.key === u.perfilKey)) e.push('Sin perfil')
  if (u.contra) { const ep = errorPassword(u.contra); if (ep) e.push(`Contraseña: ${ep}`) }
  return e
}
function repetidos(usuarios: UsuarioBorrador[]): Set<string> {
  const vistos = new Set<string>(); const rep = new Set<string>()
  for (const u of usuarios) { const k = u.usuario.trim().toLowerCase(); if (vistos.has(k)) rep.add(u.key); vistos.add(k) }
  return rep
}
function pendientesDe(d: DatosBorrador): Pendiente[] {
  const p: Pendiente[] = []
  if (!d.empresa.nombre.trim()) p.push({ paso: 'empresa', texto: 'Falta el nombre de la empresa' })
  if (d.empresa.codigo.trim().length < 2) p.push({ paso: 'empresa', texto: 'Falta el código de la empresa' })
  if (!d.modulos.length) p.push({ paso: 'modulos', texto: 'Elige al menos un módulo' })
  const nombresRol = new Set<string>()
  for (const r of d.roles) {
    const n = r.nombre.trim().toLowerCase()
    if (!n) p.push({ paso: 'roles', texto: 'Hay un rol sin nombre' })
    else if (nombresRol.has(n)) p.push({ paso: 'roles', texto: `El rol "${r.nombre}" está repetido` })
    nombresRol.add(n)
  }
  const nombresPerfil = new Set<string>()
  for (const x of d.perfiles) {
    const n = x.nombre.trim().toLowerCase()
    if (!n) p.push({ paso: 'perfiles', texto: 'Hay un perfil sin nombre' })
    else if (nombresPerfil.has(n)) p.push({ paso: 'perfiles', texto: `El perfil "${x.nombre}" está repetido` })
    nombresPerfil.add(n)
    if (!d.roles.some((r) => r.key === x.rolKey)) p.push({ paso: 'perfiles', texto: `El perfil "${x.nombre || '(sin nombre)'}" no tiene rol` })
  }
  if (!d.usuarios.some((u) => u.esAdmin)) p.push({ paso: 'usuarios', texto: 'Falta el administrador de la empresa' })
  const rep = repetidos(d.usuarios)
  const malos = d.usuarios.filter((u) => erroresUsuario(u, d, rep.has(u.key)).length).length
  if (malos) p.push({ paso: 'usuarios', texto: `${malos} usuario(s) con datos incompletos o repetidos` })
  return p
}

// El rol Administrador, mientras no se edite a mano, tiene todos los módulos de la empresa.
function conModulos(d: DatosBorrador, modulos: string[]): DatosBorrador {
  return { ...d, modulos, roles: d.roles.map((r) => (!r.editado && r.rolBase === 'AD' ? { ...r, modulos: [...modulos] } : r)) }
}
function borradorNuevo(c: CatalogoAsistente): DatosBorrador {
  const mods = c.plantillas.find((p) => p.key === 'contact-center')?.modulos ?? []
  return conModulos({
    empresa: { nombre: '', codigo: '' },
    modulos: mods,
    roles: c.rolesSistema.map((r) => ({ key: r.key, nombre: r.nombre, descripcion: r.descripcion, esSistema: true, rolBase: r.rolBase, modulos: r.modulos, acciones: {}, editado: false })),
    perfiles: [],
    usuarios: [],
  }, mods)
}

// Asistente "Crear empresa" (portada de Configuración y "Continuar" en
// Empresas). Todo lo capturado es un borrador que se guarda solo; la empresa
// se crea con todo configurado hasta el último paso. Si hay borradores
// pendientes, al abrir pregunta si continuar uno o empezar otro.
export function AsistenteEmpresa({ borradorIdInicial, onSalir }: { borradorIdInicial?: number | null; onSalir: () => void }) {
  const qc = useQueryClient()
  const { data: catalogo } = useQuery({ queryKey: ['empresa-asistente-catalogo'], queryFn: svc.catalogo, staleTime: 5 * 60_000 })
  const [borradorId, setBorradorId] = useState<number | null>(borradorIdInicial ?? null)
  // decidir: abrir un borrador concreto (desde Empresas) según su estado.
  const [modo, setModo] = useState<'decidir' | 'elegir' | 'editar' | 'creacion'>(borradorIdInicial ? 'decidir' : 'elegir')
  const [cargar, setCargar] = useState(false) // el editor carga un borrador existente

  const { data: inicial } = useQuery({
    queryKey: ['empresa-asistente-decidir', borradorIdInicial], queryFn: () => svc.borrador(borradorIdInicial!),
    enabled: modo === 'decidir' && !!borradorIdInicial, gcTime: 0,
  })
  useEffect(() => {
    if (modo !== 'decidir' || !inicial) return
    if (inicial.estado === 'borrador') { setCargar(true); setModo('editar') } else setModo('creacion')
  }, [modo, inicial])

  // Borradores pendientes del usuario (para preguntar al abrir).
  const { data: borradores, isLoading: cargandoLista } = useQuery({
    queryKey: ['empresa-asistente-borradores'], queryFn: svc.borradores, enabled: modo === 'elegir',
  })
  const pendientesMios = (borradores ?? []).filter((b) => b.esMio)
  useEffect(() => {
    if (modo === 'elegir' && !cargandoLista && borradores && pendientesMios.length === 0) { setCargar(false); setModo('editar') }
  }, [modo, cargandoLista, borradores, pendientesMios.length])

  const abrir = (b: BorradorResumen) => {
    setBorradorId(b.id)
    if (b.estado === 'borrador') { setCargar(true); setModo('editar') } else setModo('creacion')
  }

  if (!catalogo || modo === 'decidir' || (modo === 'elegir' && (cargandoLista || pendientesMios.length === 0))) {
    return <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
  }
  if (modo === 'elegir') {
    return <ElegirBorrador borradores={pendientesMios} onContinuar={abrir} onNueva={() => { setBorradorId(null); setCargar(false); setModo('editar') }} onSalir={onSalir}
      onDescartado={() => qc.invalidateQueries({ queryKey: ['empresa-asistente-borradores'] })} />
  }
  if (modo === 'creacion' && borradorId) {
    return <VistaCreacion borradorId={borradorId} onEditar={() => { setCargar(true); setModo('editar') }} onSalir={onSalir} />
  }
  return <Editor catalogo={catalogo} borradorId={borradorId} cargar={cargar}
    onBorradorCreado={setBorradorId} onCreacion={() => setModo('creacion')} onSalir={onSalir} />
}

/* ─────────────── Pregunta al abrir: continuar o empezar ─────────────── */
function descripcionEstado(b: BorradorResumen) {
  if (b.estado === 'creada') return { texto: 'Creada · falta ver las contraseñas y terminar', tono: 'emerald' }
  if (b.estado === 'error') return { texto: `No se pudo terminar de crear: ${b.error ?? 'error'}`, tono: 'red' }
  if (b.estado === 'creando') return b.interrumpido ? { texto: 'La creación se interrumpió a la mitad', tono: 'amber' } : { texto: 'Creándose ahora mismo…', tono: 'violet' }
  return { texto: `Borrador · paso ${Math.min(b.paso + 1, 6)} de 6`, tono: 'gray' }
}
const hace = (f: string) => {
  const min = Math.round((Date.now() - new Date(f).getTime()) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} día(s)`
}

function ElegirBorrador({ borradores, onContinuar, onNueva, onSalir, onDescartado }: {
  borradores: BorradorResumen[]; onContinuar: (b: BorradorResumen) => void; onNueva: () => void; onSalir: () => void; onDescartado: () => void
}) {
  const [descartar, setDescartar] = useState<BorradorResumen | null>(null)
  const quitar = useMutation({
    mutationFn: (id: number) => svc.descartar(id),
    onSuccess: () => { toast.success('Borrador descartado'); setDescartar(null); onDescartado() },
    onError: (e) => toast.error(msgError(e, 'No se pudo descartar')),
  })
  return (
    <div className="space-y-4">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={onSalir} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary hover:bg-gray-50"><X className="h-4 w-4" /></button>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear empresa</p>
          <h2 className="text-base font-bold text-ink">Tienes {borradores.length === 1 ? 'una empresa pendiente' : `${borradores.length} empresas pendientes`}</h2>
        </div>
      </div>
      <div className={clsx(card, 'space-y-3')}>
        <p className="text-[0.8rem] text-ink-secondary">¿Quieres continuar donde te quedaste o empezar una empresa nueva?</p>
        {borradores.map((b) => {
          const est = descripcionEstado(b)
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><FileClock className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.88rem] font-semibold text-ink">{b.nombre || 'Empresa sin nombre'} {b.codigo && <span className="font-mono text-[0.72rem] text-ink-tertiary">· {b.codigo}</span>}</p>
                <p className={clsx('text-[0.72rem]', {
                  'text-emerald-600': est.tono === 'emerald', 'text-red-600': est.tono === 'red', 'text-amber-600': est.tono === 'amber',
                  'text-violet-600': est.tono === 'violet', 'text-ink-tertiary': est.tono === 'gray',
                })}>{est.texto}</p>
                <p className="text-[0.66rem] text-ink-tertiary">
                  {b.resumen.modulos} módulos · {b.resumen.perfiles} perfiles · {b.resumen.usuarios} usuarios · guardado {hace(b.actualizado)}
                </p>
              </div>
              {!b.empKey && b.estado !== 'creando' && (
                <button onClick={() => setDescartar(b)} className="rounded-lg p-2 text-ink-tertiary hover:bg-red-50 hover:text-red-500" title="Descartar borrador"><Trash2 className="h-4 w-4" /></button>
              )}
              <button onClick={() => onContinuar(b)} className={btnPrim}>Continuar <ArrowRight className="h-4 w-4" /></button>
            </div>
          )
        })}
        <div className="flex justify-end border-t border-gray-50 pt-3">
          <button onClick={onNueva} className={btnSec}><Plus className="h-4 w-4" /> Empezar una empresa nueva</button>
        </div>
      </div>
      <ConfirmDialog isOpen={!!descartar} onClose={() => setDescartar(null)} onConfirm={() => descartar && quitar.mutate(descartar.id)}
        title="Descartar borrador" message={`Se borrará todo lo capturado de "${descartar?.nombre || 'Empresa sin nombre'}". No se puede deshacer.`}
        confirmLabel="Descartar" isPending={quitar.isPending} />
    </div>
  )
}

/* ─────────────── Editor del borrador (pasos 1-6) ─────────────── */
function Editor({ catalogo, borradorId, cargar, onBorradorCreado, onCreacion, onSalir }: {
  catalogo: CatalogoAsistente; borradorId: number | null; cargar: boolean
  onBorradorCreado: (id: number) => void; onCreacion: () => void; onSalir: () => void
}) {
  const qc = useQueryClient()
  const [datos, setDatos] = useState<DatosBorrador | null>(cargar ? null : borradorNuevo(catalogo))
  const [paso, setPaso] = useState(0)
  const [empKeyCreada, setEmpKeyCreada] = useState<string | null>(null)
  const [estadoGuardado, setEstadoGuardado] = useState<'guardado' | 'guardando' | 'pendiente' | 'error'>('guardado')
  const [confirmSalir, setConfirmSalir] = useState(false)
  const idRef = useRef<number | null>(borradorId)
  const primerCambio = useRef(true)

  // Cargar un borrador existente.
  // Sin caché (gcTime 0): siempre la versión guardada más reciente.
  const { data: cargado } = useQuery({ queryKey: ['empresa-asistente-borrador', borradorId], queryFn: () => svc.borrador(borradorId!), enabled: cargar && !!borradorId, gcTime: 0 })
  useEffect(() => {
    if (!cargado || datos) return
    setDatos(cargado.datos)
    setPaso(Math.min(cargado.paso ?? 0, PASOS.length - 1))
    setEmpKeyCreada(cargado.empKey)
  }, [cargado, datos])

  // Guardado automático (el borrador se crea al salir del primer paso).
  const guardarAhora = async (d: DatosBorrador, p: number) => {
    if (!idRef.current) return true
    setEstadoGuardado('guardando')
    try { await svc.guardarBorrador(idRef.current, d, p); setEstadoGuardado('guardado'); return true } catch (e) {
      setEstadoGuardado('error'); toast.error(msgError(e, 'No se pudo guardar el borrador')); return false
    }
  }
  useEffect(() => {
    if (!datos || !idRef.current) return
    if (primerCambio.current) { primerCambio.current = false; return }
    setEstadoGuardado('pendiente')
    const t = setTimeout(() => { guardarAhora(datos, paso) }, 800)
    return () => clearTimeout(t)
  }, [datos, paso]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!datos) return <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>

  const pend = pendientesDe(datos)
  const pendPaso = (k: string) => pend.filter((p) => p.paso === k).length
  const actual = PASOS[paso]
  const bloqueado = (i: number) => i > 0 && !idRef.current

  const irA = async (i: number) => {
    if (i === paso || bloqueado(i)) return
    setPaso(i)
  }
  const crearBorrador = async () => {
    const r = await svc.crearBorrador(datos, 1)
    idRef.current = r.id
    primerCambio.current = true
    onBorradorCreado(r.id)
    qc.invalidateQueries({ queryKey: ['empresa-asistente-borradores'] })
    setPaso(1)
    setEstadoGuardado('guardado')
  }
  const crearEmpresa = async () => {
    if (!(await guardarAhora(datos, paso))) return
    try {
      await svc.crearEmpresa(idRef.current!)
      qc.invalidateQueries({ queryKey: ['empresa-asistente-borradores'] })
      onCreacion()
    } catch (e) {
      const d = (e as ErrApi)?.response?.data
      toast.error(d?.pendientes?.length ? `Falta: ${d.pendientes.map((x) => x.texto).join(' · ')}` : msgError(e, 'No se pudo iniciar la creación'))
    }
  }
  const salir = () => {
    if (idRef.current || datos.empresa.nombre.trim()) setConfirmSalir(true)
    else onSalir()
  }

  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={salir} title="Salir del asistente"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear empresa · borrador</p>
          <h2 className="truncate text-base font-bold text-ink">{datos.empresa.nombre || 'Empresa nueva'}</h2>
        </div>
        {idRef.current && (
          <span className={clsx('flex flex-shrink-0 items-center gap-1.5 text-[0.7rem] font-semibold',
            estadoGuardado === 'error' ? 'text-red-600' : estadoGuardado === 'guardado' ? 'text-emerald-600' : 'text-ink-tertiary')}>
            {estadoGuardado === 'guardado' ? <CloudCheck className="h-4 w-4" /> : estadoGuardado === 'error' ? <AlertTriangle className="h-4 w-4" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {estadoGuardado === 'guardado' ? 'Borrador guardado' : estadoGuardado === 'error' ? 'Sin guardar' : 'Guardando…'}
          </span>
        )}
        <span className="flex-shrink-0 text-[0.72rem] text-ink-tertiary">Paso {paso + 1} de {PASOS.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <nav className={clsx(card, 'h-fit space-y-1 !p-3')}>
          {PASOS.map((p, i) => {
            const activo = i === paso
            const faltan = p.key === 'revisar' ? pend.length : pendPaso(p.key)
            const hecho = p.key !== 'revisar' && !!idRef.current && faltan === 0 && (p.key !== 'perfiles' || datos.perfiles.length > 0)
            return (
              <button key={p.key} disabled={bloqueado(i)} onClick={() => irA(i)}
                className={clsx('flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                  activo ? 'bg-violet-50' : 'hover:bg-gray-50')}>
                <span className={clsx('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold',
                  hecho ? 'bg-emerald-500 text-white' : activo ? 'bg-violet-600 text-white' : 'bg-gray-100 text-ink-tertiary')}>
                  {hecho ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block text-[0.8rem] font-semibold', activo ? 'text-violet-700' : 'text-ink')}>{p.titulo}</span>
                  <span className="block text-[0.66rem] leading-snug text-ink-tertiary">{p.desc}</span>
                </span>
                {faltan > 0 && idRef.current && <span className="mt-0.5 rounded-full bg-amber-100 px-1.5 text-[0.6rem] font-bold text-amber-700">{faltan}</span>}
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
            <PasoEmpresa datos={datos} setDatos={setDatos} codigoFijo={empKeyCreada} yaCreado={!!idRef.current}
              onContinuar={idRef.current ? () => irA(1) : crearBorrador} />
          )}
          {actual.key === 'modulos' && <PasoModulos datos={datos} setDatos={setDatos} catalogo={catalogo} />}
          {actual.key === 'roles' && <PasoRoles datos={datos} setDatos={setDatos} catalogo={catalogo} />}
          {actual.key === 'perfiles' && <PasoPerfiles datos={datos} setDatos={setDatos} />}
          {actual.key === 'usuarios' && <PasoUsuarios datos={datos} setDatos={setDatos} />}
          {actual.key === 'revisar' && (
            <PasoRevisar datos={datos} pendientes={pend} codigoFijo={empKeyCreada} onIr={(k) => irA(PASOS.findIndex((p) => p.key === k))} onCrear={crearEmpresa} />
          )}

          {paso > 0 && (
            <div className="flex justify-between">
              <button onClick={() => irA(paso - 1)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-gray-50">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </button>
              {paso < PASOS.length - 1 && (
                <button onClick={() => irA(paso + 1)} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                  Siguiente <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog isOpen={confirmSalir} onClose={() => setConfirmSalir(false)} variant="warning" confirmLabel="Salir"
        title="¿Salir del asistente?"
        message={idRef.current
          ? 'Lo capturado queda guardado como borrador. La empresa todavía no se crea: la próxima vez que abras "Crear empresa" te preguntará si quieres continuarla.'
          : 'Todavía no se guarda nada (el borrador se guarda al pasar del primer paso). Si sales, se pierde lo que escribiste.'}
        onConfirm={async () => { if (idRef.current) await guardarAhora(datos, paso); setConfirmSalir(false); qc.invalidateQueries({ queryKey: ['empresa-asistente-borradores'] }); onSalir() }} />
    </div>
  )
}

type SetDatos = React.Dispatch<React.SetStateAction<DatosBorrador | null>>
const upd = (setDatos: SetDatos, f: (d: DatosBorrador) => DatosBorrador) => setDatos((d) => (d ? f(d) : d))

/* ─────────────── Paso 1: Empresa ─────────────── */
function PasoEmpresa({ datos, setDatos, codigoFijo, yaCreado, onContinuar }: {
  datos: DatosBorrador; setDatos: SetDatos; codigoFijo: string | null; yaCreado: boolean; onContinuar: () => Promise<void> | void
}) {
  const [codigoEditado, setCodigoEditado] = useState(!!datos.empresa.codigo)
  const [disp, setDisp] = useState<{ ok: boolean; motivo?: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const { nombre, codigo } = datos.empresa
  const setEmp = (e: Partial<DatosBorrador['empresa']>) => upd(setDatos, (d) => ({ ...d, empresa: { ...d.empresa, ...e } }))

  useEffect(() => {
    if (codigoFijo || codigoEditado || !nombre.trim()) return
    const t = setTimeout(() => { svc.sugerirCodigo(nombre).then((r) => setEmp({ codigo: r.codigo })).catch(() => {}) }, 350)
    return () => clearTimeout(t)
  }, [nombre, codigoEditado, codigoFijo]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (codigoFijo || codigo.length < 2) { setDisp(null); return }
    const t = setTimeout(() => { svc.revisarCodigo(codigo).then((r) => setDisp({ ok: r.disponible, motivo: r.motivo })).catch(() => setDisp(null)) }, 400)
    return () => clearTimeout(t)
  }, [codigo, codigoFijo])

  const continuar = async () => {
    setEnviando(true)
    try { await onContinuar() } catch (e) { toast.error(msgError(e, 'No se pudo guardar el borrador')) } finally { setEnviando(false) }
  }

  return (
    <div className={clsx(card, 'space-y-4')}>
      <label className="block">
        <span className={label}>Nombre de la empresa</span>
        <input className={field} value={nombre} autoFocus onChange={(e) => setEmp({ nombre: e.target.value })} placeholder="Ej. Fuzion Contact" />
      </label>
      <label className="block">
        <span className={label}>Código</span>
        <input className={clsx(field, 'font-mono')} value={codigo} disabled={!!codigoFijo}
          onChange={(e) => { setCodigoEditado(true); setEmp({ codigo: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }) }} placeholder="se genera del nombre" />
        <span className="mt-1 flex items-center gap-1.5 text-[0.68rem]">
          {codigoFijo
            ? <span className="text-ink-tertiary">La base de datos de la empresa ya existe; el código no se puede cambiar.</span>
            : disp && !disp.ok ? <span className="font-semibold text-red-600">{disp.motivo}</span>
              : disp?.ok ? <span className="font-semibold text-emerald-600">Disponible</span>
                : <span className="text-ink-tertiary">Solo minúsculas, números y guion bajo. No se puede cambiar después de crear la empresa.</span>}
        </span>
      </label>
      <div className="rounded-xl bg-violet-50/60 px-3 py-2.5 text-[0.72rem] text-violet-900">
        Nada se crea todavía: vas a capturar módulos, roles, perfiles y usuarios, y todo se guarda como borrador. La empresa se crea con todo configurado en el último paso.
      </div>
      <div className="flex justify-end">
        <button onClick={continuar} disabled={!nombre.trim() || codigo.length < 2 || (disp !== null && !disp.ok) || enviando} className={btnPrim}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {yaCreado ? 'Continuar' : 'Guardar borrador y continuar'}
        </button>
      </div>
    </div>
  )
}

/* ─────────────── Paso 2: Módulos ─────────────── */
function PasoModulos({ datos, setDatos, catalogo }: { datos: DatosBorrador; setDatos: SetDatos; catalogo: CatalogoAsistente }) {
  const sel = new Set(datos.modulos)
  const [copiarDe, setCopiarDe] = useState('')
  const aplicar = (mods: string[]) => upd(setDatos, (d) => conModulos(d, mods))
  const toggle = (k: string) => aplicar(sel.has(k) ? datos.modulos.filter((m) => m !== k) : [...datos.modulos, k])
  return (
    <div className="space-y-4">
      <div className={card}>
        <span className={label}>Empieza con una plantilla</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {catalogo.plantillas.map((p) => (
            <button key={p.key} onClick={() => aplicar(p.modulos)} className="rounded-xl border border-gray-100 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/40">
              <span className="block text-[0.85rem] font-semibold text-ink">{p.nombre}</span>
              <span className="block text-[0.68rem] leading-snug text-ink-tertiary">{p.descripcion}</span>
              <span className="mt-1.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[0.62rem] font-semibold text-ink-secondary">{p.modulos.length} módulos</span>
            </button>
          ))}
        </div>
        {catalogo.empresas.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Copy className="h-4 w-4 text-ink-tertiary" />
            <span className="text-[0.75rem] text-ink-secondary">O copia los módulos de otra empresa:</span>
            <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className="rounded-lg border border-gray-200 bg-card px-2 py-1 text-[0.78rem]">
              <option value="">Elegir…</option>
              {catalogo.empresas.map((e) => <option key={e.key} value={e.key}>{e.nombre} ({e.modulos.length})</option>)}
            </select>
            <button disabled={!copiarDe} onClick={() => { const e = catalogo.empresas.find((x) => x.key === copiarDe); if (e) aplicar(e.modulos) }} className={btnSec}>Copiar</button>
          </div>
        )}
      </div>
      <div className={card}>
        <p className="mb-3 text-[0.8rem] font-semibold text-ink">{sel.size} de {catalogo.modulos.length} módulos activos</p>
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
          Los módulos que no marques quedan apagados para toda la empresa, igual que los que se agreguen al sistema en el futuro: se encienden en Configuración → Empresas cuando se necesiten.
        </p>
      </div>
    </div>
  )
}

/* ─────────────── Paso 3: Roles ─────────────── */
function PasoRoles({ datos, setDatos, catalogo }: { datos: DatosBorrador; setDatos: SetDatos; catalogo: CatalogoAsistente }) {
  const [editando, setEditando] = useState<RolBorrador | 'nuevo' | null>(null)
  const activos = new Set(datos.modulos)
  const eliminar = (r: RolBorrador) => {
    if (datos.perfiles.some((p) => p.rolKey === r.key)) { toast.error('Hay perfiles que usan este rol; cámbialos primero'); return }
    upd(setDatos, (d) => ({ ...d, roles: d.roles.filter((x) => x.key !== r.key) }))
  }
  if (editando) {
    return <RolEditor rol={editando === 'nuevo' ? null : editando} datos={datos} catalogo={catalogo} onCancelar={() => setEditando(null)}
      onGuardar={(rol) => { upd(setDatos, (d) => ({ ...d, roles: d.roles.some((x) => x.key === rol.key) ? d.roles.map((x) => (x.key === rol.key ? rol : x)) : [...d.roles, rol] })); setEditando(null) }} />
  }
  return (
    <div className={clsx(card, 'space-y-3')}>
      <p className="text-[0.75rem] text-ink-secondary">
        Un rol define qué módulos y acciones tiene quien lo recibe. La empresa nace con los roles de sistema; ajusta sus permisos o crea roles propios. Solo cuentan los módulos activos.
      </p>
      <div className="divide-y divide-gray-50 rounded-xl border border-gray-100">
        {datos.roles.map((r) => {
          const mods = r.modulos.filter((m) => activos.has(m))
          return (
            <div key={r.key} className="flex items-center gap-3 px-3 py-2.5">
              <ShieldCheck className={clsx('h-4 w-4 flex-shrink-0', r.esSistema ? 'text-violet-500' : 'text-emerald-500')} />
              <div className="min-w-0 flex-1">
                <p className="text-[0.82rem] font-semibold text-ink">{r.nombre} {r.esSistema && <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-ink-tertiary">sistema</span>}</p>
                <p className="truncate text-[0.68rem] text-ink-tertiary">{mods.length ? `${mods.length} módulo(s): ${mods.slice(0, 5).join(', ')}${mods.length > 5 ? '…' : ''}` : 'Sin módulos de esta empresa'}</p>
              </div>
              <button onClick={() => setEditando(r)} className={btnSec}><Pencil className="h-3.5 w-3.5" /> Permisos</button>
              {!r.esSistema && <button onClick={() => eliminar(r)} title="Quitar rol" className="rounded-lg p-2 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
            </div>
          )
        })}
      </div>
      <button onClick={() => setEditando('nuevo')} className={btnSec}><Plus className="h-3.5 w-3.5" /> Nuevo rol</button>
    </div>
  )
}

function RolEditor({ rol, datos, catalogo, onGuardar, onCancelar }: {
  rol: RolBorrador | null; datos: DatosBorrador; catalogo: CatalogoAsistente; onGuardar: (r: RolBorrador) => void; onCancelar: () => void
}) {
  const activos = catalogo.modulos.filter((m) => datos.modulos.includes(m.key))
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [mods, setMods] = useState<Set<string>>(() => new Set((rol?.modulos ?? []).filter((m) => datos.modulos.includes(m))))
  const [acciones, setAcciones] = useState<Record<string, string[]>>(() => ({ ...(rol?.acciones ?? {}) }))
  const [abierto, setAbierto] = useState<string | null>(null)
  const toggleMod = (k: string) => setMods((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleAcc = (m: string, a: string) => setAcciones((s) => { const l = new Set(s[m] ?? []); if (l.has(a)) l.delete(a); else l.add(a); return { ...s, [m]: [...l] } })
  const guardar = () => {
    if (!rol?.esSistema && !nombre.trim()) { toast.error('El rol necesita nombre'); return }
    onGuardar({
      key: rol?.key ?? nuevaKey('n'), nombre: rol?.esSistema ? rol.nombre : nombre.trim(), descripcion: descripcion.trim(),
      esSistema: !!rol?.esSistema, rolBase: rol?.rolBase, modulos: [...mods],
      acciones: Object.fromEntries(Object.entries(acciones).filter(([m, l]) => mods.has(m) && l.length)), editado: true,
    })
  }
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
                  {on && lista.length > 0 && <span className="block text-[0.64rem] text-ink-tertiary">{marcadas.length ? `${marcadas.length} acción(es) específicas` : 'Todas las acciones del módulo'}</span>}
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
        <button onClick={guardar} className={btnPrim}><Check className="h-4 w-4" /> Guardar rol</button>
      </div>
    </div>
  )
}

/* ─────────────── Paso 4: Perfiles ─────────────── */
function PasoPerfiles({ datos, setDatos }: { datos: DatosBorrador; setDatos: SetDatos }) {
  const vacio = { nombre: '', descripcion: '', rolKey: '', puesto: '', departamento: '' }
  const [form, setForm] = useState(vacio)
  const [editKey, setEditKey] = useState<string | null>(null)
  const sugerencias = [
    { nombre: 'Agente', descripcion: 'Agente de Call Center', rolKey: 'sys:CC', puesto: 'Agente', departamento: '' },
    { nombre: 'Administrador', descripcion: 'Administra la empresa', rolKey: 'sys:AD', puesto: 'Administrador', departamento: '' },
  ].filter((s) => datos.roles.some((r) => r.key === s.rolKey) && !datos.perfiles.some((p) => p.nombre.toLowerCase() === s.nombre.toLowerCase()))
  const guardar = (f: typeof vacio) => {
    if (!f.nombre.trim() || !f.rolKey) return
    if (datos.perfiles.some((p) => p.key !== editKey && p.nombre.trim().toLowerCase() === f.nombre.trim().toLowerCase())) { toast.error('Ya hay un perfil con ese nombre'); return }
    const p: PerfilBorrador = { key: editKey ?? nuevaKey('p'), nombre: f.nombre.trim(), descripcion: f.descripcion, rolKey: f.rolKey, puesto: f.puesto, departamento: f.departamento }
    upd(setDatos, (d) => ({ ...d, perfiles: editKey ? d.perfiles.map((x) => (x.key === editKey ? p : x)) : [...d.perfiles, p] }))
    setForm(vacio); setEditKey(null)
  }
  const eliminar = (p: PerfilBorrador) => {
    const n = datos.usuarios.filter((u) => u.perfilKey === p.key).length
    if (n) { toast.error(`${n} usuario(s) usan este perfil; cámbialos primero`); return }
    upd(setDatos, (d) => ({ ...d, perfiles: d.perfiles.filter((x) => x.key !== p.key) }))
  }
  const rolNombre = (k: string) => datos.roles.find((r) => r.key === k)?.nombre ?? '—'
  return (
    <div className="space-y-4">
      <div className={clsx(card, 'space-y-3')}>
        <p className="text-[0.75rem] text-ink-secondary">Un perfil es la plantilla con la que se da de alta a un usuario: su rol (permisos), puesto y departamento. En Usuarios y en el Excel solo eliges el perfil.</p>
        {sugerencias.length > 0 && !editKey && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.72rem] text-ink-tertiary">Sugeridos:</span>
            {sugerencias.map((s) => <button key={s.nombre} onClick={() => guardar(s)} className={btnSec}><Plus className="h-3.5 w-3.5" /> {s.nombre}</button>)}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Nombre del perfil</span><input className={field} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Supervisor de turno" /></label>
          <label className="block"><span className={label}>Rol (permisos)</span>
            <select className={field} value={form.rolKey} onChange={(e) => setForm({ ...form, rolKey: e.target.value })}>
              <option value="">Elegir…</option>
              {datos.roles.map((r) => <option key={r.key} value={r.key}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="block"><span className={label}>Puesto (opcional)</span><input className={field} value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} /></label>
          <label className="block"><span className={label}>Departamento (opcional)</span><input className={field} value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} /></label>
        </div>
        <div className="flex justify-end gap-2">
          {editKey && <button onClick={() => { setEditKey(null); setForm(vacio) }} className={btnSec}>Cancelar</button>}
          <button onClick={() => guardar(form)} disabled={!form.nombre.trim() || !form.rolKey} className={btnPrim}><Check className="h-4 w-4" /> {editKey ? 'Guardar cambios' : 'Agregar perfil'}</button>
        </div>
      </div>
      {datos.perfiles.length > 0 && (
        <div className={clsx(card, 'divide-y divide-gray-50 !p-0')}>
          {datos.perfiles.map((p) => (
            <div key={p.key} className="flex items-center gap-3 px-4 py-2.5">
              <IdCard className="h-4 w-4 flex-shrink-0 text-violet-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.82rem] font-semibold text-ink">{p.nombre}</p>
                <p className="truncate text-[0.68rem] text-ink-tertiary">Rol {rolNombre(p.rolKey)}{p.puesto ? ` · ${p.puesto}` : ''}{p.departamento ? ` · ${p.departamento}` : ''}</p>
              </div>
              <button onClick={() => { setEditKey(p.key); setForm({ nombre: p.nombre, descripcion: p.descripcion ?? '', rolKey: p.rolKey, puesto: p.puesto ?? '', departamento: p.departamento ?? '' }) }} className="rounded-lg p-2 text-ink-tertiary hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => eliminar(p)} className="rounded-lg p-2 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────── Paso 5: Usuarios ─────────────── */
function PasoUsuarios({ datos, setDatos }: { datos: DatosBorrador; setDatos: SetDatos }) {
  const [admin, setAdmin] = useState({ nombres: '', usuario: '', correo: '', contra: '' })
  const [nuevo, setNuevo] = useState({ nombres: '', usuario: '', correo: '', perfilKey: '' })
  const admins = datos.usuarios.filter((u) => u.esAdmin)
  const rep = repetidos(datos.usuarios)
  const existe = (usuario: string) => datos.usuarios.some((u) => u.usuario.trim().toLowerCase() === usuario.trim().toLowerCase())
  const agregar = (u: Omit<UsuarioBorrador, 'key'>) => {
    if (existe(u.usuario)) { toast.error(`El usuario "${u.usuario}" ya está en la lista`); return false }
    upd(setDatos, (d) => ({ ...d, usuarios: [...d.usuarios, { ...u, key: nuevaKey('u') }] }))
    return true
  }
  const quitar = (key: string) => upd(setDatos, (d) => ({ ...d, usuarios: d.usuarios.filter((x) => x.key !== key) }))
  const errAdminPass = admin.contra ? errorPassword(admin.contra) : null

  return (
    <div className="space-y-4">
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
          <div>
            <input className={field} placeholder="Contraseña (vacío = se genera una temporal)" value={admin.contra} onChange={(e) => setAdmin({ ...admin, contra: e.target.value })} />
            {errAdminPass && <p className="mt-1 text-[0.66rem] text-red-600">{errAdminPass}</p>}
          </div>
        </div>
        <div className="flex justify-end">
          <button disabled={!admin.nombres.trim() || !USUARIO_RE.test(admin.usuario) || !!errAdminPass}
            onClick={() => { if (agregar({ nombres: admin.nombres.trim(), usuario: admin.usuario, correo: admin.correo.trim() || undefined, contra: admin.contra || undefined, esAdmin: true })) setAdmin({ nombres: '', usuario: '', correo: '', contra: '' }) }}
            className={btnPrim}><UserPlus className="h-4 w-4" /> {admins.length ? 'Agregar otro administrador' : 'Agregar administrador'}</button>
        </div>
      </div>

      <div className={clsx(card, 'space-y-3')}>
        <p className="flex items-center gap-2 text-[0.85rem] font-bold text-ink"><UserPlus className="h-4 w-4 text-violet-600" /> Agregar un usuario</p>
        {datos.perfiles.length === 0 ? (
          <p className="text-[0.75rem] text-amber-700">Primero crea al menos un perfil en el paso anterior.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input className={clsx(field, 'sm:col-span-2')} placeholder="Nombre completo" value={nuevo.nombres} onChange={(e) => setNuevo({ ...nuevo, nombres: e.target.value })} />
              <input className={field} placeholder="Usuario" value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value.trim() })} />
              <select className={field} value={nuevo.perfilKey} onChange={(e) => setNuevo({ ...nuevo, perfilKey: e.target.value })}>
                <option value="">Perfil…</option>
                {datos.perfiles.map((p) => <option key={p.key} value={p.key}>{p.nombre}</option>)}
              </select>
              <input className={clsx(field, 'sm:col-span-2')} placeholder="Correo (opcional)" value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <button disabled={!nuevo.nombres.trim() || !USUARIO_RE.test(nuevo.usuario) || !nuevo.perfilKey}
                onClick={() => { if (agregar({ nombres: nuevo.nombres.trim(), usuario: nuevo.usuario, correo: nuevo.correo.trim() || undefined, perfilKey: nuevo.perfilKey })) setNuevo({ nombres: '', usuario: '', correo: '', perfilKey: nuevo.perfilKey }) }}
                className={btnPrim}><Plus className="h-4 w-4" /> Agregar</button>
            </div>
          </>
        )}
      </div>

      {datos.perfiles.length > 0 && <ImportarExcel datos={datos} setDatos={setDatos} />}

      {datos.usuarios.length > 0 && (
        <div className={clsx(card, '!p-0')}>
          <p className="border-b border-gray-50 px-4 py-2.5 text-[0.78rem] font-semibold text-ink">{datos.usuarios.length} usuario(s) en el borrador · se crean al final</p>
          <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
            {datos.usuarios.map((u) => {
              const errs = erroresUsuario(u, datos, rep.has(u.key))
              return (
                <div key={u.key} className={clsx('flex items-center gap-3 px-4 py-2 text-[0.75rem]', errs.length && 'bg-red-50/40')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{u.nombres || '(sin nombre)'}</span>
                    {errs.length > 0 && <span className="block text-[0.66rem] text-red-600">{errs.join(' · ')}</span>}
                  </span>
                  <span className="font-mono text-ink-tertiary">{u.usuario}</span>
                  <span className="w-28 truncate text-right text-ink-secondary">{u.esAdmin ? 'Administrador' : datos.perfiles.find((p) => p.key === u.perfilKey)?.nombre ?? '—'}</span>
                  <button onClick={() => quitar(u.key)} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Encabezados aceptados en el Excel (sin acentos, minúsculas).
type CampoExcel = 'nombres' | 'usuario' | 'correo' | 'perfil' | 'contra'
const COLUMNAS: Record<string, CampoExcel> = {
  nombre: 'nombres', nombres: 'nombres', 'nombre completo': 'nombres', usuario: 'usuario', user: 'usuario',
  correo: 'correo', email: 'correo', 'correo electronico': 'correo', perfil: 'perfil', contrasena: 'contra', password: 'contra',
}
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function ImportarExcel({ datos, setDatos }: { datos: DatosBorrador; setDatos: SetDatos }) {
  const [filas, setFilas] = useState<{ fila: number; u: UsuarioBorrador; perfilTexto: string; errores: string[] }[] | null>(null)
  const [archivo, setArchivo] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const plantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Nombre', 'Usuario', 'Correo', 'Perfil'], ['Ana López Pérez', 'alopez', 'ana@empresa.com', datos.perfiles[0]?.nombre ?? 'Agente']])
    ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 20 }]
    const wsP = XLSX.utils.aoa_to_sheet([['Perfiles disponibles'], ...datos.perfiles.map((p) => [p.nombre])])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')
    XLSX.utils.book_append_sheet(wb, wsP, 'Perfiles')
    XLSX.writeFile(wb, `plantilla_usuarios_${datos.empresa.codigo || 'empresa'}.xlsx`)
  }

  const leer = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const yaEnBorrador = new Set(datos.usuarios.map((u) => u.usuario.trim().toLowerCase()))
      const enArchivo = new Set<string>()
      const revisadas = crudas.map((r, i) => {
        const f: Partial<Record<CampoExcel, string>> = {}
        for (const [k, v] of Object.entries(r)) { const c = COLUMNAS[normal(k)]; if (c) f[c] = String(v ?? '').trim() }
        const perfil = datos.perfiles.find((p) => p.nombre.trim().toLowerCase() === (f.perfil ?? '').toLowerCase())
        const u: UsuarioBorrador = { key: nuevaKey('u'), nombres: f.nombres ?? '', usuario: f.usuario ?? '', correo: f.correo || undefined, perfilKey: perfil?.key, contra: f.contra || undefined }
        const errores = erroresUsuario(u, datos, false).filter((e) => e !== 'Sin perfil')
        if (!perfil) errores.push(f.perfil ? `No existe el perfil "${f.perfil}"` : 'Falta el perfil')
        const k = u.usuario.trim().toLowerCase()
        if (k && yaEnBorrador.has(k)) errores.push('Ya está en el borrador')
        else if (k && enArchivo.has(k)) errores.push('Repetido en el archivo')
        if (k) enArchivo.add(k)
        return { fila: i + 2, u, perfilTexto: f.perfil ?? '', errores }
      }).filter((x) => x.u.nombres || x.u.usuario)
      if (!revisadas.length) { toast.error('No se encontraron filas. Usa la plantilla: Nombre, Usuario, Correo, Perfil'); return }
      if (revisadas.length > 1000) { toast.error('Máximo 1000 usuarios por archivo'); return }
      setArchivo(file.name); setFilas(revisadas)
    } catch {
      toast.error('No se pudo leer el archivo. Debe ser Excel (.xlsx) o CSV')
    }
  }

  const validas = (filas ?? []).filter((f) => !f.errores.length)
  const agregar = () => {
    upd(setDatos, (d) => ({ ...d, usuarios: [...d.usuarios, ...validas.map((f) => f.u)] }))
    toast.success(`${validas.length} usuario(s) agregados al borrador`)
    setFilas(null); setArchivo('')
  }

  return (
    <div className={clsx(card, 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[0.85rem] font-bold text-ink"><Upload className="h-4 w-4 text-violet-600" /> Importar usuarios desde Excel</p>
        <button onClick={plantilla} className={btnSec}><Download className="h-3.5 w-3.5" /> Descargar plantilla</button>
      </div>
      <p className="text-[0.72rem] text-ink-tertiary">Llena la plantilla (Nombre, Usuario, Correo, Perfil) y súbela. Se revisa cada fila y las correctas se agregan al borrador; se crean junto con la empresa, cada una con contraseña temporal.</p>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = '' }} />
      <button onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-center transition hover:border-violet-300 hover:bg-violet-50/30">
        <Upload className="h-5 w-5 text-ink-tertiary" />
        <span className="text-[0.8rem] font-semibold text-ink">{archivo || 'Elegir archivo'}</span>
        <span className="text-[0.66rem] text-ink-tertiary">.xlsx, .xls o .csv · máximo 1000 filas</span>
      </button>
      {filas && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-[0.75rem]">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-ink-secondary">{filas.length} filas</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{validas.length} listas</span>
            {filas.length - validas.length > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-600">{filas.length - validas.length} con error</span>}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100">
            <table className="w-full text-[0.72rem]">
              <thead className="sticky top-0 bg-gray-50 text-left text-[0.64rem] font-semibold uppercase text-ink-tertiary">
                <tr><th className="px-2 py-1.5">Fila</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Usuario</th><th className="px-2 py-1.5">Perfil</th><th className="px-2 py-1.5">Estado</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filas.map((f) => (
                  <tr key={f.fila} className={f.errores.length ? 'bg-red-50/40' : ''}>
                    <td className="px-2 py-1.5 text-ink-tertiary">{f.fila}</td>
                    <td className="px-2 py-1.5 text-ink">{f.u.nombres || '—'}</td>
                    <td className="px-2 py-1.5 font-mono text-ink-secondary">{f.u.usuario || '—'}</td>
                    <td className="px-2 py-1.5 text-ink-secondary">{f.perfilTexto || '—'}</td>
                    <td className="px-2 py-1.5">{f.errores.length ? <span className="flex items-start gap-1 text-red-600"><AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" /> {f.errores.join(' · ')}</span> : <span className="text-emerald-600">Lista</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setFilas(null); setArchivo('') }} className={btnSec}>Descartar</button>
            <button onClick={agregar} disabled={!validas.length} className={btnPrim}><Check className="h-4 w-4" /> Agregar {validas.length} al borrador</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────── Paso 6: Revisar y crear ─────────────── */
function PasoRevisar({ datos, pendientes, codigoFijo, onIr, onCrear }: {
  datos: DatosBorrador; pendientes: Pendiente[]; codigoFijo: string | null; onIr: (paso: string) => void; onCrear: () => Promise<void>
}) {
  const [creando, setCreando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const resumen = [
    { paso: 'empresa', texto: `${datos.empresa.nombre || '(sin nombre)'} · código ${codigoFijo ?? datos.empresa.codigo}` },
    { paso: 'modulos', texto: `${datos.modulos.length} módulos activos` },
    { paso: 'roles', texto: `${datos.roles.length} roles (${datos.roles.filter((r) => !r.esSistema).length} propios)` },
    { paso: 'perfiles', texto: `${datos.perfiles.length} perfiles` },
    { paso: 'usuarios', texto: `${datos.usuarios.length} usuarios (${datos.usuarios.filter((u) => u.esAdmin).length} administrador)` },
  ]
  return (
    <div className={clsx(card, 'space-y-4')}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {resumen.map((r) => {
          const falta = pendientes.some((p) => p.paso === r.paso)
          return (
            <button key={r.paso} onClick={() => onIr(r.paso)} className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[0.78rem] transition',
              falta ? 'border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-50' : 'border-emerald-100 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-50')}>
              {falta ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> : <Check className="h-4 w-4 flex-shrink-0" />} {r.texto}
            </button>
          )
        })}
      </div>
      {pendientes.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="mb-1 text-[0.78rem] font-bold text-amber-800">Antes de crear la empresa falta:</p>
          <ul className="space-y-0.5">
            {pendientes.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[0.75rem] text-amber-800">
                <span>• {p.texto}</span>
                <button onClick={() => onIr(p.paso)} className="text-[0.7rem] font-semibold text-violet-700 hover:underline">Ir a {PASOS.find((x) => x.key === p.paso)?.titulo}</button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.68rem] text-amber-700">Puedes salir cuando quieras: el borrador queda guardado y al volver te preguntará si continúas.</p>
        </div>
      ) : (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[0.78rem] text-emerald-800">Todo listo. Al crearla se hace todo de una vez: la base de datos, sus módulos, roles, perfiles y usuarios con sus contraseñas temporales.</p>
      )}
      <div className="flex justify-end">
        <button onClick={() => setConfirmar(true)} disabled={pendientes.length > 0 || creando} className={btnPrim}>
          {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Crear empresa
        </button>
      </div>
      <ConfirmDialog isOpen={confirmar} onClose={() => setConfirmar(false)} variant="warning" confirmLabel="Crear empresa" isPending={creando}
        title={`¿Crear ${datos.empresa.nombre}?`}
        message={`Se crea la base de datos "intranet_${codigoFijo ?? datos.empresa.codigo}" con ${datos.modulos.length} módulos, ${datos.roles.length} roles, ${datos.perfiles.length} perfiles y ${datos.usuarios.length} usuarios. Tarda cerca de un minuto; si se interrumpe, podrás continuarla sin duplicar nada.`}
        onConfirm={async () => { setCreando(true); try { await onCrear() } finally { setCreando(false); setConfirmar(false) } }} />
    </div>
  )
}

/* ─────────────── Creación: avance, error, interrupción y resultado ─────────────── */
const ETIQUETAS: Record<string, string> = {
  empresa: 'Crear la empresa y su base de datos',
  esquema: 'Preparar la base de datos (cerca de un minuto)',
  modulos: 'Activar los módulos',
  roles: 'Configurar los roles',
  perfiles: 'Crear los perfiles',
  usuarios: 'Dar de alta a los usuarios',
}

function descargarCredenciales(creados: CredencialCreada[], empresa: string) {
  const ws = XLSX.utils.json_to_sheet(creados.map((c) => ({ Nombre: c.nombre, Usuario: c.usuario, 'Contraseña temporal': c.contraTemporal ?? '(la que se escribió)', Perfil: c.perfil ?? '' })))
  ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Credenciales')
  XLSX.writeFile(wb, `credenciales_${empresa}.xlsx`)
}

function VistaCreacion({ borradorId, onEditar, onSalir }: { borradorId: number; onEditar: () => void; onSalir: () => void }) {
  const qc = useQueryClient()
  const { data: b } = useQuery({
    queryKey: ['empresa-asistente-creacion', borradorId],
    queryFn: () => svc.borrador(borradorId),
    refetchInterval: (q) => (q.state.data?.estado === 'creando' && !q.state.data.interrumpido ? 2000 : false),
  })
  const continuar = useMutation({
    mutationFn: () => svc.crearEmpresa(borradorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa-asistente-creacion', borradorId] }),
    onError: (e) => toast.error(msgError(e, 'No se pudo continuar')),
  })
  const [confirmTerminar, setConfirmTerminar] = useState(false)
  const terminar = useMutation({
    mutationFn: () => svc.terminar(borradorId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa-asistente-borradores'] }); qc.invalidateQueries({ queryKey: ['accesos-empresas'] }); toast.success('Empresa lista'); onSalir() },
    onError: (e) => toast.error(msgError(e, 'No se pudo terminar')),
  })

  const etapas = useMemo(() => ['empresa', 'esquema', 'modulos', 'roles', 'perfiles', 'usuarios'], [])
  if (!b) return <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
  const hechas = new Set(b.avance?.completadas ?? [])
  const enCurso = b.estado === 'creando' && !b.interrumpido
  const creados = b.resultado?.creados ?? []

  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={onSalir} title={enCurso ? 'La empresa se sigue creando en el servidor' : 'Salir'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50"><X className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear empresa</p>
          <h2 className="truncate text-base font-bold text-ink">{b.nombre}</h2>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-[0.7rem] font-semibold', {
          'bg-violet-50 text-violet-700': enCurso, 'bg-emerald-50 text-emerald-700': b.estado === 'creada',
          'bg-red-50 text-red-600': b.estado === 'error', 'bg-amber-50 text-amber-700': b.interrumpido,
        })}>
          {enCurso ? 'Creando…' : b.estado === 'creada' ? 'Creada' : b.estado === 'error' ? 'No se terminó' : 'Interrumpida'}
        </span>
      </div>

      <div className={clsx(card, 'space-y-2')}>
        {etapas.map((e) => {
          const hecha = hechas.has(e)
          const actual = !hecha && b.avance?.etapa === e
          const fallo = actual && b.estado === 'error'
          return (
            <div key={e} className="flex items-center gap-3 text-[0.8rem]">
              {hecha ? <Check className="h-4 w-4 text-emerald-500" />
                : fallo ? <AlertTriangle className="h-4 w-4 text-red-500" />
                  : actual && enCurso ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                    : <CircleDashed className="h-4 w-4 text-gray-300" />}
              <span className={clsx(hecha ? 'text-ink' : actual ? 'font-semibold text-ink' : 'text-ink-tertiary')}>
                {ETIQUETAS[e]}
                {e === 'usuarios' && b.avance?.usuariosTotal ? ` (${b.avance.usuariosHechos ?? 0} de ${b.avance.usuariosTotal})` : ''}
              </span>
            </div>
          )
        })}
        {enCurso && <p className="pt-1 text-[0.7rem] text-ink-tertiary">Puedes salir: la empresa se sigue creando y al volver verás el resultado.</p>}
      </div>

      {(b.estado === 'error' || b.interrumpido) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-[0.82rem] font-bold text-amber-800">
            {b.interrumpido ? 'La creación se interrumpió a la mitad (por ejemplo, se reinició el servidor).' : 'No se pudo terminar de crear la empresa.'}
          </p>
          {b.error && <p className="text-[0.75rem] text-amber-800">Motivo: {b.error}</p>}
          <p className="text-[0.72rem] text-amber-700">¿Quieres continuar donde se quedó? Lo que ya se creó no se repite. Si el problema está en los datos (por ejemplo, un código ocupado), corrígelos primero.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {b.estado === 'error' && <button onClick={onEditar} className={btnSec}><Pencil className="h-3.5 w-3.5" /> Corregir datos</button>}
            <button onClick={() => continuar.mutate()} disabled={continuar.isPending} className={btnPrim}>
              {continuar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Continuar la creación
            </button>
          </div>
        </div>
      )}

      {b.estado === 'creada' && (
        <div className={clsx(card, 'space-y-3')}>
          <p className="flex items-center gap-2 text-[0.9rem] font-bold text-emerald-700"><Check className="h-5 w-5" /> {b.nombre} quedó creada y configurada</p>
          {creados.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink"><KeyRound className="h-4 w-4 text-violet-600" /> Contraseñas temporales ({creados.length})</p>
                <button onClick={() => descargarCredenciales(creados, b.codigo ?? 'empresa')} className={btnSec}><Download className="h-3.5 w-3.5" /> Descargar credenciales</button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
                <table className="w-full text-[0.75rem]">
                  <tbody className="divide-y divide-gray-50">
                    {creados.map((c) => (
                      <tr key={c.usuario}>
                        <td className="px-3 py-1.5 font-medium text-ink">{c.nombre}</td>
                        <td className="px-3 py-1.5 font-mono text-ink-secondary">{c.usuario}</td>
                        <td className="px-3 py-1.5 font-mono text-ink">{c.contraTemporal ?? '—'}</td>
                        <td className="px-3 py-1.5 text-ink-tertiary">{c.perfil ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.7rem] text-ink-tertiary">Al terminar, estas contraseñas se borran del sistema: descárgalas antes. Cada usuario debe cambiarla la primera vez que entre.</p>
            </>
          )}
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-[0.72rem] text-ink-secondary">
            Para entrar, en el inicio de sesión se elige la empresa <b>{b.nombre}</b>. Los módulos se cambian en Configuración → Empresas; los permisos finos por usuario, la marca, los datos fiscales y el correo se ajustan dentro de la empresa.
          </div>
          <div className="flex justify-end">
            <button onClick={() => (creados.some((c) => c.contraTemporal) ? setConfirmTerminar(true) : terminar.mutate())} disabled={terminar.isPending} className={btnPrim}>
              {terminar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Terminar
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog isOpen={confirmTerminar} onClose={() => setConfirmTerminar(false)} variant="warning" confirmLabel="Ya las descargué, terminar"
        title="¿Ya descargaste las contraseñas?" message="Al terminar se borran las contraseñas temporales del sistema y no se pueden volver a ver."
        onConfirm={() => { setConfirmTerminar(false); terminar.mutate() }} isPending={terminar.isPending} />
    </div>
  )
}
