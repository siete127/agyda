import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ArrowDown, ArrowLeft, ArrowUp, Ban, Clock, FileSpreadsheet, FileText, Film, Image as ImageIcon, Keyboard, Loader2,
  MessageSquareText, Pause, Play, Plus, Save, Search, Timer, Trash2, Upload, X,
} from 'lucide-react'
import {
  waMasivoService, type CampaniaMasivo as Campania, type EstadoDestinatarioMasivo, type FilaDestinatario, type PasoMasivo, type TipoPasoMasivo,
} from '@/services/waMasivo.service'
import { ESTADO_CAMPANIA } from './waMasivoUi'

const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f
const TIPOS: { id: TipoPasoMasivo; label: string; Icon: typeof FileText; accept?: string }[] = [
  { id: 'texto', label: 'Texto', Icon: MessageSquareText },
  { id: 'imagen', label: 'Imagen', Icon: ImageIcon, accept: 'image/*' },
  { id: 'video', label: 'Video', Icon: Film, accept: 'video/*' },
  { id: 'documento', label: 'Documento', Icon: FileText, accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/*' },
]
const UNIDADES = [{ s: 86400, l: 'días' }, { s: 3600, l: 'horas' }, { s: 60, l: 'minutos' }, { s: 1, l: 'segundos' }]
const separarEspera = (seg: number) => {
  const u = UNIDADES.find((x) => seg >= x.s && seg % x.s === 0) ?? UNIDADES[3]
  return { valor: seg ? seg / u.s : 0, unidad: u.s }
}
const textoEspera = (seg: number) => { const { valor, unidad } = separarEspera(seg); return seg ? `${valor} ${UNIDADES.find((u) => u.s === unidad)!.l}` : 'enseguida' }
const DIAS = [{ d: 1, l: 'L' }, { d: 2, l: 'M' }, { d: 3, l: 'M' }, { d: 4, l: 'J' }, { d: 5, l: 'V' }, { d: 6, l: 'S' }, { d: 0, l: 'D' }]
const ESTADO_DEST: Record<EstadoDestinatarioMasivo, { label: string; cls: string }> = {
  pendiente: { label: 'Por enviar', cls: 'bg-gray-100 text-gray-600' },
  en_cadena: { label: 'En cadena', cls: 'bg-blue-50 text-blue-700' },
  completado: { label: 'Completado', cls: 'bg-emerald-50 text-emerald-700' },
  excluido: { label: 'Sin WhatsApp', cls: 'bg-amber-50 text-amber-700' },
  fallido: { label: 'Falló', cls: 'bg-red-50 text-red-700' },
}
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── Lectura del Excel / texto pegado ──────────────────────────────────────
// Columna del teléfono: la que se llame teléfono/celular/whatsapp/número, o la
// primera que traiga casi puros números. Nombre: nombre/cliente. Lo demás se
// vuelve variable ({{empresa}}, {{monto}}…) con el encabezado como nombre.
function filasDeHoja(rows: unknown[][]): FilaDestinatario[] {
  const limpias = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim()))
  if (!limpias.length) return []
  const pareceTel = (v: unknown) => String(v ?? '').replace(/\D/g, '').length >= 10
  const primera = limpias[0].map((c) => String(c ?? '').trim())
  const conEncabezado = !primera.some(pareceTel)
  const enc = conEncabezado ? primera.map((h) => sinAcentos(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')) : []
  const datos = conEncabezado ? limpias.slice(1) : limpias
  let colTel = enc.findIndex((h) => /tel|cel|whats|movil|numero|phone/.test(h))
  if (colTel < 0) {
    const ancho = Math.max(...datos.map((r) => r.length))
    for (let i = 0; i < ancho && colTel < 0; i++) {
      const muestra = datos.slice(0, 20)
      if (muestra.filter((r) => pareceTel(r[i])).length >= Math.ceil(muestra.length * 0.6)) colTel = i
    }
  }
  if (colTel < 0) return []
  const colNom = enc.findIndex((h, i) => i !== colTel && /nombre|name|cliente|contacto/.test(h))
  return datos.map((r) => {
    const variables: Record<string, string> = {}
    enc.forEach((h, i) => { if (h && i !== colTel && i !== colNom && String(r[i] ?? '').trim()) variables[h] = String(r[i]).trim() })
    return { telefono: String(r[colTel] ?? ''), nombre: colNom >= 0 ? String(r[colNom] ?? '').trim() : undefined, variables }
  })
}
function filasDeTexto(texto: string): FilaDestinatario[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^([+\d\s().-]{8,})[,;\t ]*(.*)$/.exec(l)
    return m ? { telefono: m[1], nombre: m[2].trim() || undefined } : { telefono: l }
  })
}

// ── Un paso de la cadena ──────────────────────────────────────────────────
function PasoEditor({ paso, i, total, editable, onCambio, onMover, onQuitar }: {
  paso: PasoMasivo; i: number; total: number; editable: boolean
  onCambio: (p: PasoMasivo) => void; onMover: (d: -1 | 1) => void; onQuitar: () => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)
  const tipo = TIPOS.find((t) => t.id === paso.tipo)!
  const espera = separarEspera(paso.esperaSeg)
  const textos = paso.textos.length ? paso.textos : ['']
  const subir = async (f: File | undefined) => {
    if (!f) return
    setSubiendo(true)
    try {
      const a = await waMasivoService.subirArchivo(f)
      onCambio({ ...paso, archivoId: a.id, archivo: a })
    } catch (e) { toast.error(msgError(e, 'No se pudo subir el archivo')) } finally { setSubiendo(false) }
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-[0.75rem] font-bold text-white">{i + 1}</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Tipo del mensaje ${i + 1}`}>
          {TIPOS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={paso.tipo === t.id} disabled={!editable}
              onClick={() => onCambio({ ...paso, tipo: t.id, ...(t.id === 'texto' ? { archivoId: null, archivo: null } : {}) })}
              className={clsx('flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold transition disabled:cursor-default',
                paso.tipo === t.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              <t.Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {editable && (
          <div className="ml-auto flex gap-0.5">
            <button onClick={() => onMover(-1)} disabled={i === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => onMover(1)} disabled={i === total - 1} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button onClick={onQuitar} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Quitar mensaje"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      {paso.tipo !== 'texto' && (
        <div className="mt-3">
          <input ref={archivoRef} type="file" accept={tipo.accept} className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
          {paso.archivo ? (
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
              {paso.tipo === 'imagen'
                ? <img src={paso.archivo.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><tipo.Icon className="h-6 w-6" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8rem] font-semibold text-gray-800">{paso.archivo.nombre}</p>
                <p className="text-[0.68rem] text-gray-400">{paso.archivo.tamano ? `${(paso.archivo.tamano / 1048576).toFixed(1)} MB` : ''}</p>
              </div>
              {editable && <button onClick={() => archivoRef.current?.click()} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:bg-card">Cambiar</button>}
            </div>
          ) : (
            <button onClick={() => archivoRef.current?.click()} disabled={!editable || subiendo}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-200 px-4 py-5 text-[0.8rem] font-semibold text-violet-700 hover:bg-violet-50/50 disabled:opacity-60">
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {subiendo ? 'Subiendo…' : `Subir ${tipo.label.toLowerCase()}`}
            </button>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {textos.map((t, j) => (
          <div key={j} className="relative">
            <textarea value={t} disabled={!editable} rows={paso.tipo === 'texto' ? 3 : 2} maxLength={4000}
              placeholder={paso.tipo === 'texto' ? 'Escribe el mensaje… usa {{nombre}} para personalizar' : 'Pie de texto (opcional)'}
              onChange={(e) => onCambio({ ...paso, textos: textos.map((x, k) => (k === j ? e.target.value : x)) })}
              className="w-full rounded-xl border border-gray-200 bg-card px-3 py-2 pr-8 text-[0.82rem] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 disabled:bg-gray-50" />
            {textos.length > 1 && <span className="absolute right-2 top-1.5 text-[0.6rem] font-bold text-violet-500">V{j + 1}</span>}
            {editable && textos.length > 1 && (
              <button onClick={() => onCambio({ ...paso, textos: textos.filter((_, k) => k !== j) })} className="absolute bottom-2 right-2 rounded p-0.5 text-gray-300 hover:text-red-500" aria-label="Quitar variante"><X className="h-3 w-3" /></button>
            )}
          </div>
        ))}
        {editable && (
          <div className="flex flex-wrap items-center gap-2 text-[0.68rem]">
            {textos.length < 5 && <button onClick={() => onCambio({ ...paso, textos: [...textos, ''] })} className="font-semibold text-violet-600 hover:underline">+ Variante del texto</button>}
            <span className="text-gray-400">Con varias variantes se elige una al azar por número, para que no salgan todos iguales.</span>
          </div>
        )}
      </div>

      {i < total - 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-[0.75rem] text-gray-600">
          <Timer className="h-3.5 w-3.5 text-violet-500" /> Esperar
          <input type="number" min={0} disabled={!editable} value={espera.valor}
            onChange={(e) => onCambio({ ...paso, esperaSeg: Math.max(0, Number(e.target.value) || 0) * espera.unidad })}
            className="field w-20 py-1 text-[0.78rem]" aria-label="Cantidad de espera" />
          <select disabled={!editable} value={espera.unidad} aria-label="Unidad de espera"
            onChange={(e) => onCambio({ ...paso, esperaSeg: espera.valor * Number(e.target.value) })}
            className="field w-auto py-1 text-[0.78rem]">
            {UNIDADES.map((u) => <option key={u.s} value={u.s}>{u.l}</option>)}
          </select>
          antes de mandar el mensaje {i + 2}
        </div>
      )}
    </div>
  )
}

// ── Números de la campaña ─────────────────────────────────────────────────
function Destinatarios({ campania, editable }: { campania: Campania; editable: boolean }) {
  const qc = useQueryClient()
  const [estado, setEstado] = useState<EstadoDestinatarioMasivo | ''>('')
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(0)
  const [aMano, setAMano] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const excelRef = useRef<HTMLInputElement>(null)
  const { data } = useQuery({
    queryKey: ['wa-masivo-dest', campania.id, estado, buscar, pagina],
    queryFn: () => waMasivoService.destinatarios(campania.id, { estado: estado || undefined, buscar: buscar || undefined, pagina }),
    refetchInterval: campania.estado === 'enviando' ? 8000 : false,
  })
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['wa-masivo-dest', campania.id] }); qc.invalidateQueries({ queryKey: ['wa-masivo-campania', campania.id] }) }

  const cargar = async (filas: FilaDestinatario[]) => {
    if (!filas.length) { toast.error('No encontré números en lo que cargaste'); return }
    setCargando(true)
    try {
      let tot = { agregados: 0, repetidos: 0, invalidos: 0 }
      for (let i = 0; i < filas.length; i += 5000) {
        const r = await waMasivoService.agregarDestinatarios(campania.id, filas.slice(i, i + 5000))
        tot = { agregados: tot.agregados + r.agregados, repetidos: tot.repetidos + r.repetidos, invalidos: tot.invalidos + r.invalidos }
      }
      toast.success(`${tot.agregados} números agregados${tot.repetidos ? ` · ${tot.repetidos} repetidos` : ''}${tot.invalidos ? ` · ${tot.invalidos} inválidos` : ''}`, { duration: 6000 })
      setAMano(null)
      refrescar()
    } catch (e) { toast.error(msgError(e, 'No se pudieron agregar')) } finally { setCargando(false) }
  }
  const leerExcel = async (f: File | undefined) => {
    if (!f) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false })
      await cargar(filasDeHoja(rows))
    } catch { toast.error('No se pudo leer el archivo: usa .xlsx, .xls o .csv') }
  }
  const quitar = useMutation({
    mutationFn: () => waMasivoService.quitarPendientes(campania.id),
    onSuccess: (r) => { refrescar(); toast.success(`${r.quitados} números quitados`) },
  })
  const puedeAgregar = !['terminada', 'cancelada'].includes(campania.estado)

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[0.95rem] font-bold text-gray-900">2. Números <span className="text-[0.75rem] font-semibold text-gray-400">· {campania.total}</span></h3>
        {puedeAgregar && (
          <>
            <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { leerExcel(e.target.files?.[0]); e.target.value = '' }} />
            <button onClick={() => excelRef.current?.click()} disabled={cargando}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Subir Excel
            </button>
            <button onClick={() => setAMano(aMano === null ? '' : null)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-50">
              <Keyboard className="h-4 w-4" /> Escribir a mano
            </button>
          </>
        )}
        {editable && campania.conteo.pendiente > 0 && (
          <button onClick={() => { if (window.confirm(`¿Quitar los ${campania.conteo.pendiente} números que aún no reciben nada?`)) quitar.mutate() }}
            className="rounded-xl px-2.5 py-1.5 text-[0.72rem] font-semibold text-red-600 hover:bg-red-50">Quitar los no enviados</button>
        )}
      </div>
      <p className="mt-1 text-[0.7rem] text-gray-400">
        Excel: una columna de teléfono (10 dígitos o con lada), y si quieres nombre y otras columnas, que se usan como variables. Ej. la columna "empresa" se escribe {'{{empresa}}'}.
      </p>

      {aMano !== null && (
        <div className="mt-3 space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <textarea autoFocus rows={6} value={aMano} onChange={(e) => setAMano(e.target.value)} placeholder={'Un número por renglón, con nombre si quieres:\n5512345678, Juan Pérez\n5598765432'}
            className="w-full rounded-xl border border-gray-200 bg-card px-3 py-2 font-mono text-[0.8rem] outline-none focus:border-violet-500" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAMano(null)} className="rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
            <button onClick={() => cargar(filasDeTexto(aMano))} disabled={!aMano.trim() || cargando}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Agregar {filasDeTexto(aMano).length || ''} número(s)
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {([['', 'Todos', campania.total], ...(Object.keys(ESTADO_DEST) as EstadoDestinatarioMasivo[]).map((k) => [k, ESTADO_DEST[k].label, campania.conteo[k]])] as [EstadoDestinatarioMasivo | '', string, number][]).map(([k, l, n]) => (
          <button key={k || 'todos'} onClick={() => { setEstado(k); setPagina(0) }}
            className={clsx('rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition', estado === k ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {l} {n ?? 0}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input value={buscar} onChange={(e) => { setBuscar(e.target.value); setPagina(0) }} placeholder="Buscar número o nombre"
            className="w-52 rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[0.75rem] outline-none focus:border-violet-500" />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[0.78rem]">
          <thead>
            <tr className="border-b border-gray-100 text-[0.64rem] font-semibold uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-3">Número</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Mensaje</th><th className="px-3 py-2">Cuenta</th><th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(data?.filas ?? []).map((d) => (
              <tr key={d.id}>
                <td className="py-2 pr-3 font-mono text-gray-700">{d.telefono}</td>
                <td className="px-3 py-2 text-gray-600">{d.nombre ?? '—'}</td>
                <td className="px-3 py-2"><span className={clsx('rounded-full px-2 py-0.5 text-[0.64rem] font-semibold', ESTADO_DEST[d.estado].cls)}>{ESTADO_DEST[d.estado].label}</span></td>
                <td className="px-3 py-2 tabular-nums text-gray-500">{Math.min(d.paso, campania.pasos.length)} / {campania.pasos.length}</td>
                <td className="px-3 py-2 text-gray-500">{d.cuenta ?? '—'}</td>
                <td className="px-3 py-2 text-[0.7rem] text-gray-400">
                  {d.error ?? (d.estado === 'en_cadena' && d.proximo ? `Siguiente: ${new Date(d.proximo).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` : '')}
                </td>
              </tr>
            ))}
            {data && !data.filas.length && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Sin números</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > 100 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-[0.72rem] text-gray-500">
          <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="rounded-lg border px-2 py-1 disabled:opacity-40">Anterior</button>
          {pagina * 100 + 1}–{Math.min(data.total, (pagina + 1) * 100)} de {data.total}
          <button onClick={() => setPagina((p) => p + 1)} disabled={(pagina + 1) * 100 >= data.total} className="rounded-lg border px-2 py-1 disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </section>
  )
}

// ── Editor / avance de una campaña ────────────────────────────────────────
type Form = Pick<Campania, 'nombre' | 'pasos' | 'pausaMin' | 'pausaMax' | 'horaInicio' | 'horaFin' | 'dias'>
const formDe = (c: Campania): Form => ({ nombre: c.nombre, pasos: c.pasos, pausaMin: c.pausaMin, pausaMax: c.pausaMax, horaInicio: c.horaInicio, horaFin: c.horaFin, dias: c.dias })

export function CampaniaMasivo({ id, cuentasEnviando, onVolver }: { id: number; cuentasEnviando: number; onVolver: () => void }) {
  const qc = useQueryClient()
  const { data: c, isLoading } = useQuery({
    queryKey: ['wa-masivo-campania', id],
    queryFn: () => waMasivoService.getCampania(id),
    refetchInterval: (q) => (q.state.data?.estado === 'enviando' ? 5000 : false),
  })
  const [form, setForm] = useState<Form | null>(null)
  const [base, setBase] = useState<string | null>(null)
  if (c && (!form || base === null)) { setForm(formDe(c)); setBase(JSON.stringify(formDe(c))) }
  const editable = !!c && ['borrador', 'pausada'].includes(c.estado)
  const cambios = !!form && base !== null && JSON.stringify(form) !== base
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['wa-masivo-resumen'] }); qc.invalidateQueries({ queryKey: ['wa-masivo-dest', id] }) }

  const guardar = useMutation({
    mutationFn: () => waMasivoService.guardarCampania(id, form!),
    onSuccess: (n) => { qc.setQueryData(['wa-masivo-campania', id], n); setForm(formDe(n)); setBase(JSON.stringify(formDe(n))); refrescar(); toast.success('Campaña guardada') },
    onError: (e) => toast.error(msgError(e, 'No se pudo guardar')),
  })
  const estado = useMutation({
    mutationFn: async (accion: 'iniciar' | 'pausar' | 'reanudar' | 'cancelar') => {
      if (cambios && (accion === 'iniciar' || accion === 'reanudar')) await waMasivoService.guardarCampania(id, form!)
      return waMasivoService.cambiarEstado(id, accion)
    },
    onSuccess: (n, accion) => {
      qc.setQueryData(['wa-masivo-campania', id], n); setForm(formDe(n)); setBase(JSON.stringify(formDe(n))); refrescar()
      toast.success({ iniciar: 'Envío iniciado', pausar: 'Campaña pausada', reanudar: 'Envío reanudado', cancelar: 'Campaña cancelada' }[accion])
    },
    onError: (e) => toast.error(msgError(e, 'No se pudo cambiar el estado')),
  })
  const eliminar = useMutation({
    mutationFn: () => waMasivoService.eliminarCampania(id),
    onSuccess: () => { refrescar(); toast.success('Campaña borrada'); onVolver() },
    onError: (e) => toast.error(msgError(e, 'No se pudo borrar')),
  })

  if (isLoading || !c || !form) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
  const set = (p: Partial<Form>) => setForm({ ...form, ...p })
  const setPaso = (i: number, p: PasoMasivo) => set({ pasos: form.pasos.map((x, j) => (j === i ? p : x)) })
  const mover = (i: number, d: -1 | 1) => { const l = [...form.pasos]; [l[i], l[i + d]] = [l[i + d], l[i]]; set({ pasos: l }) }
  const noEnviados = c.conteo.excluido + c.conteo.fallido
  const hechos = c.conteo.completado + noEnviados
  const pct = c.total ? Math.round((hechos / c.total) * 100) : 0
  const promedioPausa = (form.pausaMin + form.pausaMax) / 2
  const porHora = cuentasEnviando ? Math.round((3600 / Math.max(5, promedioPausa)) * cuentasEnviando) : 0

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <button onClick={onVolver} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Volver"><ArrowLeft className="h-4 w-4" /></button>
        {editable
          ? <input value={form.nombre} onChange={(e) => set({ nombre: e.target.value })} maxLength={150} className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-[1.05rem] font-bold text-gray-900 hover:border-gray-200 focus:border-violet-400 focus:outline-none" aria-label="Nombre de la campaña" />
          : <h2 className="min-w-0 flex-1 truncate text-[1.05rem] font-bold text-gray-900">{c.nombre}</h2>}
        <span className={clsx('rounded-full px-2.5 py-1 text-[0.7rem] font-bold', ESTADO_CAMPANIA[c.estado].cls)}>{ESTADO_CAMPANIA[c.estado].label}</span>
        {editable && cambios && (
          <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-1.5 text-[0.78rem] font-bold text-violet-700 hover:bg-violet-50">
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </button>
        )}
        {c.estado === 'borrador' && (
          <>
            <button onClick={() => { if (window.confirm(`¿Iniciar el envío a ${c.total} números?`)) estado.mutate('iniciar') }} disabled={estado.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Play className="h-4 w-4" /> Iniciar envío</button>
            <button onClick={() => { if (window.confirm('¿Borrar esta campaña?')) eliminar.mutate() }} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" aria-label="Borrar campaña"><Trash2 className="h-4 w-4" /></button>
          </>
        )}
        {c.estado === 'enviando' && (
          <button onClick={() => estado.mutate('pausar')} disabled={estado.isPending} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-[0.8rem] font-bold text-white hover:bg-amber-600"><Pause className="h-4 w-4" /> Pausar</button>
        )}
        {c.estado === 'pausada' && (
          <button onClick={() => estado.mutate('reanudar')} disabled={estado.isPending} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700"><Play className="h-4 w-4" /> Reanudar</button>
        )}
        {['enviando', 'pausada'].includes(c.estado) && (
          <button onClick={() => { if (window.confirm('¿Cancelar la campaña? Los que faltan ya no recibirán nada.')) estado.mutate('cancelar') }}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[0.75rem] font-semibold text-red-600 hover:bg-red-50"><Ban className="h-3.5 w-3.5" /> Cancelar</button>
        )}
      </div>

      {c.estado !== 'borrador' && c.total > 0 && (
        <section className="card p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Números', c.total, 'text-gray-900'], ['Por enviar', c.conteo.pendiente, 'text-gray-600'], ['En cadena', c.conteo.en_cadena, 'text-blue-600'],
              ['Completados', c.conteo.completado, 'text-emerald-600'], ['No enviados', noEnviados, 'text-amber-600'],
            ].map(([l, n, cls]) => (
              <div key={l as string} className="rounded-xl bg-gray-50 px-3 py-2.5">
                <p className={clsx('text-xl font-black tabular-nums', cls as string)}>{n as number}</p>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400">{l}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1.5 text-[0.72rem] text-gray-500">
            {pct}% terminado
            {c.estado === 'enviando' && !c.enHorario && <> · <b className="text-amber-600">Fuera de horario:</b> sigue a las {c.horaInicio}</>}
            {c.estado === 'enviando' && !cuentasEnviando && <> · <b className="text-red-600">No hay cuentas conectadas enviando</b></>}
          </p>
          {c.porCuenta.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {c.porCuenta.map((p) => (
                <span key={p.cuentaId} className="rounded-xl border border-gray-100 px-3 py-1.5 text-[0.72rem] text-gray-600">
                  <b>{p.alias ?? `Cuenta ${p.cuentaId}`}</b> · {p.numeros} números · {p.mensajes} mensajes
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card p-5">
        <h3 className="text-[0.95rem] font-bold text-gray-900">1. Cadena de mensajes</h3>
        <p className="mb-3 text-[0.72rem] text-gray-400">Cada número recibe los mensajes en este orden, siempre desde la misma cuenta, con la espera que pongas entre uno y otro.</p>
        {!editable && c.estado !== 'borrador' && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[0.72rem] text-amber-800">Para cambiar la cadena o el horario, primero pausa la campaña.</p>}
        <div className="space-y-2">
          {form.pasos.map((p, i) => (
            <div key={i}>
              <PasoEditor paso={p} i={i} total={form.pasos.length} editable={editable}
                onCambio={(n) => setPaso(i, n)} onMover={(d) => mover(i, d)} onQuitar={() => set({ pasos: form.pasos.filter((_, j) => j !== i) })} />
              {i < form.pasos.length - 1 && (
                <div className="flex items-center gap-2 py-1 pl-6 text-[0.68rem] font-semibold text-violet-500"><Clock className="h-3 w-3" /> {textoEspera(p.esperaSeg)}</div>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button onClick={() => set({ pasos: [...form.pasos, { tipo: 'texto', textos: [''], archivoId: null, esperaSeg: 60 }] })}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-300 px-4 py-2.5 text-[0.8rem] font-semibold text-violet-700 hover:bg-violet-50/60">
            <Plus className="h-4 w-4" /> Agregar mensaje a la cadena
          </button>
        )}
      </section>

      <Destinatarios campania={c} editable={editable} />

      <section className="card p-5">
        <h3 className="text-[0.95rem] font-bold text-gray-900">3. Ritmo y horario</h3>
        <p className="mb-3 text-[0.72rem] text-gray-400">Pausa al azar entre un envío y el siguiente de la misma cuenta: entre más humana, menos riesgo de bloqueo.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Pausa entre envíos (segundos)</span>
            <div className="flex items-center gap-2">
              <input type="number" min={5} disabled={!editable} value={form.pausaMin} onChange={(e) => set({ pausaMin: Math.max(5, Number(e.target.value) || 5) })} className="field w-20" aria-label="Pausa mínima" />
              a
              <input type="number" min={form.pausaMin} disabled={!editable} value={form.pausaMax} onChange={(e) => set({ pausaMax: Math.max(form.pausaMin, Number(e.target.value) || form.pausaMin) })} className="field w-20" aria-label="Pausa máxima" />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Horario de envío</span>
            <div className="flex items-center gap-2">
              <input type="time" disabled={!editable} value={form.horaInicio} onChange={(e) => set({ horaInicio: e.target.value })} className="field w-auto" aria-label="Hora de inicio" />
              a
              <input type="time" disabled={!editable} value={form.horaFin} onChange={(e) => set({ horaFin: e.target.value })} className="field w-auto" aria-label="Hora de fin" />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[0.72rem] font-semibold text-gray-600">Días</span>
            <div className="flex gap-1">
              {DIAS.map(({ d, l }) => (
                <button key={d} type="button" disabled={!editable} aria-pressed={form.dias.includes(d)}
                  onClick={() => set({ dias: form.dias.includes(d) ? form.dias.filter((x) => x !== d) : [...form.dias, d] })}
                  className={clsx('h-8 w-8 rounded-lg text-[0.75rem] font-bold transition', form.dias.includes(d) ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[0.72rem] text-gray-500">
          {cuentasEnviando
            ? <>Con {cuentasEnviando} cuenta(s) conectada(s), unos <b>{porHora} mensajes por hora</b> en total (respetando el tope diario de cada cuenta).</>
            : 'Conecta al menos una cuenta en la pestaña Cuentas para poder enviar.'}
        </p>
      </section>
    </div>
  )
}
