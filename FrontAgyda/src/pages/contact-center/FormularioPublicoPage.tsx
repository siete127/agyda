import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, Plus, Save, X, Phone, User, Check, PhoneCall, RefreshCw, History } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccFormularioPublicoService } from '@/services/ccFormularios.service'
import type { CCFormPublicoCampo, CCFormPublicoSeccion, CCFormBuscadorResultado, CCFormAccionPost, CCFormPrellenado, CCFormPendienteGrupo, CCFormHistorialItem } from '@/types/ccFormularios.types'

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
// Respaldo cuando ?agente=/agenteId= llegan vacíos (ej. VICIdial no tiene la
// URL bien armada con sus propias variables, o alguien abrió el enlace a
// mano): este formulario es público (sin sesión, ver comentario de arriba),
// pero vive en el mismo origen que el resto de AGYDA — si quien lo abre ya
// tiene una sesión activa en otra pestaña, se usa ese usuario como agente en
// vez de dejar el campo vacío. Nunca pisa lo que VICIdial sí mandó bien.
function agenteDeSesionActiva(): { nombre: string; id: number } | null {
  try {
    const raw = localStorage.getItem('auth-store')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const user = parsed?.state?.user
    if (!user?.id || !user?.nombres) return null
    return { nombre: String(user.nombres), id: Number(user.id) }
  } catch {
    return null
  }
}

