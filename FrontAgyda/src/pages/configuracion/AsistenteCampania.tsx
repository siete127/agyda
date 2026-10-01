import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Layers, RotateCcw, Loader2, Megaphone, Plug, FileText, Tags, Rocket, BarChart3, X,
  PhoneCall, ShoppingCart, Pencil, UsersRound,
} from 'lucide-react'
import { ccService } from '@/services/cc.service'
import { campanasVentasService } from '@/services/campanasVentas.service'
import { EditorCampanaVentas } from '@/components/ventas/EditorCampanaVentas'
import { Avatar } from '@/components/ui/Avatar'
import { REPORTES_CAMPANIA } from '@/pages/suite-reportes/reportesCampania'
import {
  CanalesDeCampaniaPanel, FormularioYMarcadorPanel, SkillsDeCampaniaPanel, TipificacionesDeCampaniaPanel,
} from './ContactCenterTabs'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'

// Identificador público a partir del nombre (el backend lo vuelve a normalizar).
const slugDe = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

// Las tipificaciones van antes del formulario: el formulario las ofrece (catálogo
// "Tipificaciones de la campaña") y define cuáles permite.
const PASOS_BASE = [
  { key: 'campania', titulo: 'Campaña', desc: 'Nombre y cómo se asignan las conversaciones', icon: Megaphone },
  { key: 'skills', titulo: 'Skills', desc: 'Grupos de atención de la campaña (su gente la pone el grupo)', icon: Layers },
  { key: 'canales', titulo: 'Canales', desc: 'WhatsApp, Messenger, Instagram, web o marcador', icon: Plug },
  { key: 'tipificaciones', titulo: 'Tipificaciones', desc: 'Cómo se clasifica cada atención', icon: Tags },
  { key: 'formulario', titulo: 'Formulario y marcador', desc: 'Qué se captura y la URL para VICIdial', icon: FileText },
  { key: 'listo', titulo: 'Listo', desc: 'Resumen y reportes', icon: Rocket },
] as const
type PasoKey = typeof PASOS_BASE[number]['key']

/** El grupo que se está armando cuando el asistente se abre desde "Crear grupo". */
export interface GrupoDeLaCampania {
  nombre: string
  modalidad: 'omnicanal' | 'marcador' | 'ambos'
  ventasCampanaId: number | null
  supervisores: { usuarioId: number; nombre: string }[]
  agentes: { usuarioId: number; nombre: string }[]
}

// Avance del asistente en este navegador: si se sale (Esc, X o clic fuera),
// al volver a abrirlo sigue con la misma campaña y en el mismo paso.
const CLAVE_BORRADOR = 'agyda:asistente-campania'
type DatosCampania = { nombre: string; slug: string; slugTocado: boolean; modoAsignacion: string }
type Borrador = { campaniaId: number | null; paso: number; datos: DatosCampania }
const DATOS_VACIOS: DatosCampania = { nombre: '', slug: '', slugTocado: false, modoAsignacion: 'global' }
function leerBorrador(): Borrador | null {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null') as Borrador | null
    return b && typeof b.paso === 'number' && b.datos ? b : null
  } catch { return null }
}
function guardarBorrador(b: Borrador | null) {
  try {
    if (b) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b))
    else localStorage.removeItem(CLAVE_BORRADOR)
  } catch { /* sin almacenamiento: solo no se recuerda */ }
}

