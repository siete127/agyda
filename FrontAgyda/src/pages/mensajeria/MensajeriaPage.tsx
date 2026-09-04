import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessagesSquare, Send, Users, Plus, UserPlus, Paperclip, FileText, Download, X, HardDrive, Settings, Smile, Minus, MoreVertical, Pencil, Trash2, Check, AlertCircle, RotateCw } from 'lucide-react'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { useCurrentUser } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { NuevoGrupoModal } from './NuevoGrupoModal'
import { DriveArchivoPicker } from './DriveArchivoPicker'
import type { MensajeriaCanal, MensajeriaMensaje, MensajeriaConfig, MensajeriaReaccion } from '@/types/mensajeria.types'
import { parseMensajeriaMensaje } from '@/types/mensajeria.types'
import { getContrastTextColor } from '@/lib/color'
import { api } from '@/lib/axios'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const MAX_ADJUNTO_MB = 15
const REACCIONES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// Mismo patrón que MensajeriaChatWindow.tsx (burbuja flotante): el mensaje se
// muestra al instante al enviarlo (optimista), sin esperar a que llegue por
// socket — antes solo dependía del evento mensajeria:nuevo_mensaje, y si no
// llegaba a tiempo el mensaje no aparecía hasta recargar la página.
type EstadoEnvio = 'enviando' | 'enviado' | 'error'
type MensajeConEstado = MensajeriaMensaje & { estadoEnvio?: EstadoEnvio; tempId?: number }

// Agrupa las reacciones de un mensaje por emoji, para mostrar "👍 2" en vez de
// una burbuja repetida por cada persona que reaccionó igual.
function agruparReacciones(reacciones: MensajeriaReaccion[]) {
  const grupos = new Map<string, MensajeriaReaccion[]>()
  for (const r of reacciones) {
    if (!grupos.has(r.emoji)) grupos.set(r.emoji, [])
    grupos.get(r.emoji)!.push(r)
  }
  return Array.from(grupos.entries()).map(([emoji, lista]) => ({ emoji, lista }))
}

function esImagen(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url)
}

// Tipos que el navegador puede abrir/reproducir directamente en una pestaña (visualizar) en vez de solo descargar.
function esPrevisualizable(url: string): boolean {
  return /\.(pdf|txt|mp4|webm|mov|mp3|wav|ogg)$/i.test(url)
}

function nombreDeUrl(url: string): string {
  const partes = url.split('/')
  const archivo = partes[partes.length - 1] || 'archivo'
  return archivo.replace(/^msj_\d+_/, '')
}

interface UsuarioSimple {
  id: number
  nombre: string
  fotoUrl: string | null
}

async function buscarUsuarios(): Promise<UsuarioSimple[]> {
  const { data } = await api.get('/usuarios')
  const list = Array.isArray(data) ? data : (data?.data ?? [])
  return (list as Record<string, unknown>[]).map((u) => ({
    id: Number(u.id),
    nombre: String(u.nombre ?? ''),
    fotoUrl: (u.fotoUrl as string) || null,
  }))
}

function formatHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function formatFechaCorta(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

/* ── Selector para iniciar un DM nuevo ── */
function NuevoDMPicker({ onClose, onCreado }: { onClose: () => void; onCreado: (canal: MensajeriaCanal) => void }) {
  const [busqueda, setBusqueda] = useState('')
  const { data: usuarios = [], isLoading } = useQuery({ queryKey: ['mensajeria-usuarios'], queryFn: buscarUsuarios })
  const user = useCurrentUser()

  const crearDM = useMutation({
    mutationFn: (usuarioId: number) => mensajeriaService.crearOReusarDM(usuarioId),
    onSuccess: (canal) => { onCreado(canal); onClose() },
    onError: () => toast.error('No se pudo iniciar la conversación'),
  })

  const filtrados = usuarios
    .filter((u) => u.id !== user?.id)
    .filter((u) => u.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="absolute inset-x-3 top-14 z-20 rounded-xl border border-gray-200 bg-card shadow-lg">
      <div className="p-2 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar compañero..."
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-6"><Spinner size="sm" /></div>
        ) : filtrados.length === 0 ? (
          <p className="px-4 py-4 text-xs text-gray-400">Sin resultados</p>
        ) : (
          filtrados.map((u) => (
            <button
              key={u.id}
              disabled={crearDM.isPending}
              onClick={() => crearDM.mutate(u.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <Avatar src={u.fotoUrl} name={u.nombre} size="sm" />
              <span className="truncate">{u.nombre}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ── Item de la lista de conversaciones ── */
function ConversacionItem({ canal, activa, onClick }: { canal: MensajeriaCanal; activa: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3 border-b border-gray-100 transition-colors flex items-center gap-3',
        activa ? 'bg-blue-50' : 'hover:bg-gray-50',
      )}
    >
      <div className="relative flex-shrink-0">
        {canal.tipo === 'grupo' ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Users className="h-4 w-4" />
          </div>
        ) : (
          <Avatar name={canal.nombre ?? '?'} size="sm" />
        )}
        {canal.noLeidos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">
            {canal.noLeidos > 9 ? '9+' : canal.noLeidos}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={clsx('truncate text-sm', canal.noLeidos > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700')}>
            {canal.nombre || 'Conversación'}
          </span>
          <span className="flex-shrink-0 text-[0.65rem] text-gray-400">{formatFechaCorta(canal.ultimoMensajeFecha)}</span>
        </div>
        <p className="truncate text-xs text-gray-500 mt-0.5">{canal.ultimoMensajePreview || 'Sin mensajes aún'}</p>
      </div>
    </button>
  )
}

/* ── Panel de chat activo ── */
function ChatPanel({ canal, onMinimizar, onCerrar, compacto = false }: { canal: MensajeriaCanal; onMinimizar?: () => void; onCerrar?: () => void; compacto?: boolean }) {
  const user = useCurrentUser()
  const clearUnread = useMensajeriaStore((s) => s.clearUnread)
  const [mensajes, setMensajes] = useState<MensajeConEstado[]>([])
  const tempIdRef = useRef(-1)
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false)
  const dragCounterRef = useRef(0)
  const [drivePickerOpen, setDrivePickerOpen] = useState(false)
  const [aparienciaOpen, setAparienciaOpen] = useState(false)
  const [miembrosOpen, setMiembrosOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [otrosEscribiendo, setOtrosEscribiendo] = useState<string | null>(null)
  // Id del mensaje sobre el que se muestra la barra de reacciones rápidas
  // (hover/click), y si además está abierto el selector completo de emojis.
  const [reaccionandoId, setReaccionandoId] = useState<number | null>(null)
  const [pickerReaccionId, setPickerReaccionId] = useState<number | null>(null)
  // Menú "..." (editar/eliminar) del mensaje propio abierto, id del mensaje en
  // edición inline y su texto en curso, y el mensaje pendiente de confirmar borrado.
  const [menuMensajeId, setMenuMensajeId] = useState<number | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const mensajesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cierra el menú "..." (editar/eliminar) al hacer clic fuera de él.
  useEffect(() => {
    if (menuMensajeId === null) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuMensajeId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuMensajeId])

  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['mensajeria-mi-config'],
    queryFn: () => mensajeriaService.getMiConfig(),
    staleTime: 5 * 60 * 1000,
  })

  const guardarApariencia = useMutation({
    mutationFn: (payload: Partial<MensajeriaConfig>) => mensajeriaService.actualizarMiConfig(payload),
    onSuccess: (nuevaConfig) => qc.setQueryData(['mensajeria-mi-config'], nuevaConfig),
    onError: () => toast.error('No se pudo guardar la apariencia'),
  })

  // Solo se piden al abrir el panel — no hace falta cargarlos en cada mensaje.
  const { data: canalDetalle, isLoading: cargandoMiembros } = useQuery({
    queryKey: ['mensajeria-canal-detalle', canal.id],
    queryFn: () => mensajeriaService.getCanal(canal.id),
    enabled: miembrosOpen && canal.tipo === 'grupo',
  })

  const oscuro = config?.tema === 'oscuro'
  const colorPropio = config?.colorMensajePropio ?? '#2563EB'
  const colorAjeno = config?.colorMensajeAjeno ?? '#FFFFFF'
  const textColorPropio = getContrastTextColor(colorPropio)
  const textColorAjeno = getContrastTextColor(colorAjeno)

  const { data, isLoading } = useQuery({
    queryKey: ['mensajeria-mensajes', canal.id],
    queryFn: () => mensajeriaService.getMensajes(canal.id),
  })

  useEffect(() => {
    if (data) setMensajes(data)
  }, [data])

  useEffect(() => {
    const socket = getSocket()
    socket.emit('mensajeria:join_canal', { canalId: canal.id })
    return () => {
      socket.emit('mensajeria:leave_canal', { canalId: canal.id })
    }
  }, [canal.id])

  useEffect(() => {
    mensajeriaService.marcarLeido(canal.id).catch(() => {})
    clearUnread(canal.id)
  }, [canal.id, clearUnread])

  useSocketEvent<Record<string, unknown>>('mensajeria:nuevo_mensaje', (raw) => {
    const msg = parseMensajeriaMensaje(raw)
    if (msg.canalId !== canal.id) return
    setMensajes((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      // Si es un mensaje propio que ya está optimista en pantalla (enviando),
      // el socket confirma primero que la respuesta REST: se reemplaza el
      // optimista en vez de duplicar la burbuja.
      if (msg.emisorId === user?.id) {
        const pendiente = prev.find((m) => m.estadoEnvio === 'enviando' && m.contenido === msg.contenido)
        if (pendiente) return prev.map((m) => (m === pendiente ? { ...msg, estadoEnvio: 'enviado' } : m))
      }
      return [...prev, msg]
    })
    if (msg.emisorId !== user?.id) {
      mensajeriaService.marcarLeido(canal.id).catch(() => {})
      clearUnread(canal.id)
    }
  })

  useSocketEvent<{ mensajeId: number; canalId: number; reacciones: MensajeriaReaccion[] }>('mensajeria:reaccion', (payload) => {
    if (payload.canalId !== canal.id) return
    setMensajes((prev) => prev.map((m) => (m.id === payload.mensajeId ? { ...m, reacciones: payload.reacciones } : m)))
  })

  useSocketEvent<Record<string, unknown>>('mensajeria:mensaje_editado', (raw) => {
    const msg = parseMensajeriaMensaje(raw)
    if (msg.canalId !== canal.id) return
    setMensajes((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
  })

  useSocketEvent<{ mensajeId: number; canalId: number }>('mensajeria:mensaje_eliminado', (payload) => {
    if (payload.canalId !== canal.id) return
    setMensajes((prev) => prev.filter((m) => m.id !== payload.mensajeId))
  })

  useSocketEvent<{ canalId: number; usuarioId: number; usuarioNombre: string; isTyping: boolean }>('mensajeria:typing', (payload) => {
    if (payload.canalId !== canal.id || payload.usuarioId === user?.id) return
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current)
    if (payload.isTyping) {
      setOtrosEscribiendo(payload.usuarioNombre || 'Alguien')
      stopTypingTimeoutRef.current = setTimeout(() => setOtrosEscribiendo(null), 3000)
    } else {
      setOtrosEscribiendo(null)
    }
  })

  // Solo hace auto-scroll si el usuario ya estaba cerca del final — así no lo
  // interrumpe si está leyendo mensajes viejos hacia arriba cuando llega uno nuevo.
  useEffect(() => {
    const el = mensajesContainerRef.current
    const cercaDelFinal = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (cercaDelFinal) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const enviar = useMutation({
    mutationFn: async ({ contenido, file }: { contenido: string; file: File | null; tempId: number }) => {
      let archivoUrl: string | undefined
      if (file) {
        const subido = await mensajeriaService.subirArchivo(canal.id, file)
        archivoUrl = subido.url
      }
      return mensajeriaService.enviarMensaje(canal.id, contenido, archivoUrl)
    },
    onMutate: ({ contenido, file, tempId }) => {
      const optimista: MensajeConEstado = {
        id: tempId,
        canalId: canal.id,
        emisorId: user?.id ?? 0,
        emisorNombre: user?.nombres ?? '',
        contenido,
        // Preview local inmediato del adjunto mientras se sube (URL de objeto
        // en memoria) — se descarta al llegar la URL real del servidor.
        archivoUrl: file ? URL.createObjectURL(file) : null,
        fecha: new Date().toISOString(),
        editado: false,
        reacciones: [],
        estadoEnvio: 'enviando',
        tempId,
      }
      setMensajes((prev) => [...prev, optimista])
      setTexto('')
      setArchivo(null)
      // El alto del textarea se ajusta imperativamente (fuera del control de
      // React) al escribir varias líneas — hay que resetearlo a una línea acá.
      if (inputRef.current) inputRef.current.style.height = 'auto'
    },
    onSuccess: (msg, { tempId }) => {
      // El socket puede llegar antes que esta respuesta y ya haber insertado el
      // mensaje real — en ese caso solo se quita el optimista, sin duplicar.
      setMensajes((prev) => {
        const yaLlego = prev.some((m) => m.id === msg.id && m.tempId !== tempId)
        if (yaLlego) return prev.filter((m) => m.tempId !== tempId)
        return prev.map((m) => (m.tempId === tempId ? { ...msg, estadoEnvio: 'enviado' } : m))
      })
    },
    onError: (_err, { tempId }) => {
      setMensajes((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, estadoEnvio: 'error' } : m)))
      toast.error('No se pudo enviar el mensaje')
    },
  })

  // El reintento con un solo clic solo aplica a mensajes de puro texto — un
  // adjunto que falló requeriría volver a elegir el archivo, ya no lo tenemos
  // guardado tras el primer intento (el objeto File no persiste en el mensaje).
  const reintentarEnvio = (m: MensajeConEstado) => {
    if (m.tempId == null || m.archivoUrl) return
    setMensajes((prev) => prev.map((msg) => (msg.tempId === m.tempId ? { ...msg, estadoEnvio: 'enviando' } : msg)))
    enviar.mutate({ contenido: m.contenido, file: null, tempId: m.tempId })
  }

  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = getSocket()
    socket.emit('mensajeria:typing', { canalId: canal.id, usuarioId: user?.id, usuarioNombre: user?.nombres, isTyping })
  }, [canal.id, user?.id, user?.nombres])

  const handleChangeTexto = (value: string) => {
    setTexto(value)
    emitTyping(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2000)
  }

  // Punto único de validación/asignación de archivo — usado por el selector de
  // archivos, pegar del portapapeles (Ctrl+V) y arrastrar-soltar.
  const adjuntarArchivo = (file: File) => {
    if (config?.permitirAdjuntos === false) return
    if (file.size > MAX_ADJUNTO_MB * 1024 * 1024) {
      toast.error(`El archivo supera el límite de ${MAX_ADJUNTO_MB}MB`)
      return
    }
    setArchivo(file)
  }

  const handleSeleccionArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    adjuntarArchivo(file)
  }

  // Pegar una imagen copiada (captura de pantalla, "Copiar imagen" desde el
  // navegador, etc.) directamente en el campo de texto con Ctrl+V.
  const handlePegarArchivo = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const archivoPegado = Array.from(e.clipboardData.items)
      .find((item) => item.kind === 'file')
      ?.getAsFile()
    if (!archivoPegado) return
    e.preventDefault()
    adjuntarArchivo(archivoPegado)
  }

  // Arrastrar y soltar un archivo sobre el panel del chat — dragCounterRef evita
  // que el overlay parpadee al pasar por encima de elementos hijos (cada uno
  // dispara su propio dragenter/dragleave).
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!e.dataTransfer.types.includes('Files')) return
    dragCounterRef.current += 1
    setArrastrandoArchivo(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setArrastrandoArchivo(false) }
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setArrastrandoArchivo(false)
    const file = e.dataTransfer.files?.[0]
    if (file) adjuntarArchivo(file)
  }

  const handleEnviar = () => {
    const contenido = texto.trim()
    if (!contenido && !archivo) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    emitTyping(false)
    enviar.mutate({ contenido, file: archivo, tempId: tempIdRef.current-- })
  }

  // Toca la misma reacción propia = la quita (toggle); toca otra = la reemplaza
  // (una sola reacción activa por usuario y mensaje, igual que WhatsApp).
  const handleReaccionar = (mensajeId: number, emoji: string) => {
    const mensaje = mensajes.find((m) => m.id === mensajeId)
    const propia = mensaje?.reacciones.find((r) => r.usuarioId === user?.id)
    const accion = propia?.emoji === emoji
      ? mensajeriaService.quitarReaccion(mensajeId)
      : mensajeriaService.reaccionarMensaje(mensajeId, emoji)
    accion
      .then((reacciones) => setMensajes((prev) => prev.map((m) => (m.id === mensajeId ? { ...m, reacciones } : m))))
      .catch(() => {})
    setReaccionandoId(null)
    setPickerReaccionId(null)
  }

  const iniciarEdicion = (m: MensajeriaMensaje) => {
    setEditandoId(m.id)
    setTextoEdicion(m.contenido)
    setMenuMensajeId(null)
  }

  const editarMensaje = useMutation({
    mutationFn: ({ mensajeId, contenido }: { mensajeId: number; contenido: string }) =>
      mensajeriaService.editarMensaje(mensajeId, contenido),
    onSuccess: (msg) => {
      setMensajes((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
      setEditandoId(null)
    },
  })

  const guardarEdicion = (mensajeId: number) => {
    const contenido = textoEdicion.trim()
    if (!contenido) return
    editarMensaje.mutate({ mensajeId, contenido })
  }

  const eliminarMensaje = useMutation({
    mutationFn: (mensajeId: number) => mensajeriaService.eliminarMensaje(mensajeId),
    onSuccess: (_data, mensajeId) => {
      setMensajes((prev) => prev.filter((m) => m.id !== mensajeId))
      setConfirmarEliminarId(null)
    },
  })

  const handleSeleccionEmoji = (emoji: string) => {
    const input = inputRef.current
    if (!input) { handleChangeTexto(texto + emoji); return }
    const start = input.selectionStart ?? texto.length
    const end = input.selectionEnd ?? texto.length
    const nuevoTexto = texto.slice(0, start) + emoji + texto.slice(end)
    handleChangeTexto(nuevoTexto)
    requestAnimationFrame(() => {
      input.focus()
      const cursor = start + emoji.length
      input.setSelectionRange(cursor, cursor)
    })
  }

  const enviarDesdeDrive = useMutation({
    mutationFn: async (archivoId: number) => {
      const { url } = await mensajeriaService.adjuntarDesdeDrive(canal.id, archivoId)
      return mensajeriaService.enviarMensaje(canal.id, '', url)
    },
    onSuccess: () => setDrivePickerOpen(false),
    onError: () => toast.error('No se pudo adjuntar el archivo de Drive'),
  })

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>
  }

  return (
    <div
      className={clsx('relative flex-1 flex flex-col min-h-0', oscuro && 'bg-gray-900')}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {arrastrandoArchivo && config?.permitirAdjuntos !== false && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-4 border-dashed border-brand bg-brand/10 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-4 shadow-xl">
            <Paperclip className="h-8 w-8 text-brand" />
            <p className="text-sm font-semibold text-brand">Suelta el archivo para adjuntarlo</p>
          </div>
        </div>
      )}
      <div className={clsx('px-5 py-3 border-b flex items-center gap-2.5 shrink-0 relative', oscuro ? 'border-gray-700' : 'border-gray-100')}>
        {canal.tipo === 'grupo' ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Users className="h-4 w-4" />
          </div>
        ) : (
          <Avatar name={canal.nombre ?? '?'} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <p className={clsx('font-semibold truncate', oscuro ? 'text-gray-100' : 'text-gray-800')}>{canal.nombre || 'Conversación'}</p>
          {otrosEscribiendo && <p className="text-xs text-brand animate-pulse">{otrosEscribiendo} está escribiendo…</p>}
        </div>
        {compacto && onMinimizar && (
          <button
            onClick={onMinimizar}
            className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
            title="Minimizar"
          >
            <Minus className="h-4 w-4" />
          </button>
        )}
        {compacto && onCerrar && (
          <button
            onClick={onCerrar}
            className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
            title="Cerrar conversación"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {canal.tipo === 'grupo' && (
          <button
            onClick={() => setMiembrosOpen((v) => !v)}
            className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
            title="Ver integrantes del grupo"
          >
            <Users className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setAparienciaOpen((v) => !v)}
          className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
          title="Apariencia del chat"
        >
          <Settings className="h-4 w-4" />
        </button>

        {miembrosOpen && canal.tipo === 'grupo' && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMiembrosOpen(false)} />
            <div className={clsx(
              'absolute right-4 top-12 z-20 w-64 rounded-xl border shadow-lg p-3',
              oscuro ? 'bg-gray-800 border-gray-700' : 'bg-card border-gray-200',
            )}>
              <p className={clsx('mb-2 text-xs font-semibold uppercase tracking-wide', oscuro ? 'text-gray-400' : 'text-gray-500')}>
                Integrantes {canalDetalle ? `(${canalDetalle.miembros.length})` : ''}
              </p>
              {cargandoMiembros ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {canalDetalle?.miembros.map((m) => (
                    <div key={m.usuarioId} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                      <Avatar name={m.nombre} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className={clsx('truncate text-sm', oscuro ? 'text-gray-100' : 'text-gray-800')}>
                          {m.nombre}{m.usuarioId === user?.id && ' (tú)'}
                        </p>
                        {m.usuarioId === canal.creadoPor && (
                          <p className="text-[0.65rem] text-brand">Creador del grupo</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {aparienciaOpen && config && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAparienciaOpen(false)} />
            <div className={clsx(
              'absolute right-4 top-12 z-20 w-64 rounded-xl border shadow-lg p-3',
              oscuro ? 'bg-gray-800 border-gray-700' : 'bg-card border-gray-200',
            )}>
              <p className={clsx('mb-2 text-xs font-semibold uppercase tracking-wide', oscuro ? 'text-gray-400' : 'text-gray-500')}>Apariencia del chat</p>

              <label className={clsx('mb-1.5 block text-[0.68rem] font-semibold', oscuro ? 'text-gray-400' : 'text-gray-500')}>Tema</label>
              <select
                value={config.tema}
                onChange={(e) => guardarApariencia.mutate({ tema: e.target.value as MensajeriaConfig['tema'] })}
                className={clsx(
                  'mb-3 w-full rounded-lg border px-2 py-1.5 text-sm focus:outline-none',
                  oscuro ? 'bg-gray-900 border-gray-700 text-gray-100' : 'border-gray-200',
                )}
              >
                <option value="claro">Claro</option>
                <option value="oscuro">Oscuro</option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={clsx('mb-1 block text-[0.65rem] font-semibold', oscuro ? 'text-gray-400' : 'text-gray-500')}>Mis mensajes</label>
                  <input
                    type="color"
                    value={config.colorMensajePropio}
                    onChange={(e) => guardarApariencia.mutate({ colorMensajePropio: e.target.value })}
                    className="h-8 w-full cursor-pointer rounded-lg border border-gray-200"
                  />
                </div>
                <div>
                  <label className={clsx('mb-1 block text-[0.65rem] font-semibold', oscuro ? 'text-gray-400' : 'text-gray-500')}>Recibidos</label>
                  <input
                    type="color"
                    value={config.colorMensajeAjeno}
                    onChange={(e) => guardarApariencia.mutate({ colorMensajeAjeno: e.target.value })}
                    className="h-8 w-full cursor-pointer rounded-lg border border-gray-200"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div ref={mensajesContainerRef} className={clsx('flex-1 overflow-y-auto px-5 py-4', oscuro ? 'bg-gray-900' : 'bg-gray-50')}>
        {mensajes.map((m, i) => {
          const esMio = m.emisorId === user?.id
          const bgColor = esMio ? colorPropio : colorAjeno
          const textColor = esMio ? textColorPropio : textColorAjeno
          const grupos = agruparReacciones(m.reacciones)
          const miReaccion = m.reacciones.find((r) => r.usuarioId === user?.id)?.emoji
          // Mensajes consecutivos del mismo remitente quedan más pegados entre
          // sí (como WhatsApp agrupa una racha); más aire cuando cambia quién habla.
          const mismoRemitenteQueAnterior = i > 0 && mensajes[i - 1].emisorId === m.emisorId
          return (
            <div key={m.id} className={clsx('flex flex-col animate-fade-in', esMio ? 'items-end' : 'items-start', mismoRemitenteQueAnterior ? 'mt-1' : 'mt-4')}>
              <div
                className={clsx('relative flex', esMio ? 'justify-end' : 'justify-start')}
                onMouseEnter={() => setReaccionandoId(m.id)}
                onMouseLeave={() => setReaccionandoId((v) => (v === m.id ? null : v))}
              >
                {/* Barra de reacciones rápidas — aparece al hacer hover del mensaje */}
                {reaccionandoId === m.id && (
                  <div
                    className={clsx(
                      'absolute -top-9 z-20 flex items-center gap-0.5 rounded-full border px-1 py-1 shadow-lg',
                      esMio ? 'right-0' : 'left-0',
                      oscuro ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white',
                    )}
                  >
                    {REACCIONES_RAPIDAS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaccionar(m.id, emoji)}
                        className={clsx(
                          'flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125',
                          miReaccion === emoji && 'bg-brand-light',
                        )}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={() => setPickerReaccionId(m.id)}
                      className={clsx(
                        'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                        oscuro ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100',
                      )}
                      title="Más emojis"
                    >
                      <Smile size={14} />
                    </button>
                    {esMio && (
                      <button
                        onClick={() => setMenuMensajeId((v) => (v === m.id ? null : m.id))}
                        className={clsx(
                          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                          oscuro ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100',
                        )}
                        title="Más opciones"
                      >
                        <MoreVertical size={14} />
                      </button>
                    )}
                    {pickerReaccionId === m.id && (
                      <div className={clsx('absolute top-9 z-30', esMio ? 'right-0' : 'left-0')}>
                        <EmojiPicker
                          onSelect={(emoji) => handleReaccionar(m.id, emoji)}
                          onClose={() => setPickerReaccionId(null)}
                          className="w-72"
                        />
                      </div>
                    )}
                    {menuMensajeId === m.id && (
                      <div ref={menuRef} className={clsx(
                        'absolute top-9 right-0 z-30 w-36 overflow-hidden rounded-xl border shadow-lg animate-fade-in',
                        oscuro ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white',
                      )}>
                        {!m.archivoUrl && (
                          <button
                            onClick={() => iniciarEdicion(m)}
                            className={clsx(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-xs',
                              oscuro ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50',
                            )}
                          >
                            <Pencil size={13} /> Editar
                          </button>
                        )}
                        <button
                          onClick={() => { setConfirmarEliminarId(m.id); setMenuMensajeId(null) }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {editandoId === m.id ? (
                  <div
                    className={clsx(
                      'max-w-[70%] rounded-2xl px-4 py-2 text-sm',
                      esMio ? 'rounded-br-sm' : 'rounded-bl-sm border',
                      !esMio && (oscuro ? 'border-gray-700' : 'border-gray-200'),
                    )}
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    <input
                      autoFocus
                      value={textoEdicion}
                      onChange={(e) => setTextoEdicion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') guardarEdicion(m.id)
                        if (e.key === 'Escape') setEditandoId(null)
                      }}
                      className="w-full min-w-[160px] border-b bg-transparent text-sm outline-none"
                      style={{ borderColor: textColor === 'white' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)', color: textColor }}
                    />
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <button onClick={() => setEditandoId(null)} className="text-[10px] opacity-80 hover:opacity-100" style={{ color: textColor }}>
                        Cancelar
                      </button>
                      <button
                        onClick={() => guardarEdicion(m.id)}
                        disabled={!textoEdicion.trim() || editarMensaje.isPending}
                        className="flex items-center gap-0.5 text-[10px] font-semibold opacity-90 hover:opacity-100 disabled:opacity-40"
                        style={{ color: textColor }}
                      >
                        <Check size={11} /> Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={clsx(
                      'inline-block min-w-[64px] max-w-[70%] overflow-hidden rounded-2xl px-4 py-2 text-sm transition-opacity',
                      esMio ? 'rounded-br-sm' : 'rounded-bl-sm border',
                      !esMio && (oscuro ? 'border-gray-700' : 'border-gray-200'),
                      m.estadoEnvio === 'enviando' && 'opacity-60',
                    )}
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    {!esMio && canal.tipo === 'grupo' && (
                      <div className="text-[0.68rem] font-semibold text-brand mb-0.5">{m.emisorNombre}</div>
                    )}
                    {m.contenido && <p className="whitespace-pre-wrap break-words text-left">{m.contenido.trim()}</p>}
                    {m.archivoUrl && (
                      esImagen(m.archivoUrl) ? (
                        <a href={m.archivoUrl} target="_blank" rel="noreferrer" className="block mt-1">
                          <img src={m.archivoUrl} alt={nombreDeUrl(m.archivoUrl)} className="block w-full max-w-[220px] h-auto rounded-lg object-cover" />
                        </a>
                      ) : (
                        <div
                          className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium"
                          style={{ backgroundColor: `${textColor === 'white' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}` }}
                        >
                          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                          {esPrevisualizable(m.archivoUrl) ? (
                            <a href={m.archivoUrl} target="_blank" rel="noreferrer" className="truncate max-w-[140px] hover:underline">
                              {nombreDeUrl(m.archivoUrl)}
                            </a>
                          ) : (
                            <span className="truncate max-w-[140px]">{nombreDeUrl(m.archivoUrl)}</span>
                          )}
                          <a href={m.archivoUrl} download className="flex-shrink-0 hover:opacity-70" title="Descargar">
                            <Download className="h-3 w-3" />
                          </a>
                        </div>
                      )
                    )}
                    <div className="flex items-center justify-end gap-1 text-[10px] mt-1 opacity-70 whitespace-nowrap" style={{ color: textColor }}>
                      {m.editado && <span className="italic">editado ·</span>}
                      {m.estadoEnvio === 'enviando' ? (
                        <RotateCw size={10} className="animate-spin" />
                      ) : m.estadoEnvio === 'error' ? (
                        <button
                          onClick={() => reintentarEnvio(m)}
                          className="flex items-center gap-0.5 hover:underline"
                          title="Error al enviar — clic para reintentar"
                        >
                          <AlertCircle size={11} /> reintentar
                        </button>
                      ) : (
                        <span>{formatHora(m.fecha)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {confirmarEliminarId === m.id && (
                <div className={clsx(
                  'mt-1 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                  oscuro ? 'border-red-900 bg-red-950/40' : 'border-red-200 bg-red-50',
                )}>
                  <span className="text-red-500">¿Eliminar este mensaje?</span>
                  <button
                    onClick={() => eliminarMensaje.mutate(m.id)}
                    disabled={eliminarMensaje.isPending}
                    className="font-semibold text-red-600 hover:text-red-800"
                  >
                    Sí
                  </button>
                  <button onClick={() => setConfirmarEliminarId(null)} className={oscuro ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}>
                    No
                  </button>
                </div>
              )}
              {/* Chips de reacciones agrupadas por emoji */}
              {grupos.length > 0 && (
                <div className={clsx('mt-0.5 flex flex-wrap gap-1', esMio ? 'justify-end' : 'justify-start')}>
                  {grupos.map(({ emoji, lista }) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaccionar(m.id, emoji)}
                      title={lista.map((r) => r.usuarioNombre).join(', ')}
                      className={clsx(
                        'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                        lista.some((r) => r.usuarioId === user?.id)
                          ? 'border-brand bg-brand-light'
                          : oscuro ? 'border-gray-700 bg-gray-800 hover:bg-gray-700' : 'border-gray-200 bg-white hover:bg-gray-50',
                      )}
                    >
                      <span>{emoji}</span>
                      {lista.length > 1 && <span className={oscuro ? 'text-gray-400' : 'text-gray-500'}>{lista.length}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className={clsx('p-4 border-t shrink-0', oscuro ? 'border-gray-700' : 'border-gray-100')}>
        {archivo && (
          <div className={clsx('mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs', oscuro ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-700')}>
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate flex-1">{archivo.name}</span>
            <button onClick={() => setArchivo(null)} className="text-gray-400 hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {config?.permitirAdjuntos !== false && (
            <>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleSeleccionArchivo} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
                title="Adjuntar archivo de mi dispositivo"
              >
                <Paperclip size={17} />
              </button>
              <button
                onClick={() => setDrivePickerOpen(true)}
                className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
                title="Elegir archivo de mi Drive"
              >
                <HardDrive size={17} />
              </button>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
              title="Insertar emoji"
            >
              <Smile size={17} />
            </button>
            {emojiOpen && (
              <div className="absolute bottom-11 left-0 z-30">
                <EmojiPicker
                  onSelect={handleSeleccionEmoji}
                  onClose={() => setEmojiOpen(false)}
                />
              </div>
            )}
          </div>
          <textarea
            ref={inputRef}
            rows={1}
            value={texto}
            onChange={(e) => {
              handleChangeTexto(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter (o Ctrl/Cmd+Enter) inserta salto de línea.
              if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                handleEnviar()
              }
            }}
            onPaste={handlePegarArchivo}
            placeholder="Escribe un mensaje..."
            className={clsx(
              'flex-1 resize-none rounded-3xl border px-4 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500',
              oscuro ? 'border-gray-700 bg-gray-800 text-gray-100 placeholder-gray-500' : 'border-gray-300',
            )}
            style={{ maxHeight: 120 }}
          />
          <Button onClick={handleEnviar} disabled={enviar.isPending || (!texto.trim() && !archivo)}>
            <Send size={16} />
          </Button>
        </div>
      </div>

      {drivePickerOpen && (
        <DriveArchivoPicker
          onClose={() => setDrivePickerOpen(false)}
          onSeleccionar={(archivo) => enviarDesdeDrive.mutate(archivo.id)}
        />
      )}
    </div>
  )
}

export function MensajeriaPage() {
  const setCanales = useMensajeriaStore((s) => s.setCanales)
  const chatsAbiertos = useMensajeriaStore((s) => s.chatsAbiertos)
  const minimizados = useMensajeriaStore((s) => s.minimizados)
  const abrirChat = useMensajeriaStore((s) => s.abrirChat)
  const cerrarChat = useMensajeriaStore((s) => s.cerrarChat)
  const minimizarChat = useMensajeriaStore((s) => s.minimizarChat)
  const restaurarChat = useMensajeriaStore((s) => s.restaurarChat)
  const setSelectedId = useMensajeriaStore((s) => s.setCanalAbiertoId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [nuevoGrupoOpen, setNuevoGrupoOpen] = useState(false)

  const { data: canales = [], refetch } = useQuery({
    queryKey: ['mensajeria-canales'],
    queryFn: () => mensajeriaService.getMisCanales(),
  })

  useEffect(() => {
    setCanales(canales)
  }, [canales, setCanales])

  // Deep-link ?canal=<id> (desde notificaciones) — abre esa conversación.
  const [searchParams, setSearchParams] = useSearchParams()
  const [linkAbierto, setLinkAbierto] = useState<string | null>(null)
  const canalParam = searchParams.get('canal')
  if (canalParam && canalParam !== linkAbierto && canales.length > 0) {
    setLinkAbierto(canalParam)
    if (canales.some((c) => c.id === Number(canalParam))) abrirChat(Number(canalParam))
    const next = new URLSearchParams(searchParams)
    next.delete('canal')
    setSearchParams(next, { replace: true })
  }

  // Al salir del módulo, ya no hay "canal abierto" — así la burbuja flotante
  // vuelve a poder mostrar avisos de cualquier conversación.
  useEffect(() => {
    return () => setSelectedId(null)
  }, [setSelectedId])

  const handleActualizar = useCallback(() => { refetch() }, [refetch])

  useSocketEvent('mensajeria:nuevo_mensaje', handleActualizar)
  useSocketEvent('mensajeria:canal_creado', handleActualizar)

  const panelesVisibles = chatsAbiertos
    .filter((id) => !minimizados[id])
    .map((id) => canales.find((c) => c.id === id))
    .filter((c): c is MensajeriaCanal => !!c)

  const panelesMinimizados = chatsAbiertos
    .filter((id) => minimizados[id])
    .map((id) => canales.find((c) => c.id === id))
    .filter((c): c is MensajeriaCanal => !!c)

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="text-brand" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Mensajería</h1>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setNuevoGrupoOpen(true)}>
          <UserPlus size={14} /> Nuevo grupo
        </Button>
      </div>

      <div className="flex-1 flex bg-card rounded-xl border border-gray-200 overflow-hidden min-h-0">
        <div className="w-72 border-r border-gray-100 flex flex-col shrink-0 relative">
          <div className="p-3 border-b border-gray-100">
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setPickerOpen((v) => !v)}>
              <Plus size={14} /> Nuevo mensaje
            </Button>
          </div>

          {pickerOpen && (
            <NuevoDMPicker
              onClose={() => setPickerOpen(false)}
              onCreado={(canal) => { refetch(); abrirChat(canal.id) }}
            />
          )}

          <div className="flex-1 overflow-y-auto">
            {canales.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <MessagesSquare size={28} className="mx-auto mb-2 opacity-40" />
                Sin conversaciones todavía
              </div>
            ) : (
              canales.map((canal) => (
                <ConversacionItem
                  key={canal.id}
                  canal={canal}
                  activa={chatsAbiertos.includes(canal.id) && !minimizados[canal.id]}
                  onClick={() => abrirChat(canal.id)}
                />
              ))
            )}
          </div>
        </div>

        {panelesVisibles.length > 0 ? (
          <div className="flex-1 flex min-w-0 divide-x divide-gray-100">
            {panelesVisibles.map((canal) => (
              <ChatPanel
                key={canal.id}
                canal={canal}
                compacto={panelesVisibles.length > 1}
                onMinimizar={() => minimizarChat(canal.id)}
                onCerrar={() => cerrarChat(canal.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecciona una conversación
          </div>
        )}
      </div>

      {panelesMinimizados.length > 0 && (
        <div className="flex items-center gap-2 mt-2">
          {panelesMinimizados.map((canal) => (
            <button
              key={canal.id}
              onClick={() => restaurarChat(canal.id)}
              className="group relative flex items-center gap-2 rounded-full border border-gray-200 bg-card pl-1.5 pr-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors"
              title={canal.nombre || 'Conversación'}
            >
              {canal.tipo === 'grupo' ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Users className="h-3 w-3" />
                </div>
              ) : (
                <Avatar name={canal.nombre ?? '?'} size="sm" />
              )}
              <span className="max-w-[100px] truncate">{canal.nombre || 'Conversación'}</span>
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); cerrarChat(canal.id) }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-600 transition-all"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </button>
          ))}
        </div>
      )}

      {nuevoGrupoOpen && (
        <NuevoGrupoModal
          onClose={() => setNuevoGrupoOpen(false)}
          onCreado={(canal) => { refetch(); abrirChat(canal.id); setNuevoGrupoOpen(false) }}
        />
      )}
    </div>
  )
}
