import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ventasService } from '@/services/ventas.service'
import { useVentasStore } from '@/stores/ventas.store'
import { type CRMInteraccion, type CRMGestion, type CRMCampoConfig } from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'
import {
  Phone, User, Clock, Database, History, AlertCircle,
  Pencil, CheckCircle2, XCircle, MessageSquare, Send,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════
   CRM PÚBLICO — se abre desde VICIdial al caer la llamada
   URL: https://intranet.ardabytec.vip/crm?cliente=5513950319&agente=Juan&agenteId=12
══════════════════════════════════════════════════════════ */

const RESULTADOS_GESTION = [
  { code: 'AGEND',  label: 'Agendada' },
  { code: 'BDV',    label: 'Buzón de voz' },
  { code: 'CLIC',   label: 'Cliente colgó' },
  { code: 'CLIF',   label: 'Cliente finado' },
  { code: 'CLIMO',  label: 'Cliente molesto' },
  { code: 'CNE',    label: 'Cliente no escucha' },
  { code: 'DND',    label: 'Dirección no disponible' },
  { code: 'DUP',    label: 'Duplicidad' },
  { code: 'ENRPS',  label: 'Extran no se realizó' },
  { code: 'LIDESO', label: 'Límite de edad' },
  { code: 'NCE',    label: 'No cubre edad' },
  { code: 'NDE',    label: 'Número de empresa' },
  { code: 'NLISA',  label: 'No le interesa' },
  { code: 'NOCTA',  label: 'No contesta' },
  { code: 'NTINE',  label: 'No tiene INE' },
  { code: 'NUMA',   label: 'Número ARCO' },
  { code: 'NUMERQ', label: 'Número equivocado' },
  { code: 'RERFC',  label: 'Rechazo RFC' },
  { code: 'REZDOM', label: 'Rechazo domicilio' },
  { code: 'REZOTP', label: 'Rechazo OTP' },
  { code: 'SOFDS',  label: 'Suspendido o fuera de servicio' },
  { code: 'VLL',    label: 'Volver a llamar' },
]

const RESULTADOS_VENTA = [
  { code: 'VESA',   label: 'Venta exitosa' },
  { code: 'VEPEND', label: 'Venta pendiente' },
  { code: 'RECHA',  label: 'Venta rechazada' },
]

/* Normaliza a 10 dígitos (México), quitando el prefijo de país 52/521 que
   VICIdial a veces incluye en el número — debe coincidir con la normalización
   del backend (ventasController.js) para que la búsqueda del cliente haga match. */
function normalizarTelefono(v: string): string {
  const digitos = v.replace(/\D/g, '')
  if (digitos.length === 12 && digitos.startsWith('52')) return digitos.slice(2)
  if (digitos.length === 13 && digitos.startsWith('521')) return digitos.slice(3)
  return digitos
}

export default function CRMPublicPage() {
  const [params] = useSearchParams()
  const telefono = normalizarTelefono(params.get('cliente') ?? '')

  /* Nombre del agente: resuelto por el backend via username, fallback al store o URL param */
  const storeNombre   = useVentasStore(s => s.ventasNombre)
  const storeUserId   = useVentasStore(s => s.ventasUserId)
  const agenteParam   = params.get('agente') ?? ''

  const [loading,           setLoading]           = useState(true)
  const [fetchDone,         setFetchDone]         = useState(false)
  const [found,             setFound]             = useState(false)
  const [enBaseMadreVici,   setEnBaseMadreVici]   = useState(false)
  const [vicidialLead,      setVicidialLead]      = useState<Record<string, unknown> | null>(null)
  const [interacciones,     setInteracciones]     = useState<CRMInteraccion[]>([])
  const [gestiones,         setGestiones]         = useState<CRMGestion[]>([])
  const [camposConfig,      setCamposConfig]      = useState<CRMCampoConfig[]>([])
  const [editando,          setEditando]          = useState<Record<string, string> | null>(null)
  const [guardando,         setGuardando]         = useState(false)
  const [nombreAgente,      setNombreAgente]      = useState<string>(agenteParam || '')
  const [agenteId,          setAgenteId]          = useState<number>(0)

  /* Tipificación */
  const [tipTab,       setTipTab]       = useState<'datos' | 'tipificar' | 'historial'>('tipificar')
  const [resultado,    setResultado]    = useState('')
  const [notas,        setNotas]        = useState('')
  const [enviando,     setEnviando]     = useState(false)
  const [tipOk,        setTipOk]        = useState(false)
  const [tipError,     setTipError]     = useState('')

  useEffect(() => {
    if (!telefono) { setLoading(false); return }

    /* Mostrar el formulario de tipificación inmediatamente con el nombre del URL param,
       mientras la carga de datos del cliente ocurre en segundo plano */
    setLoading(false)

    async function cargar() {
      try {
        /* Pasar el username de VICIdial — el backend resuelve el nombreAgente real */
        const res = await ventasService.getCRMCliente(telefono, agenteParam)
        setFound(res.found)
        setEnBaseMadreVici(res.enBaseMadreVicidial ?? false)
        setVicidialLead(res.vicidialLead ?? null)
        setInteracciones(res.interacciones ?? [])
        setGestiones(res.gestiones ?? [])
        setCamposConfig(res.camposConfig ?? [])

        /* Nombre resuelto: backend > store > URL param > fallback */
        const nombre = res.nombreAgente || storeNombre || agenteParam || 'Agente'
        const uid    = res.agenteId     || Number(storeUserId ?? 0)
        setNombreAgente(nombre)
        setAgenteId(uid)

        /* Registrar apertura en segundo plano — no bloquea UI */
        ventasService.registrarGestionCRMPublica({
          telefono,
          campaignId: res.interacciones[0]?.campaignId ?? 0,
          agente:   nombre,
          agenteId: uid || undefined,
        }).catch(() => {/* silencioso */})
      } catch {
        setFound(false)
      } finally {
        setFetchDone(true)
      }
    }
    cargar()
  }, [telefono]) // eslint-disable-line react-hooks/exhaustive-deps

  function parseFecha(s: string) {
    return new Date(s.replace('T', ' ').replace(/\.\d+$/, ''))
  }

  const inter  = interacciones[0]
  const datos  = inter?.datos ?? {}
  const nombre = inter?.nombre ?? '—'

  const camposVisibles = camposConfig
    .filter(c => c.visible)
    .sort((a, b) => a.orden - b.orden)

  async function guardarEdicion() {
    if (!editando || !inter) return
    setGuardando(true)
    try {
      await ventasService.updateCRMInteraccion(telefono, inter.campaignId, editando)
      setInteracciones(prev => prev.map((x, i) => i === 0 ? { ...x, datos: editando } : x))
      setEditando(null)
    } catch {
      /* silencioso */
    } finally {
      setGuardando(false)
    }
  }

  async function enviarTipificacion() {
    if (!resultado) return
    setEnviando(true)
    setTipError('')
    try {
      await ventasService.tipificarCRMPublico({
        telefono,
        campaignId: inter?.campaignId ?? 0,
        agente:     nombreAgente,
        agenteId:   agenteId || undefined,
        resultado,
        notas,
      })
      setTipOk(true)
      /* Cerrar la ventana después de 1.5 s para que el agente vea la confirmación */
      setTimeout(() => {
        try { window.close() } catch { /* si el navegador bloquea, no pasa nada */ }
      }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar'
      setTipError(msg || 'Error al registrar la tipificación. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  /* ── UI ── */
  if (!telefono) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
          <p className="font-semibold text-gray-700">Parámetro <code className="text-brand">cliente</code> no proporcionado</p>
          <p className="text-[0.8rem] text-gray-400">Ejemplo: /crm?cliente=5513950319</p>
        </div>
      </div>
    )
  }

  if (!fetchDone) {
    /* Mostrar form de tipificación mientras los datos cargan en segundo plano */
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[1rem] font-bold text-gray-900">CRM</h1>
              <p className="text-[0.72rem] text-gray-400 font-mono">{telefono}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[0.72rem] text-gray-400">
              <Spinner size="sm" />
              <span>Cargando datos...</span>
            </div>
          </div>
          <TipificacionPanel
            telefono={telefono}
            campaignId={0}
            nombreAgente={nombreAgente}
            resultado={resultado}
            notas={notas}
            enviando={enviando}
            tipOk={tipOk}
            tipError={tipError}
            onResultado={setResultado}
            onNotas={setNotas}
            onEnviar={enviarTipificacion}
          />
        </div>
      </div>
    )
  }

  if (!found) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[1rem] font-bold text-gray-900">CRM</h1>
              <p className="text-[0.72rem] text-gray-400">Sistema de gestión de clientes</p>
            </div>
          </div>

          {/* Información del lead: en base Vicidial o no encontrado */}
          {enBaseMadreVici && vicidialLead ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-400" />
                <p className="font-semibold text-blue-900 text-[0.85rem]">Número en base madre Vicidial</p>
              </div>
              <p className="text-[0.9rem] font-bold text-blue-900">{String(vicidialLead.nombre ?? telefono)}</p>
              <p className="text-[0.82rem] text-blue-700 font-mono">{telefono}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.75rem] text-blue-700 pt-1">
                {vicidialLead.state  ? <span>Estado: <b>{String(vicidialLead.state)}</b></span>  : null}
                {vicidialLead.city   ? <span>Ciudad: <b>{String(vicidialLead.city)}</b></span>   : null}
                {vicidialLead.status ? <span>Status VD: <b>{String(vicidialLead.status)}</b></span> : null}
                {vicidialLead.calledCount !== undefined ? <span>Llamadas: <b>{String(vicidialLead.calledCount)}</b></span> : null}
              </div>
              <p className="text-[0.72rem] text-blue-500">Puedes igualmente registrar el resultado de esta llamada.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3 mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-400" />
                <p className="font-semibold text-amber-900 text-[0.85rem]">Número no en base CRM</p>
              </div>
              <p className="text-[0.82rem] text-amber-700 font-mono">{telefono}</p>
              <p className="text-[0.75rem] text-amber-600">Puedes igualmente registrar el resultado de esta llamada.</p>
            </div>
          )}

          <TipificacionPanel
            telefono={telefono}
            campaignId={0}
            nombreAgente={nombreAgente}
            resultado={resultado}
            notas={notas}
            enviando={enviando}
            tipOk={tipOk}
            tipError={tipError}
            onResultado={setResultado}
            onNotas={setNotas}
            onEnviar={enviarTipificacion}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner fijo superior */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-brand to-brand/80 px-4 py-3 shadow-md">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white leading-tight truncate">{nombre}</p>
            <p className="text-[0.75rem] text-white/70 flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> {telefono}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[0.62rem] text-white/60">Agente</p>
            <p className="text-[0.72rem] font-semibold text-white">{nombreAgente}</p>
            <p className="text-[0.6rem] text-white/50">
              {inter?.ultimaGestion
                ? parseFecha(inter.ultimaGestion).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
                : 'Sin gestiones previas'}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4 pb-8 space-y-4">

        {/* Tabs internos */}
        <div className="flex rounded-xl bg-card border border-gray-200/60 shadow-sm overflow-hidden">
          {(['datos', 'tipificar', 'historial'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTipTab(t)}
              className={clsx(
                'flex-1 py-2.5 text-[0.78rem] font-semibold transition-colors',
                tipTab === t
                  ? 'bg-brand text-white'
                  : 'text-gray-500 hover:bg-gray-50'
              )}
            >
              {t === 'datos' ? 'Datos' : t === 'tipificar' ? 'Tipificar' : `Historial (${gestiones.length})`}
            </button>
          ))}
        </div>

        {/* ── TAB: DATOS ── */}
        {tipTab === 'datos' && (
          <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="text-[0.78rem] font-bold text-gray-700">Datos del cliente</p>
              {editando ? (
                <div className="flex gap-2">
                  <button onClick={() => setEditando(null)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                    <XCircle className="h-3.5 w-3.5" /> Cancelar
                  </button>
                  <button onClick={guardarEdicion} disabled={guardando} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.72rem] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {guardando ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Guardar
                  </button>
                </div>
              ) : (
                camposVisibles.some(c => c.editable) && (
                  <button onClick={() => setEditando({ ...datos })} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                )
              )}
            </div>

            <div className="p-4">
              {camposVisibles.length === 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(datos).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-gray-50 px-3 py-2.5">
                      <p className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wide">{k}</p>
                      <p className="text-[0.82rem] font-semibold text-gray-800 mt-0.5 truncate">{v || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {camposVisibles.map(cfg => {
                    const val = (editando ?? datos)[cfg.campo] ?? ''
                    return (
                      <div key={cfg.campo} className="rounded-xl bg-gray-50 px-3 py-2.5">
                        <p className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wide">{cfg.etiqueta}</p>
                        {editando && cfg.editable ? (
                          <input value={editando[cfg.campo] ?? ''}
                            onChange={e => setEditando(prev => ({ ...prev!, [cfg.campo]: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-brand/30 bg-card px-2 py-1 text-[0.8rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
                        ) : (
                          <p className={clsx('text-[0.82rem] font-semibold mt-0.5 truncate', val ? 'text-gray-800' : 'text-gray-300')}>
                            {val || '—'}
                            {cfg.editable && !editando && <Pencil className="inline h-3 w-3 ml-1 text-gray-300" />}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Campañas múltiples */}
            {interacciones.length > 1 && (
              <div className="border-t border-gray-100 px-5 py-3">
                <p className="text-[0.7rem] text-gray-400 mb-2">Aparece en {interacciones.length} campañas</p>
                <div className="flex flex-wrap gap-1.5">
                  {interacciones.map((itx, i) => (
                    <span key={itx.id} className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold', i === 0 ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-500')}>
                      {itx.importacionNombre ?? `Campaña #${itx.campaignId}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: TIPIFICAR ── */}
        {tipTab === 'tipificar' && (
          <TipificacionPanel
            telefono={telefono}
            campaignId={inter?.campaignId ?? 0}
            nombreAgente={nombreAgente}
            resultado={resultado}
            notas={notas}
            enviando={enviando}
            tipOk={tipOk}
            tipError={tipError}
            onResultado={setResultado}
            onNotas={setNotas}
            onEnviar={enviarTipificacion}
          />
        )}

        {/* ── TAB: HISTORIAL ── */}
        {tipTab === 'historial' && (
          <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
              <History className="h-4 w-4 text-brand" />
              <p className="text-[0.85rem] font-bold text-gray-900">Historial de gestiones</p>
              <span className="ml-auto rounded-full bg-brand/10 px-2 py-0.5 text-[0.65rem] font-bold text-brand">{gestiones.length}</span>
            </div>

            {gestiones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-300">
                <History className="h-7 w-7 opacity-30" />
                <p className="text-[0.78rem]">Sin gestiones previas</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                {gestiones.map(g => {
                  const fecha = parseFecha(g.fecha)
                  const tipoColor = g.tipo === 'apertura'
                    ? 'bg-blue-100 text-blue-700'
                    : g.tipo === 'tipificacion'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-500'

                  let datosExtra: Record<string, unknown> = {}
                  try { datosExtra = JSON.parse(g.datos ?? '{}') } catch { /* ok */ }

                  return (
                    <div key={g.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 mt-0.5">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold', tipoColor)}>
                            {g.tipo}
                          </span>
                          <p className="text-[0.78rem] font-semibold text-gray-800">{(g as unknown as { agenteNombre?: string }).agenteNombre ?? g.nombreAgente}</p>
                        </div>
                        <p className="text-[0.68rem] text-gray-400 mt-0.5">
                          {fecha.toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                        </p>
                        {Object.keys(datosExtra).length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {Boolean(datosExtra.resultado) && (
                              <p className="text-[0.72rem] font-semibold text-gray-700">
                                Resultado: <span className="text-brand">{String(datosExtra.resultado)}</span>
                              </p>
                            )}
                            {Boolean(datosExtra.notas) && (
                              <p className="text-[0.68rem] text-gray-500 italic">{String(datosExtra.notas)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[0.65rem] text-gray-300 pb-2">CRM · {new Date().toLocaleString('es-MX')}</p>
      </div>
    </div>
  )
}

/* ── Componente reutilizable de tipificación ── */
function TipificacionPanel({
  telefono: _telefono,
  campaignId: _campaignId,
  nombreAgente,
  resultado,
  notas,
  enviando,
  tipOk,
  tipError,
  onResultado,
  onNotas,
  onEnviar,
}: {
  telefono: string
  campaignId: number
  nombreAgente: string
  resultado: string
  notas: string
  enviando: boolean
  tipOk: boolean
  tipError: string
  onResultado: (v: string) => void
  onNotas: (v: string) => void
  onEnviar: () => void
}) {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand" />
          <p className="text-[0.85rem] font-bold text-gray-900">Tipificar llamada</p>
        </div>
        {nombreAgente && nombreAgente !== 'Agente' && (
          <div className="flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1">
            <User className="h-3 w-3 text-brand" />
            <span className="text-[0.7rem] font-semibold text-brand">{nombreAgente}</span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {tipOk && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-[0.95rem] font-bold text-emerald-700">Tipificación registrada</p>
            <p className="text-[0.78rem] text-emerald-600">Esta ventana se cerrará automáticamente...</p>
          </div>
        )}
        {tipError && !tipOk && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-[0.78rem] font-semibold text-red-700">{tipError}</p>
          </div>
        )}

        {/* Formulario: oculto cuando ya se registró */}
        {!tipOk && <>

        {/* Grupo: Resultado de venta */}
        <div>
          <p className="text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide mb-2">Resultado de venta</p>
          <div className="grid grid-cols-3 gap-2">
            {RESULTADOS_VENTA.map(r => {
              const color = r.code === 'VESA'
                ? resultado === r.code ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                : r.code === 'RECHA'
                ? resultado === r.code ? 'border-red-500 bg-red-500 text-white' : 'border-red-200 bg-red-50 text-red-600 hover:border-red-400'
                : resultado === r.code ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400'
              return (
                <button key={r.code} onClick={() => onResultado(r.code)}
                  className={clsx('rounded-xl border px-3 py-2.5 text-[0.72rem] font-semibold text-center transition-all', color)}>
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Separador y Gestión de llamada — comentado para ocultar, no borrar
        <div className="relative flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[0.65rem] font-semibold text-gray-300 uppercase tracking-wide">o gestión</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <div>
          <p className="text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide mb-2">Resultado de llamada</p>
          <div className="grid grid-cols-2 gap-2">
            {RESULTADOS_GESTION.map(r => (
              <button
                key={r.code}
                onClick={() => onResultado(r.code)}
                className={clsx(
                  'rounded-xl border px-3 py-2 text-[0.72rem] font-semibold text-left transition-all',
                  resultado === r.code
                    ? 'border-brand bg-brand text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-brand/40 hover:bg-brand/5'
                )}
              >
                <span className="block text-[0.6rem] font-bold opacity-50 mb-0.5">{r.code}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        */}

        {/* Notas */}
        <div>
          <p className="text-[0.72rem] font-bold text-gray-600 mb-1.5">Notas adicionales</p>
          <textarea
            rows={3}
            value={notas}
            onChange={e => onNotas(e.target.value)}
            placeholder="Observaciones, acuerdos, próximos pasos..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[0.8rem] text-gray-800 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 resize-none"
          />
        </div>

        <button
          onClick={onEnviar}
          disabled={!resultado || enviando}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[0.82rem] font-bold text-white hover:bg-brand/90 disabled:opacity-40 transition-colors"
        >
          {enviando ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
          Registrar tipificación
        </button>

        </> /* fin !tipOk */}
      </div>
    </div>
  )
}