// Asistente para dar de alta una campaña de principio a fin. Reutiliza los
// mismos paneles de la ficha de campaña (Configuración → Contact Center →
// Campañas y skills), así que todo lo que se hace aquí se ve igual allá.
// onSalir recibe la campaña creada al terminar (null si sale sin terminar).
// `campaniaEditar`: abre esa campaña ya existente con los mismos pasos (no
// toca el borrador de "campaña nueva" de este navegador).
// `grupo`: abierto desde el asistente "Crear grupo" — en un grupo solo de
// marcador no hay skills y el canal es el Marcador (se crea solo); con campaña
// de Ventas, las tipificaciones son sus estatus (una sola lista).
export function AsistenteCampania({ onSalir, campaniaEditar, grupo }: { onSalir: (campaniaCreada: number | null) => void; campaniaEditar?: number; grupo?: GrupoDeLaCampania }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const editando = campaniaEditar != null
  const [inicial] = useState<Borrador | null>(() => (editando ? { campaniaId: campaniaEditar, paso: 0, datos: DATOS_VACIOS } : leerBorrador()))
  const [pasoGuardado, setPaso] = useState(inicial?.paso ?? 0)
  const [campaniaGuardada, setCampaniaId] = useState<number | null>(inicial?.campaniaId ?? null)
  const [datos, setDatos] = useState<DatosCampania>(inicial?.datos ?? DATOS_VACIOS)
  useEffect(() => { if (!editando) guardarBorrador({ campaniaId: campaniaGuardada, paso: pasoGuardado, datos }) }, [editando, campaniaGuardada, pasoGuardado, datos])

  const { data: campanias = [], isFetching, isFetched } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias(), enabled: campaniaGuardada != null })
  // Al editar, los datos del primer paso salen de la campaña.
  const [datosCargados, setDatosCargados] = useState(!editando)
  if (!datosCargados) {
    const c = campanias.find((x) => x.id === campaniaEditar)
    if (c) {
      setDatos({ nombre: c.nombre, slug: c.slug ?? '', slugTocado: !!c.slug, modoAsignacion: c.modoAsignacion ?? 'global' })
      setDatosCargados(true)
    }
  }
  // Una campaña retomada que ya no existe (la borraron) no se sigue.
  const campaniaId = campaniaGuardada != null && (isFetching || !isFetched || campanias.some((c) => c.id === campaniaGuardada)) ? campaniaGuardada : null
  const paso = campaniaId == null ? 0 : pasoGuardado
  const empezarOtra = () => { setCampaniaId(null); setPaso(0); setDatos(DATOS_VACIOS) }
  const terminar = () => { if (!editando) guardarBorrador(null); onSalir(campaniaId) }
  const campania = campanias.find((c) => c.id === campaniaId) ?? (campaniaId ? { id: campaniaId, nombre: datos.nombre } : null)
  const { data: canalesTodos = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales(), enabled: campaniaId != null })
  const canales = canalesTodos.filter((c) => c.campaniaId === campaniaId)
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos', campaniaId], queryFn: () => ccService.getGrupos(campaniaId!), enabled: campaniaId != null })
  const { data: forms } = useQuery({
    queryKey: ['cc-campania-formularios', campaniaId],
    queryFn: () => ccService.getFormulariosDeCampania(campaniaId!),
    enabled: campaniaId != null,
  })
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-campanias'] }); qc.invalidateQueries({ queryKey: ['cc-grupos-all'] }) }

  const slugFinal = datos.slugTocado ? datos.slug : slugDe(datos.nombre)
  const guardarCampania = useMutation({
    mutationFn: async () => {
      let id = campaniaId
      if (!id) {
        const r = await ccService.createCampania({ nombre: datos.nombre.trim() })
        id = r?.data?.id as number
        if (!id) throw new Error('No se pudo crear la campaña')
        setCampaniaId(id)
      }
      await ccService.updateCampania(id, { nombre: datos.nombre.trim(), slug: slugFinal || undefined, modoAsignacion: datos.modoAsignacion })
      return id
    },
    onSuccess: () => {
      inval()
      toast.success(campaniaId ? 'Campaña actualizada' : 'Campaña creada')
      setPaso(1)
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Error al guardar la campaña'),
  })

  const soloMarcador = grupo?.modalidad === 'marcador'
  const conMarcador = !!grupo && grupo.modalidad !== 'omnicanal'
  const PASOS = PASOS_BASE.filter((p) => !(soloMarcador && p.key === 'skills')).map((p) =>
    p.key === 'canales' && soloMarcador ? { ...p, desc: 'El canal del marcador (VICIdial), se crea solo' }
      : p.key === 'tipificaciones' && grupo?.ventasCampanaId ? { ...p, desc: 'Los estatus de su campaña de Ventas' } : p)
  const actual = PASOS[Math.min(paso, PASOS.length - 1)]
  const irA = (k: PasoKey) => { const i = PASOS.findIndex((p) => p.key === k); if (i >= 0) setPaso(i) }
  const bloqueado = (i: number) => i > 0 && campaniaId == null

  // Estado de cada paso para el resumen y el indicador.
  const completo: Record<PasoKey, boolean> = {
    campania: campaniaId != null,
    skills: grupos.length > 0,
    canales: soloMarcador ? canales.some((c) => c.tipo === 'marcador') : canales.length > 0,
    formulario: (forms?.formularios.length ?? 0) > 0,
    tipificaciones: false, // opcional, sin conteo barato
    listo: false,
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Encabezado */}
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={() => onSalir(null)} title="Salir del asistente (puedes retomarlo después)"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">{editando ? 'Editar campaña' : 'Configurar nueva campaña'}</p>
          <h2 className="truncate text-base font-bold text-ink">{campania?.nombre || 'Campaña nueva'}</h2>
        </div>
        {!editando && (campaniaId != null || datos.nombre) && (
          <button onClick={empezarOtra} title="Dejar esta campaña como está y empezar otra desde cero"
            className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[0.72rem] font-semibold text-ink-tertiary transition hover:bg-gray-50 hover:text-ink">
            <RotateCcw className="h-3.5 w-3.5" /> Empezar otra
          </button>
        )}
        <span className="flex-shrink-0 text-[0.72rem] text-ink-tertiary">Paso {paso + 1} de {PASOS.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        {/* Pasos */}
        <nav className={clsx(card, 'h-fit space-y-1 !p-3')}>
          {PASOS.map((p, i) => {
            const activo = i === paso
            const hecho = completo[p.key]
            return (
              <button key={p.key} disabled={bloqueado(i)} onClick={() => setPaso(i)}
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

        {/* Contenido del paso */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2.5 px-1">
            <actual.icon className="h-5 w-5 text-violet-600" />
            <div>
              <p className="text-sm font-bold text-ink">{actual.titulo}</p>
              <p className="text-[0.72rem] text-ink-tertiary">{actual.desc}</p>
            </div>
          </div>

          {actual.key === 'campania' && !datosCargados && (
            <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
          )}
          {actual.key === 'campania' && datosCargados && (
            <div className={clsx(card, 'space-y-4')}>
              <label className="block">
                <span className={label}>Nombre de la campaña</span>
                <input autoFocus className={field} value={datos.nombre} placeholder="Ej. Reclutamiento Totis"
                  onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>Identificador público (para la URL del marcador)</span>
                  <input className={field} value={slugFinal} placeholder="ej. totis"
                    onChange={(e) => setDatos({ ...datos, slug: e.target.value, slugTocado: true })} />
                  <span className="mt-0.5 block text-[0.65rem] text-gray-400">/formulario-publico/c/{slugFinal || '…'}</span>
                </label>
                <label className="block">
                  <span className={label}>Asignación de conversaciones</span>
                  <select className={field} value={datos.modoAsignacion} onChange={(e) => setDatos({ ...datos, modoAsignacion: e.target.value })}>
                    <option value="global">Seguir la configuración global</option>
                    <option value="auto">Automática — el sistema asigna a un agente</option>
                    <option value="manual">Manual — los agentes jalan de la cola</option>
                  </select>
                </label>
              </div>
              <div className="flex justify-end">
                <button onClick={() => guardarCampania.mutate()} disabled={!datos.nombre.trim() || guardarCampania.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
                  {guardarCampania.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {campaniaId ? 'Guardar y continuar' : 'Crear campaña y continuar'}
                </button>
              </div>
            </div>
          )}

          {campania && actual.key === 'skills' && (
            <>
              {grupo && <GenteDelGrupo grupo={grupo} />}
              <SkillsDeCampaniaPanel campania={campania} onChanged={inval} />
            </>
          )}
          {campania && actual.key === 'canales' && (
            <>
              {conMarcador && <CanalMarcador campania={campania} canales={canales} onChanged={inval} />}
              {!soloMarcador && <CanalesDeCampaniaPanel campania={campania} canales={canales} onChanged={inval} />}
            </>
          )}
          {campania && actual.key === 'tipificaciones' && (grupo?.ventasCampanaId
            ? <TipificacionesDeVentas ventasId={grupo.ventasCampanaId} campania={campania} />
            : <TipificacionesDeCampaniaPanel campania={campania} />)}
          {campania && actual.key === 'formulario' && <FormularioYMarcadorPanel campania={campania} onIrAContacto={() => setPaso(0)} />}

          {campania && actual.key === 'listo' && (
            <div className="space-y-4">
              <div className={card}>
                <p className="mb-3 text-sm font-bold text-ink">Resumen de "{campania.nombre}"</p>
                <div className="space-y-2">
                  {[
                    ...(soloMarcador ? [] : [{ ok: completo.skills, txt: `${grupos.length} skill(s)`, falta: 'Sin skills', paso: 'skills' as PasoKey }]),
                    { ok: completo.canales, txt: `${canales.length} canal(es): ${canales.map((c) => c.nombre).join(', ')}`, falta: soloMarcador ? 'Sin canal Marcador' : 'Sin canales', paso: 'canales' as PasoKey },
                    { ok: completo.formulario, txt: `${forms?.formularios.length ?? 0} formulario(s): ${(forms?.formularios ?? []).map((f) => f.nombre).join(', ')}`, falta: 'Sin formulario asignado', paso: 'formulario' as PasoKey },
                    {
                      ok: !!forms?.marcador.formularioId,
                      txt: `Marcador abre "${forms?.formularios.find((f) => f.id === forms?.marcador.formularioId)?.nombre ?? ''}"`,
                      falta: 'El marcador aún no abre ningún formulario (opcional)', paso: 'formulario' as PasoKey,
                    },
                  ].map((x, i) => (
                    <button key={i} onClick={() => irA(x.paso)} className="flex w-full items-center gap-2.5 rounded-xl border border-gray-100 px-3.5 py-2.5 text-left transition hover:bg-gray-50">
                      {x.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 flex-shrink-0 text-amber-400" />}
                      <span className={clsx('text-sm', x.ok ? 'text-ink' : 'text-amber-700')}>{x.ok ? x.txt : x.falta}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="mb-3 flex items-center gap-2.5">
                  <BarChart3 className="h-4 w-4 text-violet-600" />
                  <p className="text-sm font-bold text-ink">Reportes (ya creados automáticamente)</p>
                </div>
                <p className="mb-3 text-[0.72rem] text-ink-tertiary">En la Suite de reportes → carpeta "Campañas" → {campania.nombre}.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {REPORTES_CAMPANIA.map((r) => (
                    <button key={r.id} onClick={() => navigate(`/operaciones/suite-reportes?campania=${campania.id}&reporte=${r.id}`)}
                      className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:border-violet-200 hover:bg-violet-50/40">
                      <r.icon className="h-4 w-4 flex-shrink-0 text-violet-500" /> {r.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <p className="px-1 text-[0.72rem] text-ink-tertiary">
                Agentes y supervisores: agrega la campaña a un grupo en Configuración → Usuarios y Seguridad → Grupos.
                Lo demás se cambia en Configuración → Contact Center → Campañas y skills → {campania.nombre}.
              </p>
            </div>
          )}

          {/* Navegación */}
          {paso > 0 && (
            <div className="flex items-center justify-between">
              <button onClick={() => setPaso(paso - 1)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:bg-gray-50">
                <ArrowLeft className="h-4 w-4" /> Anterior
              </button>
              {paso < PASOS.length - 1 ? (
                <button onClick={() => setPaso(paso + 1)}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700">
                  Siguiente <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={terminar}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                  <Check className="h-4 w-4" /> Terminar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Piezas del asistente cuando se abre desde "Crear grupo" ── */

// La gente del grupo (paso 3 de Crear grupo): es la que entra a los skills que
// el grupo tenga marcados al crearlo o guardarlo.
function GenteDelGrupo({ grupo }: { grupo: GrupoDeLaCampania }) {
  const lista = (titulo: string, xs: { usuarioId: number; nombre: string }[]) => (
    <div className="min-w-0">
      <p className="mb-1 text-[0.66rem] font-semibold uppercase tracking-wide text-violet-700">{titulo} · {xs.length}</p>
      {xs.length ? (
        <div className="flex items-center gap-2" title={xs.map((x) => x.nombre).join(', ')}>
          <div className="flex -space-x-2">{xs.slice(0, 6).map((x) => <Avatar key={x.usuarioId} name={x.nombre} size="sm" />)}</div>
          {xs.length > 6 && <span className="text-[0.7rem] text-ink-tertiary">+{xs.length - 6}</span>}
        </div>
      ) : <p className="text-[0.72rem] text-ink-tertiary">Se cargan en el paso 3 del grupo</p>}
    </div>
  )
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[0.8rem] font-semibold text-violet-900">
        <UsersRound className="h-4 w-4" /> Gente del grupo {grupo.nombre ? `"${grupo.nombre}"` : ''}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {lista('Supervisores', grupo.supervisores)}
        {lista('Agentes', grupo.agentes)}
      </div>
      <p className="mt-2 text-[0.68rem] text-violet-800">Al crear o guardar el grupo entran solos a los skills que marques en su paso "Campañas y skills".</p>
    </div>
  )
}

// Canal del marcador (VICIdial): sin credenciales; con él el formulario del
// marcador registra cada interacción. Se crea solo la primera vez.
function CanalMarcador({ campania, canales, onChanged }: { campania: { id: number; nombre: string }; canales: { id: number; nombre: string; tipo: string }[]; onChanged: () => void }) {
  const qc = useQueryClient()
  const existente = canales.find((c) => c.tipo === 'marcador')
  const intentado = useRef(false)
  const crear = useMutation({
    mutationFn: async () => {
      const r = await ccService.createCanal({ tipo: 'marcador', nombre: `Marcador ${campania.nombre}`.slice(0, 120) })
      const id = (r as { data?: { id?: number } })?.data?.id
      if (id) await ccService.updateCanal(id, { campaniaId: campania.id })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-canales'] }); onChanged() },
    onError: () => toast.error('No se pudo crear el canal Marcador'),
  })
  useEffect(() => {
    if (existente || intentado.current) return
    intentado.current = true
    crear.mutate()
  }, [existente]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={clsx(card, 'flex items-center gap-3')}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><PhoneCall className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Canal Marcador (VICIdial)</p>
        <p className="text-[0.72rem] text-ink-tertiary">
          {existente ? `Listo: "${existente.nombre}". Cada registro del formulario del marcador entra por este canal.`
            : crear.isPending ? 'Creando el canal…' : 'Sin canal del marcador todavía.'}
        </p>
      </div>
      {existente ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
        : !crear.isPending && (
          <button onClick={() => crear.mutate()} className="rounded-xl bg-amber-500 px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-amber-600">Crear canal</button>
        )}
    </div>
  )
}

// Con campaña de Ventas las tipificaciones son sus estatus: se copian a esta
// campaña (el formulario ya las ofrece) y se editan en un solo lugar.
function TipificacionesDeVentas({ ventasId, campania }: { ventasId: number; campania: { id: number; nombre: string } }) {
  const qc = useQueryClient()
  const { data: cv, refetch } = useQuery({ queryKey: ['campana-ventas', ventasId], queryFn: () => campanasVentasService.get(ventasId) })
  const [editor, setEditor] = useState(false)
  const copiar = useMutation({
    mutationFn: () => campanasVentasService.copiarEstatusACampania(ventasId, campania.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-tipificaciones'] }); qc.invalidateQueries({ queryKey: ['ccf-tipificaciones'] }) },
    onError: () => toast.error('No se pudieron copiar los estatus de Ventas a la campaña'),
  })
  const copiado = useRef(false)
  useEffect(() => {
    if (copiado.current) return
    copiado.current = true
    copiar.mutate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const activos = (cv?.estatus ?? []).filter((e) => e.activo)
  return (
    <div className={clsx(card, 'space-y-3')}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: `${cv?.color ?? '#f59e0b'}22`, color: cv?.color ?? '#f59e0b' }}>
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Estatus de {cv?.nombre ?? 'la campaña de Ventas'}</p>
          <p className="text-[0.72rem] text-ink-tertiary">
            Son las tipificaciones de "{campania.nombre}": lo que el agente elige en el formulario llega igual a Ventas.
            {copiar.isPending ? ' Copiando…' : copiar.isSuccess ? ' Ya están en la campaña.' : ''}
          </p>
        </div>
        <button onClick={() => setEditor(true)} className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[0.75rem] font-semibold text-ink-secondary hover:border-violet-300 hover:text-violet-700">
          <Pencil className="h-3.5 w-3.5" /> Editar estatus
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activos.length ? activos.map((e) => (
          <span key={e.id} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[0.78rem] font-medium text-ink">
            <span className="h-2 w-2 rounded-full" style={{ background: e.color ?? '#9ca3af' }} /> {e.nombre}
          </span>
        )) : <p className="text-[0.75rem] text-ink-tertiary">Cargando estatus…</p>}
      </div>
      {editor && (
        <EditorCampanaVentas campanaId={ventasId} onClose={() => setEditor(false)}
          onSaved={() => { setEditor(false); refetch(); copiar.mutate() }} />
      )}
    </div>
  )
}
