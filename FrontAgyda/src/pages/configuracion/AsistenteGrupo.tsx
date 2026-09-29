import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, Check, Headset, Building2, UsersRound, Layers, UserPlus, Rocket, X, Loader2,
  Plus, Search, MessagesSquare, Phone, Trash2, AlertTriangle, CloudCheck, FileClock, RotateCcw, Pencil, CircleDashed, FileBarChart,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useActionAccess } from '@/hooks/useActionAccess'
import {
  gruposService, grupoAsistenteService as svc,
  type CatalogoAsistenteGrupo, type DatosGrupoBorrador, type BorradorGrupoResumen, type PendienteGrupo,
  type ModalidadGrupo, type TipoGrupoAsistente, type PlantillaReporteGrupo,
} from '@/services/grupos.service'
import { AsistenteCampania } from './AsistenteCampania'
import { RbMiniatura } from '@/pages/suite-reportes/RbMiniatura'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
const btnPrim = 'flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50'
const btnSec = 'flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[0.8rem] font-semibold text-ink-secondary hover:bg-gray-50 disabled:opacity-50'
type ErrApi = { response?: { data?: { message?: string; pendientes?: PendienteGrupo[] } } }
const msgError = (e: unknown, fallback: string) => (e as ErrApi)?.response?.data?.message ?? fallback

const TIPOS: { key: TipoGrupoAsistente; nombre: string; desc: string; icon: typeof Headset }[] = [
  { key: 'cc-equipos', nombre: 'Contact Center', desc: 'Agentes que atienden campañas por omnicanal y/o marcador', icon: Headset },
  { key: 'atencion-clientes', nombre: 'Atención a clientes', desc: 'Lo mismo, y además atiende a sus clientes (chat del portal y avisos)', icon: Building2 },
]
const MODALIDADES: { key: ModalidadGrupo; nombre: string; desc: string; icon: typeof Headset }[] = [
  { key: 'omnicanal', nombre: 'Omnicanal', desc: 'Conversaciones de los canales de sus skills', icon: MessagesSquare },
  { key: 'marcador', nombre: 'Marcador', desc: 'Solo llamadas con el marcador', icon: Phone },
  { key: 'ambos', nombre: 'Ambos', desc: 'Conversaciones y marcador', icon: Headset },
]

const vacio = (): DatosGrupoBorrador => ({
  tipo: 'cc-equipos', nombre: '', descripcion: '', campanias: [], modalidad: 'omnicanal', skillIds: [],
  webphoneVistaId: null, ventasCampanaId: null, supervisores: [], agentes: [], clientes: [],
})

// Mismas reglas que el backend (que es el que decide al crear).
function pendientesDe(d: DatosGrupoBorrador, cat: CatalogoAsistenteGrupo | undefined): PendienteGrupo[] {
  const p: PendienteGrupo[] = []
  const atencion = d.tipo === 'atencion-clientes'
  if (atencion && cat && !cat.atencion) p.push({ paso: 'grupo', texto: 'La empresa no tiene activo Atención al Cliente' })
  if (!d.nombre.trim()) p.push({ paso: 'grupo', texto: 'Falta el nombre del grupo' })
  if (!d.campanias.length) p.push({ paso: 'asignaciones', texto: 'Asigna al menos una campaña' })
  if (d.modalidad !== 'omnicanal' && cat && !cat.marcador) p.push({ paso: 'asignaciones', texto: 'La empresa no tiene activo Webphone: usa Omnicanal' })
  const skillsValidos = skillsDeCampanias(d, cat)
  if (d.modalidad !== 'marcador' && !skillsValidos.length) p.push({ paso: 'asignaciones', texto: 'Elige al menos un skill para el omnicanal' })
  if (d.modalidad !== 'omnicanal' && !d.webphoneVistaId) p.push({ paso: 'asignaciones', texto: 'Elige el marcador del grupo' })
  if (!d.supervisores.length) p.push({ paso: 'personas', texto: 'Falta al menos un supervisor' })
  if (!d.agentes.length) p.push({ paso: 'personas', texto: `Falta al menos un ${atencion ? 'asesor' : 'agente'}` })
  if (atencion && !d.clientes.length) p.push({ paso: 'clientes', texto: 'Asigna al menos un cliente' })
  return p
}
const recomendadasDe = (cat: CatalogoAsistenteGrupo) => (cat.plantillasReportes ?? []).filter((p) => p.recomendada).map((p) => p.id)
// Plantillas elegidas que aplican a la modalidad del grupo (las demás se omiten al crear).
const plantillaAplica = (p: PlantillaReporteGrupo, modalidad: ModalidadGrupo) => !p.requiere || p.requiere.includes(modalidad)
function reportesQueAplican(d: DatosGrupoBorrador, cat: CatalogoAsistenteGrupo | undefined) {
  const sel = new Set(d.reportes ?? [])
  return (cat?.plantillasReportes ?? []).filter((p) => sel.has(p.id) && plantillaAplica(p, d.modalidad))
}
// Solo cuentan los skills de las campañas elegidas.
function skillsDeCampanias(d: DatosGrupoBorrador, cat: CatalogoAsistenteGrupo | undefined) {
  if (!cat) return d.skillIds
  const ids = new Set(cat.campanias.filter((c) => d.campanias.some((x) => x.id === c.id)).flatMap((c) => c.skills.map((s) => s.id)))
  return d.skillIds.filter((s) => ids.has(s))
}

