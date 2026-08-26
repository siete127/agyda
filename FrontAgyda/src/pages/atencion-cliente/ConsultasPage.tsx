import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Headset, Plus, Trash2, Clock, AlertCircle, ChevronLeft,
  Search, X, ChevronDown, MessageCircle, Send, Phone, Mail,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSocketEvent } from '@/hooks/useSocket'
import { crmService } from '@/services/crm.service'

interface Consulta {
  id: number
  usuarioId: number
  usuarioNombre?: string
  usuarioRol?: string
  clienteNombre: string
  clienteTel?: string
  clienteEmail?: string
  asunto: string
  mensaje: string
  fecha: string
  estatus: string
}

interface Comentario {
  id: number
  consultaId: number
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

function EstatusSelector({ consultaId, estatus }: { consultaId: number; estatus: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const cfg = ESTATUSES[estatus] ?? ESTATUSES['pendiente']

  const cambiar = useMutation({
    mutationFn: (nuevoEstatus: string) => api.patch(`/consultas/${consultaId}/estatus`, { estatus: nuevoEstatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] })
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
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
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

function ComentariosSection({ consultaId }: { consultaId: number }) {
  const [texto, setTexto] = useState('')
  const qc = useQueryClient()

  const { data: comentarios = [], isLoading } = useQuery<Comentario[]>({
    queryKey: ['consulta-comentarios', consultaId],
    queryFn: async () => {
      const { data } = await api.get(`/consultas/${consultaId}/comentarios`)
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  useSocketEvent<{ consultaId: number; comentario: Comentario }>('consulta:comentario', (payload) => {
    if (payload.consultaId === consultaId) {
      qc.invalidateQueries({ queryKey: ['consulta-comentarios', consultaId] })
    }
  })

  const agregar = useMutation({
    mutationFn: () => api.post(`/consultas/${consultaId}/comentarios`, { contenido: texto.trim() }),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['consulta-comentarios', consultaId] })
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
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-[0.65rem] font-bold text-teal-600">
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
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function ConsultaDetalleModal({
  consulta, esGestor, onClose, onDelete,
}: {
  consulta: Consulta; esGestor: boolean; onClose: () => void; onDelete: (id: number) => void
}) {
  function handleDelete() {
    onDelete(consulta.id)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Detalle de consulta" size="lg">
      <div className="space-y-5">
        {/* Datos del cliente */}
        <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 space-y-1.5">
          <p className="text-sm font-semibold text-teal-800">{consulta.clienteNombre}</p>
          <div className="flex flex-wrap gap-3 text-[0.75rem] text-teal-600">
            {consulta.clienteTel && (
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {consulta.clienteTel}</span>
            )}
            {consulta.clienteEmail && (
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {consulta.clienteEmail}</span>
            )}
          </div>
        </div>

        {esGestor && consulta.usuarioNombre && (
          <p className="text-[0.72rem] text-gray-400">
            Registrada por <span className="font-semibold text-gray-600">{consulta.usuarioNombre}</span>
            {consulta.fecha && <> · {fmtFecha(consulta.fecha)}</>}
          </p>
        )}

        <div>
          <h2 className="text-base font-bold text-gray-900 leading-snug">{consulta.asunto}</h2>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{consulta.mensaje}</p>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Estado:</span>
            <EstatusSelector consultaId={consulta.id} estatus={consulta.estatus ?? 'pendiente'} />
          </div>

          {esGestor && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[0.78rem] font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar consulta
            </button>
          )}
        </div>

        <div className="border-t border-gray-100" />

        <ComentariosSection consultaId={consulta.id} />
      </div>
    </Modal>
  )
}

function NuevaConsultaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [contactoId, setContactoId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTel, setClienteTel] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')

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
    mutationFn: () => api.post('/consultas', {
      clienteNombre: clienteNombre.trim(),
      clienteTel: clienteTel.trim() || undefined,
      clienteEmail: clienteEmail.trim() || undefined,
      contactoId: contactoId || undefined,
      asunto: asunto.trim(),
      mensaje: mensaje.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] })
      toast.success('Consulta registrada')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo registrar la consulta')
    },
  })

  const puedeGuardar = clienteNombre.trim() && asunto.trim() && mensaje.trim()

  return (
    <Modal isOpen onClose={onClose} title="Nueva consulta" size="md">
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
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asunto</label>
          <input value={asunto} onChange={(e) => setAsunto(e.target.value)}
            className="field" placeholder="Breve descripción del asunto" maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Mensaje</label>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)}
            rows={5} className="field resize-none" placeholder="Detalle de la consulta del cliente..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>
            Registrar consulta
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConsultaCard({
  consulta, esGestor, destacada, onClick,
}: {
  consulta: Consulta; esGestor: boolean; destacada: boolean; onClick: () => void
}) {
  const cfg = ESTATUSES[consulta.estatus] ?? ESTATUSES['pendiente']

  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex h-full flex-col rounded-2xl border bg-white shadow-sm p-5 gap-3 transition-all cursor-pointer hover:shadow-md hover:border-teal-400',
        destacada ? 'border-teal-500 ring-2 ring-teal-200' : 'border-gray-200/60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-100">
            <Headset className="h-4 w-4 text-teal-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{consulta.asunto}</h3>
            <p className="text-[0.72rem] text-teal-600 font-medium mt-0.5 truncate">{consulta.clienteNombre}</p>
            {esGestor && consulta.usuarioNombre && (
              <p className="text-[0.68rem] text-gray-400 truncate">por {consulta.usuarioNombre}</p>
            )}
          </div>
        </div>
        <span className={clsx('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', cfg.bg, cfg.text, cfg.border)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
          {cfg.label}
        </span>
      </div>

      <p className="flex-1 text-sm text-gray-500 leading-relaxed line-clamp-3">{consulta.mensaje}</p>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {consulta.fecha ? (
          <div className="flex items-center gap-1.5 text-[0.68rem] text-gray-400">
            <Clock className="h-3 w-3" />
            {fmtFecha(consulta.fecha)}
          </div>
        ) : <div />}

        <span className="flex items-center gap-1 text-[0.72rem] text-teal-600 font-medium">
          <MessageCircle className="h-3.5 w-3.5" />
          Ver detalle
        </span>
      </div>
    </div>
  )
}

export function ConsultasPage() {
  const navigate = useNavigate()
  const { can, isLoading: loadingAccess } = useActionAccess()
  const puedeCrear = can('atencion-cliente', 'crear-consulta')
  const esGestor = can('atencion-cliente', 'gestionar-consultas')
  const [showNueva, setShowNueva] = useState(false)
  const [consultaDetalleId, setConsultaDetalleId] = useState<number | null>(null)
  const qc = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const consultaIdDestacada = searchParams.get('consultaId') ? Number(searchParams.get('consultaId')) : null
  const today = localDateStr()
  const [desde, setDesde] = useState(searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? today)
  const [filtroNombre, setFiltroNombre] = useState(searchParams.get('nombre') ?? '')
  const [filtroCliente, setFiltroCliente] = useState(searchParams.get('cliente') ?? '')

  useSocketEvent<{ consultaId: number; estatus: string }>('consulta:estatus', () => {
    qc.invalidateQueries({ queryKey: ['consultas'] })
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

  const { data: consultas = [], isLoading, error } = useQuery<Consulta[]>({
    queryKey: ['consultas', esGestor, searchParams.toString()],
    queryFn: async () => {
      const { data } = await api.get('/consultas', { params: esGestor ? params : undefined })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    enabled: !loadingAccess,
    staleTime: 30_000,
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/consultas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas'] })
      toast.success('Consulta eliminada')
    },
    onError: () => toast.error('Error al eliminar consulta'),
  })

  const hayFiltrosExtra = Boolean(desde || filtroNombre || filtroCliente)

  const consultaDetalle = consultaDetalleId != null
    ? (consultas.find((c) => c.id === consultaDetalleId) ?? null)
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
            backgroundImage: 'linear-gradient(90deg, #0D3B3E 0%, #0F766E 25%, #2DD4BF 50%, #0F766E 75%, #0D3B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Headset className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Consultas de Clientes</h1>
                <p className="mt-0.5 text-xs text-teal-100/80">
                  {esGestor ? `${consultas.length} consultas encontradas` : `${consultas.length} mis consultas`}
                </p>
              </div>
            </div>
            {puedeCrear && (
              <Button onClick={() => setShowNueva(true)}
                className="bg-white !text-teal-700 hover:bg-teal-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Nueva consulta
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
        <span className="text-[0.68rem] text-gray-400 italic ml-1">· Haz clic en una consulta para ver el detalle y cambiar su estado</span>
      </div>

      {/* Filtros — solo gestores */}
      {esGestor && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Agente</label>
            <input type="text" placeholder="Buscar por agente..." value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Cliente</label>
            <input type="text" placeholder="Buscar por cliente..." value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <Button onClick={aplicarFiltros} className="!bg-teal-600 hover:!bg-teal-700 !shadow-none border-0 text-[0.78rem]">
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
          <p className="text-sm">Error al cargar consultas</p>
        </div>
      ) : consultas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50">
            <Headset className="h-7 w-7 text-teal-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">
              {esGestor ? 'Sin consultas en este período' : 'No tienes consultas registradas'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {esGestor ? 'Ajusta los filtros para ver más resultados.' : puedeCrear ? 'Usa el botón para registrar una nueva consulta.' : 'No hay consultas por revisar.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.72rem] text-gray-400">{consultas.length} {consultas.length === 1 ? 'consulta' : 'consultas'} · haz clic en una para ver el detalle</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {consultas.map((c) => (
              <ConsultaCard
                key={c.id}
                consulta={c}
                esGestor={esGestor}
                destacada={consultaIdDestacada === c.id}
                onClick={() => setConsultaDetalleId(c.id)}
              />
            ))}
          </div>
        </div>
      )}

      {showNueva && <NuevaConsultaModal onClose={() => setShowNueva(false)} />}

      {consultaDetalle && (
        <ConsultaDetalleModal
          consulta={consultaDetalle}
          esGestor={esGestor}
          onClose={() => setConsultaDetalleId(null)}
          onDelete={(id) => { eliminar.mutate(id); setConsultaDetalleId(null) }}
        />
      )}
    </div>
  )
}
