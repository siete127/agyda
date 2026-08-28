import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Calendar, Gift, Plus, Trash2, Clock, AlertTriangle, UserX, Timer, Loader2 } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface UsuarioMencion {
  id: number
  nombre: string
}

async function listarUsuariosParaMencion(excluirId?: number): Promise<UsuarioMencion[]> {
  const { data } = await api.get('/usuarios')
  const list = Array.isArray(data) ? data : (data?.data ?? [])
  return (list as Record<string, unknown>[])
    .map((u) => ({ id: Number(u.id), nombre: String(u.nombre ?? '') }))
    .filter((u) => u.nombre && u.id !== excluirId)
}

/* ── Textarea con autocompletado @menciones (excluye al propio usuario) ── */
function MencionesTextarea({
  value, onChange, placeholder, rows = 2,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const user = useAuthStore((s) => s.user)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mencionQuery, setMencionQuery] = useState<string | null>(null)
  const [mencionStart, setMencionStart] = useState<number | null>(null)

  const { data: usuarios = [] } = useQuery({
    queryKey: ['calendario-usuarios-mencion'],
    queryFn: () => listarUsuariosParaMencion(user?.id),
    enabled: mencionQuery !== null,
    staleTime: 60_000,
  })

  const sugerencias = useMemo(() => {
    if (mencionQuery === null) return []
    const q = mencionQuery.toLowerCase()
    return usuarios.filter((u) => u.nombre.toLowerCase().includes(q)).slice(0, 6)
  }, [usuarios, mencionQuery])

  const detectarMencion = (texto: string, cursorPos: number) => {
    const antesDeCursor = texto.slice(0, cursorPos)
    const match = antesDeCursor.match(/@([a-zA-Z0-9._-]*)$/)
    if (match) {
      setMencionQuery(match[1])
      setMencionStart(cursorPos - match[0].length)
    } else {
      setMencionQuery(null)
      setMencionStart(null)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    detectarMencion(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  const insertarMencion = (nombre: string) => {
    if (mencionStart === null || !textareaRef.current) return
    const cursorPos = textareaRef.current.selectionStart ?? value.length
    const antes = value.slice(0, mencionStart)
    const despues = value.slice(cursorPos)
    const nuevoValor = `${antes}@${nombre} ${despues}`
    onChange(nuevoValor)
    setMencionQuery(null)
    setMencionStart(null)
    requestAnimationFrame(() => {
      const nuevaPos = antes.length + nombre.length + 2
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nuevaPos, nuevaPos)
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyUp={(e) => detectarMencion(value, e.currentTarget.selectionStart ?? value.length)}
        onBlur={() => setTimeout(() => { setMencionQuery(null); setMencionStart(null) }, 150)}
        rows={rows}
        className="field resize-none"
        placeholder={placeholder}
      />
      {mencionQuery !== null && sugerencias.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-card shadow-lg">
          {sugerencias.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertarMencion(u.nombre) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[0.65rem] font-bold text-brand">
                {u.nombre.charAt(0).toUpperCase()}
              </span>
              {u.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface AsistenciaEntrada {
  usuarioId: number
  nombre: string
  rol: string
  horaEntrada: string
  horaEsperada: string
  minutosRetardo: number
}

interface AsistenciaFalta {
  usuarioId: number
  nombre: string
  rol: string
}

interface ResumenDia {
  retardos: AsistenciaEntrada[]
  faltas: AsistenciaFalta[]
}

const ROLES_LABEL: Record<string, string> = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center' }

const ROL_PILL: Record<string, string> = {
  CC: 'bg-blue-50 text-blue-700 border-blue-200',
  AD: 'bg-violet-50 text-violet-700 border-violet-200',
  TI: 'bg-amber-50 text-amber-700 border-amber-200',
}

/* ── Panel de asistencia del día (retardos + faltas) — solo AD/TI ── */
function ResumenDiaPanel({ fecha }: { fecha: string }) {
  const { data, isLoading } = useQuery<ResumenDia>({
    queryKey: ['asistencia-resumen-dia', fecha],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/resumen-dia', { params: { fecha } })
      return { retardos: data.retardos ?? [], faltas: data.faltas ?? [] }
    },
    staleTime: 60_000,
  })

  const retardos = data?.retardos ?? []
  const faltas   = data?.faltas ?? []
  const hayDatos = retardos.length > 0 || faltas.length > 0

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[0.78rem] font-bold text-gray-700">
          <Clock className="h-3.5 w-3.5 text-brand" />
          Asistencia del día
        </h3>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        {!isLoading && (
          <div className="flex items-center gap-2">
            {retardos.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-600">
                {retardos.length} retardo{retardos.length !== 1 ? 's' : ''}
              </span>
            )}
            {faltas.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.62rem] font-semibold text-red-600">
                {faltas.length} falta{faltas.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-gray-400 text-xs">Cargando...</div>
      ) : !hayDatos ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-gray-400">
          <Clock className="h-5 w-5 text-gray-300" />
          <p className="text-[0.72rem]">Sin incidencias registradas</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {/* Retardos */}
          {retardos.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50/60 border-b border-amber-100">
                <Timer className="h-3 w-3 text-amber-500" />
                <span className="text-[0.65rem] font-bold text-amber-600 uppercase tracking-wider">Retardos</span>
              </div>
              <div className="divide-y divide-gray-50">
                {retardos.map((r) => (
                  <div key={r.usuarioId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 border border-amber-200">
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.75rem] font-semibold text-gray-800 truncate">{r.nombre}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={clsx('inline-flex items-center rounded-full border px-1.5 py-px text-[0.58rem] font-bold', ROL_PILL[r.rol] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                          {ROLES_LABEL[r.rol] ?? r.rol}
                        </span>
                        <span className="font-mono text-[0.68rem] text-amber-600 font-semibold tabular-nums">{r.horaEntrada}</span>
                        <span className="text-[0.62rem] text-gray-400">·</span>
                        <span className="text-[0.65rem] text-amber-600 font-semibold">{r.minutosRetardo} min tarde</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Faltas */}
          {faltas.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 py-2 bg-red-50/60 border-b border-red-100">
                <UserX className="h-3 w-3 text-red-500" />
                <span className="text-[0.65rem] font-bold text-red-600 uppercase tracking-wider">Faltas</span>
              </div>
              <div className="divide-y divide-gray-50">
                {faltas.map((f) => (
                  <div key={f.usuarioId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-100 border border-red-200">
                      <UserX className="h-3 w-3 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.75rem] font-semibold text-gray-800 truncate">{f.nombre}</p>
                      <span className={clsx('inline-flex items-center rounded-full border px-1.5 py-px text-[0.58rem] font-bold mt-0.5', ROL_PILL[f.rol] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                        {ROLES_LABEL[f.rol] ?? f.rol}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Evento {
  id: number
  titulo: string
  descripcion: string
  fechaInicio: string
  fechaFin: string
  tipoEvento: string
  color: string
}

const TIPO_COLORS: Record<string, string> = {
  reunion:      'bg-blue-100 text-blue-700 border-blue-200',
  festivo:      'bg-red-100 text-red-700 border-red-200',
  capacitacion: 'bg-purple-100 text-purple-700 border-purple-200',
  otro:         'bg-gray-100 text-gray-700 border-gray-200',
}

const DAYS   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function parseEvento(r: Record<string, unknown>): Evento {
  return {
    id: Number(r['id_evento'] ?? r['ID_EVENTO'] ?? r['id'] ?? r['ID'] ?? 0),
    titulo: String(r['titulo'] ?? r['TITULO'] ?? r['title'] ?? r['nombre'] ?? ''),
    descripcion: String(r['descripcion'] ?? r['DESCRIPCION'] ?? r['description'] ?? ''),
    fechaInicio: String(r['fechaInicio'] ?? r['FECHA_INICIO'] ?? r['fecha_inicio'] ?? r['start'] ?? r['fecha'] ?? ''),
    fechaFin: String(r['fechaFin'] ?? r['FECHA_FIN'] ?? r['fecha_fin'] ?? r['end'] ?? r['fechaInicio'] ?? r['fecha'] ?? ''),
    tipoEvento: String(r['tipoEvento'] ?? r['TIPO_EVENTO'] ?? r['tipo'] ?? r['type'] ?? 'otro').toLowerCase(),
    color: String(r['color'] ?? r['COLOR'] ?? '#1565C0'),
  }
}

/* ── Modal nuevo evento ── */
function NuevoEventoModal({ fecha, onClose }: { fecha: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fechaInicio: `${fecha}T09:00`,
    fechaFin: `${fecha}T10:00`,
    tipoEvento: 'reunion',
  })
  const [tipoPersonalizado, setTipoPersonalizado] = useState('')
  const usaTipoPersonalizado = form.tipoEvento === '__custom__'
  const tipoFinal = usaTipoPersonalizado ? tipoPersonalizado.trim().toLowerCase() : form.tipoEvento

  const crear = useMutation({
    mutationFn: () => api.post('/calendario', {
      titulo: form.titulo,
      descripcion: form.descripcion,
      fecha_inicio: form.fechaInicio,
      fecha_fin: form.fechaFin,
      tipo_evento: tipoFinal,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendario'] })
      toast.success('Evento creado')
      onClose()
    },
    onError: () => toast.error('Error al crear evento'),
  })

  const puedeCrear = form.titulo.trim() && (!usaTipoPersonalizado || tipoPersonalizado.trim())

  return (
    <Modal isOpen onClose={onClose} title="Nuevo evento" size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="field"
            placeholder="Nombre del evento"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
          <select value={form.tipoEvento} onChange={(e) => setForm({ ...form, tipoEvento: e.target.value })} className="field">
            <option value="reunion">Reunión</option>
            <option value="festivo">Festivo</option>
            <option value="capacitacion">Capacitación</option>
            <option value="otro">Otro</option>
            <option value="__custom__">+ Nuevo tipo...</option>
          </select>
          {usaTipoPersonalizado && (
            <input
              value={tipoPersonalizado}
              onChange={(e) => setTipoPersonalizado(e.target.value)}
              className="field mt-2"
              placeholder="Escribe el nombre del nuevo tipo"
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Inicio</label>
            <input type="datetime-local" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fin</label>
            <input type="datetime-local" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} className="field" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <MencionesTextarea
            value={form.descripcion}
            onChange={(v) => setForm({ ...form, descripcion: v })}
            placeholder="Opcional — escribe @ para mencionar a alguien"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>
            Crear evento
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function CalendarioPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<number | null>(null)
  const qc = useQueryClient()

  const user = useAuthStore((s) => s.user)
  const isTI = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['calendario', year, month],
    queryFn: async () => {
      const { data } = await api.get('/calendario', { params: { mes: month + 1, anio: year } })
      const list = Array.isArray(data) ? data : (data?.data ?? data?.eventos ?? [])
      return (list as Record<string, unknown>[]).map(parseEvento)
    },
  })

  // Resumen mensual de asistencia — solo para AD/TI
  const { data: resumenMes } = useQuery<{
    retardos: { dia: number; total: number }[]
    faltas: { dia: number; total: number }[]
  }>({
    queryKey: ['asistencia-resumen-mes', year, month],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/resumen-mes', { params: { mes: month + 1, anio: year } })
      return { retardos: data.retardos ?? [], faltas: data.faltas ?? [] }
    },
    enabled: isTI,
    staleTime: 60_000,
  })

  const diasConRetardo = new Set((resumenMes?.retardos ?? []).map((r) => r.dia))
  const diasConFalta   = new Set((resumenMes?.faltas   ?? []).map((f) => f.dia))

  const { data: cumpleanos = [] } = useQuery({
    queryKey: ['cumpleanos', year, month],
    queryFn: async () => {
      const { data } = await api.get('/calendario/cumpleanos-mes', { params: { mes: month + 1, anio: year } })
      const list = Array.isArray(data) ? data : (data?.cumpleanos ?? data?.data ?? [])
      return list as { nombre: string; fecha_cumpleanos: string; dia_cumpleanos: number }[]
    },
  })

  const eliminarEvento = useMutation({
    mutationFn: (id: number) => api.delete(`/calendario/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendario'] }); toast.success('Evento eliminado') },
    onError: () => toast.error('Error al eliminar evento'),
  })

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const eventsByDay = (day: number) =>
    eventos.filter((e) => {
      // Parsear solo la parte YYYY-MM-DD para evitar desfase UTC
      const [y, m, d] = (e.fechaInicio || '').split('T')[0].split('-').map(Number)
      return y === year && m - 1 === month && d === day
    })

  const selectedEvents = selectedDay ? eventsByDay(selectedDay) : []

  const selectedFecha = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Calendario</h1>
                <p className="mt-0.5 text-xs text-white/50">Eventos y actividades del equipo</p>
              </div>
            </div>
            {isTI && (
              <Button
                onClick={() => setShowModal(true)}
                className="bg-card !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3"
              >
                <Plus className="h-3.5 w-3.5" /> Nuevo evento
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── Calendario ── */}
        <div className="lg:col-span-2 card p-5">
          {/* Navegación mes */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-[0.9rem] font-bold text-gray-800">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Cabecera días */}
          <div className="grid grid-cols-7 gap-2.5 mb-2">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wide py-1">{d}</div>
            ))}
          </div>

          {/* Grid días */}
          {isLoading ? (
            <div className="grid grid-cols-7 gap-2.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-[72px] rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2.5">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const evts = eventsByDay(day)
                const isToday    = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
                const isSelected = day === selectedDay
                const hayEventos = evts.length > 0
                const hayIncidencia = isTI && (diasConRetardo.has(day) || diasConFalta.has(day))

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={clsx(
                      'relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-1.5 py-2.5 text-left transition-all duration-150',
                      isSelected && !isToday && 'border-brand bg-brand text-white',
                      isToday && !isSelected && 'border-brand bg-brand/10',
                      isToday && isSelected && 'border-brand bg-brand text-white',
                      !isToday && !isSelected && (hayEventos ? 'border-blue-200 bg-blue-50 hover:border-brand/50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'),
                    )}
                  >
                    <span className={clsx(
                      'text-[0.82rem] font-bold',
                      isSelected ? 'text-white' : isToday ? 'text-brand' : hayEventos ? 'text-blue-700' : 'text-gray-500',
                    )}>
                      {day}
                    </span>
                    {evts.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {evts.slice(0, 3).map((e) => (
                          <span key={e.id} className={clsx('block h-2 w-2 rounded-full', isSelected ? 'bg-card' : 'bg-brand')} />
                        ))}
                        {evts.length > 3 && (
                          <span className={clsx('text-[9px] font-bold', isSelected ? 'text-white' : 'text-brand')}>
                            +{evts.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Puntos de incidencias de asistencia — solo para AD/TI */}
                    {hayIncidencia && (
                      <div className="flex items-center justify-center gap-1">
                        {diasConRetardo.has(day) && (
                          <span className={clsx('block h-2 w-2 rounded-full', isSelected ? 'bg-card' : 'bg-amber-500')} title="Retardos" />
                        )}
                        {diasConFalta.has(day) && (
                          <span className={clsx('block h-2 w-2 rounded-full', isSelected ? 'bg-card' : 'bg-red-500')} title="Faltas" />
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Panel lateral ── */}
        <div className="space-y-3">

          {/* Sin día seleccionado: invitar a elegir uno */}
          {!selectedDay && (
            <div className="card flex flex-col items-center justify-center gap-2 p-5 text-center">
              <Calendar className="h-6 w-6 text-gray-300" />
              <p className="text-[0.75rem] text-gray-400">Selecciona un día del calendario para ver sus eventos</p>
            </div>
          )}

          {/* Eventos del día seleccionado */}
          {selectedDay && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2 text-[0.82rem] font-bold text-gray-800">
                  <Calendar className="h-4 w-4 text-brand" />
                  {selectedDay} de {MONTHS[month]}
                </h3>
                {isTI && (
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] font-semibold text-brand hover:bg-brand/8 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Agregar
                  </button>
                )}
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-[0.75rem] text-gray-400 py-2">Sin eventos este día</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e) => (
                    <div key={e.id} className={clsx('rounded-xl border px-3 py-2.5 group relative', TIPO_COLORS[e.tipoEvento] ?? TIPO_COLORS['otro'])}>
                      <p className="text-[0.78rem] font-semibold pr-5">{e.titulo}</p>
                      {e.descripcion && <p className="text-[0.7rem] mt-0.5 opacity-80">{e.descripcion}</p>}
                      {isTI && (
                        <button
                          onClick={() => setConfirmEliminar(e.id)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-1 hover:bg-black/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Asistencia del día — solo AD/TI, cuando hay un día seleccionado */}
          {isTI && selectedDay && (
            <ResumenDiaPanel fecha={selectedFecha} />
          )}

          {/* Cumpleaños del mes */}
          {cumpleanos.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-[0.82rem] font-bold text-gray-800">
                <Gift className="h-4 w-4 text-yellow-500" />
                Cumpleaños de {MONTHS[month]}
              </h3>
              <div className="space-y-2">
                {cumpleanos.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-yellow-700 text-[0.65rem] font-bold">{c.dia_cumpleanos}</span>
                    </div>
                    <p className="text-[0.78rem] text-gray-700">{c.nombre}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leyenda */}
          <div className="card p-4">
            <h3 className="text-[0.72rem] font-bold text-gray-600 uppercase tracking-widest mb-3">Tipos de evento</h3>
            <div className="space-y-1.5">
              {Object.entries(TIPO_COLORS).map(([tipo, cls]) => (
                <div key={tipo} className={clsx('rounded-xl border-2 px-2.5 py-1.5 text-[0.72rem] font-bold capitalize', cls)}>
                  {tipo}
                </div>
              ))}
              {isTI && (
                <>
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-[0.65rem] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Asistencia</p>
                    <div className="flex items-center gap-2">
                      <span className="block h-2.5 w-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="text-[0.72rem] font-medium text-gray-700">Retardo</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="block h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-[0.72rem] font-medium text-gray-700">Falta</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <NuevoEventoModal
          fecha={selectedFecha}
          onClose={() => setShowModal(false)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar !== null) eliminarEvento.mutate(confirmEliminar) }}
        title="Eliminar evento"
        message="¿Seguro que deseas eliminar este evento del calendario?"
        confirmLabel="Eliminar"
        isPending={eliminarEvento.isPending}
      />
    </div>
  )
}