// Asistente "Crear grupo" (portada de Configuración). Se captura todo como
// borrador (se guarda solo) y el grupo se crea al final con todo configurado.
// Si hay borradores pendientes, al abrir pregunta si continuar o empezar otro.
export function AsistenteGrupo({ onSalir }: { onSalir: () => void }) {
  const qc = useQueryClient()
  const { data: catalogo, refetch: recargarCatalogo } = useQuery({ queryKey: ['grupo-asistente-catalogo'], queryFn: svc.catalogo })
  const [modo, setModo] = useState<'elegir' | 'editar' | 'resultado'>('elegir')
  const [borradorId, setBorradorId] = useState<number | null>(null)
  const [cargar, setCargar] = useState(false)
  const { data: borradores, isLoading } = useQuery({ queryKey: ['grupo-asistente-borradores'], queryFn: svc.borradores, enabled: modo === 'elegir' })
  const mios = (borradores ?? []).filter((b) => b.esMio)
  useEffect(() => {
    if (modo === 'elegir' && !isLoading && borradores && mios.length === 0) { setCargar(false); setModo('editar') }
  }, [modo, isLoading, borradores, mios.length])

  if (!catalogo || (modo === 'elegir' && (isLoading || mios.length === 0))) {
    return <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
  }
  if (modo === 'elegir') {
    return <ElegirBorrador borradores={mios} onSalir={onSalir}
      onContinuar={(b) => { setBorradorId(b.id); if (b.estado === 'borrador') { setCargar(true); setModo('editar') } else setModo('resultado') }}
      onNuevo={() => { setBorradorId(null); setCargar(false); setModo('editar') }}
      onDescartado={() => qc.invalidateQueries({ queryKey: ['grupo-asistente-borradores'] })} />
  }
  if (modo === 'resultado' && borradorId) {
    return <VistaResultado borradorId={borradorId} onEditar={() => { setCargar(true); setModo('editar') }} onSalir={onSalir} />
  }
  return <Editor catalogo={catalogo} recargarCatalogo={() => recargarCatalogo()} borradorId={borradorId} cargar={cargar}
    onBorradorCreado={setBorradorId} onCreado={() => setModo('resultado')} onSalir={onSalir} />
}

/* ─────────────── Pregunta al abrir ─────────────── */
function ElegirBorrador({ borradores, onContinuar, onNuevo, onSalir, onDescartado }: {
  borradores: BorradorGrupoResumen[]; onContinuar: (b: BorradorGrupoResumen) => void; onNuevo: () => void; onSalir: () => void; onDescartado: () => void
}) {
  const [descartar, setDescartar] = useState<BorradorGrupoResumen | null>(null)
  const quitar = useMutation({
    mutationFn: (id: number) => svc.descartar(id),
    onSuccess: () => { toast.success('Borrador descartado'); setDescartar(null); onDescartado() },
    onError: (e) => toast.error(msgError(e, 'No se pudo descartar')),
  })
  const estado = (b: BorradorGrupoResumen) =>
    b.estado === 'creado' ? 'Creado · falta revisar y terminar'
      : b.estado === 'error' ? `No se pudo terminar de crear: ${b.error ?? 'error'}`
        : b.estado === 'creando' ? (b.interrumpido ? 'La creación se interrumpió a la mitad' : 'Creándose…')
          : `Borrador · paso ${Math.min(b.paso + 1, 6)}`
  return (
    <div className="space-y-4">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={onSalir} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary hover:bg-gray-50"><X className="h-4 w-4" /></button>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear grupo</p>
          <h2 className="text-base font-bold text-ink">Tienes {borradores.length === 1 ? 'un grupo pendiente' : `${borradores.length} grupos pendientes`}</h2>
        </div>
      </div>
      <div className={clsx(card, 'space-y-3')}>
        <p className="text-[0.8rem] text-ink-secondary">¿Quieres continuar donde te quedaste o empezar un grupo nuevo?</p>
        {borradores.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><FileClock className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.88rem] font-semibold text-ink">{b.nombre || 'Grupo sin nombre'} <span className="text-[0.72rem] font-normal text-ink-tertiary">· {b.tipo === 'atencion-clientes' ? 'Atención a clientes' : 'Contact Center'}</span></p>
              <p className={clsx('text-[0.72rem]', b.estado === 'error' ? 'text-red-600' : b.interrumpido ? 'text-amber-600' : b.estado === 'creado' ? 'text-emerald-600' : 'text-ink-tertiary')}>{estado(b)}</p>
              <p className="text-[0.66rem] text-ink-tertiary">{b.resumen.campanias} campañas · {b.resumen.supervisores} supervisores · {b.resumen.agentes} agentes{b.tipo === 'atencion-clientes' ? ` · ${b.resumen.clientes} clientes` : ''}</p>
            </div>
            {!b.grupoId && b.estado !== 'creando' && (
              <button onClick={() => setDescartar(b)} className="rounded-lg p-2 text-ink-tertiary hover:bg-red-50 hover:text-red-500" title="Descartar borrador"><Trash2 className="h-4 w-4" /></button>
            )}
            <button onClick={() => onContinuar(b)} className={btnPrim}>Continuar <ArrowRight className="h-4 w-4" /></button>
          </div>
        ))}
        <div className="flex justify-end border-t border-gray-50 pt-3">
          <button onClick={onNuevo} className={btnSec}><Plus className="h-4 w-4" /> Empezar un grupo nuevo</button>
        </div>
      </div>
      <ConfirmDialog isOpen={!!descartar} onClose={() => setDescartar(null)} onConfirm={() => descartar && quitar.mutate(descartar.id)}
        title="Descartar borrador" message={`Se borrará todo lo capturado de "${descartar?.nombre || 'Grupo sin nombre'}". No se puede deshacer.`}
        confirmLabel="Descartar" isPending={quitar.isPending} />
    </div>
  )
}

/* ─────────────── Editor del borrador ─────────────── */
type SetDatos = React.Dispatch<React.SetStateAction<DatosGrupoBorrador | null>>
const upd = (s: SetDatos, f: (d: DatosGrupoBorrador) => DatosGrupoBorrador) => s((d) => (d ? f(d) : d))

