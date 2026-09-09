import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { TrendingUp, Building2, Mail, FileText, PhoneCall, CalendarDays, ArrowRight, Download, AlertOctagon, DollarSign, RefreshCw, Plus, X } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { apiPublico } from '@/lib/axios'

const CRM_ETAPA_LABELS: Record<string, string> = {
  prospecto: 'Prospecto', contactado: 'Contactado', propuesta: 'Propuesta',
  negociacion: 'Negociación', ganado: 'Ganado', perdido: 'Perdido',
}
const CRM_ETAPA_COLOR: Record<string, string> = {
  prospecto: 'bg-gray-100 text-gray-600', contactado: 'bg-blue-100 text-blue-700',
  propuesta: 'bg-purple-100 text-purple-700', negociacion: 'bg-amber-100 text-amber-700',
  ganado: 'bg-emerald-100 text-emerald-700', perdido: 'bg-red-100 text-red-600',
}
const TIPO_ICON: Record<string, React.ReactNode> = {
  nota:         <FileText className="h-3.5 w-3.5" />,
  llamada:      <PhoneCall className="h-3.5 w-3.5" />,
  email:        <Mail className="h-3.5 w-3.5" />,
  reunion:      <CalendarDays className="h-3.5 w-3.5" />,
  cambio_etapa: <ArrowRight className="h-3.5 w-3.5" />,
}

interface PortalCotizacion {
  id: number; folio: string; titulo: string; estatus: string; total: number
}

interface PortalIncidencia {
  id: number; folio: string; titulo: string; categoria: string | null; prioridad: string
  estatus: string; fechaCreacion: string; fechaLimiteSla: string | null
  solucionPropuesta: string | null; fechaCompromiso: string | null; fechaResolucion: string | null
}

interface PortalPago {
  id: number; concepto: string; monto: number; montoPagado: number | null
  fechaLimite: string; estatus: string; diasRestantes: number; estatusVisual: string
}

interface PortalRenovacion {
  id: number; tipo: string; descripcion: string; fecha: string; diasRestantes: number
}

interface PortalData {
  contacto: { nombre: string; empresa: string | null; email: string; esCliente: boolean }
  oportunidades: {
    id: number; nombre: string; etapa: string; valor: number | null
    fechaCierre: string | null; notas: string | null; responsable: string | null
    pendientes: number; completadas: number; cotizaciones?: PortalCotizacion[]
  }[]
  interacciones: {
    id: number; opoId: number; opoNombre: string; tipo: string
    contenido: string | null; usuarioNombre: string | null; fecha: string
  }[]
  documentos: {
    id: number; nombreOriginal: string; mimeType: string | null
    tamanoBytes: number; fechaSubida: string
  }[]
  incidencias: PortalIncidencia[]
  pagos: PortalPago[]
  renovaciones: PortalRenovacion[]
}

const INC_ESTATUS_UI: Record<string, { label: string; cls: string }> = {
  pendiente:         { label: 'Pendiente',           cls: 'bg-amber-100 text-amber-700' },
  en_proceso:        { label: 'En proceso',          cls: 'bg-blue-100 text-blue-700' },
  en_espera_cliente: { label: 'Esperando respuesta', cls: 'bg-orange-100 text-orange-700' },
  resuelto:          { label: 'Resuelto',            cls: 'bg-emerald-100 text-emerald-700' },
  escalado:          { label: 'Escalado',            cls: 'bg-red-100 text-red-700' },
  cerrado:           { label: 'Cerrado',             cls: 'bg-gray-100 text-gray-600' },
}
const PAGO_UI: Record<string, { label: string; cls: string }> = {
  vencido:        { label: 'Vencido',      cls: 'bg-red-100 text-red-700' },
  vence_hoy:      { label: 'Vence hoy',    cls: 'bg-amber-100 text-amber-700' },
  proximo_vencer: { label: 'Por vencer',   cls: 'bg-blue-100 text-blue-700' },
}

