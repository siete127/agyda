import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Loader2, ArrowLeft as ArrowLeftIcon, Copy, Archive, Rocket,
  Layers, Trash2, Pencil, ChevronDown, ChevronUp, Link2, X, Save, Eye, Tag, Search, Globe2, Lock, Check, Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccFormulariosService } from '@/services/ccFormularios.service'
import { ccService } from '@/services/cc.service'
import { Modal } from '@/components/ui/Modal'
import { useAuthStore } from '@/stores/auth.store'
import type {
  CCFormulario, CCFormVersionCompleta, CCFormSeccion, CCFormCampo, CCFormTipoCampo,
  CCFormAccionPost, CCFormAccionTipo, CCFormOpcion, CCFormBuscadorResultado,
} from '@/types/ccFormularios.types'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'

const ESTADO_BADGE: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  publicado: 'bg-emerald-100 text-emerald-700',
  inactivo: 'bg-amber-100 text-amber-700',
  archivado: 'bg-red-100 text-red-600',
}

// Etiquetas legibles de los tipos de campo (backend es la fuente de verdad
// de cuáles existen — GET tipos-campo — pero acá se necesita una etiqueta
// humana para el <select> del constructor).
const TIPO_CAMPO_LABEL: Record<CCFormTipoCampo, string> = {
  texto_corto: 'Texto corto', texto_largo: 'Texto largo', numero: 'Número', telefono: 'Teléfono',
  email: 'Email', fecha: 'Fecha', hora: 'Hora', fecha_hora: 'Fecha y hora', lista: 'Lista desplegable',
  radio: 'Opción única (radio)', checkbox: 'Casilla (checkbox)', si_no: 'Sí / No', multiseleccion: 'Multiselección',
  moneda: 'Moneda', porcentaje: 'Porcentaje', url: 'URL', archivo: 'Archivo', imagen: 'Imagen', firma: 'Firma',
  catalogo: 'Catálogo', usuario_agente: 'Usuario / Agente', sucursal: 'Sucursal', calculado: 'Campo calculado',
  oculto: 'Campo oculto', titulo: 'Título', separador: 'Separador',
  // Busca en el histórico de interacciones (CCO_INTERACCIONES), acotado a
  // las campañas/canales asignados a ESTE formulario, y permite registrar un
  // contacto nuevo si no se encuentra — no es un campo de texto simple, ver
  // BuscadorCampoRuntime más abajo.
  buscador: 'Buscador de interacciones',
}
const TIPOS_CON_OPCIONES: CCFormTipoCampo[] = ['lista', 'radio', 'checkbox', 'multiseleccion']

