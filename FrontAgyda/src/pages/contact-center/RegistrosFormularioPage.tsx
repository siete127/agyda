import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, RefreshCw, Search, Phone, ChevronDown, ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { clsx } from 'clsx'
import { ccFormulariosService } from '@/services/ccFormularios.service'
import type { CCFormRegistro, CCFormRegistros } from '@/types/ccFormularios.types'

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
                  const columnas = 3 + (hayAsistencia ? 1 : 0) + [campos.horario, campos.puesto, campos.estatus, campos.canal, campos.contacto].filter(Boolean).length + 1
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
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-700 hover:bg-violet-50">
                            <ExternalLink className="h-3 w-3" /> Dar seguimiento
                          </a>
                        )}
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
    </div>
  )
}

export default function RegistrosFormularioPage() {
  return <RegistrosFormularioVista />
}