export function CRMPortalPage() {
  const [token]   = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [data,    setData]    = useState<PortalData | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [opoSel,  setOpoSel]  = useState<number | null>(null)

  const [showNuevaSolicitud, setShowNuevaSolicitud] = useState(false)

  const fetchData = () => {
    if (!token) { setError('Enlace inválido'); setLoading(false); return }
    setLoading(true)
    apiPublico.get(`/crm/portal/datos?token=${token}`)
      .then((r) => { setData(r.data.data); setLoading(false) })
      .catch((e) => { setError(e.response?.data?.message ?? 'Error'); setLoading(false) })
  }

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner size="lg" />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3">
        <div className="text-5xl">🔒</div>
        <p className="text-lg font-bold text-gray-700">{error ?? 'Enlace inválido'}</p>
        <p className="text-[0.85rem] text-gray-400">Solicita un nuevo enlace de acceso a tu asesor.</p>
      </div>
    </div>
  )

  const { contacto, oportunidades, interacciones, documentos, incidencias, pagos, renovaciones } = data
  const fmtSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
  const opoActual = oportunidades.find((o) => o.id === opoSel) ?? null
  const intDeOpo  = interacciones.filter((i) => i.opoId === opoSel)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-card border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
            <TrendingUp className="h-5 w-5 text-brand" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-900">Portal de seguimiento</p>
            <p className="text-[0.72rem] text-gray-500">Ardabytec</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Bienvenida */}
        <div className="rounded-2xl bg-card border border-gray-200 p-5">
          <p className="text-[1rem] font-bold text-gray-900">Hola, {contacto.nombre} 👋</p>
          {contacto.empresa && (
            <p className="text-[0.8rem] text-gray-500 flex items-center gap-1 mt-0.5">
              <Building2 className="h-3.5 w-3.5" /> {contacto.empresa}
            </p>
          )}
          <p className="text-[0.8rem] text-gray-500 flex items-center gap-1 mt-0.5">
            <Mail className="h-3.5 w-3.5" /> {contacto.email}
          </p>
        </div>

        {/* Lista de oportunidades */}
        <div className="space-y-3">
          <h2 className="text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide px-1">Tus proyectos</h2>
          {oportunidades.length === 0 ? (
            <div className="rounded-2xl bg-card border border-gray-200 p-8 text-center text-gray-400 text-[0.85rem]">Sin proyectos activos</div>
          ) : oportunidades.map((o) => (
            <button
              key={o.id}
              onClick={() => setOpoSel(opoSel === o.id ? null : o.id)}
              className={clsx(
                'w-full text-left rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md transition-all',
                opoSel === o.id ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9rem] font-bold text-gray-900">{o.nombre}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold', CRM_ETAPA_COLOR[o.etapa] ?? 'bg-gray-100 text-gray-600')}>
                      {CRM_ETAPA_LABELS[o.etapa] ?? o.etapa}
                    </span>
                    {o.fechaCierre && (
                      <span className="text-[0.68rem] text-gray-500">
                        Cierre estimado: {new Date(o.fechaCierre + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}
                      </span>
                    )}
                  </div>
                  {o.responsable && <p className="text-[0.7rem] text-gray-400 mt-1">Asesor: {o.responsable}</p>}
                </div>
                {o.valor != null && (
                  <p className="text-[0.85rem] font-bold text-emerald-700 flex-shrink-0">
                    ${o.valor.toLocaleString('es-MX')}
                  </p>
                )}
              </div>
              {/* Progreso actividades */}
              {(o.completadas + o.pendientes) > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[0.65rem] text-gray-400 mb-1">
                    <span>{o.completadas} de {o.completadas + o.pendientes} tareas completadas</span>
                    <span>{Math.round((o.completadas / (o.completadas + o.pendientes)) * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${Math.round((o.completadas / (o.completadas + o.pendientes)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Detalle expandido */}
              {opoSel === o.id && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                  {o.notas && (
                    <p className="text-[0.78rem] text-gray-600 bg-gray-50 rounded-xl p-3">{o.notas}</p>
                  )}
                  {intDeOpo.length > 0 && (
                    <div>
                      <p className="text-[0.72rem] font-bold text-gray-600 mb-2">Historial de seguimiento</p>
                      <div className="space-y-2">
                        {intDeOpo.slice(0,10).map((i) => (
                          <div key={i.id} className="flex gap-2">
                            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                              {TIPO_ICON[i.tipo] ?? <FileText className="h-3 w-3" />}
                            </div>
                            <div>
                              <p className="text-[0.75rem] text-gray-700">{i.contenido}</p>
                              <p className="text-[0.62rem] text-gray-400 mt-0.5">
                                {i.usuarioNombre && `${i.usuarioNombre} · `}
                                {new Date(i.fecha).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Cotizaciones */}
                  {o.cotizaciones && o.cotizaciones.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-gray-700">Cotizaciones</p>
                      {o.cotizaciones.map((c) => (
                        <div key={c.id} className="border rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-mono font-bold text-blue-600 mr-2">{c.folio}</span>
                              <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize', {
                                'bg-blue-100 text-blue-700': c.estatus === 'enviada',
                                'bg-green-100 text-green-700': c.estatus === 'aprobada',
                                'bg-red-100 text-red-700': c.estatus === 'rechazada',
                              })}>{c.estatus}</span>
                            </div>
                            <span className="font-bold text-emerald-700">${Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <p className="text-sm text-gray-600">{c.titulo}</p>
                          {c.estatus === 'enviada' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => apiPublico.post(`/crm/cotizaciones/${c.id}/aprobar`, { portalToken: token }).then(() => fetchData())}
                                className="flex-1 rounded-lg bg-green-600 text-white text-sm font-semibold py-2 hover:bg-green-700">
                                Aprobar
                              </button>
                              <button
                                onClick={() => apiPublico.post(`/crm/cotizaciones/${c.id}/rechazar`, { portalToken: token }).then(() => fetchData())}
                                className="flex-1 rounded-lg border border-red-300 text-red-600 text-sm font-semibold py-2 hover:bg-red-50">
                                Rechazar
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Documentos */}
        {documentos && documentos.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide px-1">Documentos</h2>
            <div className="rounded-2xl bg-card border border-gray-200 divide-y divide-gray-50 overflow-hidden">
              {documentos.map((d) => (
                <a
                  key={d.id}
                  href={`/api/crm/portal/documentos/${d.id}/download?token=${token}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{d.nombreOriginal}</p>
                      <p className="text-[0.65rem] text-gray-400">{fmtSize(d.tamanoBytes)} · {new Date(d.fechaSubida).toLocaleDateString('es-MX')}</p>
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Solicitudes e incidencias */}
        {contacto.esCliente && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide">Tus solicitudes e incidencias</h2>
              <button
                onClick={() => setShowNuevaSolicitud(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva solicitud
              </button>
            </div>
            {incidencias.length === 0 ? (
              <div className="rounded-2xl bg-card border border-gray-200 p-6 text-center text-gray-400 text-[0.82rem]">Sin solicitudes registradas</div>
            ) : (
              <div className="space-y-2">
                {incidencias.map((i) => {
                  const est = INC_ESTATUS_UI[i.estatus] ?? { label: i.estatus, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={i.id} className="rounded-2xl bg-card border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-[0.68rem] font-mono font-bold text-blue-600 mr-2">{i.folio}</span>
                          <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', est.cls)}>{est.label}</span>
                          <p className="mt-1 text-[0.86rem] font-semibold text-gray-800">{i.titulo}</p>
                        </div>
                        <span className="flex-shrink-0 text-[0.66rem] text-gray-400">
                          {new Date(i.fechaCreacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {i.solucionPropuesta && (
                        <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-[0.78rem] text-emerald-800">
                          <strong>Solución propuesta:</strong> {i.solucionPropuesta}
                        </p>
                      )}
                      {i.fechaResolucion && (
                        <p className="mt-1.5 text-[0.68rem] text-emerald-600">
                          Resuelta el {new Date(i.fechaResolucion).toLocaleDateString('es-MX')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Próximos pagos */}
        {contacto.esCliente && pagos.length > 0 && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide px-1">
              <DollarSign className="h-4 w-4" /> Próximos pagos
            </h2>
            <div className="rounded-2xl bg-card border border-gray-200 divide-y divide-gray-50 overflow-hidden">
              {pagos.map((p) => {
                const ui = PAGO_UI[p.estatusVisual] ?? { label: '', cls: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[0.82rem] font-semibold text-gray-800 truncate">{p.concepto}</p>
                      <p className="text-[0.66rem] text-gray-400">
                        Vence: {new Date(p.fechaLimite + 'T12:00:00').toLocaleDateString('es-MX')}
                        {ui.label && <span className={clsx('ml-2 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold', ui.cls)}>{ui.label}</span>}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-[0.85rem] font-bold text-emerald-700">
                      ${Number(p.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Renovaciones próximas */}
        {contacto.esCliente && renovaciones.length > 0 && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide px-1">
              <RefreshCw className="h-4 w-4" /> Renovaciones próximas
            </h2>
            <div className="rounded-2xl bg-card border border-gray-200 divide-y divide-gray-50 overflow-hidden">
              {renovaciones.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[0.82rem] font-semibold text-gray-800 truncate">{r.descripcion}</p>
                    <p className="text-[0.66rem] text-gray-400 capitalize">{r.tipo} · {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX')}</p>
                  </div>
                  <span className="flex-shrink-0 text-[0.7rem] text-gray-500">
                    {r.diasRestantes >= 0 ? `en ${r.diasRestantes} día${r.diasRestantes !== 1 ? 's' : ''}` : 'vencida'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-[0.68rem] text-gray-400 pb-4">
          Ardabytec · Portal de seguimiento de proyectos
        </p>
      </div>

      {showNuevaSolicitud && (
        <NuevaSolicitudModal token={token} onClose={() => setShowNuevaSolicitud(false)} onCreada={() => { setShowNuevaSolicitud(false); fetchData() }} />
      )}
    </div>
  )
}

function NuevaSolicitudModal({ token, onClose, onCreada }: { token: string; onClose: () => void; onCreada: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const enviar = () => {
    if (!titulo.trim() || !descripcion.trim()) { setErr('Completa el título y la descripción'); return }
    setEnviando(true); setErr(null)
    apiPublico.post('/crm/portal/incidencias', { portalToken: token, titulo: titulo.trim(), descripcion: descripcion.trim(), categoria: categoria.trim() || undefined })
      .then((r) => {
        alert(`Solicitud registrada con folio ${r.data.folio}. Un asesor le dará seguimiento.`)
        onCreada()
      })
      .catch((e) => { setErr(e.response?.data?.message ?? 'No se pudo enviar la solicitud'); setEnviando(false) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[0.95rem] font-bold text-gray-900">Nueva solicitud</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Asunto</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" placeholder="¿En qué podemos ayudarte?" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Descripción</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={4000} rows={4} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" placeholder="Cuéntanos con detalle" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Categoría (opcional)</label>
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={50} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" placeholder="Facturación, soporte, etc." />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button onClick={enviar} disabled={enviando} className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            <AlertOctagon className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