/* ═══ Pantalla raíz: lista de formularios ═══ */
export function CCFormulariosTab() {
  const qc = useQueryClient()
  const { data: formularios = [], isLoading } = useQuery({ queryKey: ['ccf-formularios'], queryFn: () => ccFormulariosService.listFormularios() })
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [abierto, setAbierto] = useState<CCFormulario | null>(null)
  const [seccion, setSeccion] = useState<'formularios' | 'asignaciones'>('formularios')

  const inval = () => qc.invalidateQueries({ queryKey: ['ccf-formularios'] })

  const crear = useMutation({
    mutationFn: () => ccFormulariosService.createFormulario({ nombre: nombreNuevo }),
    onSuccess: () => { setNombreNuevo(''); inval(); toast.success('Formulario creado') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al crear'),
  })
  const clonar = useMutation({
    mutationFn: (id: number) => ccFormulariosService.clonarFormulario(id),
    onSuccess: () => { inval(); toast.success('Formulario clonado') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al clonar'),
  })
  const archivar = useMutation({
    mutationFn: (id: number) => ccFormulariosService.archivarFormulario(id),
    onSuccess: () => { inval(); toast.success('Formulario archivado') },
  })

  if (abierto) {
    const actual = formularios.find((f) => f.id === abierto.id) ?? abierto
    return <FormularioDetalle formulario={actual} onVolver={() => { setAbierto(null); inval() }} onChanged={inval} />
  }

  return (
    <div className="space-y-4 pb-20">
      <div className={card}>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><ClipboardList className="h-5 w-5" /></div>
          <div>
            <h2 className="text-base font-bold text-ink">Formularios de Atención</h2>
            <p className="mt-0.5 text-[0.8rem] text-ink-tertiary">Crea y publica los formularios que los agentes llenan durante una interacción, y asígnalos a campaña + canal.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setSeccion('formularios')}
          className={clsx('flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
            seccion === 'formularios' ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
          <ClipboardList className="h-4 w-4" /> Formularios
        </button>
        <button onClick={() => setSeccion('asignaciones')}
          className={clsx('flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
            seccion === 'asignaciones' ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
          <Link2 className="h-4 w-4" /> Asignaciones
        </button>
      </div>

      {seccion === 'asignaciones' ? <AsignacionesPanel formularios={formularios} /> : (
        <>
          <div className={card}>
            <p className="mb-3 text-sm font-bold text-ink">Nuevo formulario</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={clsx(field, 'flex-1')} value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Ej. Reclutamiento Digital" />
              <button onClick={() => crear.mutate()} disabled={!nombreNuevo.trim() || crear.isPending}
                className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
                {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {isLoading && <p className="text-sm text-ink-tertiary">Cargando…</p>}
            {!isLoading && !formularios.length && <p className="text-sm text-ink-tertiary">Todavía no hay formularios.</p>}
            {formularios.map((f) => (
              <div key={f.id} className={clsx(card, 'flex items-center justify-between gap-3')}>
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setAbierto(f)}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">{f.nombre}</p>
                      <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', ESTADO_BADGE[f.estado])}>{f.estado}</span>
                    </div>
                    <p className="truncate text-[0.72rem] text-ink-tertiary">
                      {f.codigo} · v{f.versionMaxima ?? 1}{f.versionPublicada ? ` (publicada: v${f.versionPublicada})` : ' (sin publicar)'}
                    </p>
                  </div>
                </button>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button title="Clonar" onClick={() => clonar.mutate(f.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-gray-50"><Copy className="h-3.5 w-3.5" /></button>
                  <button title="Archivar" onClick={() => archivar.mutate(f.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50"><Archive className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ═══ Detalle: versiones + constructor de la versión activa ═══ */
function FormularioDetalle({ formulario, onVolver, onChanged }: { formulario: CCFormulario; onVolver: () => void; onChanged: () => void }) {
  const qc = useQueryClient()
  const { data: detalle } = useQuery({ queryKey: ['ccf-formulario', formulario.id], queryFn: () => ccFormulariosService.getFormulario(formulario.id) })
  const versiones = detalle?.versiones ?? []
  const [versionId, setVersionId] = useState<number | null>(null)
  const versionActivaId = versionId ?? versiones.find((v) => v.estado === 'borrador')?.id ?? versiones[0]?.id ?? null
  const [tab, setTab] = useState<'constructor' | 'tipificaciones' | 'interacciones' | 'publicacion'>('constructor')

  const crearVersion = useMutation({
    mutationFn: () => ccFormulariosService.crearVersion(formulario.id),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['ccf-formulario', formulario.id] })
      setVersionId(r?.data?.versionId ?? null)
      toast.success('Nueva versión creada (borrador)')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  return (
    <div className="space-y-4 pb-20">
      <div className={card}>
        <div className="flex items-center gap-3.5">
          <button onClick={onVolver} title="Volver" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50">
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Formularios de Atención</p>
            <h2 className="truncate text-base font-bold text-ink">{formulario.nombre}</h2>
          </div>
          {tab === 'constructor' && (
            <button onClick={() => crearVersion.mutate()} disabled={crearVersion.isPending}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-3 py-2 text-xs font-semibold text-ink-secondary shadow-sm hover:bg-gray-50 disabled:opacity-50">
              {crearVersion.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Nueva versión
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('constructor')}
          className={clsx('flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
            tab === 'constructor' ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
          <Layers className="h-4 w-4" /> Constructor
        </button>
        <button onClick={() => setTab('tipificaciones')}
          className={clsx('flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
            tab === 'tipificaciones' ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
          <Tag className="h-4 w-4" /> Tipificaciones
        </button>
        <button onClick={() => setTab('interacciones')}
          className={clsx('flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
            tab === 'interacciones' ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
          <Search className="h-4 w-4" /> Interacciones
        </button>
        <button onClick={() => setTab('publicacion')}
          className={clsx('flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
            tab === 'publicacion' ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
          <Globe2 className="h-4 w-4" /> Publicación
        </button>
      </div>

      {tab === 'constructor' && (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {versiones.map((v) => (
              <button key={v.id} onClick={() => setVersionId(v.id)}
                className={clsx('flex flex-shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
                  v.id === versionActivaId ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50')}>
                v{v.numero} <span className={clsx('rounded-full px-1.5 text-[0.6rem]', ESTADO_BADGE[v.estado])}>{v.estado}</span>
              </button>
            ))}
          </div>
          {versionActivaId && <VersionConstructor versionId={versionActivaId} formularioId={formulario.id} onPublicada={onChanged} />}
        </>
      )}

      {tab === 'tipificaciones' && <TipificacionesFormularioPanel formularioId={formulario.id} />}
      {tab === 'interacciones' && <InteraccionesBuscadorPanel formularioId={formulario.id} />}
      {tab === 'publicacion' && <PublicacionFormularioPanel formulario={formulario} onChanged={onChanged} />}
    </div>
  )
}

/* ═══ Tipificaciones heredadas de las campañas asignadas — seleccionables ═══ */
function TipificacionesFormularioPanel({ formularioId }: { formularioId: number }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ccf-tipificaciones', formularioId],
    queryFn: () => ccFormulariosService.listTipificacionesDelFormulario(formularioId),
  })
  const [seleccion, setSeleccion] = useState<number[] | null>(null)
  const activa = seleccion ?? data?.seleccionadas ?? []

  const guardar = useMutation({
    mutationFn: () => ccFormulariosService.setTipificacionesDelFormulario(formularioId, activa),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ccf-tipificaciones', formularioId] }); toast.success('Tipificaciones guardadas') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al guardar'),
  })

  const toggle = (id: number) => {
    setSeleccion((activa.includes(id) ? activa.filter((x) => x !== id) : [...activa, id]))
  }

  if (isLoading) return <p className="text-sm text-ink-tertiary">Cargando…</p>
  if (!data?.campanias.length) {
    return (
      <div className={card}>
        <p className="text-sm text-ink-tertiary">Este formulario todavía no está asignado a ninguna campaña — asígnalo primero en la pestaña "Asignaciones" para ver sus tipificaciones.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="mb-1 text-sm font-bold text-ink">Tipificaciones permitidas</p>
        <p className="mb-3 text-[0.72rem] text-ink-tertiary">
          Heredadas de: {data.campanias.map((c) => c.campaniaNombre).join(', ')}. Marca cuáles son válidas para cerrar una interacción que usó este formulario — si no marcas ninguna, se permiten todas.
        </p>
        <div className="space-y-1.5">
          {data.tipificaciones.map((t) => (
            <label key={t.id} className="flex items-center gap-2.5 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50">
              <input type="checkbox" checked={activa.includes(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 rounded border-gray-300 text-violet-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.82rem] font-semibold text-ink">{t.nombre}</p>
                {t.descripcion && <p className="truncate text-[0.68rem] text-ink-tertiary">{t.descripcion}</p>}
              </div>
              {t.requiereComentario && <span className="flex-shrink-0 rounded-full bg-amber-50 px-1.5 text-[0.6rem] font-semibold text-amber-600">Requiere comentario</span>}
            </label>
          ))}
          {!data.tipificaciones.length && <p className="text-sm text-ink-tertiary">Las campañas asignadas todavía no tienen tipificaciones configuradas.</p>}
        </div>
      </div>
      {!!data.tipificaciones.length && (
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar selección
        </button>
      )}
    </div>
  )
}

/* ═══ Buscador de interacciones de las campañas asignadas ═══ */
function InteraccionesBuscadorPanel({ formularioId }: { formularioId: number }) {
  const [texto, setTexto] = useState('')
  const [buscar, setBuscar] = useState('')
  const { data: resultados = [], isLoading, isFetching } = useQuery({
    queryKey: ['ccf-interacciones', formularioId, buscar],
    queryFn: () => ccFormulariosService.buscarInteraccionesDelFormulario(formularioId, { texto: buscar || undefined }),
  })

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={clsx(field, 'flex-1')} value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setBuscar(texto)}
            placeholder="Buscar por nombre o teléfono del cliente…" />
          <button onClick={() => setBuscar(texto)} disabled={isFetching}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-card shadow-card">
        <table className="w-full text-left text-[0.78rem]">
          <thead>
            <tr className="border-b border-gray-100 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Campaña</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Agente</th>
              <th className="px-4 py-3">Tipificación</th>
              <th className="px-4 py-3">Cierre</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-ink">{r.clienteNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-secondary">{r.clienteTelefono ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-secondary">{r.campaniaNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-secondary">{r.canalNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-secondary">{r.agenteNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-secondary">{r.tipificacionNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-tertiary">{r.fechaCierre ? new Date(r.fechaCierre).toLocaleString('es-MX') : '—'}</td>
              </tr>
            ))}
            {!isLoading && !resultados.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-tertiary">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══ Interno (bandeja del agente, requiere sesión) vs Externo (URL pública
   sin login, pensada para VICIdial — mismo patrón que /crm?cliente=&agente=
   &agenteId= visto en CRMPublicPage.tsx) ═══ */
function PublicacionFormularioPanel({ formulario, onChanged }: { formulario: CCFormulario; onChanged: () => void }) {
  const qc = useQueryClient()
  const cambiarModo = useMutation({
    mutationFn: (modo: 'interno' | 'externo') => ccFormulariosService.setModoFormulario(formulario.id, modo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ccf-formularios'] })
      qc.invalidateQueries({ queryKey: ['ccf-formulario', formulario.id] })
      onChanged()
      toast.success('Modo actualizado')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al cambiar el modo'),
  })

  const urlPublica = formulario.tokenPublico
    ? `${window.location.origin}/formulario-publico/${formulario.tokenPublico}?cliente=&agente=&agenteId=`
    : null
  const copiar = (texto: string) => { navigator.clipboard.writeText(texto); toast.success('Copiado') }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="mb-1 text-sm font-bold text-ink">Dónde se usa este formulario</p>
        <p className="mb-3 text-[0.72rem] text-ink-tertiary">
          Interno: solo lo llena el agente desde la bandeja del Contact Center, con su sesión de AGYDA. Externo: además
          queda disponible en una URL pública sin login, para integrarse a un sistema externo (ej. VICIdial abriéndola
          al conectar una llamada).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => cambiarModo.mutate('interno')}
            disabled={cambiarModo.isPending}
            className={clsx(
              'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition',
              formulario.modo === 'interno' ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:bg-gray-50',
            )}>
            <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', formulario.modo === 'interno' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-ink-tertiary')}>
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Interno</p>
              <p className="text-[0.7rem] text-ink-tertiary">Solo dentro de AGYDA</p>
            </div>
          </button>
          <button
            onClick={() => cambiarModo.mutate('externo')}
            disabled={cambiarModo.isPending}
            className={clsx(
              'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition',
              formulario.modo === 'externo' ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:bg-gray-50',
            )}>
            <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', formulario.modo === 'externo' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-ink-tertiary')}>
              <Globe2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Externo</p>
              <p className="text-[0.7rem] text-ink-tertiary">URL pública sin login</p>
            </div>
          </button>
        </div>
      </div>

      {formulario.modo === 'externo' && urlPublica && (
        <div className={card}>
          <p className={label}>URL pública para VICIdial</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs ring-1 ring-gray-200">{urlPublica}</code>
            <button onClick={() => copiar(urlPublica)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-gray-50 hover:text-violet-600"><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mt-3 text-[0.72rem] text-ink-tertiary">
            Configura esta URL en VICIdial como la acción de "Web Form Integration" (o equivalente) de la campaña, sustituyendo
            los valores vacíos por las variables reales de VICIdial: <code className="rounded bg-gray-50 px-1 py-0.5 ring-1 ring-gray-200">cliente</code> (teléfono del contacto),{' '}
            <code className="rounded bg-gray-50 px-1 py-0.5 ring-1 ring-gray-200">agente</code> (nombre del agente) y{' '}
            <code className="rounded bg-gray-50 px-1 py-0.5 ring-1 ring-gray-200">agenteId</code> (su ID en AGYDA). No requiere que el agente
            inicie sesión — la URL funciona sola.
          </p>
          <p className="mt-2 text-[0.68rem] font-medium text-amber-600">
            Solo funciona con la versión PUBLICADA del formulario. Si no hay ninguna, la URL mostrará un error hasta que publiques una.
          </p>
        </div>
      )}

      <AccionesPostCatalogoPanel formularioId={formulario.id} />
    </div>
  )
}

const TIPO_ACCION_LABEL: Record<CCFormAccionTipo, string> = {
  create_followup: 'Crear seguimiento', return_to_queue: 'Regresar a cola', send_whatsapp: 'Enviar WhatsApp',
  send_sms: 'Enviar SMS', send_email: 'Enviar correo', call_webhook: 'Llamar webhook',
  change_customer_status: 'Cambiar estatus del cliente', change_stage: 'Cambiar etapa', custom: 'Personalizada',
}

// Catálogo de "qué sugerir hacer" cuando el agente termina de guardar un
// registro de este formulario — ver AccionesPostGuardadoModal, que consume
// este catálogo. Sin proveedores reales conectados todavía (WhatsApp/SMS/
// webhook): cada tipo aquí es solo la ETIQUETA de la sugerencia, el agente
// la marca manualmente como hecha. Conectar un ejecutor real es un paso
// posterior e independiente de este panel.
function AccionesPostCatalogoPanel({ formularioId }: { formularioId: number }) {
  const qc = useQueryClient()
  const { data: acciones = [] } = useQuery({ queryKey: ['ccf-acciones-post', formularioId], queryFn: () => ccFormulariosService.listAccionesPost(formularioId) })
  const [tipo, setTipo] = useState<CCFormAccionTipo>('create_followup')
  const [etiqueta, setEtiqueta] = useState('')

  const inval = () => qc.invalidateQueries({ queryKey: ['ccf-acciones-post', formularioId] })
  const crear = useMutation({
    mutationFn: () => ccFormulariosService.createAccionPost(formularioId, { tipo, etiqueta, orden: acciones.length }),
    onSuccess: () => { setEtiqueta(''); inval(); toast.success('Acción agregada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const eliminar = useMutation({ mutationFn: (id: number) => ccFormulariosService.deleteAccionPost(id), onSuccess: inval })

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Zap className="h-4 w-4" /></div>
        <div>
          <p className="text-sm font-bold text-ink">Acciones después de guardar</p>
          <p className="text-[0.72rem] text-ink-tertiary">Sugerencias que verá el agente justo después de guardar un registro de este formulario.</p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1.4fr_auto]">
        <select className={field} value={tipo} onChange={(e) => setTipo(e.target.value as CCFormAccionTipo)}>
          {(Object.keys(TIPO_ACCION_LABEL) as CCFormAccionTipo[]).map((t) => <option key={t} value={t}>{TIPO_ACCION_LABEL[t]}</option>)}
        </select>
        <input className={field} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ej. Agendar llamada de seguimiento en 24h" />
        <button onClick={() => crear.mutate()} disabled={!etiqueta.trim() || crear.isPending}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-1.5">
        {acciones.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[0.82rem] font-semibold text-ink">{a.etiqueta}</p>
              <p className="text-[0.68rem] text-ink-tertiary">{TIPO_ACCION_LABEL[a.tipo]}</p>
            </div>
            <button onClick={() => eliminar.mutate(a.id)} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {!acciones.length && <p className="text-sm text-ink-tertiary">Todavía no hay acciones configuradas.</p>}
      </div>
    </div>
  )
}

/* ═══ Constructor: secciones + campos de una versión ═══ */
function VersionConstructor({ versionId, formularioId, onPublicada }: { versionId: number; formularioId: number; onPublicada: () => void }) {
  const qc = useQueryClient()
  const { data: version, isLoading } = useQuery({ queryKey: ['ccf-version', versionId], queryFn: () => ccFormulariosService.getVersionCompleta(versionId) })
  const [tituloSeccion, setTituloSeccion] = useState('')
  const [previsualizando, setPrevisualizando] = useState(false)
  // Editable en cualquier estado salvo 'archivado' (cierre definitivo) — ver
  // el comentario de _asegurarVersionEditable en ccFormulariosController.js
  // para el trade-off aceptado al permitir editar una versión ya publicada.
  const editable = version?.estado !== 'archivado'

  const inval = () => qc.invalidateQueries({ queryKey: ['ccf-version', versionId] })

  const crearSeccion = useMutation({
    mutationFn: () => ccFormulariosService.createSeccion(versionId, { titulo: tituloSeccion, orden: (version?.secciones.length ?? 0) }),
    onSuccess: () => { setTituloSeccion(''); inval(); toast.success('Sección agregada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const publicar = useMutation({
    mutationFn: () => ccFormulariosService.publicarVersion(versionId),
    onSuccess: () => { inval(); onPublicada(); toast.success('Versión publicada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo publicar'),
  })

  if (isLoading) return <p className="text-sm text-ink-tertiary">Cargando…</p>
  if (!version) return null

  return (
    <div className="space-y-3">
      {!editable && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] font-medium text-red-600">
          Este formulario está archivado y ya no se puede editar. Clónalo para partir de una copia editable.
        </div>
      )}
      {version.estado === 'publicado' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0.78rem] font-medium text-emerald-700">
          Esta versión está publicada y activa. Los cambios que hagas aquí quedan visibles de inmediato para quien la use — no es necesario volver a publicar.
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setPrevisualizando(true)}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-3.5 py-2 text-xs font-semibold text-ink-secondary shadow-sm transition hover:bg-gray-50">
          <Eye className="h-3.5 w-3.5" /> Previsualizar
        </button>
      </div>

      {editable && (
        <div className={card}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className={clsx(field, 'flex-1')} value={tituloSeccion} onChange={(e) => setTituloSeccion(e.target.value)} placeholder="Título de la nueva sección" />
            <button onClick={() => crearSeccion.mutate()} disabled={!tituloSeccion.trim() || crearSeccion.isPending}
              className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
              {crearSeccion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar sección
            </button>
          </div>
        </div>
      )}

      {version.secciones.map((s) => <SeccionCard key={s.id} seccion={s} formularioId={formularioId} editable={editable} onChanged={inval} />)}

      {editable && version.estado === 'borrador' && (
        <button onClick={() => publicar.mutate()} disabled={publicar.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">
          {publicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publicar esta versión
        </button>
      )}

      <PreviewFormularioModal isOpen={previsualizando} onClose={() => setPrevisualizando(false)} version={version} formularioId={formularioId} />
    </div>
  )
}

// Previsualización: mientras no exista el DynamicFormRenderer real de la
// Entrega 3, esta es la única forma de usar el formulario de verdad — así
// que además de mostrar el diseño, captura los valores y los guarda contra
// una interacción real (crea una si hace falta, igual que el campo
// 'buscador'). Al terminar, muestra las acciones sugeridas configuradas
// para el formulario (ver PublicacionFormularioPanel/pestaña Tipificaciones
// — las acciones se administran aparte, en su propio catálogo).
function PreviewFormularioModal({ isOpen, onClose, version, formularioId }: { isOpen: boolean; onClose: () => void; version: CCFormVersionCompleta; formularioId: number }) {
  const [valores, setValores] = useState<Record<number, unknown>>({})
  const [canalId, setCanalId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [resultado, setResultado] = useState<{ interaccionId: number; acciones: CCFormAccionPost[] } | null>(null)
  const { data: canales = [] } = useQuery({ queryKey: ['ccf-canales-disponibles', formularioId], queryFn: () => ccFormulariosService.listCanalesDisponibles(formularioId), enabled: isOpen })

  const setValor = (campoId: number, valor: unknown) => setValores((v) => ({ ...v, [campoId]: valor }))

  const todosLosCampos = version.secciones.flatMap((s) => s.campos)
  const camposCapturables = todosLosCampos.filter((c) => !['titulo', 'separador', 'buscador'].includes(c.tipo))
  const faltantes = camposCapturables.filter((c) => c.obligatorio && !valores[c.id] && valores[c.id] !== 0)

  // Al elegir un resultado del campo 'buscador', vuelca sus datos tanto al
  // bloque "Datos del registro" (arriba) como a los campos del formulario
  // que parezcan nombre/teléfono — detectado por TIPO, no por código
  // específico, para funcionar igual en cualquier formulario. El canal solo
  // se llena si el resultado trae uno (los postulantes de Totis no tienen).
  const usarResultadoBuscador = (r: CCFormBuscadorResultado) => {
    if (r.clienteNombre) setClienteNombre(r.clienteNombre)
    if (r.clienteTelefono) setClienteTelefono(r.clienteTelefono)
    if (r.canalId) setCanalId(String(r.canalId))
    // Si el formulario separa Apellido paterno/Apellido materno/Nombre(s) en
    // campos independientes, no se reparte el nombre completo entre ellos
    // (no hay forma confiable de saber dónde corta cada parte) — solo se
    // precarga clienteNombre, que sí llega completo a CI_CLIENTE_NOMBRE.
    const tieneNombreEstructurado = todosLosCampos.some((c) => /apellido.?paterno|apellido.?materno/i.test(`${c.codigo} ${c.etiqueta}`))
    const campoNombre = tieneNombreEstructurado ? undefined : todosLosCampos.find((c) => c.tipo === 'texto_corto' && /nombre|interesado/i.test(`${c.codigo} ${c.etiqueta}`))
      ?? todosLosCampos.find((c) => c.tipo === 'texto_corto')
    const campoTelefono = todosLosCampos.find((c) => c.tipo === 'telefono')
    if (campoNombre && r.clienteNombre) setValor(campoNombre.id, r.clienteNombre)
    if (campoTelefono && r.clienteTelefono) setValor(campoTelefono.id, r.clienteTelefono)
  }

  const guardar = useMutation({
    mutationFn: () => ccFormulariosService.guardarRespuestas(version.id, {
      respuestas: camposCapturables.filter((c) => valores[c.id] !== undefined).map((c) => ({ campoId: c.id, valor: valores[c.id] as any })),
      clienteNombre: clienteNombre || undefined,
      clienteTelefono: clienteTelefono || undefined,
      canalId: canalId ? Number(canalId) : undefined,
    }),
    onSuccess: (r) => { setResultado(r); toast.success('Registro guardado') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al guardar'),
  })

  const cerrarTodo = () => { setResultado(null); setValores({}); onClose() }

  if (resultado) {
    return (
      <AccionesPostGuardadoModal
        isOpen={isOpen}
        onClose={cerrarTodo}
        interaccionId={resultado.interaccionId}
        acciones={resultado.acciones}
      />
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Previsualización — versión ${version.numero}`} size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
          <p className="mb-2 text-[0.72rem] font-semibold text-ink-secondary">Datos del registro (se usan si guardas)</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label><span className={label}>Cliente</span><input className={field} value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} /></label>
            <label><span className={label}>Teléfono</span><input className={field} value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} /></label>
            <label><span className={label}>Canal</span>
              <select className={field} value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                <option value="">Selecciona…</option>
                {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          </div>
        </div>

        {!version.secciones.length && <p className="text-sm text-ink-tertiary">Este formulario todavía no tiene secciones ni campos.</p>}
        {version.secciones.filter((s) => s.visible).map((s) => (
          <div key={s.id}>
            <p className="mb-0.5 text-sm font-bold text-ink">{s.titulo}</p>
            {s.descripcion && <p className="mb-3 text-[0.78rem] text-ink-tertiary">{s.descripcion}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {s.campos.filter((c) => c.visible).map((c) => (
                <div key={c.id} className={c.ancho === 'completo' || c.tipo === 'buscador' ? 'sm:col-span-2' : ''}>
                  <PreviewCampo campo={c} formularioId={formularioId} valor={valores[c.id]} onChange={(v) => setValor(c.id, v)} onSeleccionarBuscador={usarResultadoBuscador} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-gray-100 bg-card px-5 py-3.5">
          {!!faltantes.length && (
            <p className="mb-2 text-[0.72rem] font-medium text-amber-600">
              Pendientes: {faltantes.map((c) => c.etiqueta).join(', ')}
            </p>
          )}
          <button onClick={() => guardar.mutate()} disabled={!!faltantes.length || guardar.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar registro
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Campo funcional (a diferencia de la versión de solo-lectura previa): cada
// tipo captura su valor real en el estado del modal padre. 'buscador' sigue
// siendo un caso aparte porque no guarda "una respuesta" — su valor final es
// el CI_ID de la interacción que busca o crea, no algo que viva en
// CCF_INTERACCION_FORM_RESPUESTAS.
// Lee campo.configJson.autocompletar (guardado por CampoForm) y calcula el
// valor real correspondiente — 'fecha_actual' usa formato datetime-local
// (yyyy-MM-ddTHH:mm) o date según el tipo del campo; 'usuario_actual' toma
// el nombre de la sesión del navegador (useAuthStore), nunca algo que el
// agente tenga que escribir.
function valorAutocompletado(campo: CCFormCampo, nombreUsuario: string | null): string | null {
  // 'usuario_agente' siempre se autocompleta con quien tiene la sesión
  // abierta — no depende de configJson.autocompletar (a diferencia de
  // texto_corto/fecha, donde SÍ es opcional) porque el propio tipo de campo
  // ya implica esa intención; no tendría sentido dejarlo vacío para que el
  // agente lo escriba a mano.
  if (campo.tipo === 'usuario_agente') return nombreUsuario ?? ''

  let cfg: any = {}
  try { cfg = campo.configJson ? JSON.parse(campo.configJson) : {} } catch { /* ignorar JSON inválido */ }
  if (cfg.autocompletar === 'fecha_actual') {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    if (campo.tipo === 'fecha') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    if (campo.tipo === 'fecha_hora') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    return now.toLocaleString('es-MX')
  }
  if (cfg.autocompletar === 'usuario_actual') return nombreUsuario ?? ''
  return null
}

// Hook compartido entre PreviewCampo (panel admin) y CampoPublico (VICIdial
// sin sesión) — dispara la precarga de autocompletar UNA sola vez al montar
// (si el campo aún no tiene valor) y resuelve el catálogo dinámico cuando
// aplica. `getCatalogo` y `usuarioActual` son inyectados por cada renderer
// porque difieren entre el contexto admin (useAuthStore) y el público
// (query param ?agente=).
function useCampoAuto(
  campo: CCFormCampo,
  valor: unknown,
  onChange: (v: unknown) => void,
  usuarioActual: string | null,
  getCatalogo: (fuente: string) => Promise<CCFormOpcion[]>,
) {
  useEffect(() => {
    if (valor !== undefined) return
    const auto = valorAutocompletado(campo, usuarioActual)
    if (auto !== null) onChange(auto)
    // Solo al montar — si el agente borra el valor autocompletado a mano,
    // no queremos que se lo volvamos a poner encima en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [opcionesDinamicas, setOpcionesDinamicas] = useState<CCFormOpcion[] | null>(null)
  useEffect(() => {
    if (campo.tipo !== 'catalogo' || !campo.catalogoFuente || campo.catalogoFuente === 'estatico') return
    let cancelado = false
    getCatalogo(campo.catalogoFuente).then((data) => { if (!cancelado) setOpcionesDinamicas(data) }).catch(() => {})
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campo.catalogoFuente])

  return opcionesDinamicas
}

function PreviewCampo({ campo, formularioId, valor, onChange, onSeleccionarBuscador }: {
  campo: CCFormCampo; formularioId: number; valor: unknown; onChange: (v: unknown) => void
  onSeleccionarBuscador?: (r: CCFormBuscadorResultado) => void
}) {
  const nombreUsuario = useAuthStore((s) => s.user?.nombres ?? s.user?.usuario ?? null)
  const opcionesDinamicas = useCampoAuto(campo, valor, onChange, nombreUsuario, (fuente) => ccFormulariosService.getOpcionesCatalogo(formularioId, fuente))

  if (campo.tipo === 'titulo') return <p className="pt-2 text-sm font-bold text-ink">{campo.etiqueta}</p>
  if (campo.tipo === 'separador') return <hr className="my-2 border-gray-200" />
  if (campo.tipo === 'buscador') return <BuscadorCampoRuntime campo={campo} formularioId={formularioId} onSeleccionar={onSeleccionarBuscador} />

  const etiqueta = (
    <span className={label}>
      {campo.etiqueta} {campo.obligatorio && <span className="text-red-500">*</span>}
    </span>
  )

  if (campo.tipo === 'texto_largo') {
    return <label>{etiqueta}<textarea className={clsx(field, 'h-20')} value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={campo.placeholder ?? ''} /></label>
  }
  if (campo.tipo === 'si_no' || campo.tipo === 'checkbox') {
    return (
      <label>{etiqueta}
        <select className={field} value={valor === true ? 'si' : valor === false ? 'no' : ''} onChange={(e) => onChange(e.target.value === 'si')}>
          <option value="">Selecciona…</option><option value="si">Sí</option><option value="no">No</option>
        </select>
      </label>
    )
  }
  if (['lista', 'radio', 'catalogo'].includes(campo.tipo)) {
    const opciones = campo.tipo === 'catalogo' && campo.catalogoFuente && campo.catalogoFuente !== 'estatico'
      ? (opcionesDinamicas ?? [])
      : campo.opciones
    return (
      <label>{etiqueta}
        <select className={field} value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{opcionesDinamicas === null && campo.tipo === 'catalogo' && campo.catalogoFuente !== 'estatico' ? 'Cargando…' : 'Selecciona…'}</option>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
    )
  }
  if (campo.tipo === 'multiseleccion') {
    const seleccionadas = Array.isArray(valor) ? valor as string[] : []
    const toggle = (v: string) => onChange(seleccionadas.includes(v) ? seleccionadas.filter((x) => x !== v) : [...seleccionadas, v])
    return (
      <div>{etiqueta}
        <div className="mt-1 space-y-1">
          {campo.opciones.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 text-[0.8rem] text-ink">
              <input type="checkbox" checked={seleccionadas.includes(o.valor)} onChange={() => toggle(o.valor)} className="h-4 w-4 rounded border-gray-300 text-violet-600" />
              {o.etiqueta}
            </label>
          ))}
        </div>
      </div>
    )
  }
  const tipoInput: Record<string, string> = {
    numero: 'number', telefono: 'tel', email: 'email', fecha: 'date', hora: 'time',
    fecha_hora: 'datetime-local', url: 'url', moneda: 'number', porcentaje: 'number',
    archivo: 'file', imagen: 'file',
  }
  return (
    <label>{etiqueta}
      <input
        type={tipoInput[campo.tipo] ?? 'text'}
        className={field}
        value={['archivo', 'imagen'].includes(campo.tipo) ? undefined : ((valor as string) ?? '')}
        onChange={(e) => onChange(campo.tipo === 'numero' || campo.tipo === 'moneda' || campo.tipo === 'porcentaje' ? Number(e.target.value) : e.target.value)}
        placeholder={campo.placeholder ?? ''}
      />
      {campo.ayuda && <span className="mt-0.5 block text-[0.68rem] text-ink-tertiary">{campo.ayuda}</span>}
    </label>
  )
}

// Modal que aparece justo después de guardar — sugerencias de acciones
// configurables por formulario (arquitectura desacoplada de ejecutores: hoy
// el agente las marca manualmente como "hecha"; un ejecutor automático real
// para WhatsApp/webhook/etc. es un paso posterior independiente de este
// modal). Se administran en el catálogo del formulario — ver
// AccionesPostCatalogoPanel más abajo, colgado de la pestaña Publicación.
function AccionesPostGuardadoModal({ isOpen, onClose, interaccionId, acciones }: {
  isOpen: boolean; onClose: () => void; interaccionId: number; acciones: CCFormAccionPost[]
}) {
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const marcar = useMutation({
    mutationFn: (accionId: number) => ccFormulariosService.marcarAccionEjecutada(interaccionId, accionId),
    onSuccess: (_r, accionId) => setMarcadas((s) => new Set(s).add(accionId)),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al marcar la acción'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registro guardado" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-emerald-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <p className="text-[0.8rem] font-semibold">Interacción #{interaccionId} guardada correctamente.</p>
        </div>

        {acciones.length > 0 && (
          <div>
            <p className="mb-2 text-[0.72rem] font-semibold text-ink-secondary">Acciones recomendadas</p>
            <div className="space-y-1.5">
              {acciones.map((a) => {
                const hecha = marcadas.has(a.id)
                return (
                  <button key={a.id} onClick={() => !hecha && marcar.mutate(a.id)} disabled={hecha || marcar.isPending}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition',
                      hecha ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50',
                    )}>
                    <div className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', hecha ? 'bg-emerald-500 text-white' : 'border-2 border-gray-300')}>
                      {hecha && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className={clsx('text-[0.8rem] font-semibold', hecha ? 'text-emerald-700 line-through' : 'text-ink')}>{a.etiqueta}</p>
                      {a.descripcion && <p className="truncate text-[0.68rem] text-ink-tertiary">{a.descripcion}</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button onClick={onClose} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-gray-200">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}

// Campo tipo 'buscador': busca en el histórico de interacciones (acotado a
// las campañas/canales asignados a este formulario) y, si no se encuentra a
// quien se busca, permite registrar un contacto nuevo — queda guardado como
// una interacción real en CCO_INTERACCIONES para reportería. Es el único
// tipo de campo con lógica propia (los demás son inputs planos).
function BuscadorCampoRuntime({ campo, formularioId, onSeleccionar }: {
  campo: CCFormCampo; formularioId: number; onSeleccionar?: (r: CCFormBuscadorResultado) => void
}) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  // Debounce simple: busca sola 400ms después de que el agente deja de
  // escribir (a partir de 2 caracteres, para no golpear el backend en cada
  // tecla) — antes solo buscaba con Enter/clic en la lupa.
  const [buscar, setBuscar] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)

  useEffect(() => {
    const t = texto.trim()
    if (t.length < 2) { setBuscar(''); return }
    const timer = setTimeout(() => setBuscar(t), 400)
    return () => clearTimeout(timer)
  }, [texto])

  const { data: resultados = [], isFetching, isFetched } = useQuery({
    queryKey: ['ccf-buscador-campo', formularioId, buscar],
    queryFn: () => ccFormulariosService.buscarRegistrosCampoBuscador(formularioId, buscar),
    enabled: !!buscar,
  })

  return (
    <div className="rounded-xl border border-gray-100 p-3.5">
      <span className={label}>
        {campo.etiqueta} {campo.obligatorio && <span className="text-red-500">*</span>}
      </span>
      <div className="relative flex gap-2">
        <input
          className={clsx(field, 'flex-1')}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setBuscar(texto.trim())}
          placeholder={campo.placeholder || 'Buscar por nombre o teléfono…'}
        />
        <button onClick={() => setBuscar(texto.trim())} disabled={!texto.trim() || isFetching}
          className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </div>
      {campo.ayuda && <span className="mt-1 block text-[0.68rem] text-ink-tertiary">{campo.ayuda}</span>}

      {texto.trim().length >= 1 && texto.trim().length < 2 && (
        <p className="mt-2 text-[0.68rem] text-ink-tertiary">Escribe al menos 2 caracteres para buscar…</p>
      )}
      {isFetching && !isFetched && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-ink-tertiary"><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</p>
      )}

      {isFetched && (
        <div className="mt-3 space-y-1.5">
          {resultados.map((r) => {
            const claveResultado = `${r.origen}-${r.id}`
            const yaSeleccionado = seleccionadoId === claveResultado
            return (
              <div key={claveResultado} className={clsx('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[0.78rem]', yaSeleccionado ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100')}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-ink">{r.clienteNombre ?? '—'} <span className="font-normal text-ink-tertiary">· {r.clienteTelefono ?? '—'}</span></p>
                    <span className={clsx('flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold',
                      r.origen === 'postulante' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700')}>
                      {r.origen === 'postulante' ? 'Postulante' : 'Interacción'}
                    </span>
                  </div>
                  <p className="truncate text-[0.68rem] text-ink-tertiary">{r.canalNombre ?? '—'} · {r.tipificacionNombre ?? 'sin tipificar'} · {r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : ''}</p>
                </div>
                {onSeleccionar && (
                  <button
                    onClick={() => { onSeleccionar(r); setSeleccionadoId(claveResultado); toast.success('Datos aplicados al formulario') }}
                    className={clsx(
                      'flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold transition',
                      yaSeleccionado ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-50 text-violet-700 hover:bg-violet-100',
                    )}>
                    {yaSeleccionado ? <Check className="h-3.5 w-3.5" /> : null} {yaSeleccionado ? 'Usado' : 'Seleccionar'}
                  </button>
                )}
              </div>
            )
          })}
          {!resultados.length && !registrando && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5">
              <p className="text-[0.78rem] text-ink-tertiary">No se encontró ningún registro para "{buscar}".</p>
              <button onClick={() => setRegistrando(true)}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[0.72rem] font-semibold text-violet-700 hover:bg-violet-100">
                <Plus className="h-3.5 w-3.5" /> Registrar interacción
              </button>
            </div>
          )}
        </div>
      )}

      {registrando && (
        <RegistrarInteraccionForm
          formularioId={formularioId}
          nombreInicial={buscar}
          onDone={() => {
            setRegistrando(false)
            qc.invalidateQueries({ queryKey: ['ccf-buscador-campo', formularioId, buscar] })
          }}
          onCancel={() => setRegistrando(false)}
        />
      )}
    </div>
  )
}

// Formulario de registro manual — pide el canal solo si el formulario tiene
// más de una asignación (lo normal es una sola, así que el selector no
// estorba en el caso común).
function RegistrarInteraccionForm({ formularioId, nombreInicial, onDone, onCancel }: {
  formularioId: number; nombreInicial: string; onDone: () => void; onCancel: () => void
}) {
  const { data: canales = [] } = useQuery({ queryKey: ['ccf-canales-disponibles', formularioId], queryFn: () => ccFormulariosService.listCanalesDisponibles(formularioId) })
  // Heurística simple: nombreInicial trae dígitos -> se capturó un teléfono.
  const pareceTelefono = /^\+?[\d\s-]{6,}$/.test(nombreInicial)
  const [nombre, setNombre] = useState(pareceTelefono ? '' : nombreInicial)
  const [telefono, setTelefono] = useState(pareceTelefono ? nombreInicial : '')
  const [canalId, setCanalId] = useState<string>('')

  // El <select> necesita un valor inicial en cuanto llegan los canales — no
  // se puede calcular en el useState de arriba porque la query aún no
  // resolvió en el primer render.
  useEffect(() => {
    if (!canalId && canales.length) setCanalId(String(canales[0].id))
  }, [canales, canalId])

  const registrar = useMutation({
    mutationFn: () => ccFormulariosService.crearRegistroCampoBuscador(formularioId, {
      clienteNombre: nombre || undefined,
      clienteTelefono: telefono || undefined,
      canalId: Number(canalId),
    }),
    onSuccess: () => { toast.success('Interacción registrada'); onDone() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al registrar'),
  })

  return (
    <div className="mt-2 space-y-2.5 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label><span className={label}>Nombre del cliente</span>
          <input className={field} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label><span className={label}>Teléfono</span>
          <input className={field} value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
      </div>
      {canales.length > 1 && (
        <label><span className={label}>Canal</span>
          <select className={field} value={canalId} onChange={(e) => setCanalId(e.target.value)}>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-tertiary hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Cancelar</button>
        <button onClick={() => registrar.mutate()} disabled={(!nombre.trim() && !telefono.trim()) || !canalId || registrar.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {registrar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
        </button>
      </div>
      {!canales.length && <p className="text-[0.68rem] font-medium text-amber-600">Este formulario no tiene ningún canal disponible todavía.</p>}
    </div>
  )
}

function SeccionCard({ seccion, formularioId, editable, onChanged }: { seccion: CCFormSeccion; formularioId: number; editable: boolean; onChanged: () => void }) {
  const [colapsado, setColapsado] = useState(false)
  const [nuevoCampo, setNuevoCampo] = useState(false)

  const eliminar = useMutation({
    mutationFn: () => ccFormulariosService.deleteSeccion(seccion.id),
    onSuccess: onChanged,
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3">
        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setColapsado((v) => !v)}>
          <Layers className="h-4 w-4 flex-shrink-0 text-violet-500" />
          <p className="text-sm font-bold text-ink">{seccion.titulo}</p>
          <span className="rounded-full bg-black/5 px-1.5 text-[0.65rem] text-ink-tertiary">{seccion.campos.length} campos</span>
        </button>
        <div className="flex items-center gap-1">
          {editable && (
            <button title="Eliminar sección" onClick={() => eliminar.mutate()} className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setColapsado((v) => !v)} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-gray-50">
            {colapsado ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!colapsado && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {seccion.campos.map((c) => <CampoRow key={c.id} campo={c} formularioId={formularioId} editable={editable} onChanged={onChanged} />)}
          {editable && !nuevoCampo && (
            <button onClick={() => setNuevoCampo(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-xs font-semibold text-ink-tertiary transition hover:border-violet-300 hover:text-violet-600">
              <Plus className="h-3.5 w-3.5" /> Agregar campo
            </button>
          )}
          {editable && nuevoCampo && (
            <CampoForm
              seccionId={seccion.id}
              formularioId={formularioId}
              orden={seccion.campos.length}
              onDone={() => { setNuevoCampo(false); onChanged() }}
              onCancel={() => setNuevoCampo(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function CampoRow({ campo, formularioId, editable, onChanged }: { campo: CCFormCampo; formularioId: number; editable: boolean; onChanged: () => void }) {
  const [editando, setEditando] = useState(false)
  const eliminar = useMutation({
    mutationFn: () => ccFormulariosService.deleteCampo(campo.id),
    onSuccess: onChanged,
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  if (editando) {
    return <CampoForm seccionId={campo.seccionId} formularioId={formularioId} orden={campo.orden} campoExistente={campo} onDone={() => { setEditando(false); onChanged() }} onCancel={() => setEditando(false)} />
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[0.82rem] font-semibold text-ink">{campo.etiqueta}</p>
          {campo.obligatorio && <span className="rounded-full bg-red-50 px-1.5 text-[0.6rem] font-semibold text-red-500">Obligatorio</span>}
        </div>
        <p className="truncate text-[0.68rem] text-ink-tertiary">{campo.codigo} · {TIPO_CAMPO_LABEL[campo.tipo] ?? campo.tipo}</p>
      </div>
      {editable && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <button title="Editar" onClick={() => setEditando(true)} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /></button>
          <button title="Eliminar" onClick={() => eliminar.mutate()} className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  )
}

// Formulario de alta/edición de campo — usado tanto para "agregar campo"
// como para "editar campo" (mismo cuerpo, ccFormulariosService.createCampo
// vs updateCampo). Sin drag&drop en esta Entrega 1: el orden se asigna
// secuencial al crear.
// Tipos de campo donde tiene sentido ofrecer autocompletado — el valor se
// calcula en el renderer (PreviewCampo/CampoPublico) al montar el campo, no
// aquí; esto solo guarda la intención en FC_CONFIG_JSON.autocompletar.
const TIPOS_CON_AUTOCOMPLETAR: CCFormTipoCampo[] = ['fecha', 'fecha_hora', 'texto_corto']
type Autocompletar = '' | 'fecha_actual' | 'usuario_actual'
const AUTOCOMPLETAR_LABEL: Record<Exclude<Autocompletar, ''>, string> = {
  fecha_actual: 'Fecha y hora actual (automático)',
  usuario_actual: 'Usuario que tiene la sesión abierta (automático)',
}
const FUENTES_CATALOGO_LABEL: Record<string, string> = {
  estatico: 'Opciones escritas a mano',
  tipificaciones_campania: 'Tipificaciones de la campaña',
}

function CampoForm({ seccionId, formularioId, orden, campoExistente, onDone, onCancel }: {
  seccionId: number; formularioId: number; orden: number; campoExistente?: CCFormCampo; onDone: () => void; onCancel: () => void
}) {
  const { data: tipos = [] } = useQuery({ queryKey: ['ccf-tipos-campo'], queryFn: () => ccFormulariosService.listTiposCampo() })
  const [codigo, setCodigo] = useState(campoExistente?.codigo ?? '')
  const [tipo, setTipo] = useState<CCFormTipoCampo>(campoExistente?.tipo ?? 'texto_corto')
  const [etiqueta, setEtiqueta] = useState(campoExistente?.etiqueta ?? '')
  const [obligatorio, setObligatorio] = useState(campoExistente?.obligatorio ?? false)
  const [opcionesTexto, setOpcionesTexto] = useState((campoExistente?.opciones ?? []).map((o) => o.etiqueta).join('\n'))
  const configExistente = (() => { try { return campoExistente?.configJson ? JSON.parse(campoExistente.configJson) : {} } catch { return {} } })()
  const [autocompletar, setAutocompletar] = useState<Autocompletar>(configExistente.autocompletar ?? '')
  const [catalogoFuente, setCatalogoFuente] = useState(campoExistente?.catalogoFuente || 'estatico')

  // Vista previa en vivo de las opciones que va a traer una fuente
  // dinámica — se pide en cuanto el admin la elige, ANTES de guardar el
  // campo, para que confirme qué va a ver el agente sin tener que
  // guardar/reabrir a ciegas.
  const { data: opcionesPreview = [], isFetching: cargandoPreview } = useQuery({
    queryKey: ['ccf-catalogo-preview', formularioId, catalogoFuente],
    queryFn: () => ccFormulariosService.getOpcionesCatalogo(formularioId, catalogoFuente),
    enabled: tipo === 'catalogo' && catalogoFuente !== 'estatico',
  })

  const guardar = useMutation({
    mutationFn: () => {
      const opciones = tipo === 'catalogo'
        ? (catalogoFuente === 'estatico' ? opcionesTexto.split('\n').map((s) => s.trim()).filter(Boolean).map((v, i) => ({ valor: v, etiqueta: v, orden: i })) : [])
        : TIPOS_CON_OPCIONES.includes(tipo)
          ? opcionesTexto.split('\n').map((s) => s.trim()).filter(Boolean).map((v, i) => ({ valor: v, etiqueta: v, orden: i }))
          : undefined
      const body: any = {
        codigo, tipo, etiqueta, obligatorio, orden, opciones,
        configJson: autocompletar ? { autocompletar } : {},
      }
      if (tipo === 'catalogo') body.catalogoFuente = catalogoFuente
      return campoExistente ? ccFormulariosService.updateCampo(campoExistente.id, body) : ccFormulariosService.createCampo(seccionId, body)
    },
    onSuccess: () => { onDone(); toast.success('Campo guardado') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al guardar el campo'),
  })

  return (
    <div className="space-y-2.5 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label><span className={label}>Código interno</span>
          <input className={field} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ej. nombre_cliente" /></label>
        <label><span className={label}>Tipo de campo</span>
          <select className={field} value={tipo} onChange={(e) => setTipo(e.target.value as CCFormTipoCampo)}>
            {(tipos.length ? tipos : Object.keys(TIPO_CAMPO_LABEL) as CCFormTipoCampo[]).map((t) => (
              <option key={t} value={t}>{TIPO_CAMPO_LABEL[t] ?? t}</option>
            ))}
          </select>
        </label>
      </div>
      <label><span className={label}>Etiqueta (lo que ve el agente)</span>
        <input className={field} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="ej. Nombre del cliente" /></label>

      {TIPOS_CON_AUTOCOMPLETAR.includes(tipo) && (
        <label><span className={label}>Autocompletar con</span>
          <select className={field} value={autocompletar} onChange={(e) => setAutocompletar(e.target.value as Autocompletar)}>
            <option value="">Nada — el agente lo escribe</option>
            {(Object.keys(AUTOCOMPLETAR_LABEL) as (keyof typeof AUTOCOMPLETAR_LABEL)[]).map((k) => (
              <option key={k} value={k}>{AUTOCOMPLETAR_LABEL[k]}</option>
            ))}
          </select>
          {autocompletar && <span className="mt-0.5 block text-[0.68rem] text-ink-tertiary">El agente puede corregirlo a mano si no marcas "Solo lectura".</span>}
        </label>
      )}

      {tipo === 'catalogo' && (
        <label><span className={label}>Fuente del catálogo</span>
          <select className={field} value={catalogoFuente} onChange={(e) => setCatalogoFuente(e.target.value)}>
            {Object.entries(FUENTES_CATALOGO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {catalogoFuente === 'tipificaciones_campania' && (
            <>
              <span className="mt-0.5 block text-[0.68rem] text-ink-tertiary">Se llena solo con las tipificaciones de la campaña asignada a este formulario — no necesitas escribir opciones.</span>
              <div className="mt-2 rounded-lg border border-gray-200 bg-card p-2.5">
                <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">Vista previa — lo que verá el agente</p>
                {cargandoPreview && <p className="flex items-center gap-1.5 text-[0.72rem] text-ink-tertiary"><Loader2 className="h-3 w-3 animate-spin" /> Cargando tipificaciones…</p>}
                {!cargandoPreview && !opcionesPreview.length && (
                  <p className="text-[0.72rem] font-medium text-amber-600">Este formulario no tiene ninguna campaña asignada todavía, o esa campaña no tiene tipificaciones — asígnalo primero en la pestaña "Asignaciones".</p>
                )}
                {!cargandoPreview && !!opcionesPreview.length && (
                  <ul className="space-y-1">
                    {opcionesPreview.map((o) => (
                      <li key={o.valor} className="flex items-center gap-1.5 text-[0.78rem] text-ink">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" /> {o.etiqueta}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </label>
      )}

      {((tipo === 'catalogo' && catalogoFuente === 'estatico') || (tipo !== 'catalogo' && TIPOS_CON_OPCIONES.includes(tipo))) && (
        <label><span className={label}>Opciones (una por línea)</span>
          <textarea className={clsx(field, 'h-20')} value={opcionesTexto} onChange={(e) => setOpcionesTexto(e.target.value)} placeholder={'Sí\nNo'} /></label>
      )}

      <label className="flex items-center gap-2 text-[0.78rem] font-medium text-ink-secondary">
        <input type="checkbox" checked={obligatorio} onChange={(e) => setObligatorio(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-violet-600" />
        Campo obligatorio
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-tertiary hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Cancelar</button>
        <button onClick={() => guardar.mutate()} disabled={!codigo.trim() || !etiqueta.trim() || guardar.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
        </button>
      </div>
    </div>
  )
}

/* ═══ Asignaciones: Campaña (+Canal) -> Versión publicada ═══ */
function AsignacionesPanel({ formularios }: { formularios: CCFormulario[] }) {
  const qc = useQueryClient()
  const { data: asignaciones = [] } = useQuery({ queryKey: ['ccf-asignaciones'], queryFn: () => ccFormulariosService.listAsignaciones() })
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const { data: canales = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales() })

  const [campaniaId, setCampaniaId] = useState('')
  const [canalId, setCanalId] = useState('')
  const [formularioId, setFormularioId] = useState('')
  const formularioSel = formularios.find((f) => f.id === Number(formularioId))

  const inval = () => qc.invalidateQueries({ queryKey: ['ccf-asignaciones'] })
  const eliminar = useMutation({ mutationFn: (id: number) => ccFormulariosService.deleteAsignacion(id), onSuccess: inval })

  // formularioId en el <select> es el FR_ID (formulario), pero la API espera
  // el FV_ID (versión publicada) — se resuelve al vuelo con getFormulario
  // porque el listado de formularios no trae el FV_ID de la versión publicada,
  // solo su número.
  const crearAsignacion = useMutation({
    mutationFn: async () => {
      const detalle = await ccFormulariosService.getFormulario(Number(formularioId))
      const versionPublicada = detalle.versiones.find((v) => v.estado === 'publicado')
      if (!versionPublicada) throw new Error('Este formulario no tiene una versión publicada')
      return ccFormulariosService.createAsignacion({ campaniaId: Number(campaniaId), canalId: canalId ? Number(canalId) : null, formVersionId: versionPublicada.id })
    },
    onSuccess: () => { inval(); toast.success('Asignación creada'); setCampaniaId(''); setCanalId(''); setFormularioId('') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Error al asignar'),
  })

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="mb-3 text-sm font-bold text-ink">Nueva asignación</p>
        <p className="mb-3 text-[0.72rem] text-ink-tertiary">Deja "Cualquier canal" vacío para que el formulario aplique a todos los canales de la campaña que no tengan una asignación más específica.</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <select className={field} value={campaniaId} onChange={(e) => setCampaniaId(e.target.value)}>
            <option value="">Selecciona campaña…</option>
            {campanias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className={field} value={canalId} onChange={(e) => setCanalId(e.target.value)}>
            <option value="">Cualquier canal</option>
            {canales.filter((c: any) => !campaniaId || c.campaniaId === Number(campaniaId)).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className={field} value={formularioId} onChange={(e) => setFormularioId(e.target.value)}>
            <option value="">Selecciona formulario…</option>
            {formularios.filter((f) => f.versionPublicada).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </div>
        <button onClick={() => crearAsignacion.mutate()} disabled={!campaniaId || !formularioId || crearAsignacion.isPending}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {crearAsignacion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Asignar
        </button>
        {formularioId && !formularioSel?.versionPublicada && (
          <p className="mt-2 text-[0.72rem] font-medium text-amber-600">Este formulario no tiene versión publicada todavía.</p>
        )}
      </div>

      <div className="space-y-2">
        {asignaciones.map((a) => (
          <div key={a.id} className={clsx(card, 'flex items-center justify-between gap-3')}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{a.campaniaNombre} · <span className="text-ink-tertiary">{a.canalNombre ?? 'Cualquier canal'}</span></p>
              <p className="truncate text-[0.72rem] text-ink-tertiary">{a.formularioNombre} (v{a.version})</p>
            </div>
            <button title="Quitar asignación" onClick={() => eliminar.mutate(a.id)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {!asignaciones.length && <p className="text-sm text-ink-tertiary">Todavía no hay asignaciones.</p>}
      </div>
    </div>
  )
}
