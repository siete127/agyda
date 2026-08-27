import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Phone, RefreshCw, Settings, ShieldAlert, ExternalLink, X,
  Plus, Trash2, Pencil, CheckCircle2, XCircle, Loader2, PictureInPicture2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { useWebphoneStore } from '@/stores/webphone.store'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { parseVista, type VistaWebphone } from '@/components/ui/WebphoneFrame'
import toast from 'react-hot-toast'

const VPN_CHECK_TIMEOUT_MS = 5_000
const ZOOMS = [1, 1.3, 1.5, 1.8] as const

type VpnCheckState = 'idle' | 'checking' | 'ok' | 'fail'

/* ── Formulario crear/editar vista ── */
function VistaForm({
  initial, onCancel, onSave, saving,
}: {
  initial?: VistaWebphone
  onCancel: () => void
  onSave: (data: { label: string; url: string; requiereVpn: boolean }) => void
  saving: boolean
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [requiereVpn, setRequiereVpn] = useState(initial?.requiereVpn ?? false)
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    if (!label.trim()) return setError('El nombre es obligatorio.')
    if (!/^https?:\/\//i.test(url.trim())) return setError('Ingresa una URL válida (con http:// o https://).')
    onSave({ label: label.trim(), url: url.trim(), requiereVpn })
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-brand/30 bg-brand/5 p-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <div>
        <label className="text-xs font-medium text-gray-600">Nombre</label>
        <input className="field mt-1 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Azul 2" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">URL</label>
        <input className="field mt-1 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." type="url" />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={requiereVpn} onChange={(e) => setRequiereVpn(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/30" />
        Requiere VPN para cargar
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button onClick={submit} isLoading={saving}>Guardar</Button>
      </div>
    </div>
  )
}

export function WebphonePage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
  const qc = useQueryClient()

  const { vistaId, zoom, loadError, setVistaId, setZoom, bumpReloadKey, pipSupported, pipActive, requestPip } = useWebphoneStore()
  const [showConfig, setShowConfig] = useState(false)
  const [showVpnWarning, setShowVpnWarning] = useState(false)
  const [editando, setEditando] = useState<VistaWebphone | 'nueva' | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<VistaWebphone | null>(null)
  const [vpnCheck, setVpnCheck] = useState<VpnCheckState>('idle')

  const { data: vistas = [], isLoading: loadingVistas } = useQuery({
    queryKey: ['webphone-vistas'],
    queryFn: async () => {
      const { data } = await api.get('/webphone/vistas')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseVista)
    },
    staleTime: 30_000,
  })

  const vista = vistas.find((v) => v.id === vistaId) ?? vistas[0] ?? null

  // Si el usuario no eligió una vista a mano en esta sesión, seguir siempre a
  // la vista predeterminada (la de menor orden) aunque cambie en Configuración
  // sin necesidad de recargar la página.
  const vistaElegidaManualmente = useRef(false)
  useEffect(() => {
    if (vistaElegidaManualmente.current) return
    if (!vistas.length) return
    const predeterminada = vistas[0]
    if (vistaId !== predeterminada.id) setVistaId(predeterminada.id)
  }, [vistas, vistaId, setVistaId])

  const crear = useMutation({
    mutationFn: (body: { label: string; url: string; requiereVpn: boolean }) => api.post('/webphone/vistas', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webphone-vistas'] }); toast.success('Vista creada'); setEditando(null) },
    onError: () => toast.error('Error al crear la vista'),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { label: string; url: string; requiereVpn: boolean } }) =>
      api.put(`/webphone/vistas/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webphone-vistas'] }); toast.success('Vista actualizada'); setEditando(null) },
    onError: () => toast.error('Error al actualizar la vista'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/webphone/vistas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webphone-vistas'] })
      toast.success('Vista eliminada')
      setConfirmEliminar(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al eliminar'
      toast.error(msg)
      setConfirmEliminar(null)
    },
  })

  const cargarVista = (v: VistaWebphone) => {
    vistaElegidaManualmente.current = true
    setVistaId(v.id)
    setShowConfig(false)
    setVpnCheck('idle')
    bumpReloadKey()
    if (v.requiereVpn) setShowVpnWarning(true)
  }

  const recargar = () => bumpReloadKey()

  // No existe una API de navegador para detectar VPN directamente. Se infiere
  // intentando alcanzar la URL: si el fetch no lanza error de red dentro del
  // timeout, algo respondió en esa red (probable VPN activa); si lanza o
  // expira, lo más probable es que la VPN no esté conectada.
  const verificarVpn = async () => {
    if (!vista) return
    setVpnCheck('checking')
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), VPN_CHECK_TIMEOUT_MS)
    try {
      await fetch(vista.url, { mode: 'no-cors', signal: controller.signal, cache: 'no-store' })
      setVpnCheck('ok')
    } catch {
      setVpnCheck('fail')
    } finally {
      clearTimeout(t)
    }
  }

  return (
    <div className="flex flex-col space-y-5 animate-fade-in" style={{ height: 'calc(100vh - 7.5rem)' }}>

      {/* ── Banner ── */}
      <div className="card overflow-hidden flex-shrink-0">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Webphone</h1>
                <p className="mt-0.5 text-xs text-blue-200/80 flex items-center gap-1.5">
                  {vista?.label ?? 'Sin vistas configuradas'}
                  {vista?.requiereVpn && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-200">
                      <ShieldAlert className="h-2.5 w-2.5" /> VPN
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
                {ZOOMS.map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoom(z)}
                    className={clsx(
                      'rounded-md px-2 py-1 text-[0.7rem] font-semibold transition-colors',
                      zoom === z ? 'bg-white text-brand' : 'text-white/70 hover:text-white',
                    )}
                    title={`Zoom ${z}x`}
                  >
                    {z}x
                  </button>
                ))}
              </div>
              {pipSupported && vista && (
                <button
                  onClick={() => requestPip?.()}
                  disabled={pipActive}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
                    pipActive ? 'bg-white/5 text-white/40 cursor-default' : 'bg-white/10 text-white hover:bg-white/20',
                  )}
                  title="Abrir en ventana flotante — se mantiene visible aunque cambies de pestaña"
                >
                  <PictureInPicture2 className="h-3.5 w-3.5" /> {pipActive ? 'Flotando' : 'Modo flotante'}
                </button>
              )}
              <button
                onClick={() => setShowConfig(true)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:bg-white/20 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" /> Cambiar vista
              </button>
              {vista && (
                <a
                  href={vista.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                  title="Abrir en pestaña nueva"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                onClick={recargar}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                title="Recargar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hueco donde WebphoneFrame (montado en AppLayout) se superpone ── */}
      <div className="relative flex-1 min-h-[600px]">
        <div data-webphone-slot className="absolute inset-0 rounded-2xl" />

        {!loadingVistas && !vista && (
          <div className="card absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
            <Phone className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">No hay vistas configuradas</p>
            {isAdmin && (
              <button onClick={() => { setShowConfig(true); setEditando('nueva') }} className="text-xs font-medium text-brand hover:underline">
                Agregar una vista
              </button>
            )}
          </div>
        )}

        {vista && (loadError || vista.requiereVpn) && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2">
            {loadError && (
              <button
                onClick={recargar}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-brand-dark transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reintentar
              </button>
            )}
            {vista.requiereVpn && (
              <button
                onClick={verificarVpn}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-md hover:bg-amber-50 transition-colors"
              >
                {vpnCheck === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                Verificar VPN
              </button>
            )}
            {vpnCheck === 'ok' && (
              <span className="pointer-events-none flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-600 shadow-md">
                <CheckCircle2 className="h-3.5 w-3.5" /> VPN activa
              </span>
            )}
            {vpnCheck === 'fail' && (
              <span className="pointer-events-none flex items-center gap-1 rounded-xl bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 shadow-md">
                <XCircle className="h-3.5 w-3.5" /> Sin conexión
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: cambiar vista ── */}
      {showConfig && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-white" />
                <span className="text-sm font-bold text-white">Vistas de Webphone</span>
              </div>
              <button onClick={() => { setShowConfig(false); setEditando(null) }} className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto">
              {vistas.map((v) => (
                editando === v ? (
                  <VistaForm
                    key={v.id}
                    initial={v}
                    saving={actualizar.isPending}
                    onCancel={() => setEditando(null)}
                    onSave={(body) => actualizar.mutate({ id: v.id, body })}
                  />
                ) : (
                  <div
                    key={v.id}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 transition-colors',
                      v.id === vistaId ? 'border-brand bg-brand/5' : 'border-gray-200',
                    )}
                  >
                    <button onClick={() => cargarVista(v)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-gray-800 truncate">{v.label}</p>
                      <p className="text-xs text-gray-400 truncate">{v.url}</p>
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {v.requiereVpn && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-700">
                          <ShieldAlert className="h-3 w-3" /> VPN
                        </span>
                      )}
                      {isAdmin && (
                        <>
                          <button onClick={() => setEditando(v)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmEliminar(v)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              ))}

              {isAdmin && editando === 'nueva' && (
                <VistaForm
                  saving={crear.isPending}
                  onCancel={() => setEditando(null)}
                  onSave={(body) => crear.mutate(body)}
                />
              )}

              {isAdmin && editando !== 'nueva' && (
                <button
                  onClick={() => setEditando('nueva')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:border-brand/40 hover:text-brand transition-colors"
                >
                  <Plus className="h-4 w-4" /> Agregar vista
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: aviso VPN ── */}
      {showVpnWarning && vista && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
                <ShieldAlert className="h-7 w-7 text-amber-500" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Esta vista requiere VPN</p>
              <p className="text-xs text-gray-400">
                {vista.label} solo carga correctamente si estás conectado a la VPN de la empresa. Si no la tienes activa, la página no cargará.
              </p>
              <button
                onClick={() => setShowVpnWarning(false)}
                className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminar.mutate(confirmEliminar.id) }}
        title="Eliminar vista"
        message={`¿Eliminar la vista "${confirmEliminar?.label}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
