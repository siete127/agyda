import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, Plus, Save, X, Phone, User, Check } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccFormularioPublicoService } from '@/services/ccFormularios.service'
import type { CCFormPublicoCampo, CCFormPublicoSeccion, CCFormBuscadorResultado, CCFormAccionPost } from '@/types/ccFormularios.types'

const field = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-gray-500'

// Formulario de Atención en modo EXTERNO — pantalla pública sin sesión, para
// que VICIdial la abra directo al conectar una llamada:
//   /formulario-publico/<token>?cliente=<telefono>&agente=<nombre>&agenteId=<id>
// Mismo espíritu que CRMPublicPage.tsx (/crm?cliente=&agente=&agenteId=),
// pero resolviendo un formulario dinámico en vez de la pantalla fija de CRM
// de Ventas. El agente/cliente de los query params se usan como precarga y
// como identidad para el registro (campo 'buscador' y el guardado general)
// — no hay login.
export default function FormularioPublicoPage() {
  const { token } = useParams<{ token: string }>()
  const [params] = useSearchParams()
  const cliente = params.get('cliente') || ''
  const agenteNombre = params.get('agente') || ''
  const agenteId = params.get('agenteId') ? Number(params.get('agenteId')) : null

  const { data: def, isLoading, isError } = useQuery({
    queryKey: ['ccf-publico', token],
    queryFn: () => ccFormularioPublicoService.getDefinicion(token!),
    enabled: !!token,
    retry: false,
  })
  const { data: canales = [] } = useQuery({
    queryKey: ['ccf-publico-canales-top', token],
    queryFn: () => ccFormularioPublicoService.listCanalesDisponibles(token!),
    enabled: !!token,
  })

  const [valores, setValores] = useState<Record<number, unknown>>({})
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState(cliente)
  const [resultado, setResultado] = useState<{ interaccionId: number; acciones: CCFormAccionPost[] } | null>(null)

  const setValor = (campoId: number, valor: unknown) => setValores((v) => ({ ...v, [campoId]: valor }))

  const camposCapturables = (def?.secciones.flatMap((s) => s.campos) ?? []).filter((c) => !['titulo', 'separador', 'buscador'].includes(c.tipo))
  const faltantes = camposCapturables.filter((c) => c.obligatorio && !valores[c.id] && valores[c.id] !== 0)

  const guardar = useMutation({
    mutationFn: () => ccFormularioPublicoService.guardarRespuestas(token!, def!.versionId, {
      respuestas: camposCapturables.filter((c) => valores[c.id] !== undefined).map((c) => ({ campoId: c.id, valor: valores[c.id] as any })),
      clienteNombre: clienteNombre || undefined,
      clienteTelefono: clienteTelefono || undefined,
      canalId: canales[0]?.id,
      agenteId,
      agenteNombre: agenteNombre || undefined,
    }),
    onSuccess: (r) => { setResultado(r); toast.success('Registro guardado') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al guardar'),
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    )
  }
  if (isError || !def) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-red-600">Formulario no disponible</p>
          <p className="mt-1 text-[0.8rem] text-gray-500">
            El enlace no es válido, o el formulario ya no está en modo externo, o no tiene una versión publicada.
          </p>
        </div>
      </div>
    )
  }

  if (resultado) {
    return <AccionesPostGuardadoPantalla interaccionId={resultado.interaccionId} acciones={resultado.acciones} />
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-base font-bold text-gray-900">{def.nombre}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[0.75rem] text-gray-500">
            {cliente && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {cliente}</span>}
            {agenteNombre && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {agenteNombre}</span>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 p-3.5">
            <p className="mb-2 text-[0.72rem] font-semibold text-gray-500">Datos del cliente (se guardan con el registro)</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label><span className={label}>Nombre</span><input className={field} value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} /></label>
              <label><span className={label}>Teléfono</span><input className={field} value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} /></label>
            </div>
          </div>

          <div className="space-y-5">
            {def.secciones.map((s) => (
              <SeccionPublica key={s.id} seccion={s} token={token!} cliente={cliente} agenteId={agenteId} agenteNombre={agenteNombre}
                valores={valores} onChange={setValor} />
            ))}
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            {!!faltantes.length && (
              <p className="mb-2 text-[0.72rem] font-medium text-amber-600">
                Pendientes: {faltantes.map((c) => c.etiqueta).join(', ')}
              </p>
            )}
            {!canales.length && (
              <p className="mb-2 text-[0.72rem] font-medium text-amber-600">Este formulario no tiene ningún canal disponible.</p>
            )}
            <button onClick={() => guardar.mutate()} disabled={!!faltantes.length || !canales.length || guardar.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
              {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar registro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Pantalla que reemplaza el formulario justo después de guardar — mismo
// concepto que AccionesPostGuardadoModal del panel admin
// (CCFormulariosTab.tsx), adaptado a página completa (esta pantalla no
// vive dentro del layout de AGYDA, así que no hay Modal disponible aquí).
function AccionesPostGuardadoPantalla({ interaccionId, acciones }: { interaccionId: number; acciones: CCFormAccionPost[] }) {
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  // Sin sesión, no hay endpoint público para marcar acciones ejecutadas
  // (marcarAccionEjecutada requiere JWT porque queda en bitácora de quién la
  // hizo) — aquí solo se muestran como checklist visual local para el
  // agente de VICIdial; si se necesita bitácora real desde este flujo, es un
  // endpoint público adicional a futuro.
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-emerald-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <p className="text-[0.8rem] font-semibold">Interacción #{interaccionId} guardada correctamente.</p>
        </div>

        {acciones.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[0.72rem] font-semibold text-gray-500">Acciones recomendadas</p>
            <div className="space-y-1.5">
              {acciones.map((a) => {
                const hecha = marcadas.has(a.id)
                return (
                  <button key={a.id} onClick={() => setMarcadas((s) => new Set(s).add(a.id))} disabled={hecha}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition',
                      hecha ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50',
                    )}>
                    <div className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', hecha ? 'bg-emerald-500 text-white' : 'border-2 border-gray-300')}>
                      {hecha && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <p className={clsx('text-[0.8rem] font-semibold', hecha ? 'text-emerald-700 line-through' : 'text-gray-900')}>{a.etiqueta}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-center text-[0.72rem] text-gray-400">Puedes cerrar esta ventana.</p>
      </div>
    </div>
  )
}

function SeccionPublica({ seccion, token, cliente, agenteId, agenteNombre, valores, onChange }: {
  seccion: CCFormPublicoSeccion; token: string; cliente: string; agenteId: number | null; agenteNombre: string
  valores: Record<number, unknown>; onChange: (campoId: number, valor: unknown) => void
}) {
  return (
    <div>
      <p className="mb-0.5 text-sm font-bold text-gray-900">{seccion.titulo}</p>
      {seccion.descripcion && <p className="mb-3 text-[0.78rem] text-gray-500">{seccion.descripcion}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {seccion.campos.map((c) => (
          <div key={c.id} className={c.ancho === 'completo' || c.tipo === 'buscador' ? 'sm:col-span-2' : ''}>
            <CampoPublico campo={c} token={token} cliente={cliente} agenteId={agenteId} agenteNombre={agenteNombre}
              valor={valores[c.id]} onChange={(v) => onChange(c.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function CampoPublico({ campo, token, cliente, agenteId, agenteNombre, valor, onChange }: {
  campo: CCFormPublicoCampo; token: string; cliente: string; agenteId: number | null; agenteNombre: string
  valor: unknown; onChange: (v: unknown) => void
}) {
  if (campo.tipo === 'titulo') return <p className="pt-2 text-sm font-bold text-gray-900">{campo.etiqueta}</p>
  if (campo.tipo === 'separador') return <hr className="my-2 border-gray-200" />
  if (campo.tipo === 'buscador') {
    return <BuscadorPublico campo={campo} token={token} clienteInicial={cliente} agenteId={agenteId} agenteNombre={agenteNombre} />
  }

  const etiqueta = <span className={label}>{campo.etiqueta} {campo.obligatorio && <span className="text-red-500">*</span>}</span>

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
  if (['lista', 'radio'].includes(campo.tipo)) {
    return (
      <label>{etiqueta}
        <select className={field} value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona…</option>
          {campo.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
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
            <label key={o.valor} className="flex items-center gap-2 text-[0.8rem] text-gray-900">
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
      {campo.ayuda && <span className="mt-0.5 block text-[0.68rem] text-gray-400">{campo.ayuda}</span>}
    </label>
  )
}

// Mismo comportamiento que BuscadorCampoRuntime del panel admin (buscar en
// el histórico, registrar si no se encuentra), pero contra los endpoints
// públicos y precargando el teléfono del query param ?cliente= de VICIdial.
function BuscadorPublico({ campo, token, clienteInicial, agenteId, agenteNombre }: {
  campo: CCFormPublicoCampo; token: string; clienteInicial: string; agenteId: number | null; agenteNombre: string
}) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState(clienteInicial)
  // Debounce: busca sola 400ms después de dejar de escribir (desde 2
  // caracteres) — antes solo buscaba con Enter/clic en la lupa.
  const [buscar, setBuscar] = useState('')
  const [registrando, setRegistrando] = useState(false)

  useEffect(() => {
    const t = texto.trim()
    if (t.length < 2) { setBuscar(''); return }
    const timer = setTimeout(() => setBuscar(t), 400)
    return () => clearTimeout(timer)
  }, [texto])

  const { data: resultados = [], isFetching, isFetched } = useQuery({
    queryKey: ['ccf-publico-buscador', token, buscar],
    queryFn: () => ccFormularioPublicoService.buscar(token, buscar),
    enabled: !!buscar,
  })

  return (
    <div className="rounded-xl border border-gray-200 p-3.5">
      <span className={label}>{campo.etiqueta} {campo.obligatorio && <span className="text-red-500">*</span>}</span>
      <div className="flex gap-2">
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
      {texto.trim().length >= 1 && texto.trim().length < 2 && (
        <p className="mt-2 text-[0.68rem] text-gray-400">Escribe al menos 2 caracteres para buscar…</p>
      )}
      {isFetching && !isFetched && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</p>
      )}

      {isFetched && (
        <div className="mt-3 space-y-1.5">
          {resultados.map((r: CCFormBuscadorResultado) => (
            <div key={`${r.origen}-${r.id}`} className="rounded-lg border border-gray-100 px-3 py-2 text-[0.78rem]">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-900">{r.clienteNombre ?? '—'} <span className="font-normal text-gray-400">· {r.clienteTelefono ?? '—'}</span></p>
                <span className={clsx('flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold',
                  r.origen === 'postulante' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700')}>
                  {r.origen === 'postulante' ? 'Postulante' : 'Interacción'}
                </span>
              </div>
              <p className="text-[0.68rem] text-gray-400">{r.canalNombre ?? '—'} · {r.tipificacionNombre ?? 'sin tipificar'} · {r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : ''}</p>
            </div>
          ))}
          {!resultados.length && !registrando && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5">
              <p className="text-[0.78rem] text-gray-500">No se encontró ningún registro para "{buscar}".</p>
              <button onClick={() => setRegistrando(true)}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[0.72rem] font-semibold text-violet-700 hover:bg-violet-100">
                <Plus className="h-3.5 w-3.5" /> Registrar interacción
              </button>
            </div>
          )}
        </div>
      )}

      {registrando && (
        <RegistrarPublico
          token={token}
          nombreInicial={buscar}
          agenteId={agenteId}
          agenteNombre={agenteNombre}
          onDone={() => {
            setRegistrando(false)
            qc.invalidateQueries({ queryKey: ['ccf-publico-buscador', token, buscar] })
          }}
          onCancel={() => setRegistrando(false)}
        />
      )}
    </div>
  )
}

function RegistrarPublico({ token, nombreInicial, agenteId, agenteNombre, onDone, onCancel }: {
  token: string; nombreInicial: string; agenteId: number | null; agenteNombre: string; onDone: () => void; onCancel: () => void
}) {
  const { data: canales = [] } = useQuery({ queryKey: ['ccf-publico-canales', token], queryFn: () => ccFormularioPublicoService.listCanalesDisponibles(token) })
  const pareceTelefono = /^\+?[\d\s-]{6,}$/.test(nombreInicial)
  const [nombre, setNombre] = useState(pareceTelefono ? '' : nombreInicial)
  const [telefono, setTelefono] = useState(pareceTelefono ? nombreInicial : '')
  const canalId = canales[0]?.id ?? null

  const registrar = useMutation({
    mutationFn: () => ccFormularioPublicoService.registrar(token, {
      clienteNombre: nombre || undefined,
      clienteTelefono: telefono || undefined,
      canalId: canalId!,
      agenteId,
      agenteNombre: agenteNombre || undefined,
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
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Cancelar</button>
        <button onClick={() => registrar.mutate()} disabled={(!nombre.trim() && !telefono.trim()) || !canalId || registrar.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {registrar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
        </button>
      </div>
      {!canalId && <p className="text-[0.68rem] font-medium text-amber-600">Este formulario no tiene ningún canal disponible.</p>}
    </div>
  )
}
