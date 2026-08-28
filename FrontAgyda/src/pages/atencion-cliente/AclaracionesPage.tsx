import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FileQuestion, Plus, Trash2, Clock, AlertCircle, ChevronLeft,
  Search, X, ChevronDown, MessageCircle, Send, Phone, Mail, Hash,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSocketEvent } from '@/hooks/useSocket'
import { crmService } from '@/services/crm.service'

interface Aclaracion {
  id: number
  usuarioId: number
  usuarioNombre?: string
  usuarioRol?: string
  clienteNombre: string
  clienteTel?: string
  clienteEmail?: string
  referencia?: string
  motivo: string
  detalle: string
  fecha: string
  estatus: string
}

interface Comentario {
  id: number
  aclaracionId: number
  usuarioId: number
  autorNombre: string
  contenido: string
  fecha: string
}

const ESTATUSES: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pendiente: { label: 'Pendiente',  bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  proceso:   { label: 'En proceso', bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  resuelta:  { label: 'Resuelta',   bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
}

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

function fmtHora(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

function EstatusBadge({ estatus }: { estatus: string }) {
  const cfg = ESTATUSES[estatus] ?? ESTATUSES['pendiente']
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', cfg.bg, cfg.text, cfg.border)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function EstatusSelector({ aclaracionId, estatus }: { aclaracionId: number; estatus: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const cfg = ESTATUSES[estatus] ?? ESTATUSES['pendiente']

  const cambiar = useMutation({
    mutationFn: (nuevoEstatus: string) => api.patch(`/aclaraciones/${aclaracionId}/estatus`, { estatus: nuevoEstatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aclaraciones'] })
      setOpen(false)
      toast.success('Estado actualizado')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo cambiar el estado')
    },
  })

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition-all hover:opacity-80 cursor-pointer',
          cfg.bg, cfg.text, cfg.border
        )}
      >
        <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
        {cfg.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-xl border border-gray-200 bg-card shadow-xl overflow-hidden">
            {Object.entries(ESTATUSES).map(([key, s]) => (
              <button
                key={key}
                disabled={key === estatus || cambiar.isPending}
                onClick={(e) => { e.stopPropagation(); cambiar.mutate(key) }}
                className={clsx(
                  'w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors text-left',
                  key === estatus ? 'opacity-40 cursor-default bg-gray-50' : 'hover:bg-gray-50 cursor-pointer',
                  s.text
                )}
              >
                <span className={clsx('h-2.5 w-2.5 rounded-full flex-shrink-0', s.dot)} />
                {s.label}
                {key === estatus && <span className="ml-auto text-[0.65rem] opacity-60">actual</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ComentariosSection({ aclaracionId }: { aclaracionId: number }) {
  const [texto, setTexto] = useState('')
  const qc = useQueryClient()

  const { data: comentarios = [], isLoading } = useQuery<Comentario[]>({
    queryKey: ['aclaracion-comentarios', aclaracionId],
    queryFn: async () => {
      const { data } = await api.get(`/aclaraciones/${aclaracionId}/comentarios`)
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  useSocketEvent<{ aclaracionId: number; comentario: Comentario }>('aclaracion:comentario', (payload) => {
    if (payload.aclaracionId === aclaracionId) {
      qc.invalidateQueries({ queryKey: ['aclaracion-comentarios', aclaracionId] })
    }
  })

  const agregar = useMutation({
    mutationFn: () => api.post(`/aclaraciones/${aclaracionId}/comentarios`, { contenido: texto.trim() }),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['aclaracion-comentarios', aclaracionId] })
    },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  return (
    <div className="space-y-3">
      <p className="text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" /> Seguimiento {comentarios.length > 0 && `(${comentarios.length})`}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-8 rounded-lg bg-gray-100 animate-pulse" />)}
        </div>
      ) : comentarios.length === 0 ? (
        <p className="text-[0.72rem] text-gray-400 text-center py-3 bg-gray-50 rounded-xl">Sin comentarios aún</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {comentarios.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-[0.65rem] font-bold text-purple-600">
                {(c.autorNombre || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[0.78rem] font-semibold text-gray-800">{c.autorNombre}</span>
                  <span className="text-[0.62rem] text-gray-400">{fmtHora(c.fecha)}</span>
                </div>
                <p className="text-[0.8rem] text-gray-600 leading-relaxed">{c.contenido}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Agregar comentario de seguimiento..."
          className="field flex-1 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && texto.trim()) {
              e.preventDefault()
              agregar.mutate()
            }
          }}
        />
        <button
          disabled={!texto.trim() || agregar.isPending}
          onClick={() => agregar.mutate()}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function AclaracionDetalleModal({
  aclaracion, esGestor, onClose, onDelete,
}: {
  aclaracion: Aclaracion; esGestor: boolean; onClose: () => void; onDelete: (id: number) => void
}) {
  function handleDelete() {
    onDelete(aclaracion.id)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Detalle de aclaración" size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 space-y-1.5">
          <p className="text-sm font-semibold text-purple-800">{aclaracion.clienteNombre}</p>
          <div className="flex flex-wrap gap-3 text-[0.75rem] text-purple-600">
            {aclaracion.clienteTel && (
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {aclaracion.clienteTel}</span>
            )}
            {aclaracion.clienteEmail && (
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {aclaracion.clienteEmail}</span>
            )}
            {aclaracion.referencia && (
              <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> {aclaracion.referencia}</span>
            )}
          </div>
        </div>

        {esGestor && aclaracion.usuarioNombre && (
          <p className="text-[0.72rem] text-gray-400">
            Registrada por <span className="font-semibold text-gray-600">{aclaracion.usuarioNombre}</span>
            {aclaracion.fecha && <> · {fmtFecha(aclaracion.fecha)}</>}
          </p>
        )}

        <div>
          <h2 className="text-base font-bold text-gray-900 leading-snug">{aclaracion.motivo}</h2>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aclaracion.detalle}</p>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Estado:</span>
            <EstatusSelector aclaracionId={aclaracion.id} estatus={aclaracion.estatus ?? 'pendiente'} />
          </div>

          {esGestor && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[0.78rem] font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar aclaración
            </button>
          )}
        </div>

        <div className="border-t border-gray-100" />

        <ComentariosSection aclaracionId={aclaracion.id} />
      </div>
    </Modal>
  )
}

function NuevaAclaracionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [contactoId, setContactoId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTel, setClienteTel] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [referencia, setReferencia] = useState('')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')

  const { data: clientes } = useQuery({
    queryKey: ['clientes-lista'],
    queryFn: () => crmService.getClientes(),
    staleTime: 60_000,
  })

  const seleccionarCliente = (id: string) => {
    setContactoId(id)
    const c = clientes?.find((x) => String(x.id) === id)
    if (c) {
      setClienteNombre(c.nombre)
      setClienteTel(c.telefono ?? '')
      setClienteEmail(c.correo ?? '')
    }
  }

  const crear = useMutation({
    mutationFn: () => api.post('/aclaraciones', {
      clienteNombre: clienteNombre.trim(),
      clienteTel: clienteTel.trim() || undefined,
      clienteEmail: clienteEmail.trim() || undefined,
      contactoId: contactoId || undefined,
      referencia: referencia.trim() || undefined,
      motivo: motivo.trim(),
      detalle: detalle.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aclaraciones'] })
      toast.success('Aclaración registrada')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo registrar la aclaración')
    },
  })

  const puedeGuardar = clienteNombre.trim() && motivo.trim() && detalle.trim()

  return (
    <Modal isOpen onClose={onClose} title="Nueva aclaración" size="md">
      <div className="space-y-4">
        {clientes && clientes.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente registrado (opcional)</label>
            <select value={contactoId} onChange={(e) => seleccionarCliente(e.target.value)} className="field">
              <option value="">Escribir manualmente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre del cliente</label>
          <input value={clienteNombre} onChange={(e) => { setClienteNombre(e.target.value); setContactoId('') }}
            className="field" placeholder="Nombre completo" autoFocus maxLength={200} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Teléfono (opcional)</label>
            <input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)}
              className="field" placeholder="55 1234 5678" maxLength={30} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Correo (opcional)</label>
            <input value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)}
              className="field" placeholder="cliente@correo.com" maxLength={200} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Referencia (folio, orden, factura...)</label>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
            className="field" placeholder="Opcional" maxLength={100} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo de la aclaración</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="field" placeholder="Breve descripción del motivo" maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Detalle</label>
          <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)}
            rows={5} className="field resize-none" placeholder="Explica la aclaración solicitada por el cliente..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>
            Registrar aclaración
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AclaracionCard({
  aclaracion, esGestor, destacada, onClick,
}: {
  aclaracion: Aclaracion; esGestor: boolean; destacada: boolean; onClick: () => void
}) {
  const cfg = ESTATUSES[aclaracion.estatus] ?? ESTATUSES['pendiente']

  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex h-full flex-col rounded-2xl border bg-card shadow-sm p-5 gap-3 transition-all cursor-pointer hover:shadow-md hover:border-purple-400',
        destacada ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200/60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100">
            <FileQuestion className="h-4 w-4 text-purple-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{aclaracion.motivo}</h3>
            <p className="text-[0.72rem] text-purple-600 font-medium mt-0.5 truncate">
              {aclaracion.clienteNombre}
              {aclaracion.referencia && <span className="text-gray-400"> · {aclaracion.referencia}</span>}
            </p>
            {esGestor && aclaracion.usuarioNombre && (
              <p className="text-[0.68rem] text-gray-400 truncate">por {aclaracion.usuarioNombre}</p>
            )}
          </div>
        </div>
        <span className={clsx('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', cfg.bg, cfg.text, cfg.border)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
          {cfg.label}
        </span>
      </div>

      <p className="flex-1 text-sm text-gray-500 leading-relaxed line-clamp-3">{aclaracion.detalle}</p>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {aclaracion.fecha ? (
          <div className="flex items-center gap-1.5 text-[0.68rem] text-gray-400">
            <Clock className="h-3 w-3" />
            {fmtFecha(aclaracion.fecha)}
          </div>
        ) : <div />}

        <span className="flex items-center gap-1 text-[0.72rem] text-purple-600 font-medium">
          <MessageCircle className="h-3.5 w-3.5" />
          Ver detalle
        </span>
      </div>
    </div>
  )
}

export function AclaracionesPage() {
  const navigate = useNavigate()
  const { can, isLoading: loadingAccess } = useActionAccess()
  const puedeCrear = can('atencion-cliente', 'crear-aclaracion')
  const esGestor = can('atencion-cliente', 'gestionar-aclaraciones')
  const [showNueva, setShowNueva] = useState(false)
  const [aclaracionDetalleId, setAclaracionDetalleId] = useState<number | null>(null)
  const qc = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const aclaracionIdDestacada = searchParams.get('aclaracionId') ? Number(searchParams.get('aclaracionId')) : null
  const today = localDateStr()
  const [desde, setDesde] = useState(searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? today)
  const [filtroNombre, setFiltroNombre] = useState(searchParams.get('nombre') ?? '')
  const [filtroCliente, setFiltroCliente] = useState(searchParams.get('cliente') ?? '')

  useSocketEvent<{ aclaracionId: number; estatus: string }>('aclaracion:estatus', () => {
    qc.invalidateQueries({ queryKey: ['aclaraciones'] })
  })

  function aplicarFiltros() {
    const p: Record<string, string> = {}
    if (desde) p.desde = desde
    if (hasta) p.hasta = hasta
    if (filtroNombre) p.nombre = filtroNombre
    if (filtroCliente) p.cliente = filtroCliente
    setSearchParams(p)
  }

  function limpiarFiltros() {
    setDesde('')
    setHasta(today)
    setFiltroNombre('')
    setFiltroCliente('')
    setSearchParams({})
  }

  const params = esGestor ? {
    desde: searchParams.get('desde') || undefined,
    hasta: searchParams.get('hasta') || today,
    nombre: searchParams.get('nombre') || undefined,
    cliente: searchParams.get('cliente') || undefined,
  } : {}

  const { data: aclaraciones = [], isLoading, error } = useQuery<Aclaracion[]>({
    queryKey: ['aclaraciones', esGestor, searchParams.toString()],
    queryFn: async () => {
      const { data } = await api.get('/aclaraciones', { params: esGestor ? params : undefined })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    enabled: !loadingAccess,
    staleTime: 30_000,
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/aclaraciones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aclaraciones'] })
      toast.success('Aclaración eliminada')
    },
    onError: () => toast.error('Error al eliminar aclaración'),
  })

  const hayFiltrosExtra = Boolean(desde || filtroNombre || filtroCliente)

  const aclaracionDetalle = aclaracionDetalleId != null
    ? (aclaraciones.find((a) => a.id === aclaracionDetalleId) ?? null)
    : null

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #2E1065 0%, #6D28D9 25%, #A78BFA 50%, #6D28D9 75%, #2E1065 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <FileQuestion className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Aclaraciones de Clientes</h1>
                <p className="mt-0.5 text-xs text-purple-100/80">
                  {esGestor ? `${aclaraciones.length} aclaraciones encontradas` : `${aclaraciones.length} mis aclaraciones`}
                </p>
              </div>
            </div>
            {puedeCrear && (
              <Button onClick={() => setShowNueva(true)}
                className="bg-card !text-purple-700 hover:bg-purple-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Nueva aclaración
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Leyenda de estados */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <span className="text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Estados:</span>
        {Object.values(ESTATUSES).map((s) => (
          <span key={s.label} className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', s.bg, s.text, s.border)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />{s.label}
          </span>
        ))}
        <span className="text-[0.68rem] text-gray-400 italic ml-1">· Haz clic en una aclaración para ver el detalle y cambiar su estado</span>
      </div>

      {/* Filtros — solo gestores */}
      {esGestor && (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Agente</label>
            <input type="text" placeholder="Buscar por agente..." value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Cliente</label>
            <input type="text" placeholder="Buscar por cliente..." value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <Button onClick={aplicarFiltros} className="!bg-purple-600 hover:!bg-purple-700 !shadow-none border-0 text-[0.78rem]">
            <Search className="h-3.5 w-3.5" /> Buscar
          </Button>
          {hayFiltrosExtra && (
            <button onClick={limpiarFiltros} className="flex items-center gap-1 text-[0.75rem] text-gray-400 hover:text-gray-600 px-2 py-1.5">
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* Contenido */}
      {isLoading || loadingAccess ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-4 w-2/3 rounded-lg bg-gray-100" />
              <div className="h-3 w-full rounded-lg bg-gray-100" />
              <div className="h-3 w-4/5 rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar aclaraciones</p>
        </div>
      ) : aclaraciones.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50">
            <FileQuestion className="h-7 w-7 text-purple-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">
              {esGestor ? 'Sin aclaraciones en este período' : 'No tienes aclaraciones registradas'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {esGestor ? 'Ajusta los filtros para ver más resultados.' : puedeCrear ? 'Usa el botón para registrar una nueva aclaración.' : 'No hay aclaraciones por revisar.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.72rem] text-gray-400">{aclaraciones.length} {aclaraciones.length === 1 ? 'aclaración' : 'aclaraciones'} · haz clic en una para ver el detalle</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {aclaraciones.map((a) => (
              <AclaracionCard
                key={a.id}
                aclaracion={a}
                esGestor={esGestor}
                destacada={aclaracionIdDestacada === a.id}
                onClick={() => setAclaracionDetalleId(a.id)}
              />
            ))}
          </div>
        </div>
      )}

      {showNueva && <NuevaAclaracionModal onClose={() => setShowNueva(false)} />}

      {aclaracionDetalle && (
        <AclaracionDetalleModal
          aclaracion={aclaracionDetalle}
          esGestor={esGestor}
          onClose={() => setAclaracionDetalleId(null)}
          onDelete={(id) => { eliminar.mutate(id); setAclaracionDetalleId(null) }}
        />
      )}
    </div>
  )
}
