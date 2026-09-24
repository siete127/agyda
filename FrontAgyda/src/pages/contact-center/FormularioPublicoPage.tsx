import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, Plus, Save, X, Phone, User, Check } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccFormularioPublicoService } from '@/services/ccFormularios.service'
import type { CCFormPublicoCampo, CCFormPublicoSeccion, CCFormBuscadorResultado, CCFormAccionPost, CCFormPrellenado } from '@/types/ccFormularios.types'

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
  const [clienteTelefono, setClienteTelefono] = useState(cliente)
  const [resultado, setResultado] = useState<{ interaccionId: number; acciones: CCFormAccionPost[] } | null>(null)

  const setValor = (campoId: number, valor: unknown) => setValores((v) => ({ ...v, [campoId]: valor }))

  // Campos detectados por TIPO/etiqueta, no por un código fijo, para que
  // funcione igual en cualquier formulario externo.
  const campos = def?.secciones.flatMap((s) => s.campos) ?? []
  const campoTelefono = campos.find((c) => c.tipo === 'telefono')
  // Ese campo (p. ej. "Telefono Interesado") repetiría el Teléfono de arriba:
  // no se muestra, pero se llena solo con él y se guarda igual (lo usan la
  // página de Registros, la búsqueda por teléfono y los reportes).
  const ocultos = new Set(campoTelefono ? [campoTelefono.id] : [])
  // Si el formulario separa Apellido paterno/Apellido materno/Nombre(s), un
  // nombre completo (buscador, postulante web) no se reparte entre ellos: no
  // hay forma confiable de saber dónde corta cada parte.
  const tieneNombreEstructurado = campos.some((c) => /apellido.?paterno|apellido.?materno/i.test(`${c.codigo} ${c.etiqueta}`))
  const campoNombre = tieneNombreEstructurado ? undefined : campos.find((c) => c.tipo === 'texto_corto' && /nombre|interesado/i.test(`${c.codigo} ${c.etiqueta}`))
    ?? campos.find((c) => c.tipo === 'texto_corto')

  // ── Prellenado por teléfono ──
  // Con solo el número (10 dígitos), se buscan sus datos de un registro
  // previo en la campaña y se llenan nombre, apellidos, etc. Lo que llenó el
  // prellenado se recuerda: si cambian el número, se reemplaza por los datos
  // de la nueva persona, pero nunca se pisa lo que el agente ya escribió.
  const prellenadoRef = useRef<Record<number, string>>({})
  const ultimoBuscadoRef = useRef('')
  const prellenar = useMutation({
    mutationFn: (tel: string) => ccFormularioPublicoService.prellenar(token!, tel),
    onSuccess: (d) => {
      const anterior = prellenadoRef.current
      setValores((v) => {
        const next = { ...v }
        const ids = new Set([...Object.keys(anterior), ...Object.keys(d.valores)].map(Number))
        for (const id of ids) {
          if (id === campoTelefono?.id) continue // el teléfono lo pone el agente
          const actual = next[id]
          const intacto = actual === undefined || actual === '' || actual === anterior[id]
          if (intacto) next[id] = d.valores[id] ?? ''
        }
        return next
      })
      prellenadoRef.current = d.valores
    },
  })
  const tel10 = (tel: string) => tel.replace(/\D/g, '').slice(-10)
  const buscarSiCompleto = (tel: string) => {
    if (tel.replace(/\D/g, '').length < 10 || tel10(tel) === ultimoBuscadoRef.current) return
    ultimoBuscadoRef.current = tel10(tel)
    prellenar.mutate(tel)
  }
  const cambiarTelefono = (tel: string) => {
    setClienteTelefono(tel)
    if (campoTelefono) setValor(campoTelefono.id, tel)
    buscarSiCompleto(tel)
  }
  const telBuscado = prellenar.variables ? tel10(prellenar.variables) : ''

  // Screen-pop: VICIdial manda el teléfono del que llama (?cliente=). En
  // cuanto hay definición se copia al campo teléfono (ajuste de estado en
  // render, no en un efecto) y se busca a la persona.
  const [telefonoInicialPuesto, setTelefonoInicialPuesto] = useState(false)
  if (def && !telefonoInicialPuesto) {
    setTelefonoInicialPuesto(true)
    if (cliente && campoTelefono) setValores((v) => ({ ...v, [campoTelefono.id]: cliente }))
  }
  useEffect(() => {
    if (def && cliente) buscarSiCompleto(cliente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, cliente])

  const camposCapturables = campos.filter((c) => !['titulo', 'separador', 'buscador'].includes(c.tipo))
  const faltantes = camposCapturables.filter((c) => c.obligatorio && !valores[c.id] && valores[c.id] !== 0)

  // Al elegir un resultado del campo 'buscador' (mismo criterio que el panel
  // interno) — el canal no se vuelca aquí porque en modo externo no hay
  // selector visible de canal: siempre se usa canales[0] al guardar.
  const usarResultadoBuscador = (r: CCFormBuscadorResultado) => {
    if (r.clienteTelefono) cambiarTelefono(r.clienteTelefono)
    if (campoNombre && r.clienteNombre) setValor(campoNombre.id, r.clienteNombre)
  }

  const guardar = useMutation({
    mutationFn: () => ccFormularioPublicoService.guardarRespuestas(token!, def!.versionId, {
      respuestas: camposCapturables.filter((c) => valores[c.id] !== undefined).map((c) => ({ campoId: c.id, valor: valores[c.id] as any })),
      // Sin nombre aparte: el backend lo arma de los campos (apellidos + nombres).
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
            <label>
              <span className={label}>Teléfono</span>
              <div className="relative">
                <input className={clsx(field, 'pr-9')} value={clienteTelefono} inputMode="tel" autoFocus
                  placeholder="10 dígitos — si ya está registrado, se llenan sus datos"
                  onChange={(e) => cambiarTelefono(e.target.value)} />
                {prellenar.isPending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" />}
              </div>
            </label>
            {prellenar.data && !prellenar.isPending && telBuscado && tel10(clienteTelefono) === telBuscado && (
              <AvisoPrellenado d={prellenar.data} faltaNombre={tieneNombreEstructurado} />
            )}
          </div>

          <div className="space-y-5">
            {def.secciones.map((s) => (
              <SeccionPublica key={s.id} seccion={s} token={token!} formularioId={def.formularioId} cliente={cliente} agenteId={agenteId} agenteNombre={agenteNombre}
                valores={valores} onChange={setValor} onSeleccionarBuscador={usarResultadoBuscador} ocultos={ocultos} />
            ))}
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            {!!faltantes.length && (
              <p className="mb-2 text-[0.72rem] font-medium text-amber-600">
                Pendientes: {faltantes.map((c) => (c.id === campoTelefono?.id ? 'Teléfono' : c.etiqueta)).join(', ')}
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

// Qué encontró el prellenado por teléfono.
function AvisoPrellenado({ d, faltaNombre }: { d: CCFormPrellenado; faltaNombre: boolean }) {
  const fecha = d.fecha ? new Date(d.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null
  if (d.origen === 'interaccion') {
    return (
      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[0.75rem] text-emerald-800">
        <b>Ya registrado:</b> {d.nombre ?? 'sin nombre'}
        {fecha && <> · último contacto {fecha}</>}
        {d.estatus && <> · {d.estatus}</>}
        <span className="block text-emerald-700/80">Se llenaron sus datos; revísalos antes de guardar.</span>
      </p>
    )
  }
  if (d.origen === 'postulante') {
    return (
      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[0.75rem] text-blue-800">
        <b>Se registró en la página web</b> como {d.nombre ?? 'sin nombre'}{fecha && <> ({fecha})</>}.
        {faltaNombre && <span className="block text-blue-700/80">Captura sus apellidos y nombre(s) por separado.</span>}
      </p>
    )
  }
  return <p className="mt-2 text-[0.72rem] text-gray-400">Número nuevo: no hay registros previos con este teléfono.</p>
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

function SeccionPublica({ seccion, token, formularioId, cliente, agenteId, agenteNombre, valores, onChange, onSeleccionarBuscador, ocultos }: {
  seccion: CCFormPublicoSeccion; token: string; formularioId: number; cliente: string; agenteId: number | null; agenteNombre: string
  valores: Record<number, unknown>; onChange: (campoId: number, valor: unknown) => void
  onSeleccionarBuscador?: (r: CCFormBuscadorResultado) => void
  ocultos?: Set<number> // campos que se llenan solos desde arriba (no se muestran, sí se guardan)
}) {
  return (
    <div>
      <p className="mb-0.5 text-sm font-bold text-gray-900">{seccion.titulo}</p>
      {seccion.descripcion && <p className="mb-3 text-[0.78rem] text-gray-500">{seccion.descripcion}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {seccion.campos.filter((c) => !ocultos?.has(c.id)).map((c) => (
          <div key={c.id} className={c.ancho === 'completo' || c.tipo === 'buscador' ? 'sm:col-span-2' : ''}>
            <CampoPublico campo={c} token={token} formularioId={formularioId} cliente={cliente} agenteId={agenteId} agenteNombre={agenteNombre}
              valor={valores[c.id]} onChange={(v) => onChange(c.id, v)} onSeleccionarBuscador={onSeleccionarBuscador} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Mismo criterio que valorAutocompletado en CCFormulariosTab.tsx (panel
// admin) — duplicado a propósito porque son dos páginas sin relación de
// import entre sí (una vive dentro del layout de AGYDA, otra es pública),
// pero deben calcular el mismo valor para el mismo config.autocompletar.
function valorAutocompletadoPublico(campo: CCFormPublicoCampo, agenteNombre: string): string | null {
  // 'usuario_agente' siempre se autocompleta — en modo externo con el
  // ?agente= que VICIdial manda en la URL (mismo criterio que
  // valorAutocompletado en CCFormulariosTab.tsx para el panel interno).
  if (campo.tipo === 'usuario_agente') return agenteNombre || ''

  let cfg: any = {}
  try { cfg = campo.configJson ? JSON.parse(campo.configJson) : {} } catch { /* ignorar JSON inválido */ }
  if (cfg.autocompletar === 'fecha_actual') {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    if (campo.tipo === 'fecha') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    if (campo.tipo === 'fecha_hora') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    return now.toLocaleString('es-MX')
  }
  // En modo externo "el usuario que tiene la sesión" es el agente de
  // VICIdial identificado por ?agente= en la URL — no hay sesión de AGYDA.
  if (cfg.autocompletar === 'usuario_actual') return agenteNombre || ''
  return null
}

function CampoPublico({ campo, token, formularioId, cliente, agenteId, agenteNombre, valor, onChange, onSeleccionarBuscador }: {
  campo: CCFormPublicoCampo; token: string; formularioId: number; cliente: string; agenteId: number | null; agenteNombre: string
  valor: unknown; onChange: (v: unknown) => void; onSeleccionarBuscador?: (r: CCFormBuscadorResultado) => void
}) {
  useEffect(() => {
    if (valor !== undefined) return
    const auto = valorAutocompletadoPublico(campo, agenteNombre)
    if (auto !== null) onChange(auto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [opcionesDinamicas, setOpcionesDinamicas] = useState<{ valor: string; etiqueta: string }[] | null>(null)
  useEffect(() => {
    if (campo.tipo !== 'catalogo' || !campo.catalogoFuente || campo.catalogoFuente === 'estatico') return
    let cancelado = false
    ccFormularioPublicoService.getOpcionesCatalogo(token, campo.catalogoFuente).then((data) => { if (!cancelado) setOpcionesDinamicas(data) }).catch(() => {})
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campo.catalogoFuente])

  if (campo.tipo === 'titulo') return <p className="pt-2 text-sm font-bold text-gray-900">{campo.etiqueta}</p>
  if (campo.tipo === 'separador') return <hr className="my-2 border-gray-200" />
  if (campo.tipo === 'buscador') {
    return <BuscadorPublico campo={campo} token={token} clienteInicial={cliente} agenteId={agenteId} agenteNombre={agenteNombre} onSeleccionar={onSeleccionarBuscador} />
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
function BuscadorPublico({ campo, token, clienteInicial, agenteId, agenteNombre, onSeleccionar }: {
  campo: CCFormPublicoCampo; token: string; clienteInicial: string; agenteId: number | null; agenteNombre: string
  onSeleccionar?: (r: CCFormBuscadorResultado) => void
}) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState(clienteInicial)
  // Debounce: busca sola 400ms después de dejar de escribir (desde 2
  // caracteres) — antes solo buscaba con Enter/clic en la lupa.
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
          {resultados.map((r: CCFormBuscadorResultado) => {
            const claveResultado = `${r.origen}-${r.id}`
            const yaSeleccionado = seleccionadoId === claveResultado
            return (
              <div key={claveResultado} className={clsx('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[0.78rem]', yaSeleccionado ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100')}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-gray-900">{r.clienteNombre ?? '—'} <span className="font-normal text-gray-400">· {r.clienteTelefono ?? '—'}</span></p>
                    <span className={clsx('flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold',
                      r.origen === 'postulante' ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700')}>
                      {r.origen === 'postulante' ? 'Postulante' : 'Interacción'}
                    </span>
                  </div>
                  <p className="truncate text-[0.68rem] text-gray-400">{r.canalNombre ?? '—'} · {r.tipificacionNombre ?? 'sin tipificar'} · {r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : ''}</p>
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