function Editor({ catalogo, recargarCatalogo, borradorId, cargar, onBorradorCreado, onCreado, onSalir }: {
  catalogo: CatalogoAsistenteGrupo; recargarCatalogo: () => void; borradorId: number | null; cargar: boolean
  onBorradorCreado: (id: number) => void; onCreado: () => void; onSalir: () => void
}) {
  const qc = useQueryClient()
  // Las plantillas recomendadas quedan marcadas de inicio (también en borradores viejos que no las tenían).
  const [datos, setDatos] = useState<DatosGrupoBorrador | null>(cargar ? null : { ...vacio(), reportes: recomendadasDe(catalogo) })
  const [paso, setPaso] = useState(0)
  const [grupoYaCreado, setGrupoYaCreado] = useState(false)
  const [guardado, setGuardado] = useState<'guardado' | 'guardando' | 'pendiente' | 'error'>('guardado')
  const [confirmSalir, setConfirmSalir] = useState(false)
  const [confirmCrear, setConfirmCrear] = useState(false)
  const [creando, setCreando] = useState(false)
  const idRef = useRef<number | null>(borradorId)
  const primerCambio = useRef(true)

  const { data: cargado } = useQuery({ queryKey: ['grupo-asistente-borrador', borradorId], queryFn: () => svc.borrador(borradorId!), enabled: cargar && !!borradorId, gcTime: 0 })
  useEffect(() => {
    if (!cargado || datos) return
    setDatos({ ...vacio(), reportes: recomendadasDe(catalogo), ...cargado.datos })
    setPaso(Math.min(cargado.paso ?? 0, 5))
    setGrupoYaCreado(!!cargado.grupoId)
  }, [cargado, datos, catalogo])

  const guardarAhora = async (d: DatosGrupoBorrador, p: number) => {
    if (!idRef.current) return true
    setGuardado('guardando')
    try { await svc.guardarBorrador(idRef.current, d, p); setGuardado('guardado'); return true } catch (e) { setGuardado('error'); toast.error(msgError(e, 'No se pudo guardar el borrador')); return false }
  }
  useEffect(() => {
    if (!datos || !idRef.current) return
    if (primerCambio.current) { primerCambio.current = false; return }
    setGuardado('pendiente')
    const t = setTimeout(() => { guardarAhora(datos, paso) }, 800)
    return () => clearTimeout(t)
  }, [datos, paso]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!datos) return <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>

  const atiende = datos.tipo === 'atencion-clientes'
  const gente = atiende ? 'Asesores' : 'Agentes'
  const conReportes = !!catalogo.reportes && (catalogo.plantillasReportes ?? []).length > 0
  const nReportes = reportesQueAplican(datos, catalogo).length
  const PASOS = [
    { key: 'grupo', titulo: 'Grupo', desc: 'Tipo, nombre y descripción', icon: UsersRound },
    { key: 'asignaciones', titulo: 'Campañas y skills', desc: 'Campañas, skills, comunicación, marcador', icon: Layers },
    { key: 'personas', titulo: `Supervisores y ${gente.toLowerCase()}`, desc: 'Quién supervisa y quién trabaja', icon: UserPlus },
    ...(atiende ? [{ key: 'clientes', titulo: 'Clientes', desc: 'A qué clientes atiende', icon: Building2 }] : []),
    ...(conReportes ? [{ key: 'reportes', titulo: 'Reportes', desc: 'Sus reportes en la Suite', icon: FileBarChart }] : []),
    { key: 'revisar', titulo: 'Revisar y crear', desc: 'Todo se crea al final', icon: Rocket },
  ]
  const actual = PASOS[Math.min(paso, PASOS.length - 1)]
  const pend = pendientesDe(datos, catalogo)
  const pendPaso = (k: string) => pend.filter((x) => x.paso === k).length
  const bloqueado = (i: number) => i > 0 && !idRef.current
  const irA = (i: number) => { if (!bloqueado(i)) setPaso(i) }

  const crearBorrador = async () => {
    try {
      const r = await svc.crearBorrador(datos, 1)
      idRef.current = r.id
      primerCambio.current = true
      onBorradorCreado(r.id)
      qc.invalidateQueries({ queryKey: ['grupo-asistente-borradores'] })
      setPaso(1)
    } catch (e) { toast.error(msgError(e, 'No se pudo guardar el borrador')) }
  }
  const crearGrupo = async () => {
    if (!(await guardarAhora(datos, paso))) return
    setCreando(true)
    try {
      await svc.crearGrupo(idRef.current!)
      qc.invalidateQueries({ queryKey: ['grupos-resumen'] })
      qc.invalidateQueries({ queryKey: ['grupo-asistente-borradores'] })
      onCreado()
    } catch (e) {
      const d = (e as ErrApi)?.response?.data
      toast.error(d?.pendientes?.length ? `Falta: ${d.pendientes.map((x) => x.texto).join(' · ')}` : msgError(e, 'No se pudo crear el grupo'), { duration: 7000 })
      onCreado() // la vista de resultado muestra el error y deja continuar o corregir
    } finally {
      setCreando(false); setConfirmCrear(false)
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={() => (idRef.current || datos.nombre.trim() ? setConfirmSalir(true) : onSalir())} title="Salir del asistente"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50"><X className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear grupo · borrador</p>
          <h2 className="truncate text-base font-bold text-ink">{datos.nombre || 'Grupo nuevo'}</h2>
        </div>
        {idRef.current && (
          <span className={clsx('flex flex-shrink-0 items-center gap-1.5 text-[0.7rem] font-semibold', guardado === 'error' ? 'text-red-600' : guardado === 'guardado' ? 'text-emerald-600' : 'text-ink-tertiary')}>
            {guardado === 'guardado' ? <CloudCheck className="h-4 w-4" /> : guardado === 'error' ? <AlertTriangle className="h-4 w-4" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {guardado === 'guardado' ? 'Borrador guardado' : guardado === 'error' ? 'Sin guardar' : 'Guardando…'}
          </span>
        )}
        <span className="flex-shrink-0 text-[0.72rem] text-ink-tertiary">Paso {Math.min(paso, PASOS.length - 1) + 1} de {PASOS.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <nav className={clsx(card, 'h-fit space-y-1 !p-3')}>
          {PASOS.map((p, i) => {
            const activo = actual.key === p.key
            const faltan = p.key === 'revisar' ? pend.length : pendPaso(p.key)
            const hecho = p.key !== 'revisar' && !!idRef.current && faltan === 0
            return (
              <button key={p.key} disabled={bloqueado(i)} onClick={() => irA(i)}
                className={clsx('flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40', activo ? 'bg-violet-50' : 'hover:bg-gray-50')}>
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

          {actual.key === 'grupo' && (
            <div className={clsx(card, 'space-y-4')}>
              <div>
                <span className={label}>Tipo de grupo</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TIPOS.map(({ key, nombre, desc, icon: Icon }) => {
                    const sinModulo = key === 'atencion-clientes' && !catalogo.atencion
                    return (
                      <button key={key} type="button" disabled={grupoYaCreado || sinModulo} onClick={() => upd(setDatos, (d) => ({ ...d, tipo: key }))}
                        title={sinModulo ? 'La empresa no tiene activo el módulo Atención al Cliente' : undefined}
                        className={clsx('flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                          datos.tipo === key ? 'border-violet-300 bg-violet-50' : 'border-gray-100 hover:border-gray-200')}>
                        <Icon className={clsx('mt-0.5 h-5 w-5 flex-shrink-0', datos.tipo === key ? 'text-violet-600' : 'text-ink-tertiary')} />
                        <span>
                          <span className="block text-[0.85rem] font-semibold text-ink">{nombre}</span>
                          <span className="block text-[0.7rem] text-ink-tertiary">{sinModulo ? 'Requiere el módulo Atención al Cliente' : desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <label className="block"><span className={label}>Nombre del grupo</span>
                <input className={field} value={datos.nombre} autoFocus onChange={(e) => upd(setDatos, (d) => ({ ...d, nombre: e.target.value }))} placeholder="Ej. Ventas Amex turno matutino" /></label>
              <label className="block"><span className={label}>Descripción (opcional)</span>
                <input className={field} value={datos.descripcion} onChange={(e) => upd(setDatos, (d) => ({ ...d, descripcion: e.target.value }))} placeholder="¿Qué hace este grupo?" /></label>
              <div className="rounded-xl bg-violet-50/60 px-3 py-2.5 text-[0.72rem] text-violet-900">
                Nada se crea todavía: captura sus campañas, skills, supervisores y {gente.toLowerCase()}; todo se guarda como borrador y el grupo se crea con todo configurado en el último paso.
              </div>
              <div className="flex justify-end">
                <button onClick={idRef.current ? () => irA(1) : crearBorrador} disabled={!datos.nombre.trim()} className={btnPrim}>
                  <ArrowRight className="h-4 w-4" /> {idRef.current ? 'Continuar' : 'Guardar borrador y continuar'}
                </button>
              </div>
            </div>
          )}
          {actual.key === 'asignaciones' && <PasoAsignaciones datos={datos} setDatos={setDatos} catalogo={catalogo} recargarCatalogo={recargarCatalogo} />}
          {actual.key === 'personas' && <PasoPersonas datos={datos} setDatos={setDatos} catalogo={catalogo} />}
          {actual.key === 'clientes' && <PasoClientes datos={datos} setDatos={setDatos} catalogo={catalogo} />}
          {actual.key === 'reportes' && <PasoReportes datos={datos} setDatos={setDatos} catalogo={catalogo} />}
          {actual.key === 'revisar' && (
            <div className={clsx(card, 'space-y-4')}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { paso: 'grupo', texto: `${datos.nombre || '(sin nombre)'} · ${atiende ? 'Atención a clientes' : 'Contact Center'}` },
                  { paso: 'asignaciones', texto: `${datos.campanias.length} campaña(s) · ${MODALIDADES.find((m) => m.key === datos.modalidad)?.nombre} · ${skillsDeCampanias(datos, catalogo).length} skill(s)` },
                  { paso: 'personas', texto: `${datos.supervisores.length} supervisor(es) · ${datos.agentes.length} ${gente.toLowerCase()}` },
                  ...(atiende ? [{ paso: 'clientes', texto: `${datos.clientes.length} cliente(s)` }] : []),
                  ...(conReportes ? [{ paso: 'reportes', texto: nReportes ? `${nReportes} reporte(s) en la Suite` : 'Sin reportes (puedes crearlos después)' }] : []),
                ].map((r) => {
                  const falta = pend.some((x) => x.paso === r.paso)
                  return (
                    <button key={r.paso} onClick={() => irA(PASOS.findIndex((p) => p.key === r.paso))} className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[0.78rem]',
                      falta ? 'border-amber-200 bg-amber-50/60 text-amber-800' : 'border-emerald-100 bg-emerald-50/60 text-emerald-700')}>
                      {falta ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> : <Check className="h-4 w-4 flex-shrink-0" />} {r.texto}
                    </button>
                  )
                })}
              </div>
              {pend.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="mb-1 text-[0.78rem] font-bold text-amber-800">Antes de crear el grupo falta:</p>
                  <ul className="space-y-0.5">
                    {pend.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-[0.75rem] text-amber-800">
                        <span>• {p.texto}</span>
                        <button onClick={() => irA(PASOS.findIndex((x) => x.key === p.paso))} className="text-[0.7rem] font-semibold text-violet-700 hover:underline">Ir</button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[0.68rem] text-amber-700">Puedes salir cuando quieras: el borrador queda guardado y al volver te preguntará si continúas.</p>
                </div>
              ) : (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[0.78rem] text-emerald-800">Todo listo. Al crearlo se aplica de una vez: campañas, skills, marcador, supervisores, {gente.toLowerCase()}{atiende ? ' y clientes' : ''}{nReportes ? `, y ${nReportes} reporte(s) en la Suite` : ''}.</p>
              )}
              <div className="flex justify-end">
                <button onClick={() => setConfirmCrear(true)} disabled={pend.length > 0 || creando} className={btnPrim}>
                  {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Crear grupo
                </button>
              </div>
            </div>
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

      <ConfirmDialog isOpen={confirmSalir} onClose={() => setConfirmSalir(false)} variant="warning" confirmLabel="Salir" title="¿Salir del asistente?"
        message={idRef.current
          ? 'Lo capturado queda guardado como borrador. El grupo todavía no se crea: la próxima vez que abras "Crear grupo" te preguntará si quieres continuarlo.'
          : 'Todavía no se guarda nada (el borrador se guarda al pasar del primer paso). Si sales, se pierde lo que escribiste.'}
        onConfirm={async () => { if (idRef.current) await guardarAhora(datos, paso); setConfirmSalir(false); qc.invalidateQueries({ queryKey: ['grupo-asistente-borradores'] }); onSalir() }} />
      <ConfirmDialog isOpen={confirmCrear} onClose={() => setConfirmCrear(false)} variant="warning" confirmLabel="Crear grupo" isPending={creando}
        title={`¿Crear el grupo ${datos.nombre}?`}
        message={`Se crea con ${datos.campanias.length} campaña(s), ${datos.supervisores.length} supervisor(es) y ${datos.agentes.length} ${gente.toLowerCase()}${atiende ? ` y ${datos.clientes.length} cliente(s)` : ''}; todos reciben su configuración al momento. Si algo falla, podrás continuar sin duplicar nada.`}
        onConfirm={crearGrupo} />
    </div>
  )
}

/* ─────────────── Paso 2: Campañas y skills ─────────────── */
function PasoAsignaciones({ datos, setDatos, catalogo, recargarCatalogo }: {
  datos: DatosGrupoBorrador; setDatos: SetDatos; catalogo: CatalogoAsistenteGrupo; recargarCatalogo: () => void
}) {
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const puedeCrearCampania = can('contact-center', 'gestionar-skills')
  const [asistente, setAsistente] = useState(false)
  const [nuevoSkill, setNuevoSkill] = useState<{ campaniaId: number; nombre: string } | null>(null)
  const campIds = datos.campanias.map((c) => c.id)
  const asignadas = catalogo.campanias.filter((c) => campIds.includes(c.id))
  const usaSkills = datos.modalidad !== 'marcador'
  const usaMarcador = datos.modalidad !== 'omnicanal'
  const toggleCampania = (id: number) => upd(setDatos, (d) => ({ ...d, campanias: d.campanias.some((x) => x.id === id) ? d.campanias.filter((x) => x.id !== id) : [...d.campanias, { id, formularioId: null }] }))
  const toggleSkill = (id: number) => upd(setDatos, (d) => ({ ...d, skillIds: d.skillIds.includes(id) ? d.skillIds.filter((x) => x !== id) : [...d.skillIds, id] }))
  const chk = (m: boolean) => clsx('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[0.8rem]', m ? 'border-violet-200 bg-violet-50/50' : 'border-gray-100')

  // Crear un skill es inmediato (vive en la campaña, no en el grupo) y queda marcado en el borrador.
  const crearSkill = useMutation({
    mutationFn: (s: { campaniaId: number; nombre: string }) => gruposService.crear('cc-skills', { nombre: s.nombre, campaniaId: s.campaniaId }),
    onSuccess: (r) => { upd(setDatos, (d) => ({ ...d, skillIds: [...d.skillIds, r.data.id] })); setNuevoSkill(null); recargarCatalogo(); toast.success('Skill creado en la campaña y marcado') },
    onError: (e) => toast.error(msgError(e, 'No se pudo crear el skill')),
  })

  return (
    <div className={clsx(card, 'space-y-5')}>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[0.85rem] font-bold text-ink">Campañas ({datos.campanias.length})</p>
          {puedeCrearCampania && (
            <button onClick={() => setAsistente(true)} className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white hover:bg-violet-700"><Plus className="h-3.5 w-3.5" /> Nueva campaña</button>
          )}
        </div>
        <p className="mb-2 text-[0.7rem] text-ink-tertiary">Sus supervisores supervisan estas campañas. Cada una da su link del marcador para este grupo.</p>
        {catalogo.campanias.length === 0 && <p className="text-[0.75rem] text-amber-700">La empresa no tiene campañas activas{puedeCrearCampania ? ': crea una con "Nueva campaña".' : '.'}</p>}
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {catalogo.campanias.map((c) => (
            <label key={c.id} className={chk(campIds.includes(c.id))}>
              <input type="checkbox" checked={campIds.includes(c.id)} className="accent-violet-600" onChange={() => toggleCampania(c.id)} />
              <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
              <span className="text-[0.62rem] text-ink-tertiary">{c.skills.length} skill(s)</span>
              {c.otrosGrupos && <span className="text-[0.62rem] text-amber-600" title="La comparten: sus supervisores serán los de ambos grupos">también {c.otrosGrupos}</span>}
            </label>
          ))}
        </div>
      </div>

      {asignadas.length > 0 && (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-[0.85rem] font-bold text-ink">Cómo trabaja el grupo</p>
          <div className="grid grid-cols-3 gap-2">
            {MODALIDADES.map(({ key, nombre, desc, icon: Icon }) => {
              const sinModulo = key !== 'omnicanal' && !catalogo.marcador
              return (
                <button key={key} type="button" disabled={sinModulo} onClick={() => upd(setDatos, (d) => ({ ...d, modalidad: key }))}
                  title={sinModulo ? 'La empresa no tiene activo el módulo Webphone' : undefined}
                  className={clsx('rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50', datos.modalidad === key ? 'border-violet-300 bg-violet-50' : 'border-gray-100 hover:border-gray-200')}>
                  <Icon className={clsx('mb-1 h-4 w-4', datos.modalidad === key ? 'text-violet-600' : 'text-ink-tertiary')} />
                  <p className="text-[0.8rem] font-semibold text-ink">{nombre}</p>
                  <p className="text-[0.65rem] leading-tight text-ink-tertiary">{sinModulo ? 'Requiere Webphone' : desc}</p>
                </button>
              )
            })}
          </div>

          {asignadas.map((c) => {
            const sel = datos.campanias.find((x) => x.id === c.id)
            return (
              <div key={c.id} className="rounded-xl border border-gray-100 p-3">
                <p className="mb-2 text-[0.8rem] font-bold text-ink">{c.nombre}</p>
                {usaSkills && (
                  <div className="mb-2">
                    <p className="mb-1 text-[0.7rem] font-semibold text-ink-secondary">Skills</p>
                    {c.skills.length === 0 && <p className="text-[0.7rem] text-ink-tertiary">Esta campaña aún no tiene skills.</p>}
                    <div className="space-y-1">
                      {c.skills.map((s) => (
                        <label key={s.id} className={chk(datos.skillIds.includes(s.id))}>
                          <input type="checkbox" checked={datos.skillIds.includes(s.id)} className="accent-violet-600" onChange={() => toggleSkill(s.id)} />
                          <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                          <span className="text-[0.62rem] text-ink-tertiary">{s.canales} canal(es)</span>
                          {s.otrosGrupos && <span className="text-[0.62rem] text-amber-600">también {s.otrosGrupos}</span>}
                        </label>
                      ))}
                    </div>
                    {nuevoSkill?.campaniaId === c.id ? (
                      <div className="mt-1.5 flex gap-2">
                        <input className={clsx(field, '!py-1.5')} autoFocus value={nuevoSkill.nombre} placeholder="Nombre del skill" onChange={(e) => setNuevoSkill({ campaniaId: c.id, nombre: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && nuevoSkill.nombre.trim()) crearSkill.mutate({ campaniaId: c.id, nombre: nuevoSkill.nombre.trim() }) }} />
                        <button onClick={() => crearSkill.mutate({ campaniaId: c.id, nombre: nuevoSkill.nombre.trim() })} disabled={!nuevoSkill.nombre.trim() || crearSkill.isPending}
                          className="rounded-lg bg-violet-600 px-3 text-[0.72rem] font-semibold text-white disabled:opacity-50">Crear</button>
                        <button onClick={() => setNuevoSkill(null)} className="rounded-lg px-2 text-ink-tertiary hover:bg-gray-100"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setNuevoSkill({ campaniaId: c.id, nombre: '' })} className="mt-1.5 flex items-center gap-1 text-[0.7rem] font-semibold text-violet-600 hover:underline">
                        <Plus className="h-3 w-3" /> Nuevo skill en esta campaña
                      </button>
                    )}
                  </div>
                )}
                {usaMarcador && (
                  <label className="block">
                    <span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Formulario del marcador</span>
                    <select className={clsx(field, '!py-1.5')} value={sel?.formularioId ?? ''}
                      onChange={(e) => upd(setDatos, (d) => ({ ...d, campanias: d.campanias.map((x) => (x.id === c.id ? { ...x, formularioId: e.target.value ? Number(e.target.value) : null } : x)) }))}>
                      <option value="">El de la campaña</option>
                      {c.formularios.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                    {!c.tieneLinkMarcador && <span className="text-[0.65rem] text-amber-600">La campaña no tiene URL del marcador (configúrala en su ficha).</span>}
                    {c.tieneLinkMarcador && <span className="text-[0.65rem] text-ink-tertiary">El link del marcador del grupo se genera al crearlo.</span>}
                  </label>
                )}
              </div>
            )
          })}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {usaMarcador && (
              <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Marcador (Webphone) de los agentes</span>
                <select className={field} value={datos.webphoneVistaId ?? ''} onChange={(e) => upd(setDatos, (d) => ({ ...d, webphoneVistaId: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">Elige el marcador…</option>
                  {catalogo.vistas.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </label>
            )}
            <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-ink-secondary">Campaña de ventas (opcional)</span>
              <select className={field} value={datos.ventasCampanaId ?? ''} onChange={(e) => upd(setDatos, (d) => ({ ...d, ventasCampanaId: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">Sin campaña de ventas</option>
                {catalogo.campanasVentas.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {asistente && (
        <Modal isOpen onClose={() => { setAsistente(false); toast('La campaña quedó a medias: con "Nueva campaña" sigues donde te quedaste') }} title="Nueva campaña" size="full" elevated>
          <AsistenteCampania onSalir={(creada) => {
            setAsistente(false)
            recargarCatalogo()
            qc.invalidateQueries({ queryKey: ['grupos-opciones'] })
            if (creada) { upd(setDatos, (d) => (d.campanias.some((x) => x.id === creada) ? d : { ...d, campanias: [...d.campanias, { id: creada, formularioId: null }] })); toast.success('Campaña lista y marcada en el grupo') }
          }} />
        </Modal>
      )}
    </div>
  )
}

/* ─────────────── Paso 3: Supervisores y agentes ─────────────── */
function BuscarUsuario({ catalogo, excluir, placeholder, onElegir }: {
  catalogo: CatalogoAsistenteGrupo; excluir: Set<number>; placeholder: string; onElegir: (u: { id: number; nombre: string }) => void
}) {
  const [busca, setBusca] = useState('')
  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return catalogo.usuarios.filter((u) => !excluir.has(u.id) && (!t || `${u.nombre} ${u.puesto ?? ''}`.toLowerCase().includes(t))).slice(0, 8)
  }, [catalogo, excluir, busca])
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
      <input className={clsx(field, 'pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={placeholder} />
      {busca.trim() && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
          {candidatos.length === 0 ? <p className="px-3 py-2.5 text-xs text-ink-tertiary">Sin resultados</p> : candidatos.map((u) => (
            <button key={u.id} onClick={() => { onElegir(u); setBusca('') }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-violet-50">
              <UserPlus className="h-4 w-4 flex-shrink-0 text-violet-500" />
              <span className="min-w-0 flex-1 truncate">{u.nombre}</span>
              <span className="text-[0.65rem] text-ink-tertiary">{u.puesto || u.tipo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PasoPersonas({ datos, setDatos, catalogo }: { datos: DatosGrupoBorrador; setDatos: SetDatos; catalogo: CatalogoAsistenteGrupo }) {
  const atiende = datos.tipo === 'atencion-clientes'
  const gente = atiende ? 'asesores' : 'agentes'
  // Una persona, un papel: quien es supervisor no se ofrece como agente y viceversa.
  const ocupados = new Set([...datos.supervisores.map((s) => s.usuarioId), ...datos.agentes.map((a) => a.usuarioId)])
  const lista = (titulo: string, sub: string, campo: 'supervisores' | 'agentes', ph: string) => (
    <div className={clsx(card, 'space-y-3')}>
      <div>
        <p className="text-[0.85rem] font-bold text-ink">{titulo} ({datos[campo].length})</p>
        <p className="text-[0.7rem] text-ink-tertiary">{sub}</p>
      </div>
      <BuscarUsuario catalogo={catalogo} excluir={ocupados} placeholder={ph}
        onElegir={(u) => upd(setDatos, (d) => ({ ...d, [campo]: [...d[campo], { usuarioId: u.id, nombre: u.nombre }] }))} />
      {datos[campo].length === 0 ? <p className="py-2 text-center text-[0.75rem] text-ink-tertiary">Sin {titulo.toLowerCase()}.</p> : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {datos[campo].map((m) => (
            <div key={m.usuarioId} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{m.nombre}</span>
              <button onClick={() => upd(setDatos, (d) => ({ ...d, [campo]: d[campo].filter((x) => x.usuarioId !== m.usuarioId) }))} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
  return (
    <div className="space-y-4">
      {lista('Supervisores', atiende ? 'Supervisan sus campañas y skills, reciben los avisos de sus clientes y ven sus chats.' : 'Supervisan las campañas y los skills del grupo.', 'supervisores', 'Buscar un usuario para hacerlo supervisor…')}
      {lista(atiende ? 'Asesores' : 'Agentes', `Trabajan en el grupo: al crearlo reciben sus campañas, skills y marcador${atiende ? ', y atienden a sus clientes' : ''}. Cada persona es supervisor o ${atiende ? 'asesor' : 'agente'}, no ambos.`, 'agentes', `Buscar un usuario para agregarlo como ${gente.slice(0, -1)}…`)}
    </div>
  )
}

/* ─────────────── Paso 4: Clientes (atención) ─────────────── */
function PasoClientes({ datos, setDatos, catalogo }: { datos: DatosGrupoBorrador; setDatos: SetDatos; catalogo: CatalogoAsistenteGrupo }) {
  const [busca, setBusca] = useState('')
  const ya = new Set(datos.clientes.map((c) => c.clienteId))
  const t = busca.trim().toLowerCase()
  const candidatos = catalogo.clientes.filter((c) => !ya.has(c.id) && (!t || c.nombre.toLowerCase().includes(t))).slice(0, 8)
  return (
    <div className={clsx(card, 'space-y-3')}>
      <div>
        <p className="text-[0.85rem] font-bold text-ink">Clientes que atiende ({datos.clientes.length})</p>
        <p className="text-[0.7rem] text-ink-tertiary">Si un cliente tiene asesor individual, sigue hablando con él; si no, su portal chatea con todo el grupo. Cada cliente está en un solo grupo: si ya tenía otro, se mueve al crear este.</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
        <input className={clsx(field, 'pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un cliente para asignar…" />
        {busca.trim() && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
            {candidatos.length === 0 ? <p className="px-3 py-2.5 text-xs text-ink-tertiary">Sin resultados</p> : candidatos.map((c) => (
              <button key={c.id} onClick={() => { upd(setDatos, (d) => ({ ...d, clientes: [...d.clientes, { clienteId: c.id, nombre: c.nombre }] })); setBusca('') }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-violet-50">
                <Building2 className="h-4 w-4 flex-shrink-0 text-violet-500" />
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                {c.grupo && <span className="text-[0.65rem] text-amber-600" title="Se moverá a este grupo">en {c.grupo}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {datos.clientes.length === 0 ? <p className="py-2 text-center text-[0.75rem] text-ink-tertiary">Aún no atiende a ningún cliente.</p> : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {datos.clientes.map((c) => (
            <div key={c.clienteId} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
              <Building2 className="h-4 w-4 flex-shrink-0 text-violet-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{c.nombre}</span>
              <button onClick={() => upd(setDatos, (d) => ({ ...d, clientes: d.clientes.filter((x) => x.clienteId !== c.clienteId) }))} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-red-50 hover:text-red-500"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────── Resultado: creado, error o interrumpido ─────────────── */
const ETAPAS: { key: string; texto: string }[] = [
  { key: 'grupo', texto: 'Crear el grupo' },
  { key: 'config', texto: 'Aplicar campañas, skills, marcador y supervisores' },
  { key: 'agentes', texto: 'Agregar a su gente' },
  { key: 'clientes', texto: 'Asignar sus clientes' },
  { key: 'reportes', texto: 'Crear sus reportes en la Suite' },
]

/* ─────────────── Paso: Reportes (plantillas de la Suite) ─────────────── */
function PasoReportes({ datos, setDatos, catalogo }: { datos: DatosGrupoBorrador; setDatos: SetDatos; catalogo: CatalogoAsistenteGrupo }) {
  const plantillas = catalogo.plantillasReportes ?? []
  const sel = new Set(datos.reportes ?? [])
  const categorias = [...new Set(plantillas.map((p) => p.categoria))]
  const n = reportesQueAplican(datos, catalogo).length
  const modalidad = MODALIDADES.find((m) => m.key === datos.modalidad)?.nombre.toLowerCase() ?? datos.modalidad
  const gente = datos.tipo === 'atencion-clientes' ? 'asesores' : 'agentes'
  const fijar = (ids: string[]) => upd(setDatos, (d) => ({ ...d, reportes: ids }))
  const toggle = (id: string) => fijar(sel.has(id) ? [...sel].filter((x) => x !== id) : [...sel, id])

  return (
    <div className={clsx(card, 'space-y-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[0.85rem] font-bold text-ink">Reportes del grupo ({n})</p>
          <p className="max-w-2xl text-[0.7rem] text-ink-tertiary">
            Se crean en la Suite de reportes, en la carpeta <span className="font-semibold">"Grupo {datos.nombre || '…'}"</span>, ya limitados a este grupo.
            Los ven los administradores y los supervisores del grupo (los {gente} no). Cada uno es una copia: se puede editar después sin afectar la plantilla.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => fijar(plantillas.filter((p) => p.recomendada).map((p) => p.id))} className={btnSec}>Recomendadas</button>
          <button onClick={() => fijar(plantillas.filter((p) => plantillaAplica(p, datos.modalidad)).map((p) => p.id))} className={btnSec}>Todas</button>
          <button onClick={() => fijar([])} className={btnSec}>Ninguna</button>
        </div>
      </div>

      {categorias.map((cat) => (
        <div key={cat}>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">{cat}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {plantillas.filter((p) => p.categoria === cat).map((p) => {
              const ok = plantillaAplica(p, datos.modalidad)
              const on = ok && sel.has(p.id)
              return (
                <button key={p.id} type="button" disabled={!ok} onClick={() => toggle(p.id)}
                  title={ok ? undefined : `No aplica a un grupo ${modalidad}`}
                  className={clsx('flex gap-3 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45',
                    on ? 'border-violet-300 bg-violet-50/60' : 'border-gray-100 hover:border-gray-200')}>
                  <RbMiniatura tipo={p.tipoVisual} series={p.series} className="h-14 w-24 flex-shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={clsx('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', on ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate text-[0.8rem] font-semibold text-ink">{p.nombre}</span>
                    </span>
                    <span className="mt-0.5 block text-[0.66rem] leading-snug text-ink-tertiary">{ok ? p.descripcion : `No aplica a un grupo ${modalidad} (${p.origenLabel.toLowerCase()})`}</span>
                    {p.recomendada && ok && <span className="mt-1 inline-block rounded-full bg-violet-100 px-1.5 text-[0.58rem] font-bold text-violet-700">Recomendada</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="text-[0.68rem] text-ink-tertiary">Opcional: puedes dejarlo sin reportes y crearlos después desde el Constructor de reportes (Plantillas y copias).</p>
    </div>
  )
}

function VistaResultado({ borradorId, onEditar, onSalir }: { borradorId: number; onEditar: () => void; onSalir: () => void }) {
  const qc = useQueryClient()
  const { data: b, refetch } = useQuery({ queryKey: ['grupo-asistente-resultado', borradorId], queryFn: () => svc.borrador(borradorId), gcTime: 0 })
  const continuar = useMutation({
    mutationFn: () => svc.crearGrupo(borradorId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos-resumen'] }); refetch() },
    onError: (e) => { toast.error(msgError(e, 'No se pudo continuar')); refetch() },
  })
  const terminar = useMutation({
    mutationFn: () => svc.terminar(borradorId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupo-asistente-borradores'] }); toast.success('Grupo listo'); onSalir() },
    onError: (e) => toast.error(msgError(e, 'No se pudo terminar')),
  })
  if (!b) return <div className={clsx(card, 'flex justify-center py-10')}><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
  const hechas = new Set(b.avance?.completadas ?? [])
  const fallo = b.estado === 'error' || b.interrumpido
  const r = b.avance?.resultado
  const etapas = ETAPAS.filter((e) =>
    (e.key !== 'clientes' || b.tipo === 'atencion-clientes') &&
    (e.key !== 'reportes' || hechas.has('reportes') || (b.datos?.reportes?.length ?? 0) > 0))
  const rep = b.avance?.reportes
  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-center gap-3.5')}>
        <button onClick={onSalir} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary hover:bg-gray-50"><X className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Crear grupo</p>
          <h2 className="truncate text-base font-bold text-ink">{b.nombre}</h2>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-[0.7rem] font-semibold', b.estado === 'creado' ? 'bg-emerald-50 text-emerald-700' : fallo ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700')}>
          {b.estado === 'creado' ? 'Creado' : fallo ? 'Sin terminar' : 'Creándose…'}
        </span>
      </div>
      <div className={clsx(card, 'space-y-2')}>
        {etapas.map((e) => {
          const hecha = hechas.has(e.key)
          const actual = !hecha && b.avance?.etapa === e.key
          return (
            <div key={e.key} className="flex items-center gap-3 text-[0.8rem]">
              {hecha ? <Check className="h-4 w-4 text-emerald-500" /> : actual && fallo ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <CircleDashed className="h-4 w-4 text-gray-300" />}
              <span className={hecha ? 'text-ink' : actual ? 'font-semibold text-ink' : 'text-ink-tertiary'}>{e.texto}</span>
            </div>
          )
        })}
      </div>
      {fallo && (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[0.82rem] font-bold text-amber-800">{b.interrumpido ? 'La creación se interrumpió a la mitad.' : 'No se pudo terminar de crear el grupo.'}</p>
          {b.error && <p className="text-[0.75rem] text-amber-800">Motivo: {b.error}</p>}
          <p className="text-[0.72rem] text-amber-700">¿Quieres continuar donde se quedó? Lo que ya se hizo no se repite. Si el problema está en los datos (por ejemplo, una campaña que ya no existe), corrígelos primero.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {b.estado === 'error' && <button onClick={onEditar} className={btnSec}><Pencil className="h-3.5 w-3.5" /> Corregir datos</button>}
            <button onClick={() => continuar.mutate()} disabled={continuar.isPending} className={btnPrim}>
              {continuar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Continuar la creación
            </button>
          </div>
        </div>
      )}
      {b.estado === 'creado' && (
        <div className={clsx(card, 'space-y-3')}>
          <p className="flex items-center gap-2 text-[0.9rem] font-bold text-emerald-700"><Check className="h-5 w-5" /> {b.nombre} quedó creado y aplicado</p>
          {r && <p className="text-[0.78rem] text-ink-secondary">{r.campanias ?? 0} campaña(s) · {r.skills ?? 0} skill(s) · {r.supervisores ?? 0} supervisor(es) · {r.agentes ?? 0} agente(s){r.conMarcador ? ` · marcador a ${r.conMarcador}` : ''}</p>}
          {!!b.avance?.agentesOmitidos && <p className="text-[0.72rem] text-amber-700">{b.avance.agentesOmitidos} persona(s) no se agregaron porque ya no están activas.</p>}
          {rep && (rep.creados + rep.yaExistian) > 0 && (
            <p className="flex items-center gap-1.5 text-[0.78rem] text-ink-secondary">
              <FileBarChart className="h-4 w-4 text-violet-500" />
              {rep.creados + rep.yaExistian} reporte(s) en la Suite de reportes, carpeta "{rep.carpeta}".
            </p>
          )}
          {rep && rep.omitidos.length > 0 && (
            <p className="text-[0.72rem] text-ink-tertiary">No se crearon por no aplicar a su modalidad: {rep.omitidos.map((o) => o.nombre).join(', ')}.</p>
          )}
          <p className="text-[0.72rem] text-ink-tertiary">Puedes cambiar todo después en Configuración → Usuarios y Seguridad → Grupos. Quien entre o salga del grupo recibe o pierde su configuración automáticamente.</p>
          <div className="flex justify-end">
            <button onClick={() => terminar.mutate()} disabled={terminar.isPending} className={btnPrim}>
              {terminar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Terminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
