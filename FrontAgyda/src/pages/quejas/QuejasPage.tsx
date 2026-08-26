import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  MessageSquareWarning, Plus, Trash2, Clock, AlertCircle,
  BarChart2, Search, X, ChevronDown, MessageCircle, Send,
  ShieldCheck, Lock,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSocketEvent } from '@/hooks/useSocket'

interface Queja {
  id: number
  usuarioId?: number
  usuarioNombre?: string
  usuarioRol?: string
  titulo: string
  descripcion: string
  fecha?: string
  estatus: string
}

interface Comentario {
  id: number
  quejaId: number
  usuarioId: number
  autorNombre: string
  contenido: string
  fecha: string
}

const ROLES_LABEL: Record<string, string> = {
  AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', CL: 'Clientes',
}

const ROLES_FILTRO = [
  { value: '', label: 'Todos los roles' },
  { value: 'AD', label: 'Administración' },
  { value: 'TI', label: 'Tecnología' },
  { value: 'CC', label: 'Call Center' },
]

const SUPERVISORES = ['ADM_0002', 'ADM_0004']
const SUPERVISORES_IDS = [2, 43]
// Solo estos pueden VER acciones correctivas
const LECTORES_AC = ['ADM_0001', 'ADM_0002']

const ESTATUSES: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pendiente: { label: 'Pendiente',  bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  proceso:   { label: 'En proceso', bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  terminada: { label: 'Terminada',  bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
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

function EstatusSelector({ quejaId, estatus }: { quejaId: number; estatus: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const cfg = ESTATUSES[estatus] ?? ESTATUSES['pendiente']

  const cambiar = useMutation({
    mutationFn: (nuevoEstatus: string) => api.patch(`/quejas/${quejaId}/estatus`, { estatus: nuevoEstatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quejas'] })
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

function ComentariosSection({ quejaId, usuarioId }: { quejaId: number; usuarioId: number }) {
  const [texto, setTexto] = useState('')
  const qc = useQueryClient()

  const { data: comentarios = [], isLoading } = useQuery<Comentario[]>({
    queryKey: ['queja-comentarios', quejaId],
    queryFn: async () => {
      const { data } = await api.get(`/quejas/${quejaId}/comentarios`)
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  useSocketEvent<{ quejaId: number; comentario: Comentario }>('queja:comentario', (payload) => {
    if (payload.quejaId === quejaId) {
      qc.invalidateQueries({ queryKey: ['queja-comentarios', quejaId] })
    }
  })

  const agregar = useMutation({
    mutationFn: () => api.post(`/quejas/${quejaId}/comentarios`, { usuarioId, contenido: texto.trim() }),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['queja-comentarios', quejaId] })
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
          {[1,2].map(i => <div key={i} className="h-8 rounded-lg bg-gray-100 animate-pulse" />)}
        </div>
      ) : comentarios.length === 0 ? (
        <p className="text-[0.72rem] text-gray-400 text-center py-3 bg-gray-50 rounded-xl">Sin comentarios aún</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {comentarios.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-[0.65rem] font-bold text-orange-600">
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
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

interface AccionCorrectiva {
  id: number
  quejaId: number
  redactorNombre: string
  descripcion: string
  responsable: string
  fechaCompromiso: string
  estadoAc: 'pendiente' | 'aplicada' | 'verificada'
  fechaRegistro: string
}

const ESTADOS_AC: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  aplicada:   { label: 'Aplicada',   color: 'bg-blue-100 text-blue-700 border-blue-200' },
  verificada: { label: 'Verificada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

interface UsuarioItem { id: number; nombre: string }

function ResponsableAutocomplete({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: usuarios = [] } = useQuery<UsuarioItem[]>({
    queryKey: ['usuarios-lista'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return list
        .filter((u: { activo?: number | boolean }) => u.activo === 1 || u.activo === true)
        .map((u: { id: number; nombre: string }) => ({ id: u.id, nombre: u.nombre }))
    },
    staleTime: 300_000,
  })

  const filtrados = value.trim().length > 0
    ? usuarios.filter((u) => u.nombre.toLowerCase().includes(value.toLowerCase()))
    : []

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="field text-sm w-full"
        placeholder="Nombre del responsable"
        autoComplete="off"
      />
      {open && filtrados.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtrados.slice(0, 8).map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(u.nombre); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-orange-50 transition-colors text-gray-700"
            >
              {u.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AccionCorrectivaSection({
  quejaId, esSupervisor, puedeVerAC,
}: { quejaId: number; esSupervisor: boolean; puedeVerAC: boolean }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    descripcion: '', responsable: '', fechaCompromiso: '', estadoAc: 'pendiente',
  })
  const [confirmado, setConfirmado] = useState(false)

  const { data: ac, isLoading } = useQuery<AccionCorrectiva | null>({
    queryKey: ['queja-ac', quejaId],
    queryFn: async () => {
      const { data } = await api.get(`/quejas/${quejaId}/accion-correctiva`)
      return data?.data ?? null
    },
    enabled: puedeVerAC || esSupervisor,
    staleTime: 60_000,
  })

  const guardar = useMutation({
    mutationFn: () => api.post(`/quejas/${quejaId}/accion-correctiva`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queja-ac', quejaId] })
      toast.success('Acción correctiva registrada')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Error al guardar')
    },
  })

  // Nadie más puede ver esta sección
  if (!puedeVerAC && !esSupervisor) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <ShieldCheck className="h-4 w-4 text-rose-500" />
        <p className="text-[0.72rem] font-bold text-rose-600 uppercase tracking-wide">Acción Correctiva</p>
        <Lock className="h-3 w-3 text-rose-300 ml-1" aria-label="Solo visible para ADM_0001 y ADM_0002" />
      </div>

      {isLoading ? (
        <div className="h-16 rounded-xl bg-gray-100 animate-pulse" />
      ) : ac ? (
        // ── Vista de solo lectura (ya guardado) ──
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[0.72rem] font-semibold text-rose-700">
              Redactado por <span className="font-bold">{ac.redactorNombre}</span>
            </span>
            <span className={clsx('rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold', ESTADOS_AC[ac.estadoAc]?.color)}>
              {ESTADOS_AC[ac.estadoAc]?.label ?? ac.estadoAc}
            </span>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold text-rose-400 uppercase tracking-wide mb-0.5">Descripción de la acción</p>
            <p className="text-[0.82rem] text-gray-700 leading-relaxed whitespace-pre-wrap">{ac.descripcion}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[0.78rem]">
            <div>
              <p className="text-[0.65rem] font-semibold text-rose-400 uppercase tracking-wide mb-0.5">Responsable</p>
              <p className="text-gray-700 font-medium">{ac.responsable}</p>
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold text-rose-400 uppercase tracking-wide mb-0.5">Fecha compromiso</p>
              <p className="text-gray-700 font-medium">{fmtFecha(ac.fechaCompromiso)}</p>
            </div>
          </div>
          <p className="text-[0.62rem] text-rose-300">Registrado el {fmtHora(ac.fechaRegistro)} · No editable</p>
        </div>
      ) : esSupervisor ? (
        // ── Formulario de captura (solo supervisor, una vez) ──
        <div className="rounded-xl border border-rose-200 bg-white px-4 py-4 space-y-3">
          <p className="text-[0.72rem] text-rose-500 font-semibold">
            Redacta la acción correctiva. Una vez guardada <span className="underline">no podrá ser modificada</span>.
          </p>
          <div>
            <label className="mb-1 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide">Descripción de la acción tomada *</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              rows={3}
              className="field resize-none text-sm"
              placeholder="Describe detalladamente la acción correctiva aplicada..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide">Responsable *</label>
              <ResponsableAutocomplete
                value={form.responsable}
                onChange={(v) => setForm((f) => ({ ...f, responsable: v }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide">Fecha compromiso *</label>
              <input
                type="date"
                value={form.fechaCompromiso}
                onChange={(e) => setForm((f) => ({ ...f, fechaCompromiso: e.target.value }))}
                className="field text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide">Estado</label>
            <select
              value={form.estadoAc}
              onChange={(e) => setForm((f) => ({ ...f, estadoAc: e.target.value }))}
              className="field text-sm"
            >
              <option value="pendiente">Pendiente</option>
              <option value="aplicada">Aplicada</option>
              <option value="verificada">Verificada</option>
            </select>
          </div>
          {/* Confirmación antes de guardar */}
          {!confirmado ? (
            <button
              onClick={() => setConfirmado(true)}
              disabled={!form.descripcion.trim() || !form.responsable.trim() || !form.fechaCompromiso}
              className="w-full rounded-xl bg-rose-600 py-2 text-[0.82rem] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors"
            >
              <ShieldCheck className="inline h-3.5 w-3.5 mr-1.5" />
              Registrar acción correctiva
            </button>
          ) : (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-3 space-y-2">
              <p className="text-[0.78rem] font-semibold text-rose-700">
                ⚠️ Una vez guardado, este informe no podrá ser editado ni eliminado. ¿Confirmas?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmado(false)}
                  className="flex-1 rounded-lg border border-gray-200 py-1.5 text-[0.78rem] text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => guardar.mutate()}
                  disabled={guardar.isPending}
                  className="flex-1 rounded-lg bg-rose-600 py-1.5 text-[0.78rem] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {guardar.isPending ? 'Guardando...' : 'Sí, guardar definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Lector AC sin informe aún
        <p className="text-[0.72rem] text-gray-400 italic px-1">Aún no se ha registrado una acción correctiva para esta queja.</p>
      )}
    </div>
  )
}

function QuejaDetalleModal({
  queja, rol, userId, esSupervisor, puedeEliminar, puedeVerAC, onClose, onDelete,
}: {
  queja: Queja; rol: string; userId: number; esSupervisor: boolean
  puedeEliminar: boolean; puedeVerAC: boolean; onClose: () => void; onDelete: (id: number) => void
}) {
  const isAD = rol === 'AD'
  const cfg = ESTATUSES[queja.estatus] ?? ESTATUSES['pendiente']

  function handleDelete() {
    onDelete(queja.id)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Detalle de queja" size="lg">
      <div className="space-y-5">
        {/* Info del autor (solo AD) */}
        {isAD && queja.usuarioNombre && (
          <div className="flex items-center gap-2 rounded-xl border border-orange-100 bg-orange-50 px-4 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
              <span className="text-[0.72rem] font-bold text-orange-600">
                {queja.usuarioNombre.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-orange-700">{queja.usuarioNombre}</p>
              {queja.usuarioRol && (
                <p className="text-[0.7rem] text-orange-500">{ROLES_LABEL[queja.usuarioRol] ?? queja.usuarioRol}</p>
              )}
            </div>
            {queja.fecha && (
              <div className="ml-auto flex items-center gap-1 text-[0.68rem] text-orange-400">
                <Clock className="h-3 w-3" />
                {fmtFecha(queja.fecha)}
              </div>
            )}
          </div>
        )}

        {/* Título + fecha (para no-AD) */}
        {!isAD && queja.fecha && (
          <div className="flex items-center gap-1.5 text-[0.72rem] text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            {fmtFecha(queja.fecha)}
          </div>
        )}

        {/* Título */}
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-snug">{queja.titulo}</h2>
        </div>

        {/* Descripción */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{queja.descripcion}</p>
        </div>

        {/* Estatus */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Estado:</span>
            {esSupervisor ? (
              <EstatusSelector quejaId={queja.id} estatus={queja.estatus ?? 'pendiente'} />
            ) : (
              <EstatusBadge estatus={queja.estatus ?? 'pendiente'} />
            )}
          </div>

          {puedeEliminar && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[0.78rem] font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar queja
            </button>
          )}
        </div>

        {esSupervisor && (
          <p className="text-[0.68rem] text-gray-400 italic">
            Haz clic en el estado para cambiar a Pendiente, En proceso o Terminada.
          </p>
        )}

        {/* Separador */}
        <div className="border-t border-gray-100" />

        {/* Comentarios */}
        <ComentariosSection quejaId={queja.id} usuarioId={userId} />

        {/* Acción Correctiva — solo supervisores y lectores AC */}
        {(esSupervisor || puedeVerAC) && (
          <AccionCorrectivaSection
            quejaId={queja.id}
            esSupervisor={esSupervisor}
            puedeVerAC={puedeVerAC}
          />
        )}
      </div>
    </Modal>
  )
}

function NuevaQuejaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const crear = useMutation({
    mutationFn: () =>
      api.post('/quejas', { usuarioId: user?.id, titulo: titulo.trim(), descripcion: descripcion.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quejas'] })
      toast.success('Queja enviada correctamente')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo enviar la queja')
    },
  })

  return (
    <Modal isOpen onClose={onClose} title="Nueva queja" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asunto</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
            className="field" placeholder="Breve descripción del asunto" autoFocus maxLength={120} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            rows={5} className="field resize-none" placeholder="Explica tu queja con detalle..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!titulo.trim() || !descripcion.trim()} onClick={() => crear.mutate()}>
            Enviar queja
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function QuejaCard({
  queja, rol, destacada, onClick,
}: {
  queja: Queja; rol: string; destacada: boolean; onClick: () => void
}) {
  const isAD = rol === 'AD'
  const cfg = ESTATUSES[queja.estatus] ?? ESTATUSES['pendiente']

  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex h-full flex-col rounded-2xl border bg-white shadow-sm p-5 gap-3 transition-all cursor-pointer hover:shadow-md hover:border-brand/40',
        destacada ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200/60'
      )}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <MessageSquareWarning className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{queja.titulo}</h3>
            {isAD && queja.usuarioNombre && (
              <p className="text-[0.72rem] text-brand font-medium mt-0.5 truncate">
                {queja.usuarioNombre}
                {queja.usuarioRol && (
                  <span className="ml-1.5 text-gray-400">· {ROLES_LABEL[queja.usuarioRol] ?? queja.usuarioRol}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <span className={clsx('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', cfg.bg, cfg.text, cfg.border)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
          {cfg.label}
        </span>
      </div>

      <p className="flex-1 text-sm text-gray-500 leading-relaxed line-clamp-3">{queja.descripcion}</p>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {queja.fecha ? (
          <div className="flex items-center gap-1.5 text-[0.68rem] text-gray-400">
            <Clock className="h-3 w-3" />
            {fmtFecha(queja.fecha)}
          </div>
        ) : <div />}

        <span className="flex items-center gap-1 text-[0.72rem] text-brand font-medium">
          <MessageCircle className="h-3.5 w-3.5" />
          Ver detalle
        </span>
      </div>
    </div>
  )
}

export function QuejasPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const rol = user?.tipoUsuario?.toUpperCase() ?? ''
  const isAD = rol === 'AD'
  const esSupervisor = Boolean(
    (user?.codigo && SUPERVISORES.includes(user.codigo)) ||
    (user?.id && SUPERVISORES_IDS.includes(user.id))
  )
  const puedeEliminar = user?.codigo === 'ADM_0002' || user?.id === 2
  const puedeVerAC = Boolean(user?.codigo && LECTORES_AC.includes(user.codigo))
  const puedeCrear = !isAD // todos los no-AD pueden crear quejas
  const [showNueva, setShowNueva] = useState(false)
  const [quejaDetalleId, setQuejaDetalleId] = useState<number | null>(null)
  const qc = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const quejaIdDestacada = searchParams.get('quejaId') ? Number(searchParams.get('quejaId')) : null
  const today = localDateStr()
  const [desde, setDesde] = useState(searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? today)
  const [filtroNombre, setFiltroNombre] = useState(searchParams.get('nombre') ?? '')
  const [filtroRol, setFiltroRol] = useState(searchParams.get('rol') ?? '')

  useSocketEvent<{ quejaId: number; estatus: string }>('queja:estatus', () => {
    qc.invalidateQueries({ queryKey: ['quejas'] })
  })

  function aplicarFiltros() {
    const p: Record<string, string> = {}
    if (desde) p.desde = desde
    if (hasta) p.hasta = hasta
    if (filtroNombre) p.nombre = filtroNombre
    if (filtroRol) p.rol = filtroRol
    setSearchParams(p)
  }

  function limpiarFiltros() {
    setDesde('')
    setHasta(today)
    setFiltroNombre('')
    setFiltroRol('')
    setSearchParams({})
  }

  const params = isAD ? {
    desde: searchParams.get('desde') || undefined,
    hasta: searchParams.get('hasta') || today,
    nombre: searchParams.get('nombre') || undefined,
    rol: searchParams.get('rol') || undefined,
  } : {}

  const { data: quejas = [], isLoading, error } = useQuery<Queja[]>({
    queryKey: ['quejas', rol, searchParams.toString()],
    queryFn: async () => {
      const headers: Record<string, string> = { tipousuario: rol }
      if (!isAD) headers['usuarioid'] = String(user?.id ?? '')
      const { data } = await api.get('/quejas', { headers, params: isAD ? params : undefined })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/quejas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quejas'] })
      toast.success('Queja eliminada')
    },
    onError: () => toast.error('Error al eliminar queja'),
  })

  const hayFiltrosExtra = Boolean(desde || filtroNombre || filtroRol)

  // queja activa derivada de la lista fresca — se actualiza automáticamente cuando el estado cambia
  const quejaDetalle = quejaDetalleId != null
    ? (quejas.find((q) => q.id === quejaDetalleId) ?? null)
    : null

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <MessageSquareWarning className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Centro de Quejas</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {isAD ? `${quejas.length} quejas encontradas` : `${quejas.length} mis quejas`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAD && (
                <Button onClick={() => navigate('/quejas/dashboard')}
                  className="bg-white/10 text-white hover:bg-white/20 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <BarChart2 className="h-3.5 w-3.5" /> Dashboard
                </Button>
              )}
              {puedeCrear && (
                <Button onClick={() => setShowNueva(true)}
                  className="bg-white !text-brand hover:bg-blue-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Plus className="h-3.5 w-3.5" /> Nueva queja
                </Button>
              )}
            </div>
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
        {esSupervisor && (
          <span className="text-[0.68rem] text-gray-400 italic ml-1">· Haz clic en una queja para cambiar su estado</span>
        )}
      </div>

      {/* Filtros AD */}
      {isAD && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Rol</label>
            <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
              {ROLES_FILTRO.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Nombre</label>
            <input type="text" placeholder="Buscar por nombre..." value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          <Button onClick={aplicarFiltros} className="!bg-brand hover:!bg-brand-dark !shadow-none border-0 text-[0.78rem]">
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
      {isLoading ? (
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
          <p className="text-sm">Error al cargar quejas</p>
        </div>
      ) : quejas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <MessageSquareWarning className="h-7 w-7 text-blue-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">
              {isAD ? 'Sin quejas en este período' : 'No tienes quejas registradas'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isAD ? 'Ajusta los filtros para ver más resultados.' : puedeCrear ? 'Usa el botón para enviar una nueva queja.' : 'No hay quejas por revisar.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.72rem] text-gray-400">{quejas.length} {quejas.length === 1 ? 'queja' : 'quejas'} · haz clic en una para ver el detalle</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quejas.map((q) => (
              <QuejaCard
                key={q.id}
                queja={q}
                rol={rol}
                destacada={quejaIdDestacada === q.id}
                onClick={() => setQuejaDetalleId(q.id)}
              />
            ))}
          </div>
        </div>
      )}

      {showNueva && <NuevaQuejaModal onClose={() => setShowNueva(false)} />}

      {quejaDetalle && (
        <QuejaDetalleModal
          queja={quejaDetalle}
          rol={rol}
          userId={user?.id ?? 0}
          esSupervisor={esSupervisor}
          puedeEliminar={puedeEliminar}
          puedeVerAC={puedeVerAC}
          onClose={() => setQuejaDetalleId(null)}
          onDelete={(id) => { eliminar.mutate(id); setQuejaDetalleId(null) }}
        />
      )}
    </div>
  )
}
