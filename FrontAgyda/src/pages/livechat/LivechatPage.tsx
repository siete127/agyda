import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, User, Users, UserCheck, Clock, CheckCircle2, Power, Loader2, Settings, ArrowRightLeft, History, Download, FileText, Megaphone } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { getSocket } from '@/lib/socket'
import { useCurrentUser } from '@/hooks/useAuth'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { LivechatConversacion, LivechatMensaje, LivechatConfig, LivechatHistorialFiltros } from '@/types/livechat.types'
import { parseLivechatMensaje } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { CampaniasModal } from './CampaniasModal'

const DIAS = [
  { valor: 1, label: 'Lun' },
  { valor: 2, label: 'Mar' },
  { valor: 3, label: 'Mié' },
  { valor: 4, label: 'Jue' },
  { valor: 5, label: 'Vie' },
  { valor: 6, label: 'Sáb' },
  { valor: 0, label: 'Dom' },
]

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

function HistorialModal({ onClose }: { onClose: () => void }) {
  const [filtros, setFiltros] = useState<LivechatHistorialFiltros>({})
  const [texto, setTexto] = useState('')

  const { data: historial = [], isLoading } = useQuery({
    queryKey: ['livechat-historial', filtros],
    queryFn: () => livechatService.getHistorial(filtros),
  })

  const exportar = useMutation({
    mutationFn: () => livechatService.exportHistorialCsv(filtros),
    onError: () => toast.error('No se pudo exportar el historial'),
  })

  const aplicarBusqueda = () => {
    setFiltros((prev) => ({ ...prev, texto: texto.trim() || undefined }))
  }

  return (
    <Modal isOpen onClose={onClose} title="Historial de conversaciones" size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Desde</label>
            <input
              type="date"
              value={filtros.fechaDesde ?? ''}
              onChange={(e) => setFiltros((prev) => ({ ...prev, fechaDesde: e.target.value || undefined }))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Hasta</label>
            <input
              type="date"
              value={filtros.fechaHasta ?? ''}
              onChange={(e) => setFiltros((prev) => ({ ...prev, fechaHasta: e.target.value || undefined }))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Buscar (nombre, email, motivo)</label>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarBusqueda()}
              placeholder="Buscar..."
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={aplicarBusqueda}>Buscar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setFiltros({}); setTexto('') }}>Limpiar</Button>
          <Button size="sm" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
            {exportar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar CSV
          </Button>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : historial.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">Sin conversaciones cerradas para estos filtros</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Visitante</th>
                    <th className="text-left px-4 py-2">Motivo</th>
                    <th className="text-left px-4 py-2">Agente</th>
                    <th className="text-left px-4 py-2">Inicio</th>
                    <th className="text-left px-4 py-2">Cierre</th>
                    <th className="text-left px-4 py-2">Motivo cierre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-800">{c.visitanteNombre || 'Anónimo'}</div>
                        <div className="text-xs text-gray-400">{c.visitanteEmail || c.visitanteTelefono || '—'}</div>
                      </td>
                      <td className="px-4 py-2 max-w-[200px] truncate text-gray-600">{c.motivo || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{c.agenteNombre || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatFecha(c.fechaInicio)}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatFecha(c.fechaCierre)}</td>
                      <td className="px-4 py-2 text-gray-500">{c.motivoCierre || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// Tiempo transcurrido desde que el visitante entró a la cola, en formato corto
// ("2 min", "1 h 05 min") — ayuda a un supervisor a ver de un vistazo quién
// lleva más tiempo esperando sin tener que restar fechas mentalmente.
function tiempoEsperando(iso: string): string {
  const inicio = new Date(iso).getTime()
  if (Number.isNaN(inicio)) return '—'
  const minutos = Math.max(0, Math.floor((Date.now() - inicio) / 60000))
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `${horas} h ${String(resto).padStart(2, '0')} min`
}

// Bandeja consolidada de TODOS los leads en espera (de cualquier agente, no
// solo los propios) — la lista lateral ya muestra "esperando" pero mezclada
// con las conversaciones propias y sin tanto detalle; esta vista es para ver
// de un vistazo si se está acumulando gente sin atender, y tomarla directo
// sin pasar primero por el detalle.
function BandejaEsperaModal({ onClose, onTomada }: { onClose: () => void; onTomada: (conversacionId: number) => void }) {
  const { data: esperando = [], isLoading, refetch } = useQuery({
    queryKey: ['livechat-bandeja-espera'],
    queryFn: () => livechatService.getMisConversaciones('esperando'),
    refetchInterval: 8_000,
  })

  const tomar = useMutation({
    mutationFn: (conversacionId: number) => livechatService.tomarConversacion(conversacionId),
    onSuccess: (_data, conversacionId) => {
      toast.success('Conversación tomada')
      refetch()
      onTomada(conversacionId)
      onClose()
    },
    onError: () => toast.error('No se pudo tomar la conversación (quizás ya fue asignada)'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Bandeja de espera" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Todos los leads que están en cola ahora mismo, sin importar a qué agente le toquen. Cualquiera puede tomarlos.
        </p>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : esperando.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">Nadie esperando ahora mismo</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Posición</th>
                    <th className="text-left px-4 py-2">Visitante</th>
                    <th className="text-left px-4 py-2">Motivo</th>
                    <th className="text-left px-4 py-2">Esperando</th>
                    <th className="text-right px-4 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {esperando.map((c) => (
                    <tr key={c.id} className={c.posicionCola === 1 ? 'bg-amber-50' : undefined}>
                      <td className="px-4 py-2 font-semibold text-gray-700">
                        {c.posicionCola ? `${c.posicionCola} de ${c.totalCola}` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-800">{c.visitanteNombre || 'Anónimo'}</div>
                        <div className="text-xs text-gray-400">{c.visitanteEmail || c.visitanteTelefono || '—'}</div>
                      </td>
                      <td className="px-4 py-2 max-w-[220px] truncate text-gray-600">{c.motivo || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {tiempoEsperando(c.fechaInicio)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" onClick={() => tomar.mutate(c.id)} disabled={tomar.isPending}>
                          Tomar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// Solo lectura — un supervisor/admin ve el contenido de conversaciones de
// CUALQUIER agente, no solo las propias (a diferencia del panel principal,
// que solo maneja "mis conversaciones"). Reusa GET /conversaciones/:id, que
// ya no filtra por dueño en el backend.
function SupervisionModal({ onClose }: { onClose: () => void }) {
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)

  const { data: conversaciones = [], isLoading } = useQuery({
    queryKey: ['livechat-supervision-activas'],
    queryFn: () => livechatService.getConversacionesActivasSupervision(),
    refetchInterval: 8_000,
  })

  const { data: detalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['livechat-supervision-detalle', seleccionadaId],
    queryFn: () => livechatService.getConversacion(seleccionadaId!),
    enabled: seleccionadaId != null,
    refetchInterval: 5_000,
  })

  return (
    <Modal isOpen onClose={onClose} title="Supervisión — conversaciones activas" size="xl">
      <div className="grid grid-cols-[1fr_1.4fr] gap-3" style={{ height: '65vh' }}>
        <div className="overflow-y-auto rounded-xl border border-gray-200">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : conversaciones.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No hay conversaciones activas ni en espera.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {conversaciones.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSeleccionadaId(c.id)}
                  className={clsx(
                    'block w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50',
                    seleccionadaId === c.id && 'bg-blue-50',
                  )}
                >
                  <p className="font-medium text-gray-800">{c.visitanteNombre || 'Visitante'}</p>
                  <p className="text-xs text-gray-500">
                    {c.agenteNombre ? `Atiende: ${c.agenteNombre}` : 'Sin agente asignado'} ·{' '}
                    <span className={clsx('font-semibold', c.estado === 'activa' ? 'text-emerald-600' : 'text-amber-600')}>
                      {c.estado === 'activa' ? 'Activa' : 'En espera'}
                    </span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-y-auto rounded-xl border border-gray-200 p-3">
          {seleccionadaId == null ? (
            <p className="py-10 text-center text-sm text-gray-400">Selecciona una conversación para ver los mensajes.</p>
          ) : loadingDetalle || !detalle ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <div className="space-y-2">
              {detalle.mensajes.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Sin mensajes todavía.</p>
              ) : (
                detalle.mensajes.map((m) => (
                  <div key={m.id} className={clsx('rounded-lg px-3 py-2 text-sm', m.emisor === 'agente' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8')}>
                    <p className="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500">{m.emisor}</p>
                    <p className="text-gray-800">{m.contenido}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function AgentesEstadoModal({ onClose }: { onClose: () => void }) {
  const { data: agentes = [], isLoading } = useQuery({
    queryKey: ['livechat-agentes-estado'],
    queryFn: () => livechatService.getAgentesEstado(),
    refetchInterval: 8_000,
  })

  return (
    <Modal isOpen onClose={onClose} title="Agentes de Chat en Vivo" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Solo los marcados como <span className="font-semibold text-emerald-600">Disponible</span> pueden recibir la
          siguiente conversación (bot escalando o cola liberándose).
        </p>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : agentes.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">Ningún agente ha usado Chat en Vivo todavía</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Agente</th>
                    <th className="text-left px-4 py-2">Estado</th>
                    <th className="text-left px-4 py-2">Chats activos</th>
                    <th className="text-left px-4 py-2">Última conexión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agentes.map((a) => {
                    const puedeRecibir = a.online && a.disponible
                    return (
                      <tr key={a.usuarioId}>
                        <td className="px-4 py-2 font-medium text-gray-800">{a.nombre}</td>
                        <td className="px-4 py-2">
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                              puedeRecibir
                                ? 'bg-emerald-50 text-emerald-700'
                                : a.online
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-100 text-gray-500',
                            )}
                          >
                            <span
                              className={clsx(
                                'h-1.5 w-1.5 rounded-full',
                                puedeRecibir ? 'bg-emerald-500' : a.online ? 'bg-amber-500' : 'bg-gray-400',
                              )}
                            />
                            {puedeRecibir ? 'Disponible' : a.online ? 'En línea, no disponible' : 'Desconectado'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{a.conversacionesActivas}</td>
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatFecha(a.ultimaConexion)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ConfigModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['livechat-config'],
    queryFn: () => livechatService.getConfig(),
  })

  const [form, setForm] = useState<Partial<LivechatConfig> | null>(null)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const diasSeleccionados = new Set(
    (form?.diasSemana ?? '').split(',').map((d) => Number(d.trim())).filter((d) => !Number.isNaN(d)),
  )

  const toggleDia = (dia: number) => {
    const next = new Set(diasSeleccionados)
    if (next.has(dia)) next.delete(dia)
    else next.add(dia)
    setForm((prev) => (prev ? { ...prev, diasSemana: Array.from(next).sort().join(',') } : prev))
  }

  const guardar = useMutation({
    mutationFn: () => livechatService.updateConfig(form ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-config'] })
      toast.success('Configuración guardada')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la configuración'),
  })

  if (isLoading || !form) {
    return (
      <Modal isOpen onClose={onClose} title="Configuración de Chat en Vivo">
        <div className="flex justify-center py-8"><Spinner /></div>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Configuración de Chat en Vivo" size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Horario inicio</label>
            <input
              type="time"
              value={form.horarioInicio ?? ''}
              onChange={(e) => setForm({ ...form, horarioInicio: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Horario fin</label>
            <input
              type="time"
              value={form.horarioFin ?? ''}
              onChange={(e) => setForm({ ...form, horarioFin: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Días de atención</label>
          <div className="flex gap-1.5 flex-wrap">
            {DIAS.map((d) => (
              <button
                key={d.valor}
                type="button"
                onClick={() => toggleDia(d.valor)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  diasSeleccionados.has(d.valor)
                    ? 'bg-brand text-white border-brand'
                    : 'bg-card text-gray-600 border-gray-200 hover:bg-gray-50',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {diasSeleccionados.has(6) && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3">
            <div className="col-span-2 -mb-1 text-xs font-semibold text-gray-500">
              Horario de Sábado (si se deja vacío, usa el horario general de arriba)
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Sábado inicio</label>
              <input
                type="time"
                value={form.sabadoHorarioInicio ?? ''}
                onChange={(e) => setForm({ ...form, sabadoHorarioInicio: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Sábado fin</label>
              <input
                type="time"
                value={form.sabadoHorarioFin ?? ''}
                onChange={(e) => setForm({ ...form, sabadoHorarioFin: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Máximo de chats simultáneos por agente</label>
          <input
            type="number"
            min={1}
            max={50}
            value={form.maxChatsPorAgente ?? 5}
            onChange={(e) => setForm({ ...form, maxChatsPorAgente: Number(e.target.value) })}
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Mensaje de bienvenida</label>
          <textarea
            value={form.mensajeBienvenida ?? ''}
            onChange={(e) => setForm({ ...form, mensajeBienvenida: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Mensaje fuera de horario</label>
          <textarea
            value={form.mensajeFueraHorario ?? ''}
            onChange={(e) => setForm({ ...form, mensajeFueraHorario: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Mensaje sin agentes disponibles</label>
          <textarea
            value={form.mensajeSinAgentes ?? ''}
            onChange={(e) => setForm({ ...form, mensajeSinAgentes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Mensaje en cola de espera
            <span className="normal-case font-normal text-gray-400 ml-1">
              (usa {'{posicion_cola}'}, {'{total_cola}'}, {'{tiempo_espera}'})
            </span>
          </label>
          <textarea
            value={form.mensajeEnCola ?? ''}
            onChange={(e) => setForm({ ...form, mensajeEnCola: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Beep corto sintetizado (Web Audio API, sin archivo de audio externo que
// mantener) para avisar de una conversación nueva sin que el agente tenga
// que estar viendo la pantalla. Los navegadores bloquean audio sin gesto
// previo del usuario; como esto solo suena después de que el agente ya
// interactuó con la página (togglear disponible, hacer clic, etc.), el
// contexto ya está desbloqueado en la práctica.
function reproducirAlertaNuevaConversacion() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const tono = (frecuencia: number, inicio: number, duracion: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frecuencia
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio)
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + inicio + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracion)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + inicio)
      osc.stop(ctx.currentTime + inicio + duracion + 0.02)
    }
    tono(880, 0, 0.12)
    tono(1175, 0.14, 0.16)
  } catch {
    // Silencioso: la alerta visual (toast) ya cubre el aviso si el audio falla.
  }
}

function formatHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // timeZone explícito: sin esto, la hora depende de cómo esté configurado
  // el sistema operativo/navegador de quien mire la pantalla, no de México.
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

function ConversacionItem({ conv, activa, onClick }: { conv: LivechatConversacion; activa: boolean; onClick: () => void }) {
  const esperando = conv.estado === 'esperando'
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3 border-b border-gray-100 transition-colors',
        activa ? 'bg-blue-50' : 'hover:bg-gray-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm text-gray-800 truncate">
          {conv.visitanteNombre || 'Visitante anónimo'}
        </span>
        {esperando && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
            <Clock size={11} />
            {conv.posicionCola ? `${conv.posicionCola} de ${conv.totalCola}` : 'Esperando'}
          </span>
        )}
      </div>
      {(conv.visitanteEmail || conv.visitanteTelefono) && (
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{conv.visitanteEmail || conv.visitanteTelefono}</p>
      )}
      <p className="text-xs text-gray-500 truncate mt-0.5">{conv.motivo || 'Sin motivo especificado'}</p>
      <p className="text-[11px] text-gray-400 mt-1">{formatHora(conv.fechaInicio)}</p>
    </button>
  )
}

function ChatPanel({ conversacionId, onCerrada }: { conversacionId: number; onCerrada: () => void }) {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const [mensajes, setMensajes] = useState<LivechatMensaje[]>([])
  const [conv, setConv] = useState<LivechatConversacion | null>(null)
  const [texto, setTexto] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['livechat-conversacion', conversacionId],
    queryFn: () => livechatService.getConversacion(conversacionId),
  })

  useEffect(() => {
    if (data) {
      setConv(data)
      setMensajes(data.mensajes)
    }
  }, [data])

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_livechat_conversation', { conversacionId })

    const onMensaje = (raw: Record<string, unknown>) => {
      const msg = parseLivechatMensaje(raw)
      if (msg.conversacionId !== conversacionId) return
      setMensajes((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    }
    const onTomada = (payload: { conversacionId: number; agenteNombre: string }) => {
      if (payload.conversacionId !== conversacionId) return
      setConv((prev) => (prev ? { ...prev, estado: 'activa', agenteNombre: payload.agenteNombre } : prev))
    }
    const onCerrar = (payload: { conversacionId: number }) => {
      if (payload.conversacionId !== conversacionId) return
      toast('La conversación fue cerrada', { icon: 'ℹ️' })
      onCerrada()
    }
    // El agente ya cerró (motivo elegido); ahora se espera a que el visitante
    // califique — la conversación desaparece del lado del agente igual que
    // un cierre normal (ya no cuenta contra su cupo), pero del lado del
    // visitante sigue "abierta" un momento más.
    const onPendienteCalificacion = (payload: { conversacionId: number }) => {
      if (payload.conversacionId !== conversacionId) return
      toast('Conversación cerrada, esperando calificación del visitante', { icon: '⭐' })
      onCerrada()
    }
    const onTransferida = (payload: { conversacionId: number; agenteNombre: string }) => {
      if (payload.conversacionId !== conversacionId) return
      toast(`Conversación transferida a ${payload.agenteNombre}`, { icon: '↪️' })
      onCerrada()
    }

    socket.on('receive_livechat_message', onMensaje)
    socket.on('livechat:conversacion_tomada', onTomada)
    socket.on('livechat:conversacion_cerrada', onCerrar)
    socket.on('livechat:pendiente_calificacion', onPendienteCalificacion)
    socket.on('livechat:conversacion_transferida', onTransferida)

    return () => {
      socket.emit('leave_livechat_conversation', { conversacionId })
      socket.off('receive_livechat_message', onMensaje)
      socket.off('livechat:conversacion_tomada', onTomada)
      socket.off('livechat:conversacion_cerrada', onCerrar)
      socket.off('livechat:pendiente_calificacion', onPendienteCalificacion)
      socket.off('livechat:conversacion_transferida', onTransferida)
    }
  }, [conversacionId, onCerrada])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const tomar = useMutation({
    mutationFn: () => livechatService.tomarConversacion(conversacionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mis-conversaciones'] })
      qc.invalidateQueries({ queryKey: ['livechat-esperando'] })
      setConv((prev) => (prev ? { ...prev, estado: 'activa', agenteId: user?.id ?? null } : prev))
    },
    onError: () => toast.error('No se pudo tomar la conversación (quizás ya fue asignada)'),
  })

  const enviar = useMutation({
    mutationFn: (contenido: string) => livechatService.enviarMensaje(conversacionId, contenido),
    onSuccess: () => setTexto(''),
    onError: () => toast.error('No se pudo enviar el mensaje'),
  })

  const [cerrarOpen, setCerrarOpen] = useState(false)
  const [motivoCierreId, setMotivoCierreId] = useState<number | null>(null)
  const [comentarioCierre, setComentarioCierre] = useState('')
  const [motivoCierreLibre, setMotivoCierreLibre] = useState('')

  // Motivos de cierre solo existen si la conversación pertenece a un grupo
  // (viene de una campaña) — sin grupo, se mantiene el cierre con texto libre
  // opcional de siempre.
  const { data: motivosCierre = [] } = useQuery({
    queryKey: ['livechat-motivos-cierre', conv?.grupoId],
    queryFn: () => livechatService.getMotivosCierre(conv!.grupoId!),
    enabled: cerrarOpen && !!conv?.grupoId,
  })
  const motivoSeleccionado = motivosCierre.find((m) => m.id === motivoCierreId)

  const cerrar = useMutation({
    mutationFn: () => livechatService.cerrarConversacion(conversacionId, {
      motivoCierreId: motivoCierreId ?? undefined,
      motivoCierre: motivoCierreLibre.trim() || undefined,
      comentarioCierre: comentarioCierre.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mis-conversaciones'] })
      toast.success('Conversación cerrada, esperando calificación del visitante')
      onCerrada()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo cerrar la conversación')
    },
  })

  const handleCerrar = () => {
    if (conv?.grupoId && !motivoCierreId) {
      toast.error('Elige un motivo de cierre')
      return
    }
    if (motivoSeleccionado?.requiereComentario && !comentarioCierre.trim()) {
      toast.error('Este motivo requiere un comentario')
      return
    }
    cerrar.mutate()
  }

  const [transferirOpen, setTransferirOpen] = useState(false)
  const { data: agentesTransferibles = [] } = useQuery({
    queryKey: ['livechat-agentes-transferibles', conversacionId],
    queryFn: () => livechatService.getAgentesTransferibles(conversacionId),
    enabled: transferirOpen,
  })

  // Plantillas rápidas: solo si la conversación tiene grupo (viene de una campaña).
  const [plantillasOpen, setPlantillasOpen] = useState(false)
  const { data: plantillas = [] } = useQuery({
    queryKey: ['livechat-plantillas', conv?.grupoId],
    queryFn: () => livechatService.getPlantillas(conv!.grupoId!),
    enabled: !!conv?.grupoId,
  })

  const transferir = useMutation({
    mutationFn: (nuevoAgenteId: number) => livechatService.transferirConversacion(conversacionId, nuevoAgenteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mis-conversaciones'] })
      toast.success('Conversación transferida')
      setTransferirOpen(false)
      onCerrada()
    },
    onError: () => toast.error('No se pudo transferir la conversación'),
  })

  const handleEnviar = () => {
    const contenido = texto.trim()
    if (!contenido) return
    enviar.mutate(contenido)
  }

  if (isLoading || !conv) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  const esperandoAsignacion = conv.estado === 'esperando'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 relative">
        <div>
          <p className="font-semibold text-gray-800">{conv.visitanteNombre || 'Visitante anónimo'}</p>
          <p className="text-xs text-gray-500">{conv.visitanteEmail || conv.visitanteTelefono || 'Sin datos de contacto'}</p>
        </div>
        <div className="flex items-center gap-2">
          {esperandoAsignacion ? (
            <Button size="sm" onClick={() => tomar.mutate()} disabled={tomar.isPending}>
              {tomar.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Tomar conversación
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setTransferirOpen((v) => !v)}>
                <ArrowRightLeft size={14} />
                Transferir
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCerrarOpen((v) => !v)}>
                Cerrar chat
              </Button>
            </>
          )}
        </div>

        {cerrarOpen && (
          <div className="absolute right-5 top-14 z-10 w-80 bg-card border border-gray-200 rounded-xl shadow-lg p-4 space-y-3">
            {conv.grupoId ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo de cierre</label>
                <select
                  value={motivoCierreId ?? ''}
                  onChange={(e) => setMotivoCierreId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Selecciona un motivo…</option>
                  {motivosCierre.map((m) => (
                    <option key={m.id} value={m.id}>{m.motivo}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo (opcional)</label>
                <input
                  type="text"
                  value={motivoCierreLibre}
                  onChange={(e) => setMotivoCierreLibre(e.target.value)}
                  placeholder="Ej. Resuelto, sin respuesta…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
            )}
            {(motivoSeleccionado?.requiereComentario || !conv.grupoId) && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Comentario{motivoSeleccionado?.requiereComentario ? '' : ' (opcional)'}
                </label>
                <textarea
                  value={comentarioCierre}
                  onChange={(e) => setComentarioCierre(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm resize-none"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCerrarOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCerrar} disabled={cerrar.isPending}>
                {cerrar.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmar cierre
              </Button>
            </div>
          </div>
        )}

        {transferirOpen && (
          <div className="absolute right-5 top-14 z-10 w-64 bg-card border border-gray-200 rounded-xl shadow-lg py-2">
            {agentesTransferibles.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">No hay otros agentes conectados</p>
            ) : (
              agentesTransferibles.map((a) => (
                <button
                  key={a.usuarioId}
                  disabled={!a.online || !a.disponible || transferir.isPending}
                  onClick={() => transferir.mutate(a.usuarioId)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', a.online ? 'bg-green-500' : 'bg-gray-300')} />
                    <span className="truncate">{a.nombre}</span>
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {!a.online ? 'Desconectado' : a.disponible ? `${a.conversacionesActivas} chats` : 'Lleno'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
        {mensajes.map((m) => (
          <div key={m.id} className={clsx('flex', m.emisor === 'agente' ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'max-w-[70%] rounded-2xl px-4 py-2 text-sm',
                m.emisor === 'agente' && 'bg-blue-600 text-white rounded-br-sm',
                m.emisor === 'visitante' && 'bg-card text-gray-800 border border-gray-200 rounded-bl-sm',
                m.emisor === 'sistema' && 'bg-gray-200 text-gray-600 italic text-xs mx-auto',
              )}
            >
              {m.contenido}
              <div className={clsx('text-[10px] mt-1', m.emisor === 'agente' ? 'text-blue-100' : 'text-gray-400')}>
                {formatHora(m.fecha)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-100 flex items-center gap-2 shrink-0 relative">
        {plantillas.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlantillasOpen((v) => !v)}
              disabled={esperandoAsignacion}
              title="Plantillas rápidas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              <FileText size={15} />
            </button>
            {plantillasOpen && (
              <div className="absolute bottom-12 left-0 z-10 w-72 bg-card border border-gray-200 rounded-xl shadow-lg py-2 max-h-64 overflow-y-auto">
                {plantillas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setTexto(p.contenido); setPlantillasOpen(false) }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <p className="font-medium text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{p.contenido}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEnviar()}
          disabled={esperandoAsignacion}
          placeholder={esperandoAsignacion ? 'Toma la conversación para responder' : 'Escribe un mensaje...'}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <Button onClick={handleEnviar} disabled={esperandoAsignacion || enviar.isPending || !texto.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}

export default function LivechatPage() {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const { can } = useActionAccess()
  const puedeAtender = can('livechat', 'atender')
  const puedeSupervisar = can('livechat', 'gestionar-campanas')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [bandejaOpen, setBandejaOpen] = useState(false)
  const [campaniasOpen, setCampaniasOpen] = useState(false)
  const [agentesOpen, setAgentesOpen] = useState(false)
  const [supervisionOpen, setSupervisionOpen] = useState(false)

  // Sin esto, 'livechat:nueva_conversacion' y 'livechat:actividad_conversacion'
  // (dirigidos a la sala user:{agenteId}) nunca le llegan a este agente — la
  // sala solo se une emitiendo 'joinUser', que nada más emitía un hook
  // (useSocket) que no se usaba en ningún componente activo de la app.
  useEffect(() => {
    if (!user?.id) return
    const socket = getSocket()
    const unirse = () => socket.emit('joinUser', user.id)
    unirse()
    socket.on('connect', unirse)
    return () => {
      socket.off('connect', unirse)
      socket.emit('leaveUser', user.id)
    }
  }, [user?.id])

  const { data: estado } = useQuery({
    queryKey: ['livechat-mi-estado'],
    queryFn: () => livechatService.getMiEstado(),
    refetchInterval: 30_000,
  })

  const { data: esperando = [], refetch: refetchEsperando } = useQuery({
    queryKey: ['livechat-esperando'],
    queryFn: () => livechatService.getMisConversaciones('esperando'),
    refetchInterval: 8_000,
  })

  const { data: mias = [], refetch: refetchMias } = useQuery({
    queryKey: ['livechat-mis-conversaciones'],
    queryFn: () => livechatService.getMisConversaciones('activa'),
    refetchInterval: 8_000,
  })

  const toggleDisponible = useMutation({
    mutationFn: (disponible: boolean) => livechatService.setDisponible(disponible),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-mi-estado'] })
    },
    onError: () => toast.error('No se pudo actualizar tu disponibilidad'),
  })

  const handleNuevaAsignada = useCallback(() => {
    refetchMias()
    reproducirAlertaNuevaConversacion()
    toast('Nueva conversación asignada a ti', { icon: '💬' })
  }, [refetchMias])

  const handleNuevaEnCola = useCallback(() => {
    refetchEsperando()
    reproducirAlertaNuevaConversacion()
    toast('Alguien se está comunicando — se agregó a la cola', { icon: '💬' })
  }, [refetchEsperando])

  // Un mensaje nuevo en cualquier conversación (propia o en cola) refresca
  // ambas listas — sin esto, un chat que no está seleccionado en este momento
  // solo se actualizaba al recargar la página o tras el polling de 8s.
  const handleActividad = useCallback(() => {
    refetchMias()
    refetchEsperando()
  }, [refetchMias, refetchEsperando])

  useEffect(() => {
    const socket = getSocket()
    socket.on('livechat:nueva_conversacion', handleNuevaAsignada)
    socket.on('livechat:nueva_en_cola', handleNuevaEnCola)
    socket.on('livechat:actividad_conversacion', handleActividad)
    return () => {
      socket.off('livechat:nueva_conversacion', handleNuevaAsignada)
      socket.off('livechat:nueva_en_cola', handleNuevaEnCola)
      socket.off('livechat:actividad_conversacion', handleActividad)
    }
  }, [handleNuevaAsignada, handleNuevaEnCola, handleActividad])

  const handleCerrada = () => {
    setSelectedId(null)
    refetchMias()
    refetchEsperando()
  }

  const conversaciones = [...esperando, ...mias]

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Chat en Vivo</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setCampaniasOpen(true)}>
            <Megaphone size={16} />
            Campañas
          </Button>
          <Button variant="ghost" onClick={() => setBandejaOpen(true)} className="relative">
            <Users size={16} />
            Bandeja de espera
            {esperando.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {esperando.length}
              </span>
            )}
          </Button>
          <Button variant="ghost" onClick={() => setAgentesOpen(true)}>
            <UserCheck size={16} />
            Agentes
          </Button>
          {puedeSupervisar && (
            <Button variant="ghost" onClick={() => setSupervisionOpen(true)}>
              <Users size={16} />
              Supervisión
            </Button>
          )}
          <Button variant="ghost" onClick={() => setHistorialOpen(true)}>
            <History size={16} />
            Historial
          </Button>
          <Button variant="ghost" onClick={() => setConfigOpen(true)}>
            <Settings size={16} />
            Configuración
          </Button>
          {puedeAtender && (
            // Verde/rojo fijos a propósito — el estado disponible/no disponible
            // debe leerse igual sin importar el color de marca configurado en
            // Personalización, así que no usa las variantes 'primary'/'secondary'
            // de Button (que sí siguen el color de marca).
            <button
              onClick={() => toggleDisponible.mutate(!estado?.disponible)}
              disabled={toggleDisponible.isPending}
              className={clsx(
                'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all duration-150',
                'focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
                estado?.disponible
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 border border-emerald-600 focus:ring-emerald-500/30'
                  : 'bg-red-600 hover:bg-red-700 shadow-sm shadow-red-600/20 border border-red-600 focus:ring-red-500/30',
              )}
            >
              <Power size={16} />
              {estado?.disponible ? 'Disponible' : 'No disponible'}
            </button>
          )}
        </div>
      </div>

      {configOpen && <ConfigModal onClose={() => setConfigOpen(false)} />}
      {historialOpen && <HistorialModal onClose={() => setHistorialOpen(false)} />}
      {bandejaOpen && (
        <BandejaEsperaModal
          onClose={() => setBandejaOpen(false)}
          onTomada={(conversacionId) => { setSelectedId(conversacionId); refetchMias(); refetchEsperando() }}
        />
      )}
      {campaniasOpen && <CampaniasModal onClose={() => setCampaniasOpen(false)} />}
      {agentesOpen && <AgentesEstadoModal onClose={() => setAgentesOpen(false)} />}
      {supervisionOpen && <SupervisionModal onClose={() => setSupervisionOpen(false)} />}

      <div className="flex-1 flex bg-card rounded-xl border border-gray-200 overflow-hidden min-h-0">
        <div className="w-72 border-r border-gray-100 overflow-y-auto shrink-0">
          {conversaciones.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              <User size={28} className="mx-auto mb-2 opacity-40" />
              Sin conversaciones activas
            </div>
          ) : (
            conversaciones.map((conv) => (
              <ConversacionItem
                key={conv.id}
                conv={conv}
                activa={conv.id === selectedId}
                onClick={() => setSelectedId(conv.id)}
              />
            ))
          )}
        </div>

        {selectedId ? (
          <ChatPanel conversacionId={selectedId} onCerrada={handleCerrada} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecciona una conversación
          </div>
        )}
      </div>
    </div>
  )
}
