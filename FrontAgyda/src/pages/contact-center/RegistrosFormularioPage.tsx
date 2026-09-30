import { Fragment, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, RefreshCw, Search, Phone, ChevronDown, ExternalLink, Paperclip, Pencil, X, Loader2, Save } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccFormulariosService } from '@/services/ccFormularios.service'
import { SelectorAgente, type VistaAgentes } from '@/components/ui/SelectorAgente'
import type { CCFormRegistro, CCFormRegistros, CCFormCampo, CCFormTipoCampo } from '@/types/ccFormularios.types'

// Vista rápida de lo capturado en un formulario de Contact Center (p. ej.
// "Reclutamiento Totis"): quién, cuándo viene y con quién — con las citas
// próximas primero. A propósito sin exportar ni filtros complejos.

const LS_KEY = 'registros-formulario-id'
const leerGuardado = (): number | null => {
  try { const n = Number(localStorage.getItem(LS_KEY)); return Number.isInteger(n) && n > 0 ? n : null } catch { return null }
}
const guardar = (id: number) => { try { localStorage.setItem(LS_KEY, String(id)) } catch { /* sin almacenamiento */ } }

// 'YYYY-MM-DD' en la zona del navegador (las fechas del formulario son días, sin hora).
function diaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return diaLocal(new Date(y, m - 1, d + n))
}
function fmtDia(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
}

// Qué campo del formulario es cada dato, por su código/etiqueta y tipo.
type Rol = 'paterno' | 'materno' | 'nombres' | 'telefono' | 'contacto' | 'asistencia' | 'horario' | 'puesto' | 'estatus' | 'canal' | 'asesor'
function detectarCampos(columnas: CCFormRegistros['columnas']): Partial<Record<Rol, string>> {
  const busca = (pred: (c: CCFormRegistros['columnas'][number], texto: string) => boolean) =>
    columnas.find((c) => pred(c, `${c.codigo} ${c.etiqueta}`.toLowerCase()))?.codigo
  return {
    paterno: busca((_, t) => /paterno/.test(t)),
    materno: busca((_, t) => /materno/.test(t)),
    nombres: busca((c, t) => c.tipo === 'texto_corto' && /^nombres?\b|nombre\(s\)/.test(t)),
    telefono: busca((c) => c.tipo === 'telefono'),
    contacto: busca((c, t) => c.tipo === 'fecha' && /contac/.test(t)),
    asistencia: busca((c, t) => c.tipo === 'fecha' && /asist|cita/.test(t)),
    horario: busca((_, t) => /horario|hour|\bhora\b/.test(t)),
    puesto: busca((_, t) => /puesto|place|vacante/.test(t)),
    estatus: busca((_, t) => /estatus|status/.test(t)),
    canal: busca((c, t) => c.tipo !== 'telefono' && /canal|channel/.test(t)),
    asesor: busca((c) => c.tipo === 'usuario_agente'),
  }
}

/* ── Resto de campos del formulario (los que no tienen columna fija) ── */
type Columna = CCFormRegistros['columnas'][number]
// '/evidencia/…' es del histórico de Ventas (plata_prospectPRO) — ese
// archivo vive físicamente en el sitio de Ventas (ventas.ardabytec.vip), no
// en AGYDA, así que se sirve completando el dominio; el resto son rutas
// propias de AGYDA (/uploads/…) o absolutas.
const VENTAS_ORIGIN = 'https://ventas.ardabytec.vip'
const esRutaArchivo = (v: string) => /^(https?:\/\/|\/uploads\/|\/evidencia\/)/i.test(v)
const urlArchivo = (v: string) => v.startsWith('/evidencia/') ? `${VENTAS_ORIGIN}${v}` : v
const nombreArchivo = (v: string) => decodeURIComponent(v.split('/').pop() ?? '').replace(/^fir_\d+_/, '')

