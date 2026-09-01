import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Laptop, Cpu, Monitor, Keyboard, Mouse, Boxes, Calendar, Briefcase, Pencil, Check, X, ShieldCheck, FileText, AlertCircle, Loader2, Download, Camera } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const TIPO_LABEL: Record<string, string> = {
  AD: 'Administración',
  TI: 'Tecnología',
  CC: 'Call Center',
  CL: 'Clientes',
}

const TIPO_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  AD: { bg: 'bg-purple-50',   text: 'text-purple-700',  dot: 'bg-purple-400' },
  TI: { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400' },
  CC: { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-400' },
  CL: { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-400' },
}

interface Compañero {
  id: number
  nombre: string
  usuario: string
  tipoUsuario: string
  alias: string | null
  fotoUrl: string | null
  fechaIngreso: string | null
  puesto: string | null
  campana: string | null
}

function getInitials(nombre: string) {
  return nombre.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function antiguedad(fecha: string | null): string {
  if (!fecha) return ''
  const d = new Date(fecha)
  const now = new Date()
  const meses = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  if (meses < 1) return 'Recién ingresado'
  if (meses < 12) return `${meses} mes${meses > 1 ? 'es' : ''}`
  const a = Math.floor(meses / 12)
  return `${a} año${a > 1 ? 's' : ''}`
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-100 bg-card p-5 flex flex-col items-center gap-3">
      <div className="h-16 w-16 rounded-full bg-gray-100" />
      <div className="h-3.5 w-28 rounded-full bg-gray-100" />
      <div className="h-2.5 w-20 rounded-full bg-gray-100" />
    </div>
  )
}

function CompañeroCard({ c, isMe, onClick }: { c: Compañero; isMe?: boolean; onClick: () => void }) {
  const displayName = c.alias || c.nombre
  const initials = getInitials(c.nombre)
  const ant = antiguedad(c.fechaIngreso)

  return (
    <button
      onClick={onClick}
      className="relative rounded-2xl border border-gray-200/70 bg-card p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:border-brand/30 transition-all text-left cursor-pointer"
    >
      {isMe && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-brand px-2 py-0.5 text-[0.6rem] font-bold text-white shadow">
          Tú
        </span>
      )}
      {c.fotoUrl ? (
        <img
          src={c.fotoUrl}
          alt={displayName}
          className="h-16 w-16 rounded-full object-cover border-2 border-gray-100"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 border-2 border-brand/20">
          <span className="text-lg font-bold text-brand">{initials}</span>
        </div>
      )}
      <div className="text-center mt-1">
        <p className="text-[0.88rem] font-bold text-gray-800 leading-snug">{displayName}</p>
        {c.puesto && (
          <p className="text-[0.72rem] text-brand font-medium mt-0.5">{c.puesto}</p>
        )}
        {c.alias && (
          <p className="text-[0.72rem] text-gray-400 mt-0.5">@{c.usuario}</p>
        )}
      </div>
      {c.campana && (
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[0.62rem] font-semibold text-amber-700">
          {c.campana}
        </span>
      )}
      {ant && (
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[0.65rem] font-semibold text-gray-500">
          {ant}
        </span>
      )}
    </button>
  )
}

/* ── Detalle del compañero + activos asignados ── */
type ActivoTipo = 'laptop' | 'cpu' | 'monitor' | 'teclado' | 'mouse'

interface ActivoAsignado {
  id: number
  tipo: ActivoTipo
  marca: string
  modelo: string
  numeroSerie: string
  estado: string
  fechaAsignacion: string | null
  terminosAceptados: boolean
  fechaAceptacion: string | null
}

interface ActivoGeneral {
  id: number
  nombreEquipo: string | null
  marca: string | null
  modelo: string | null
  numeroSerie: string | null
  sistemaOperativo: string | null
  ubicacion: string | null
  estado: string | null
  monitor1: string | null
  monitor2: string | null
  diademas: string | null
  accesorios: string | null
  departamento: string | null
  fechaAsignacion: string | null
  cartaDocId: number | null
}

const TIPO_ICON: Record<ActivoTipo, typeof Laptop> = {
  laptop: Laptop, cpu: Cpu, monitor: Monitor, teclado: Keyboard, mouse: Mouse,
}

const TIPO_LABEL_ACTIVO: Record<ActivoTipo, string> = {
  laptop: 'Laptop', cpu: 'CPU', monitor: 'Monitor', teclado: 'Teclado', mouse: 'Mouse',
}

function PuestoEditable({ c }: { c: Compañero }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(c.puesto ?? '')

  const guardar = useMutation({
    mutationFn: (puesto: string) => api.put(`/usuarios/${c.id}/puesto`, { puesto }),
    onSuccess: (_, puesto) => {
      qc.setQueriesData<Compañero[]>({ queryKey: ['mi-area'] }, (old) =>
        old ? old.map((u) => u.id === c.id ? { ...u, puesto } : u) : old
      )
      toast.success('Puesto actualizado')
      setEditando(false)
    },
    onError: () => toast.error('Error al actualizar el puesto'),
  })

  if (editando) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Ej. Director General"
          className="field py-1 text-[0.78rem] flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') guardar.mutate(valor) }}
        />
        <button onClick={() => guardar.mutate(valor)} disabled={guardar.isPending}
          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setEditando(false); setValor(c.puesto ?? '') }}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setEditando(true)} className="group flex items-center gap-1.5 mt-0.5 text-left">
      <p className={c.puesto ? 'text-[0.75rem] font-semibold text-brand' : 'text-[0.75rem] text-gray-300 italic'}>
        {c.puesto || 'Sin puesto asignado'}
      </p>
      <Pencil className="h-3 w-3 text-gray-300 group-hover:text-brand transition-colors flex-shrink-0" />
    </button>
  )
}