export default function FormularioPublicoPage() {
  const { token } = useParams<{ token: string }>()
  const [params] = useSearchParams()
  const cliente = params.get('cliente') || ''
  const agenteSesion = agenteDeSesionActiva()
  const agenteNombre = params.get('agente') || agenteSesion?.nombre || ''
  const agenteId = params.get('agenteId') ? Number(params.get('agenteId')) : (agenteSesion?.id ?? null)

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

  const camposCapturables = campos.filter((c) => !['titulo', 'separador', 'buscador', 'pendientes'].includes(c.tipo))
  // Panel "Pendientes por contactar": solo si el formulario tiene ese campo
  // (constructor → tipo "Pendientes por contactar"); se dibuja en su lugar.
  const panelPendientes = campos.some((c) => c.tipo === 'pendientes') ? (
    <PanelPendientes token={token!} telefonoActual={tel10(clienteTelefono)} agente={{ id: agenteId, nombre: agenteNombre }}
      onElegir={(tel) => { cambiarTelefono(tel); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
  ) : null
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

  // Lo encontrado por teléfono aplica solo mientras el número siga siendo el buscado.
  const hallazgo = prellenar.data && !prellenar.isPending && telBuscado && tel10(clienteTelefono) === telBuscado ? prellenar.data : null

  // Formato horizontal: una sola tarjeta ancha; arriba el título y el
  // teléfono, en medio los campos en columnas, abajo pendientes + guardar.
  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="mx-auto max-w-6xl px-4">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-gray-100 p-4">
            <div className="min-w-[180px] flex-1">
              <p className="text-base font-bold text-gray-900">{def.nombre}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[0.75rem] text-gray-500">
                {cliente && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {cliente}</span>}
                {agenteNombre && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {agenteNombre}</span>}
              </div>
            </div>
            <label className="w-full sm:w-80">
              <span className={label}>Teléfono</span>
              <div className="relative">
                <input className={clsx(field, 'pr-9')} value={clienteTelefono} inputMode="tel" autoFocus
                  placeholder="10 dígitos — si ya está registrado, se llenan sus datos"
                  onChange={(e) => cambiarTelefono(e.target.value)} />
                {prellenar.isPending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" />}
              </div>
            </label>
            {hallazgo && (
              <div className="w-full lg:w-auto lg:max-w-sm lg:flex-1 lg:pt-5">
                <AvisoPrellenado d={hallazgo} faltaNombre={tieneNombreEstructurado} />
              </div>
            )}
          </div>

          {!!hallazgo?.historial?.length && <HistorialPersona items={hallazgo.historial} />}

          <div className="space-y-5 p-5">
            {def.secciones.map((s) => (
              <SeccionPublica key={s.id} seccion={s} token={token!} formularioId={def.formularioId} cliente={cliente} agenteId={agenteId} agenteNombre={agenteNombre}
                valores={valores} onChange={setValor} onSeleccionarBuscador={usarResultadoBuscador} ocultos={ocultos}
                ultimos={hallazgo?.ultimos} panelPendientes={panelPendientes} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-3.5">
            <div className="min-w-0 flex-1 text-[0.72rem] font-medium text-amber-600">
              {!!faltantes.length && <p>Pendientes: {faltantes.map((c) => (c.id === campoTelefono?.id ? 'Teléfono' : c.etiqueta)).join(', ')}</p>}
              {!canales.length && <p>Este formulario no tiene ningún canal disponible.</p>}
            </div>
            <button onClick={() => guardar.mutate()} disabled={!!faltantes.length || !canales.length || guardar.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 sm:w-auto">
              {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar registro
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Panel "Pendientes por contactar" ──
// A quién llamar según el último registro de cada persona (ver
// _pendientesPorContactar en el backend). "Cargar" pone su teléfono arriba,
// así se llenan sus datos y el agente registra el nuevo estatus.
const GRUPOS_PENDIENTES: { key: CCFormPendienteGrupo; label: string; ayuda: string; activo: string; chip: string }[] = [
  { key: 'confirmar', label: 'Por confirmar', ayuda: 'Cita agendada que aún no se confirma', activo: 'border-violet-500 bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-700' },
  { key: 'recordar', label: 'Recordar hoy / mañana', ayuda: 'Cita confirmada para hoy o mañana', activo: 'border-emerald-500 bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-700' },
  { key: 'vencida', label: 'Vencidas sin confirmar', ayuda: 'La fecha ya pasó sin confirmarse: reagendar', activo: 'border-amber-500 bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800' },
]

function diaSiguiente(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  const f = new Date(y, m - 1, d + 1)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}
function fmtDiaCorto(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
}

function PanelPendientes({ token, telefonoActual, agente, onElegir }: {
  token: string; telefonoActual: string; agente: { id: number | null; nombre: string }; onElegir: (telefono: string) => void
}) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ccf-publico-pendientes', token, agente.id, agente.nombre],
    queryFn: () => ccFormularioPublicoService.pendientes(token, agente),
    refetchInterval: 60_000,
  })
  const [elegido, setElegido] = useState<CCFormPendienteGrupo | null>(null)
  if (!data?.disponible) return null

  // Solo los grupos que el constructor dejó prendidos.
  const grupos = GRUPOS_PENDIENTES.filter((g) => !data.grupos || data.grupos.includes(g.key))
  const cuenta = (g: CCFormPendienteGrupo) => data.pendientes.filter((p) => p.grupo === g).length
  // Sin elección: el primer grupo que tenga a alguien.
  const grupo = (elegido && grupos.some((g) => g.key === elegido) ? elegido : null)
    ?? grupos.find((g) => cuenta(g.key))?.key ?? grupos[0]?.key ?? 'confirmar'
  const info = GRUPOS_PENDIENTES.find((g) => g.key === grupo)!
  const filas = data.pendientes.filter((p) => p.grupo === grupo)
  const hoy = data.hoy ?? ''
  const manana = hoy ? diaSiguiente(hoy) : ''
  const tel10 = (t: string | null) => (t ?? '').replace(/\D/g, '').slice(-10)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
        <div className="mr-2 flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-bold text-gray-900">Pendientes por contactar</p>
          {data.alcance === 'propios' && data.agente && (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[0.66rem] font-semibold text-violet-700">Solo los de {data.agente}</span>
          )}
        </div>
        {grupos.map((g) => (
          <button key={g.key} onClick={() => setElegido(g.key)} title={g.ayuda}
            className={clsx('rounded-xl border px-3 py-1 text-[0.75rem] font-semibold transition-colors',
              grupo === g.key ? g.activo : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
            {g.label} <span className="ml-0.5 opacity-80">({cuenta(g.key)})</span>
          </button>
        ))}
        <button onClick={() => refetch()} title="Actualizar"
          className={clsx('ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50', isFetching && 'animate-spin')}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {data.requiereAgente ? (
        <p className="px-4 py-3 text-[0.75rem] text-amber-700">
          Este panel muestra a cada asesor solo sus pendientes, pero la liga no trae asesor. Ábrela desde AGYDA (enlace del encabezado) para verlos.
        </p>
      ) : (
        <p className="px-4 pt-2 text-[0.7rem] text-gray-400">{info.ayuda}. «Cargar» pone su teléfono arriba y llena sus datos.</p>
      )}

      {!filas.length ? (
        <p className="px-4 py-8 text-center text-[0.8rem] text-gray-400">Nadie pendiente en este grupo.</p>
      ) : (
        <div className="max-h-[360px] overflow-auto px-2 pb-2">
          <table className="w-full text-[0.78rem]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[0.66rem] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-2 py-2">Asistencia</th>
                <th className="px-2 py-2">Horario</th>
                <th className="px-2 py-2">Nombre</th>
                <th className="px-2 py-2">Teléfono</th>
                <th className="px-2 py-2">Puesto</th>
                <th className="px-2 py-2">Estatus</th>
                <th className="px-2 py-2">Asesor</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((p) => {
                const actual = !!telefonoActual && tel10(p.telefono) === telefonoActual
                const esHoy = p.fechaAsistencia === hoy
                const esManana = p.fechaAsistencia === manana
                return (
                  <tr key={p.interaccionId} className={clsx(actual ? 'bg-violet-50' : 'hover:bg-gray-50')}>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className={clsx('rounded-md px-1.5 py-0.5 text-[0.7rem] font-bold',
                        esHoy ? 'bg-emerald-100 text-emerald-700' : esManana ? 'bg-amber-100 text-amber-800' : info.chip)}>
                        {esHoy ? 'Hoy' : esManana ? 'Mañana' : fmtDiaCorto(p.fechaAsistencia)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">{p.horario ?? '—'}</td>
                    <td className="px-2 py-1.5 font-semibold text-gray-800">{p.nombre ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-gray-600">{p.telefono ?? '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{p.puesto ?? '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{p.estatus ?? '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{p.asesor ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => p.telefono && onElegir(p.telefono)} disabled={!p.telefono || actual}
                        className="rounded-lg border border-violet-200 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40">
                        {actual ? 'Cargado' : 'Cargar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Historial de la persona ──
// Todos sus contactos (en esta y en otras postulaciones), del más reciente al
// más viejo. Guardar el formulario agrega un seguimiento nuevo: no se borra
// nada de lo anterior.
function HistorialPersona({ items }: { items: CCFormHistorialItem[] }) {
  const [abierto, setAbierto] = useState(true)
  const [todos, setTodos] = useState(false)
  const visibles = todos ? items : items.slice(0, 5)
  const fmtFecha = (f: string) => new Date(f).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  const otras = items.filter((h) => !h.estaPostulacion).length
  return (
    <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <History className="h-4 w-4 text-violet-500" />
        <span className="text-[0.8rem] font-bold text-gray-800">Historial</span>
        <span className="text-[0.72rem] text-gray-500">
          {items.length} contacto{items.length !== 1 ? 's' : ''}{otras ? ` · ${otras} en otras postulaciones` : ''}
        </span>
        <span className="ml-auto text-[0.7rem] font-semibold text-violet-600">{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>
      {abierto && (
        <div className="mt-2 overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-[0.75rem]">
            <thead>
              <tr className="text-left text-[0.64rem] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-2.5 py-1.5">Fecha</th>
                <th className="px-2.5 py-1.5">Postulación</th>
                <th className="px-2.5 py-1.5">Estatus</th>
                <th className="px-2.5 py-1.5">Cita</th>
                <th className="px-2.5 py-1.5">Canal</th>
                <th className="px-2.5 py-1.5">Asesor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((h) => (
                <tr key={`${h.origen}-${h.id}`} className={clsx(!h.estaPostulacion && 'text-gray-400')}>
                  <td className="whitespace-nowrap px-2.5 py-1.5">{fmtFecha(h.fecha)}</td>
                  <td className="px-2.5 py-1.5">
                    {h.postulacion}
                    {!h.estaPostulacion && <span className="ml-1 rounded bg-gray-100 px-1 text-[0.62rem] text-gray-500">otra postulación</span>}
                  </td>
                  <td className="px-2.5 py-1.5 font-semibold">{h.estatus ?? '—'}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5">{h.asistencia ? `${fmtDiaCorto(h.asistencia)}${h.horario ? ` · ${h.horario}` : ''}` : '—'}</td>
                  <td className="px-2.5 py-1.5">{h.canal ?? '—'}</td>
                  <td className="px-2.5 py-1.5">{h.asesor ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 5 && (
            <button onClick={() => setTodos((v) => !v)} className="w-full border-t border-gray-100 py-1.5 text-[0.7rem] font-semibold text-violet-600 hover:bg-gray-50">
              {todos ? 'Ver menos' : `Ver los ${items.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Qué encontró el prellenado por teléfono.
function AvisoPrellenado({ d, faltaNombre }: { d: CCFormPrellenado; faltaNombre: boolean }) {
  const fecha = d.fecha ? new Date(d.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null
  if (d.origen === 'interaccion') {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.75rem] text-emerald-800">
        <b>Ya registrado:</b> {d.nombre ?? 'sin nombre'}
        {fecha && <> · último contacto {fecha}</>}
        {d.postulacion && <> en {d.postulacion}</>}
        {d.estatus && <> · {d.estatus}</>}
        <span className="block text-emerald-700/80">Se llenaron sus datos. Al guardar se agrega un seguimiento nuevo a su historial.</span>
      </p>
    )
  }
  if (d.origen === 'postulante') {
    return (
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-[0.75rem] text-blue-800">
        <b>Se registró en la página web</b> como {d.nombre ?? 'sin nombre'}{fecha && <> ({fecha})</>}.
        {faltaNombre && <span className="block text-blue-700/80">Captura sus apellidos y nombre(s) por separado.</span>}
      </p>
    )
  }
  return <p className="text-[0.72rem] text-gray-400">Número nuevo: no hay registros previos con este teléfono.</p>
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

// Tipos que necesitan todo el ancho; el resto se reparte en columnas.
const TIPOS_ANCHO_COMPLETO = new Set(['texto_largo', 'buscador', 'pendientes', 'titulo', 'separador', 'multiseleccion', 'checkbox', 'radio', 'firma', 'archivo', 'imagen'])

function SeccionPublica({ seccion, token, formularioId, cliente, agenteId, agenteNombre, valores, onChange, onSeleccionarBuscador, ocultos, ultimos, panelPendientes }: {
  seccion: CCFormPublicoSeccion; token: string; formularioId: number; cliente: string; agenteId: number | null; agenteNombre: string
  valores: Record<number, unknown>; onChange: (campoId: number, valor: unknown) => void
  onSeleccionarBuscador?: (r: CCFormBuscadorResultado) => void
  ocultos?: Set<number> // campos que se llenan solos desde arriba (no se muestran, sí se guardan)
  ultimos?: Record<number, string> // último valor guardado de esa persona (referencia, no se llena)
  panelPendientes?: ReactNode // lo que se dibuja en el lugar del campo tipo 'pendientes'
}) {
  // Una sección que solo tiene el panel no repite su título (el panel trae el suyo).
  const soloPanel = seccion.campos.every((c) => c.tipo === 'pendientes')
  if (soloPanel) return <>{panelPendientes}</>
  return (
    <div>
      <p className="mb-0.5 text-sm font-bold text-gray-900">{seccion.titulo}</p>
      {seccion.descripcion && <p className="mb-3 text-[0.78rem] text-gray-500">{seccion.descripcion}</p>}
      {/* 4 columnas en pantalla ancha; items-end alinea las cajas aunque un campo
          traiga arriba la referencia del último valor guardado. */}
      <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {seccion.campos.filter((c) => !ocultos?.has(c.id)).map((c) => {
          const ultimo = ultimos?.[c.id]
          if (c.tipo === 'pendientes') {
            return <div key={c.id} className="sm:col-span-2 lg:col-span-4">{panelPendientes}</div>
          }
          return (
            <div key={c.id} className={TIPOS_ANCHO_COMPLETO.has(c.tipo) ? 'sm:col-span-2 lg:col-span-4' : ''}>
              {ultimo && (
                <p className="mb-1 truncate rounded-md bg-amber-50 px-2 py-0.5 text-[0.68rem] text-amber-800" title={`Último guardado: ${ultimo}`}>
                  Último guardado: <b>{ultimo}</b>
                </p>
              )}
              <CampoPublico campo={c} token={token} formularioId={formularioId} cliente={cliente} agenteId={agenteId} agenteNombre={agenteNombre}
                valor={valores[c.id]} onChange={(v) => onChange(c.id, v)} onSeleccionarBuscador={onSeleccionarBuscador} />
            </div>
          )
        })}
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