// Un valor según el tipo de campo: imagen con miniatura, archivo con enlace, fechas legibles…
function ValorCampo({ col, valor }: { col: Columna; valor: unknown }) {
  if (valor === null || valor === undefined || valor === '') return <span className="text-gray-300">—</span>
  const v = String(valor)
  if (col.tipo === 'imagen' || col.tipo === 'firma') {
    if (!esRutaArchivo(v)) return <span className="text-[0.7rem] text-gray-400" title={v}>Sin imagen guardada</span>
    return (
      <a href={urlArchivo(v)} target="_blank" rel="noopener noreferrer" title="Abrir imagen" className="inline-block">
        <img src={urlArchivo(v)} alt={col.etiqueta} loading="lazy"
          className="h-10 w-10 rounded-lg border border-gray-200 object-cover transition hover:scale-105" />
      </a>
    )
  }
  if (col.tipo === 'archivo') {
    if (!esRutaArchivo(v)) return <span className="text-[0.7rem] text-gray-400" title={v}>Sin archivo guardado</span>
    return (
      <a href={urlArchivo(v)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[12rem] items-center gap-1 text-[0.78rem] text-brand hover:underline">
        <Paperclip className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{nombreArchivo(v) || 'Ver archivo'}</span>
      </a>
    )
  }
  if (col.tipo === 'url' && esRutaArchivo(v)) {
    return <a href={v} target="_blank" rel="noopener noreferrer" className="text-[0.78rem] text-brand hover:underline">Abrir enlace</a>
  }
  if (col.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return <span className="whitespace-nowrap">{fmtDia(v)}</span>
  if (col.tipo === 'fecha_hora') {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return <span className="whitespace-nowrap">{d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
  }
  if (col.tipo === 'moneda' && Number.isFinite(Number(v))) {
    return <span className="whitespace-nowrap tabular-nums">{Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span>
  }
  if (col.tipo === 'porcentaje' && Number.isFinite(Number(v))) return <span className="tabular-nums">{Number(v)}%</span>
  if (typeof valor === 'boolean' || col.tipo === 'si_no') {
    const si = valor === true || /^(true|1|s[ií])$/i.test(v)
    return <span>{si ? 'Sí' : 'No'}</span>
  }
  return <span className="line-clamp-2 max-w-[16rem]" title={v}>{v}</span>
}

interface Fila {
  r: CCFormRegistro
  nombre: string
  telefono: string
  asistencia: string | null
  contacto: string | null
  horario: string
  puesto: string
  estatus: string
  canal: string
  asesor: string
}

// Una persona = su registro más reciente + todos sus registros en este formulario.
interface Persona extends Fila {
  seguimientos: Fila[]
}

type Filtro = 'proximas' | 'hoy' | 'todas'

// Color del estatus por palabras clave (el catálogo lo define cada campaña).
function tonoEstatus(e: string): string {
  const t = e.toLowerCase()
  if (/no asisti|descart|no interes|cancel/.test(t)) return 'bg-red-100 text-red-700'
  if (/asisti|contratad/.test(t)) return 'bg-emerald-100 text-emerald-700'
  if (/confirm/.test(t)) return 'bg-blue-100 text-blue-700'
  if (/agend|cita/.test(t)) return 'bg-violet-100 text-violet-700'
  return 'bg-gray-100 text-gray-600'
}

// Contenido de la vista, reutilizado tal cual en la Suite de reportes
// (carpeta Operación → "Registros de formularios"). Con `formularioIds` solo
// se ofrecen esos formularios (apartado de una campaña en la Suite).
export function RegistrosFormularioVista({ formularioIds }: { formularioIds?: number[] } = {}) {
  const { data: formularios = [], isLoading: cargandoForms } = useQuery({
    queryKey: ['ccf-formularios'],
    queryFn: () => ccFormulariosService.listFormularios(),
  })
  const publicados = formularios.filter((f) => f.activo && f.versionPublicada != null && (!formularioIds || formularioIds.includes(f.id)))
  const [elegido, setElegido] = useState<number | null>(leerGuardado)
  // Sin elección guardada (o ya no existe): el publicado más reciente.
  const formId = publicados.some((f) => f.id === elegido)
    ? elegido
    : [...publicados].sort((a, b) => b.id - a.id)[0]?.id ?? null

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ccf-registros', formId],
    queryFn: () => ccFormulariosService.listRegistros(formId!),
    enabled: formId != null,
    refetchInterval: 60_000,
  })

  const [filtro, setFiltro] = useState<Filtro>('proximas')
  const [buscar, setBuscar] = useState('')
  const hoy = diaLocal()
  const manana = sumarDias(hoy, 1)
  const en7 = sumarDias(hoy, 7)

  const campos = useMemo(() => detectarCampos(data?.columnas ?? []), [data?.columnas])
  // Todos los demás campos del formulario (incluidas imágenes y archivos): una
  // columna cada uno, después de las columnas fijas.
  const extras = useMemo(() => {
    const usados = new Set(Object.values(campos).filter(Boolean))
    return (data?.columnas ?? []).filter((c) => !usados.has(c.codigo))
  }, [data?.columnas, campos])
  const filas: Fila[] = useMemo(() => (data?.registros ?? []).map((r) => {
    const v = (rol: Rol) => (campos[rol] ? r.valores[campos[rol]!] ?? null : null)
    const nombre = [v('paterno'), v('materno'), v('nombres')].filter(Boolean).join(' ') || r.clienteNombre || '—'
    return {
      r,
      nombre,
      telefono: v('telefono') || r.clienteTelefono || '',
      asistencia: v('asistencia'),
      contacto: v('contacto'),
      horario: v('horario') ?? '',
      puesto: v('puesto') ?? '',
      estatus: v('estatus') ?? '',
      canal: v('canal') ?? '',
      asesor: v('asesor') || r.agenteNombre || '',
    }
  }), [data?.registros, campos])

  // Una fila por persona (por teléfono): su registro más reciente manda y los
  // anteriores son su historial de seguimientos en este formulario.
  const personas: Persona[] = useMemo(() => {
    const grupos = new Map<string, Fila[]>()
    for (const f of filas) {
      const tel = f.telefono.replace(/\D/g, '').slice(-10)
      const clave = tel.length === 10 ? tel : `sin-tel-${f.r.interaccionId}`
      if (!grupos.has(clave)) grupos.set(clave, [])
      grupos.get(clave)!.push(f)
    }
    return [...grupos.values()].map((g) => {
      const orden = [...g].sort((a, b) => b.r.interaccionId - a.r.interaccionId)
      return { ...orden[0], seguimientos: orden }
    })
  }, [filas])

  const formSel = publicados.find((f) => f.id === formId)
  const user = useAuthStore((s) => s.user)
  // "Dar seguimiento": abre el formulario externo con su teléfono; ahí se ve
  // su historial completo y al guardar se agrega un seguimiento nuevo.
  const urlSeguimiento = (tel: string) => {
    if (formSel?.modo !== 'externo' || !formSel.tokenPublico || !tel) return null
    const qs = new URLSearchParams({ cliente: tel })
    if (user) { qs.set('agente', user.nombres); qs.set('agenteId', String(user.id)) }
    return `/formulario-publico/${formSel.tokenPublico}?${qs.toString()}`
  }
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())
  const alternar = (id: number) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [editando, setEditando] = useState<number | null>(null)
  const [editandoVenta, setEditandoVenta] = useState<number | null>(null)

  const hayAsistencia = !!campos.asistencia
  const conteo = {
    hoy: personas.filter((f) => f.asistencia === hoy).length,
    manana: personas.filter((f) => f.asistencia === manana).length,
    semana: personas.filter((f) => f.asistencia && f.asistencia >= hoy && f.asistencia <= en7).length,
  }

  const q = buscar.trim().toLowerCase()
  const visibles = personas
    .filter((f) => !q || f.nombre.toLowerCase().includes(q) || f.telefono.includes(q))
    .filter((f) => !hayAsistencia || filtro === 'todas'
      || (filtro === 'hoy' ? f.asistencia === hoy : !!f.asistencia && f.asistencia >= hoy))
    .sort((a, b) => {
      // Próximas primero (la más cercana arriba), luego pasadas (la más
      // reciente arriba), y al final las que no tienen fecha.
      const ka = a.asistencia, kb = b.asistencia
      if (hayAsistencia && ka !== kb) {
        if (!ka) return 1
        if (!kb) return -1
        const fa = ka >= hoy, fb = kb >= hoy
        if (fa !== fb) return fa ? -1 : 1
        return fa ? ka.localeCompare(kb) : kb.localeCompare(ka)
      }
      if (a.horario !== b.horario) return a.horario.localeCompare(b.horario)
      return b.r.interaccionId - a.r.interaccionId
    })

  const elegir = (id: number) => { setElegido(id); guardar(id) }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Encabezado */}
      <div className="rounded-2xl border border-gray-200/60 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900">Registros de formularios</h1>
            <p className="text-[0.78rem] text-gray-400">Lo que se va capturando, con las citas más próximas primero.</p>
          </div>
          <select
            value={formId ?? ''}
            onChange={(e) => elegir(Number(e.target.value))}
            disabled={cargandoForms || !publicados.length}
            className="min-w-[220px] rounded-xl border border-gray-200 bg-card px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {!publicados.length && <option value="">{cargandoForms ? 'Cargando…' : 'Sin formularios publicados'}</option>}
            {publicados.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <button onClick={() => refetch()} title="Actualizar"
            className={clsx('flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50', isFetching && 'animate-spin')}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {hayAsistencia && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: 'Vienen hoy', n: conteo.hoy, cls: 'text-emerald-600' },
              { label: 'Vienen mañana', n: conteo.manana, cls: 'text-amber-600' },
              { label: 'Próximos 7 días', n: conteo.semana, cls: 'text-violet-600' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-100 px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">{k.label}</p>
                <p className={clsx('text-2xl font-black', k.cls)}>{k.n}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center gap-2">
        {hayAsistencia && ([
          ['proximas', 'Con cita próxima'],
          ['hoy', 'Hoy'],
          ['todas', 'Todos'],
        ] as [Filtro, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={clsx('rounded-xl border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors',
              filtro === k ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-card text-gray-600 hover:border-brand/40')}>
            {label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre o teléfono…"
            className="w-full rounded-xl border border-gray-200 bg-card py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-700">{data?.formulario.nombre ?? 'Registros'}</h2>
          <span className="text-[0.72rem] text-gray-400">
            {visibles.length} de {personas.length} personas · {data?.total ?? 0} registros
            {data && data.total > data.limite && ` · se muestran los ${data.limite} más recientes`}
          </span>
        </div>
        {isLoading || cargandoForms ? (
          <p className="py-16 text-center text-sm text-gray-400">Cargando…</p>
        ) : !visibles.length ? (
          <p className="py-16 text-center text-sm text-gray-400">
            {filtro === 'proximas' && hayAsistencia ? 'Nadie tiene cita próxima.' : filtro === 'hoy' ? 'Nadie viene hoy.' : 'Sin registros todavía.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
                  {hayAsistencia && <th className="px-4 py-2.5">Asistencia</th>}
                  {campos.horario && <th className="px-4 py-2.5">Horario</th>}
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Teléfono</th>
                  {campos.puesto && <th className="px-4 py-2.5">Puesto</th>}
                  {campos.estatus && <th className="px-4 py-2.5">Estatus</th>}
                  {campos.canal && <th className="px-4 py-2.5">Canal</th>}
                  <th className="px-4 py-2.5">Asesor</th>
                  {campos.contacto && <th className="px-4 py-2.5">Contacto</th>}
                  {extras.map((c) => <th key={c.codigo} className="whitespace-nowrap px-4 py-2.5">{c.etiqueta}</th>)}
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((f) => {
                  const esHoy = f.asistencia === hoy
                  const esManana = f.asistencia === manana
                  const pasada = !!f.asistencia && f.asistencia < hoy
                  const abierto = abiertos.has(f.r.interaccionId)
                  const url = urlSeguimiento(f.telefono)
                  const columnas = 3 + (hayAsistencia ? 1 : 0) + [campos.horario, campos.puesto, campos.estatus, campos.canal, campos.contacto].filter(Boolean).length + extras.length + 1
                  return (
                    <Fragment key={f.r.interaccionId}>
                    <tr className={clsx('hover:bg-gray-50/60', esHoy && 'bg-emerald-50/50', pasada && 'text-gray-400')}>
                      {hayAsistencia && (
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {f.asistencia ? (
                            <span className={clsx('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.75rem] font-bold',
                              esHoy ? 'bg-emerald-100 text-emerald-700' : esManana ? 'bg-amber-100 text-amber-700'
                                : pasada ? 'bg-gray-100 text-gray-400' : 'bg-violet-50 text-violet-700')}>
                              {esHoy ? 'Hoy' : esManana ? 'Mañana' : fmtDia(f.asistencia)}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      )}
                      {campos.horario && <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.8rem]">{f.horario || '—'}</td>}
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-800">{f.nombre}</p>
                        {f.seguimientos.length > 1 && (
                          <button onClick={() => alternar(f.r.interaccionId)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-violet-600 hover:underline">
                            <ChevronDown className={clsx('h-3 w-3 transition-transform', abierto && 'rotate-180')} />
                            {f.seguimientos.length} seguimientos
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {f.telefono ? (
                          <a href={`tel:${f.telefono}`} className="inline-flex items-center gap-1 text-[0.8rem] text-brand hover:underline">
                            <Phone className="h-3 w-3" /> {f.telefono}
                          </a>
                        ) : '—'}
                      </td>
                      {campos.puesto && <td className="px-4 py-2.5 text-[0.8rem]">{f.puesto || '—'}</td>}
                      {campos.estatus && (
                        <td className="px-4 py-2.5">
                          {f.estatus ? <span className={clsx('rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', tonoEstatus(f.estatus))}>{f.estatus}</span> : '—'}
                        </td>
                      )}
                      {campos.canal && <td className="whitespace-nowrap px-4 py-2.5 text-[0.8rem]">{f.canal || '—'}</td>}
                      <td className="px-4 py-2.5 text-[0.8rem]">{f.asesor || '—'}</td>
                      {campos.contacto && <td className="whitespace-nowrap px-4 py-2.5 text-[0.8rem]">{f.contacto ? fmtDia(f.contacto) : '—'}</td>}
                      {extras.map((c) => (
                        <td key={c.codigo} className="px-4 py-2.5 text-[0.8rem]"><ValorCampo col={c} valor={f.r.valores[c.codigo]} /></td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* interaccionId negativo = venta del histórico de Ventas
                              (plata_prospectPRO): se edita contra Ventas (EditarVentaModal). */}
                          {f.r.interaccionId > 0 ? (
                            <button onClick={() => setEditando(f.r.interaccionId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50">
                              <Pencil className="h-3 w-3" /> Editar
                            </button>
                          ) : data?.puedeEditarHistorico && (
                            <button onClick={() => setEditandoVenta(-f.r.interaccionId)} title="Venta del histórico de Ventas"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50">
                              <Pencil className="h-3 w-3" /> Editar
                            </button>
                          )}
                          {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-700 hover:bg-violet-50">
                              <ExternalLink className="h-3 w-3" /> Dar seguimiento
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="bg-violet-50/40">
                        <td colSpan={columnas} className="px-4 py-2">
                          <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-violet-700">Historial en este formulario</p>
                          <table className="w-full text-[0.75rem]">
                            <tbody className="divide-y divide-violet-100">
                              {f.seguimientos.map((s) => (
                                <tr key={s.r.interaccionId} className="text-gray-600">
                                  <td className="whitespace-nowrap py-1 pr-3">{new Date(s.r.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="py-1 pr-3 font-semibold">{s.estatus || '—'}</td>
                                  <td className="whitespace-nowrap py-1 pr-3">{s.asistencia ? `Cita ${fmtDia(s.asistencia)}${s.horario ? ` · ${s.horario}` : ''}` : 'Sin cita'}</td>
                                  <td className="py-1 pr-3">{s.canal || '—'}</td>
                                  <td className="py-1 pr-3">{s.asesor || '—'}</td>
                                  {extras.map((c) => (
                                    <td key={c.codigo} className="py-1 pr-3">
                                      <span className="mr-1 text-[0.65rem] text-gray-400">{c.etiqueta}:</span>
                                      <ValorCampo col={c} valor={s.r.valores[c.codigo]} />
                                    </td>
                                  ))}
                                  <td className="whitespace-nowrap py-1 pl-2 text-right">
                                    {(s.r.interaccionId > 0 || data?.puedeEditarHistorico) && (
                                      <button onClick={() => (s.r.interaccionId > 0 ? setEditando(s.r.interaccionId) : setEditandoVenta(-s.r.interaccionId))}
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-0.5 text-[0.68rem] font-semibold text-gray-600 hover:bg-gray-50">
                                        <Pencil className="h-2.5 w-2.5" /> Editar
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando != null && formId != null && (
        <EditarRegistroModal formId={formId} interaccionId={editando} onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); refetch() }} />
      )}
      {editandoVenta != null && formId != null && (
        <EditarVentaModal formId={formId} idVenta={editandoVenta} onClose={() => setEditandoVenta(null)}
          onSaved={() => { setEditandoVenta(null); refetch() }} />
      )}
    </div>
  )
}

// Edita un registro ya guardado (cambiar estatus, corregir un dato, volver a
// adjuntar evidencia…) desde donde se ve la lista — Registros de formularios
// y, vía RegistrosDeCampania, el Suite de Reportes de la campaña. Reabre la
// interacción con su versión publicada (mismo campoId de siempre — si el
// campo se editó después de esa respuesta, ver advertencia en el comentario
// de cabecera del archivo del backend) y guarda con guardarRespuestas pasando
// interaccionId, que actualiza en vez de crear.
function EditarRegistroModal({ formId, interaccionId, onClose, onSaved }: {
  formId: number; interaccionId: number; onClose: () => void; onSaved: () => void
}) {
  const qc = useQueryClient()
  const { data: formulario } = useQuery({
    queryKey: ['ccf-formulario', formId],
    queryFn: () => ccFormulariosService.getFormulario(formId),
  })
  const versionId = formulario?.versiones.find((v) => v.estado === 'publicado')?.id ?? null

  const { data: version, isLoading: cargandoVersion } = useQuery({
    queryKey: ['ccf-version-completa', versionId],
    queryFn: () => ccFormulariosService.getVersionCompleta(versionId!),
    enabled: versionId != null,
  })
  const { data: respuestas, isLoading: cargandoRespuestas } = useQuery({
    queryKey: ['ccf-respuestas', versionId, interaccionId],
    queryFn: () => ccFormulariosService.getRespuestas(versionId!, interaccionId),
    enabled: versionId != null,
  })

  const [valores, setValores] = useState<Record<number, unknown>>({})
  const [archivos, setArchivos] = useState<Record<number, File>>({})
  const [cargado, setCargado] = useState(false)
  if (respuestas && !cargado) {
    const iniciales: Record<number, unknown> = {}
    for (const r of respuestas) iniciales[r.campoId] = r.valor
    setValores(iniciales)
    setCargado(true)
  }
  const setValor = (campoId: number, valor: unknown) => setValores((v) => ({ ...v, [campoId]: valor }))
  const setArchivo = (campoId: number, archivo: File | null) => {
    setArchivos((a) => { if (!archivo) { const { [campoId]: _o, ...r } = a; return r } return { ...a, [campoId]: archivo } })
    setValor(campoId, archivo ? archivo.name : undefined)
  }

  const guardar = useMutation({
    mutationFn: () => {
      const campos = (version?.secciones ?? []).flatMap((s) => s.campos)
      const capturables = campos.filter((c) => !['titulo', 'separador', 'buscador', 'pendientes'].includes(c.tipo))
      return ccFormulariosService.guardarRespuestas(versionId!, {
        interaccionId,
        respuestas: capturables.filter((c) => valores[c.id] !== undefined).map((c) => ({ campoId: c.id, valor: valores[c.id] as any })),
      }, archivos)
    },
    onSuccess: () => {
      toast.success('Registro actualizado')
      qc.invalidateQueries({ queryKey: ['ccf-registros'] })
      onSaved()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al guardar'),
  })

  const cargando = cargandoVersion || cargandoRespuestas || !cargado
  const secciones = version?.secciones ?? []

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-gray-900">Editar registro</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        {cargando ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
        ) : (
          <div className="space-y-5 p-5">
            {secciones.map((s) => (
              <div key={s.id}>
                <p className="mb-2 text-sm font-bold text-gray-900">{s.titulo}</p>
                <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2">
                  {s.campos.filter((c) => !['titulo', 'separador', 'buscador', 'pendientes'].includes(c.tipo)).map((c) => (
                    <CampoEdicion key={c.id} campo={c} formId={formId} valor={valores[c.id]}
                      onChange={(v) => setValor(c.id, v)} onArchivo={(f) => setArchivo(c.id, f)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={cargando || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const mensajeError = (e: unknown) => (e as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

// Edita una venta del histórico de Ventas (fila con interaccionId negativo):
// se guarda directo en la BD de Ventas. Si cambia el estatus, Ventas lo
// registra en el historial de la venta con quién lo cambió desde AGYDA.
function EditarVentaModal({ formId, idVenta, onClose, onSaved }: {
  formId: number; idVenta: number; onClose: () => void; onSaved: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['ccf-venta-historico', formId, idVenta],
    queryFn: () => ccFormulariosService.getVentaHistorico(formId, idVenta),
    retry: false,
  })
  const [f, setF] = useState<{
    nombreCliente: string; telefonoCliente: string; estatus: string; fecha: string
    fechaAgendada: string; horaAgendada: string; idUser: number | ''; notas: string
  } | null>(null)
  const [evidencia, setEvidencia] = useState<File | null>(null)
  if (data && !f) {
    const v = data.venta
    setF({
      nombreCliente: v.nombreCliente ?? '', telefonoCliente: v.telefonoCliente ?? '', estatus: v.estatus ?? '',
      // Ventas guarda la hora local y llega como si fuera UTC: el día real son los primeros 10 caracteres.
      fecha: String(v.fecha).slice(0, 10),
      fechaAgendada: v.fechaAgendada ?? '', horaAgendada: v.horaAgendada ?? '', idUser: v.idUser || '', notas: '',
    })
  }
  const set = <K extends keyof NonNullable<typeof f>>(k: K, val: NonNullable<typeof f>[K]) => setF((x) => (x ? { ...x, [k]: val } : x))

  const guardar = useMutation({
    mutationFn: () => ccFormulariosService.editarVentaHistorico(formId, idVenta, { ...f!, evidencia }),
    onSuccess: (r) => {
      toast.success(r?.data?.cambioEstatus ? `Venta actualizada · estatus ${r.data.estatus}` : 'Venta actualizada')
      qc.invalidateQueries({ queryKey: ['ccf-registros'] })
      qc.invalidateQueries({ queryKey: ['ccf-venta-historico', formId, idVenta] })
      onSaved()
    },
    onError: (e: unknown) => toast.error(mensajeError(e) ?? 'Error al guardar'),
  })

  const cambioEstatus =!!data && !!f && f.estatus !== (data.venta.estatus ?? '')
  const esAgendada = /agend/i.test(f?.estatus ?? '')
  const vistasAsesor: VistaAgentes[] = data ? [
    { id: 'activos', label: 'Activos', agentes: data.asesores.filter((a) => a.activo) },
    { id: 'inactivos', label: 'Inactivos', agentes: data.asesores.filter((a) => !a.activo), deshabilitados: true },
  ] : []
  const errorMsg = mensajeError(error)
  const vistaPrevia = useMemo(() => (evidencia ? URL.createObjectURL(evidencia) : null), [evidencia])

  // Portal: la vista tiene animate-fade-in (deja un transform) y un `fixed`
  // dentro se centraría en toda la lista, fuera de la pantalla.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Editar venta #{idVenta}</h2>
            <p className="text-[0.7rem] text-gray-400">
              Histórico de Ventas{data ? ` · capturada el ${fmtDia(String(data.venta.fecha).slice(0, 10))}` : ''} · se guarda en la BD de Ventas
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
        ) : errorMsg || !data || !f ? (
          <p className="px-5 py-12 text-center text-sm text-gray-500">{errorMsg ?? 'No se pudo abrir la venta'}</p>
        ) : (
          <div className="space-y-5 p-5">
            <div>
              <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">Tipificación</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipificación">
                {data.estatus.map((e) => {
                  const sel = f.estatus === e.nombre
                  return (
                    <button key={e.nombre} role="radio" aria-checked={sel} onClick={() => set('estatus', e.nombre)}
                      className={clsx('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8rem] font-semibold transition',
                        sel ? 'border-transparent text-white shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}
                      style={sel ? { backgroundColor: e.color ?? '#6d28d9' } : undefined}>
                      {!sel && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color ?? '#9ca3af' }} />}
                      {e.nombre}
                    </button>
                  )
                })}
              </div>
              {cambioEstatus && (
                <p className="mt-2 text-[0.72rem] text-violet-700">
                  Cambia de <b>{data.venta.estatus || '—'}</b> a <b>{f.estatus}</b>: quedará en el historial de la venta y en el CRM de Ventas.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Nombre del cliente</span>
                <input className="field" value={f.nombreCliente} maxLength={100} onChange={(e) => set('nombreCliente', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Teléfono</span>
                <input className="field" value={f.telefonoCliente} inputMode="tel" maxLength={20} onChange={(e) => set('telefonoCliente', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Fecha de la venta</span>
                <input type="date" className="field" value={f.fecha} max={diaLocal()} onChange={(e) => e.target.value && set('fecha', e.target.value)} />
                {f.fecha !== String(data.venta.fecha).slice(0, 10) && (
                  <span className="mt-1 block text-[0.68rem] text-amber-600">Cambia el día en que cuenta para Metas y Nómina.</span>
                )}
              </label>
              <div>
                <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Asesor</span>
                <SelectorAgente vistas={vistasAsesor} value={f.idUser} onChange={(id) => set('idUser', id)} placeholder="Sin asesor" />
              </div>
              {(esAgendada || f.fechaAgendada) && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Fecha agendada</span>
                    <input type="date" className="field" value={f.fechaAgendada} onChange={(e) => set('fechaAgendada', e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Hora</span>
                    <input type="time" className="field" value={f.horaAgendada} onChange={(e) => set('horaAgendada', e.target.value)} />
                  </label>
                </>
              )}
            </div>

            <div>
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Evidencia</span>
              <div className="flex items-center gap-3">
                {(vistaPrevia || data.venta.evidencia) && (
                  <a href={vistaPrevia ?? urlArchivo(data.venta.evidencia!)} target="_blank" rel="noopener noreferrer">
                    <img src={vistaPrevia ?? urlArchivo(data.venta.evidencia!)} alt="Evidencia" className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                  </a>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:border-violet-400 hover:text-violet-700">
                  <Paperclip className="h-3.5 w-3.5" /> {evidencia ? evidencia.name : data.venta.evidencia ? 'Reemplazar evidencia' : 'Subir evidencia'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setEvidencia(e.target.files?.[0] ?? null)} />
                </label>
                {evidencia && <button onClick={() => setEvidencia(null)} className="text-[0.72rem] text-gray-400 hover:text-gray-600">Quitar</button>}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Comentario {cambioEstatus ? '(queda en el historial de la venta)' : '(opcional)'}</span>
              <textarea className="field min-h-[64px]" value={f.notas} maxLength={2000} onChange={(e) => set('notas', e.target.value)}
                placeholder="Por qué se hace el cambio…" />
            </label>

            {data.seguimientos.length > 0 && (
              <div>
                <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">Historial de estatus</p>
                <ul className="space-y-1 rounded-xl border border-gray-100 p-2 text-[0.75rem]">
                  {data.seguimientos.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-gray-600">
                      <span className="whitespace-nowrap text-gray-400">{new Date(s.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <b className="text-gray-800">{s.estatus}</b>
                      <span>· {s.nombreAgente}</span>
                      {s.notas && <span className="w-full pl-1 text-gray-500">“{s.notas}”</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!f || !f.nombreCliente.trim() || !f.estatus || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar en Ventas
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Un campo del modal de edición — mismos tipos que el runtime del
// formulario, sin buscador/pendientes/catálogo estático dinámico complejo
// (la edición es de datos ya capturados, no de flujo de atención en vivo).
function CampoEdicion({ campo, formId, valor, onChange, onArchivo }: {
  campo: CCFormCampo; formId: number; valor: unknown; onChange: (v: unknown) => void; onArchivo: (f: File | null) => void
}) {
  const field = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
  const label = 'mb-1.5 block text-[0.72rem] font-semibold text-gray-500'
  const etiqueta = <span className={label}>{campo.etiqueta} {campo.obligatorio && <span className="text-red-500">*</span>}</span>

  const [opcionesDinamicas, setOpcionesDinamicas] = useState<{ valor: string; etiqueta: string }[] | null>(null)
  const necesitaCatalogo = campo.tipo === 'catalogo' && !!campo.catalogoFuente && campo.catalogoFuente !== 'estatico'
  if (necesitaCatalogo && opcionesDinamicas === null) {
    ccFormulariosService.getOpcionesCatalogo(formId, campo.catalogoFuente!).then(setOpcionesDinamicas).catch(() => setOpcionesDinamicas([]))
  }

  if (campo.tipo === 'texto_largo') {
    return <label>{etiqueta}<textarea className={clsx(field, 'h-20')} value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
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
    const opciones = necesitaCatalogo ? (opcionesDinamicas ?? []) : campo.opciones
    return (
      <label>{etiqueta}
        <select className={field} value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{necesitaCatalogo && opcionesDinamicas === null ? 'Cargando…' : 'Selecciona…'}</option>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
    )
  }
  if (campo.tipo === 'archivo' || campo.tipo === 'imagen') {
    const actual = typeof valor === 'string' && /^(https?:\/\/|\/uploads\/)/i.test(valor) ? valor : null
    return (
      <label>{etiqueta}
        {actual && <a href={actual} target="_blank" rel="noopener noreferrer" className="mb-1 block text-[0.72rem] text-brand hover:underline">Ver archivo actual</a>}
        <input type="file" accept={campo.tipo === 'imagen' ? 'image/*' : undefined}
          className={clsx(field, 'file:mr-2 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-violet-700')}
          onChange={(e) => onArchivo(e.target.files?.[0] ?? null)} />
      </label>
    )
  }
  const tipoInput: Record<string, string> = {
    numero: 'number', telefono: 'tel', email: 'email', fecha: 'date', hora: 'time',
    fecha_hora: 'datetime-local', url: 'url', moneda: 'number', porcentaje: 'number',
  }
  return (
    <label>{etiqueta}
      <input type={tipoInput[campo.tipo as CCFormTipoCampo] ?? 'text'} className={field} value={(valor as string) ?? ''}
        onChange={(e) => onChange(campo.tipo === 'numero' || campo.tipo === 'moneda' || campo.tipo === 'porcentaje' ? Number(e.target.value) : e.target.value)} />
    </label>
  )
}

export default function RegistrosFormularioPage() {
  return <RegistrosFormularioVista />
}