/* ── Ver responsiva firmada del expediente ── */
function VerTerminosModal({
  activo, dueñoId, onClose,
}: { activo: ActivoAsignado; dueñoId: number; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const isAdmin = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
  const esMiActivo = user?.id === dueñoId
  const blobUrlRef = useRef<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const fechaTexto = activo.fechaAceptacion
    ? new Date(activo.fechaAceptacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  // 1. Listar documentos del expediente para encontrar la responsiva
  const { data: docs = [], isLoading: loadingDocs, error: errorDocs } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['expediente-docs', dueñoId],
    queryFn: async () => {
      const url = esMiActivo ? '/expedientes/mi/documentos' : `/expedientes/${dueñoId}/documentos`
      const { data } = await api.get(url)
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    enabled: esMiActivo || isAdmin,
    staleTime: 60_000,
  })

  const responsiva = docs.find((d) => /responsiva/i.test(d.nombre))

  // 2. Descargar el blob de la responsiva una vez localizada
  useEffect(() => {
    if (!responsiva) return
    let cancelled = false
    const url = esMiActivo
      ? `/expedientes/mi/documentos/${responsiva.id}/download`
      : `/expedientes/documentos/${responsiva.id}/download`

    api.get(url, { responseType: 'blob' }).then(({ data }) => {
      if (cancelled) return
      const objectUrl = URL.createObjectURL(data)
      blobUrlRef.current = objectUrl
      setBlobUrl(objectUrl)
    }).catch(() => {
      if (!cancelled) setBlobUrl('')
    })

    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [responsiva?.id, esMiActivo])

  const loadingPdf = responsiva && blobUrl === null
  const errorPdf = responsiva && blobUrl === ''

  return (
    <Modal isOpen onClose={onClose} title="Responsiva firmada" size="lg">
      <div className="space-y-4">
        {/* Cabecera: equipo */}
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            {(() => { const Icon = TIPO_ICON[activo.tipo] ?? Boxes; return <Icon className="h-4 w-4" /> })()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.82rem] font-semibold text-gray-800">
              {activo.marca || TIPO_LABEL_ACTIVO[activo.tipo]} {activo.modelo}
            </p>
            <p className="truncate text-[0.68rem] text-gray-400 font-mono">{activo.numeroSerie || 'Sin número de serie'}</p>
          </div>
          {fechaTexto && (
            <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[0.68rem] font-semibold text-emerald-700">
              <ShieldCheck className="h-3 w-3" />
              {fechaTexto}
            </div>
          )}
        </div>

        {/* Visor PDF */}
        {loadingDocs ? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Buscando responsiva...</span>
          </div>
        ) : errorDocs ? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">No se pudo acceder al expediente</span>
          </div>
        ) : !responsiva ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 text-gray-400">
            <FileText className="h-8 w-8 text-gray-200" />
            <p className="text-sm">No se encontró la responsiva en el expediente</p>
            <p className="text-[0.72rem] text-gray-300">Sube un documento con "responsiva" en el nombre en el módulo Expediente</p>
          </div>
        ) : loadingPdf ? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando documento...</span>
          </div>
        ) : errorPdf ? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">No se pudo cargar el documento</span>
          </div>
        ) : (
          <iframe
            src={blobUrl!}
            title="Responsiva firmada"
            className="w-full rounded-xl border border-gray-200"
            style={{ height: 'max(70vh, 520px)' }}
          />
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function CompañeroDetalleModal({ c, onClose }: { c: Compañero; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const rolActual = user?.tipoUsuario?.toUpperCase() ?? ''
  const isAdmin = rolActual === 'AD' || rolActual === 'TI'
  const esMiPerfil = user?.id === c.id
  const displayName = c.alias || c.nombre
  const initials = getInitials(c.nombre)
  const ant = antiguedad(c.fechaIngreso)

  const { data: activos = [], isLoading } = useQuery<ActivoGeneral[]>({
    queryKey: ['activos-generales-usuario', c.id],
    queryFn: async () => {
      const { data } = await api.get(`/activos/generales/usuario/${c.id}`)
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return list as ActivoGeneral[]
    },
  })

  const [verTerminosDe, setVerTerminosDe] = useState<ActivoAsignado | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const [mostrarPicker, setMostrarPicker] = useState(false)
  const [reasignandoActivoId, setReasignandoActivoId] = useState<number | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  // Documentos del expediente del usuario
  const { data: docsExpediente = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['expediente-docs-responsiva', c.id],
    queryFn: async () => {
      const endpoint = isAdmin && !esMiPerfil
        ? `/expedientes/${c.id}/documentos`
        : '/expedientes/mi/documentos'
      const { data } = await api.get(endpoint)
      const list = Array.isArray(data) ? data : (data?.data ?? data?.documentos ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['DOC_ID'] ?? r['id'] ?? r['ID'] ?? r['docId'] ?? 0),
        nombre: String(r['DOC_NOMBRE_ORIGINAL'] ?? r['nombre'] ?? r['NOMBRE'] ?? r['filename'] ?? ''),
      })).filter((d) => d.id > 0)
    },
    enabled: esMiPerfil || isAdmin,
  })

  const qc = useQueryClient()

  const handleCambiarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoFoto(true)
    const fd = new FormData()
    fd.append('foto', file)
    try {
      await api.post(`/perfil/${c.id}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['mi-area'] })
      toast.success('Foto actualizada')
    } catch {
      toast.error('Error al subir la foto')
    } finally {
      setSubiendoFoto(false)
      e.target.value = ''
    }
  }

  const abrirCarta = async (docId: number, guardarEnlace = false, activoIdOverride?: number) => {
    setAbriendo(true)
    setMostrarPicker(false)
    setReasignandoActivoId(null)
    try {
      // Guardar el enlace en el activo correspondiente
      if (guardarEnlace && isAdmin) {
        const activoId = activoIdOverride ?? activos[0]?.id
        if (activoId) {
          await api.patch(`/activos/generales/${activoId}/carta-doc`, { docId })
          qc.invalidateQueries({ queryKey: ['activos-generales-usuario', c.id] })
        }
      }
      const downloadPath = isAdmin && !esMiPerfil
        ? `/expedientes/documentos/${docId}/download`
        : `/expedientes/mi/documentos/${docId}/download`
      const res = await api.get(downloadPath, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      toast.error('No se pudo abrir el documento')
    } finally {
      setAbriendo(false)
    }
  }

  // cartaDocId enlazado: el primer activo que tenga uno definido
  const cartaDocId = activos.find((a) => a.cartaDocId)?.cartaDocId ?? null

  const handleCartaResponsiva = () => {
    if (cartaDocId) {
      abrirCarta(cartaDocId)
    } else {
      setMostrarPicker(true)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Perfil del colaborador" size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
          <div className="relative flex-shrink-0 group/foto">
            {c.fotoUrl ? (
              <img src={c.fotoUrl} alt={displayName} className="h-14 w-14 rounded-full object-cover border-2 border-white" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 border-2 border-white">
                <span className="text-base font-bold text-brand">{initials}</span>
              </div>
            )}
            {isAdmin && (
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover/foto:opacity-100">
                <input type="file" accept="image/*" className="hidden" onChange={handleCambiarFoto} disabled={subiendoFoto} />
                {subiendoFoto ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
              </label>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.92rem] font-bold text-gray-900">{displayName}</p>
            <p className="text-[0.75rem] text-gray-400">@{c.usuario} · {TIPO_LABEL[c.tipoUsuario?.toUpperCase()] ?? c.tipoUsuario}</p>
            {isAdmin ? (
              <PuestoEditable c={c} />
            ) : c.puesto ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] font-semibold text-brand">
                <Briefcase className="h-3 w-3" /> {c.puesto}
              </p>
            ) : null}
            {c.campana && (
              <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                {c.campana}
              </span>
            )}
            {ant && <p className="mt-0.5 text-[0.68rem] text-gray-400">Antigüedad: {ant}</p>}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <Boxes className="h-4 w-4 text-gray-400" />
            <h3 className="text-[0.78rem] font-bold text-gray-700 uppercase tracking-wide">Activos asignados</h3>
            {!isLoading && <span className="chip bg-gray-100 text-gray-500 text-[0.65rem]">{activos.length}</span>}
            {(esMiPerfil || isAdmin) && (
              <button
                onClick={handleCartaResponsiva}
                disabled={abriendo}
                className={`ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold border transition-colors disabled:opacity-50 ${cartaDocId ? 'text-brand border-brand/20 hover:bg-brand/8' : 'text-amber-600 border-amber-200 hover:bg-amber-50'}`}
              >
                {abriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cartaDocId ? <Download className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {cartaDocId ? 'Carta responsiva' : 'Asignar carta'}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : activos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-8">
              <Boxes className="h-6 w-6 text-gray-200" />
              <p className="text-[0.78rem] text-gray-400">Sin activos asignados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activos.map((a) => {
                const nombre = [a.nombreEquipo, a.marca, a.modelo].filter(Boolean).join(' ') || 'Equipo'
                const detalle = [a.sistemaOperativo, a.ubicacion].filter(Boolean).join(' · ')
                const extras = [
                  a.monitor1 && `Monitor: ${a.monitor1}`,
                  a.monitor2 && `Monitor 2: ${a.monitor2}`,
                  a.diademas && `Diadema: ${a.diademas}`,
                ].filter(Boolean)
                return (
                  <div key={a.id} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand mt-0.5">
                        <Laptop className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.82rem] font-semibold text-gray-800">{nombre}</p>
                        {a.numeroSerie && (
                          <p className="text-[0.68rem] text-gray-400 font-mono">{a.numeroSerie}</p>
                        )}
                        {detalle && (
                          <p className="text-[0.68rem] text-gray-400 mt-0.5">{detalle}</p>
                        )}
                        {extras.length > 0 && (
                          <p className="text-[0.65rem] text-gray-300 mt-0.5">{extras.join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {a.fechaAsignacion && (
                          <div className="flex items-center gap-1 text-[0.65rem] text-gray-400">
                            <Calendar className="h-3 w-3" />
                            {new Date(a.fechaAsignacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            {a.cartaDocId && (
                              <button
                                onClick={() => abrirCarta(a.cartaDocId!)}
                                disabled={abriendo}
                                className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.65rem] font-semibold border text-brand border-brand/20 hover:bg-brand/8 transition-colors disabled:opacity-50"
                              >
                                {abriendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                Carta
                              </button>
                            )}
                            <button
                              onClick={() => { setReasignandoActivoId(a.id); setMostrarPicker(true) }}
                              disabled={abriendo}
                              className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.65rem] font-semibold border transition-colors disabled:opacity-50 ${
                                a.cartaDocId
                                  ? 'text-gray-500 border-gray-200 hover:bg-gray-50'
                                  : 'text-amber-600 border-amber-200 hover:bg-amber-50'
                              }`}
                            >
                              <AlertCircle className="h-3 w-3" />
                              {a.cartaDocId ? 'Reasignar' : 'Asignar'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Picker: elegir documento del expediente como carta responsiva */}
      {mostrarPicker && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-[0.88rem] font-bold text-gray-900">
                  {reasignandoActivoId ? 'Reasignar carta responsiva' : 'Seleccionar carta responsiva'}
                </p>
                <p className="text-[0.7rem] text-gray-400 mt-0.5">
                  {reasignandoActivoId
                    ? `Activo #${reasignandoActivoId} · Elige el nuevo documento`
                    : 'Elige el documento del expediente'}
                </p>
              </div>
              <button onClick={() => { setMostrarPicker(false); setReasignandoActivoId(null) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-1">
              {docsExpediente.length === 0 ? (
                <p className="py-8 text-center text-[0.78rem] text-gray-400">No hay documentos en el expediente</p>
              ) : (
                docsExpediente.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => abrirCarta(d.id, true, reasignandoActivoId ?? undefined)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand/8 transition-colors group"
                  >
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0 group-hover:text-brand" />
                    <span className="truncate text-[0.8rem] font-medium text-gray-700 group-hover:text-brand">{d.nombre}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </Modal>
  )
}

function AreaSection({ tipo, personas, myId, onSelect }: { tipo: string; personas: Compañero[]; myId?: number; onSelect: (c: Compañero) => void }) {
  const label = TIPO_LABEL[tipo] ?? tipo
  const color = TIPO_COLOR[tipo] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`h-4 w-1 rounded-full ${color.dot}`} />
        <h2 className="text-[0.82rem] font-bold text-gray-700 uppercase tracking-widest">{label}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${color.bg} ${color.text}`}>
          {personas.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {personas.map((c) => (
          <CompañeroCard key={c.id} c={c} isMe={c.id === myId} onClick={() => onSelect(c)} />
        ))}
      </div>
    </section>
  )
}

export function MiAreaPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const tipo = user?.tipoUsuario?.toUpperCase() ?? ''
  const areaLabel = isAdmin ? 'Todas las áreas' : (TIPO_LABEL[tipo] ?? tipo)
  const [seleccionado, setSeleccionado] = useState<Compañero | null>(null)

  // AD: trae todos; resto: solo su área
  const { data = [], isLoading } = useQuery<Compañero[]>({
    queryKey: ['mi-area', isAdmin ? 'all' : tipo],
    queryFn: async () => {
      const url = isAdmin ? '/usuarios/todas-areas' : `/usuarios/area/${tipo}`
      const { data } = await api.get(url)
      return Array.isArray(data.data) ? data.data : []
    },
    enabled: !!tipo,
    staleTime: 120_000,
  })

  // Vista AD: agrupar por tipoUsuario
  if (isAdmin) {
    const orden = ['AD', 'TI', 'CC', 'CL']
    const grupos = orden.reduce<Record<string, Compañero[]>>((acc, t) => {
      const lista = data.filter((c) => c.tipoUsuario?.toUpperCase() === t)
      if (lista.length > 0) acc[t] = lista
      return acc
    }, {})
    // Tipos que no están en el orden predefinido
    data.forEach((c) => {
      const t = c.tipoUsuario?.toUpperCase() ?? 'OTRO'
      if (!orden.includes(t)) {
        if (!grupos[t]) grupos[t] = []
        if (!grupos[t].find((x) => x.id === c.id)) grupos[t].push(c)
      }
    })

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card overflow-hidden">
          <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Mi Área</h1>
                <p className="mt-0.5 text-xs text-white/50">{areaLabel}</p>
              </div>
              <div className="ml-auto">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/80">
                  {isLoading ? '…' : data.length} colaboradores
                </span>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          Object.entries(grupos).map(([t, personas]) => (
            <AreaSection key={t} tipo={t} personas={personas} myId={user?.id} onSelect={setSeleccionado} />
          ))
        )}
        {seleccionado && <CompañeroDetalleModal c={seleccionado} onClose={() => setSeleccionado(null)} />}
      </div>
    )
  }

  // Vista normal: solo mi área
  const yo = data.find((c) => c.id === user?.id)
  const compañeros = data.filter((c) => c.id !== user?.id)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Mi Área</h1>
              <p className="mt-0.5 text-xs text-white/50">{areaLabel}</p>
            </div>
            <div className="ml-auto">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/80">
                {isLoading ? '…' : data.length} colaboradores
              </span>
            </div>
          </div>
        </div>
      </div>

      {yo && !isLoading && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-4 w-1 rounded-full bg-brand" />
            <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Tú</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <CompañeroCard c={yo} isMe onClick={() => setSeleccionado(yo)} />
          </div>
        </section>
      )}

      <section>
        {compañeros.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <div className="h-4 w-1 rounded-full bg-gray-300" />
            <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Compañeros</h2>
            <span className="chip bg-gray-100 text-gray-500 text-[0.65rem]">{compañeros.length}</span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : compañeros.map((c) => <CompañeroCard key={c.id} c={c} onClick={() => setSeleccionado(c)} />)
          }
        </div>
        {!isLoading && compañeros.length === 0 && (
          <div className="card flex flex-col items-center justify-center gap-3 py-16">
            <Users className="h-10 w-10 text-gray-200" />
            <p className="text-sm text-gray-400">No hay más compañeros en tu área</p>
          </div>
        )}
      </section>

      {seleccionado && <CompañeroDetalleModal c={seleccionado} onClose={() => setSeleccionado(null)} />}
    </div>
  )
}
