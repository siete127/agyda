import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Users, Minus, X, Smile, Phone, Video, MoreVertical, Pencil, Trash2, Check, AlertCircle, RotateCw, Paperclip, FileText, Download, Eye, FileSpreadsheet, FileImage, FileVideo, FileAudio, File as FileIcon } from 'lucide-react'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { useCurrentUser } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { TypingDots } from '@/components/ui/TypingDots'
import type { MensajeriaCanal, MensajeriaMensaje, MensajeriaReaccion } from '@/types/mensajeria.types'
import { parseMensajeriaMensaje } from '@/types/mensajeria.types'
import { SolicitarReunionModal } from '@/pages/portal-cliente/components/SolicitarReunionModal'
import { getContrastTextColor, hexToRgba } from '@/lib/color'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const REACCIONES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

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

function formatHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Clave de día (sin hora) para agrupar mensajes del mismo día en el chat.
function claveDia(iso: string): string {
  return iso.slice(0, 10)
}

// "Hoy, 15 de octubre de 2026" / "Ayer, ..." / "15 de octubre de 2026" —
// separador centrado que marca el cambio de día, como WhatsApp.
function formatFechaSeparador(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hoy = new Date()
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1)
  const fechaLarga = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  if (claveDia(iso) === claveDia(hoy.toISOString())) return `Hoy, ${fechaLarga}`
  if (claveDia(iso) === claveDia(ayer.toISOString())) return `Ayer, ${fechaLarga}`
  return fechaLarga
}

const MAX_ADJUNTO_MB = 15

function esImagen(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url)
}

function esPrevisualizable(url: string): boolean {
  return /\.(pdf|txt|mp4|webm|mov|mp3|wav|ogg)$/i.test(url)
}

// Ícono + color por tipo de archivo (mismo criterio que la pestaña de
// Mensajería) — tarjeta de color según extensión en vez de un ícono genérico.
function tipoArchivo(nombre: string): { Icono: typeof FileText; color: string; bg: string; etiqueta: string } {
  const ext = (nombre.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return { Icono: FileText, color: '#EF4444', bg: 'rgba(239,68,68,0.12)', etiqueta: 'PDF' }
  if (['doc', 'docx'].includes(ext)) return { Icono: FileText, color: '#2563EB', bg: 'rgba(37,99,235,0.12)', etiqueta: 'DOC' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { Icono: FileSpreadsheet, color: '#16A34A', bg: 'rgba(22,163,74,0.12)', etiqueta: ext.toUpperCase() }
  if (['ppt', 'pptx'].includes(ext)) return { Icono: FileText, color: '#EA580C', bg: 'rgba(234,88,12,0.12)', etiqueta: 'PPT' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return { Icono: FileImage, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', etiqueta: ext.toUpperCase() }
  if (['mp4', 'webm', 'mov'].includes(ext)) return { Icono: FileVideo, color: '#DB2777', bg: 'rgba(219,39,119,0.12)', etiqueta: ext.toUpperCase() }
  if (['mp3', 'wav', 'ogg'].includes(ext)) return { Icono: FileAudio, color: '#0891B2', bg: 'rgba(8,145,178,0.12)', etiqueta: ext.toUpperCase() }
  return { Icono: FileIcon, color: '#64748B', bg: 'rgba(100,116,139,0.12)', etiqueta: ext ? ext.toUpperCase() : 'ARCHIVO' }
}

function nombreDeUrl(url: string): string {
  const partes = url.split('/')
  const archivo = partes[partes.length - 1] || 'archivo'
  return archivo.replace(/^msj_\d+_/, '')
}

// Envío optimista: el mensaje aparece en la UI de inmediato (estado 'enviando'),
// y pasa a 'enviado' cuando llega la confirmación real por socket, o a 'error'
// si la petición falla — sin esto, el mensaje solo aparecía tras el roundtrip
// completo del servidor, sintiéndose lento.
type EstadoEnvio = 'enviando' | 'enviado' | 'error'
type MensajeConEstado = MensajeriaMensaje & { estadoEnvio?: EstadoEnvio; tempId?: number }

interface MensajeriaChatWindowProps {
  canal: MensajeriaCanal
  offset: number
}

export function MensajeriaChatWindow({ canal, offset }: MensajeriaChatWindowProps) {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const clearUnread = useMensajeriaStore((s) => s.clearUnread)
  const minimizarChatFlotante = useMensajeriaStore((s) => s.minimizarChatFlotante)
  const cerrarChatFlotante = useMensajeriaStore((s) => s.cerrarChatFlotante)

  const [mensajes, setMensajes] = useState<MensajeConEstado[]>([])
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false)
  const dragCounterRef = useRef(0)
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
  const [miembrosOpen, setMiembrosOpen] = useState(false)
  const [solicitarReunionModalidad, setSolicitarReunionModalidad] = useState<'videollamada' | 'telefonica' | null>(null)
  const esPortalCliente = user?.tipoUsuario?.toUpperCase() === 'CL'
  const bottomRef = useRef<HTMLDivElement>(null)
  const mensajesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const { data, isLoading } = useQuery({
    queryKey: ['mensajeria-mensajes', canal.id],
    queryFn: () => mensajeriaService.getMensajes(canal.id),
  })

  // Mismo queryKey que la pestaña de Mensajería — React Query lo deduplica, no
  // hay petición extra. La ventana flotante debe verse igual (tema y colores)
  // que el panel completo.
  const { data: config } = useQuery({
    queryKey: ['mensajeria-mi-config'],
    queryFn: () => mensajeriaService.getMiConfig(),
    staleTime: 5 * 60 * 1000,
  })

  const oscuro = config?.tema === 'oscuro'
  const colorPropio = config?.colorMensajePropio ?? '#2563EB'
  // El blanco es el valor por defecto de "Recibidos" — si el usuario nunca lo
  // personalizó, en modo oscuro se usa un gris oscuro en su lugar (como
  // WhatsApp), para no dejar burbujas blancas sólidas en un chat oscuro.
  const colorAjenoDefault = oscuro ? '#2A2F3A' : '#FFFFFF'
  const colorAjeno = (!config?.colorMensajeAjeno || config.colorMensajeAjeno.toUpperCase() === '#FFFFFF')
    ? colorAjenoDefault
    : config.colorMensajeAjeno
  const textColorPropio = getContrastTextColor(colorPropio)
  const textColorAjeno = getContrastTextColor(colorAjeno)

  // Solo se piden al abrir el panel — no hace falta cargarlos de entrada.
  const { data: canalDetalle, isLoading: cargandoMiembros } = useQuery({
    queryKey: ['mensajeria-canal-detalle', canal.id],
    queryFn: () => mensajeriaService.getCanal(canal.id),
    enabled: miembrosOpen && canal.tipo === 'grupo',
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
    mensajeriaService.marcarLeido(canal.id)
      .then(() => qc.invalidateQueries({ queryKey: ['mensajeria-canales'] }))
      .catch(() => {})
    clearUnread(canal.id)
  }, [canal.id, clearUnread, qc])

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
      mensajeriaService.marcarLeido(canal.id)
        .then(() => qc.invalidateQueries({ queryKey: ['mensajeria-canales'] }))
        .catch(() => {})
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

  const tempIdRef = useRef(-1)

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

  const handleEnviar = () => {
    const contenido = texto.trim()
    if (!contenido && !archivo) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    emitTyping(false)
    enviar.mutate({ contenido, file: archivo, tempId: tempIdRef.current-- })
  }

  // Punto único de validación/asignación de archivo — usado por el selector de
  // archivos, pegar del portapapeles (Ctrl+V) y arrastrar-soltar.
  const adjuntarArchivo = (file: File) => {
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

  // Arrastrar y soltar un archivo sobre la ventana de chat — dragCounterRef evita
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

  return (
    <div
      className={clsx(
        'pointer-events-auto relative flex w-96 flex-col rounded-t-2xl border shadow-2xl overflow-hidden',
        oscuro ? 'chat-tema-oscuro border-gray-700 bg-gray-900' : 'chat-tema-claro border-gray-200 bg-card',
      )}
      style={{ height: 520, position: 'fixed', bottom: 0, right: 24 + offset * (384 + 16), zIndex: 190 }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {arrastrandoArchivo && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-4 border-dashed border-brand bg-brand/10 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-4 py-3 shadow-xl">
            <Paperclip className="h-6 w-6 text-brand" />
            <p className="text-xs font-semibold text-brand">Suelta el archivo para adjuntarlo</p>
          </div>
        </div>
      )}
      {/* Barra de cabecera estilo Messenger */}
      <div className="flex items-center gap-2.5 bg-brand px-3 py-2.5 text-white shrink-0">
        {canal.tipo === 'grupo' ? (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
            <Users className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex-shrink-0"><Avatar name={canal.nombre ?? '?'} size="sm" /></div>
        )}
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold leading-tight">{canal.nombre || 'Conversación'}</p>
          {otrosEscribiendo ? (
            <p className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.65rem] text-white/70 leading-tight">
              {otrosEscribiendo} está escribiendo <TypingDots className="bg-white/70" />
            </p>
          ) : (
            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.65rem] text-white/70 leading-tight">Activo(a)</p>
          )}
        </div>
        {canal.tipo === 'grupo' && (
          <div className="relative">
            <button
              onClick={() => setMiembrosOpen((v) => !v)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
              title="Ver integrantes del grupo"
            >
              <Users className="h-3.5 w-3.5" />
            </button>
            {miembrosOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMiembrosOpen(false)} />
                <div className="absolute right-0 top-9 z-40 w-56 overflow-hidden rounded-xl border border-gray-200 bg-card text-gray-800 shadow-lg animate-fade-in">
                  <p className="border-b border-gray-100 px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-500">
                    Integrantes {canalDetalle ? `(${canalDetalle.miembros.length})` : ''}
                  </p>
                  {cargandoMiembros ? (
                    <div className="flex justify-center py-4"><span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/20 border-t-brand" /></div>
                  ) : (
                    <div className="max-h-56 space-y-0.5 overflow-y-auto p-1.5">
                      {canalDetalle?.miembros.map((m) => (
                        <div key={m.usuarioId} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                          <Avatar name={m.nombre} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-gray-800">
                              {m.nombre}{m.usuarioId === user?.id && ' (tú)'}
                            </p>
                            {m.usuarioId === canal.creadoPor && (
                              <p className="text-[0.6rem] text-brand">Creador del grupo</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {esPortalCliente && (
          <>
            <button
              onClick={() => setSolicitarReunionModalidad('telefonica')}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
              title="Solicitar llamada"
            >
              <Phone className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSolicitarReunionModalidad('videollamada')}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
              title="Solicitar reunión"
            >
              <Video className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          onClick={() => minimizarChatFlotante(canal.id)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
          title="Minimizar"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => cerrarChatFlotante(canal.id)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
          title="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mensajes */}
      <div ref={mensajesContainerRef} className={clsx('flex-1 overflow-y-auto px-3 py-3', oscuro ? 'bg-gray-900' : 'bg-gray-50')}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
          </div>
        ) : (
          mensajes.map((m, i) => {
            const esMio = m.emisorId === user?.id
            const bgColor = esMio ? hexToRgba(colorPropio, 0.55) : colorAjeno
            const textColor = esMio ? textColorPropio : textColorAjeno
            const grupos = agruparReacciones(m.reacciones)
            const miReaccion = m.reacciones.find((r) => r.usuarioId === user?.id)?.emoji
            // Mensajes consecutivos del mismo remitente quedan más pegados entre
            // sí (como WhatsApp agrupa una racha); más aire cuando cambia quién habla.
            const mismoRemitenteQueAnterior = i > 0 && mensajes[i - 1].emisorId === m.emisorId
            const cambioDeDia = i === 0 || claveDia(mensajes[i - 1].fecha) !== claveDia(m.fecha)
            const mostrarAvatarGrupo = !esMio && canal.tipo === 'grupo' && !mismoRemitenteQueAnterior
            return (
              <div key={m.id} className="contents">
                {cambioDeDia && (
                  <div className="my-3 flex items-center justify-center">
                    <span className={clsx('rounded-full px-2.5 py-1 text-[0.62rem] font-medium', oscuro ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500 shadow-sm')}>
                      {formatFechaSeparador(m.fecha)}
                    </span>
                  </div>
                )}
              <div className={clsx('group/msg relative flex flex-col animate-fade-in', esMio ? 'items-end' : 'items-start', mismoRemitenteQueAnterior && !cambioDeDia ? 'mt-0.5' : 'mt-3')}>
                {mostrarAvatarGrupo && (
                  <span className={clsx('mb-0.5 pl-8 text-[0.62rem] font-semibold', oscuro ? 'text-gray-300' : 'text-gray-700')}>{m.emisorNombre}</span>
                )}
                <div
                  className={clsx('relative flex items-start gap-1.5', esMio ? 'justify-end' : 'justify-start')}
                  onMouseEnter={() => setReaccionandoId(m.id)}
                  onMouseLeave={() => setReaccionandoId((v) => (v === m.id ? null : v))}
                >
                  {!esMio && canal.tipo === 'grupo' && (
                    <div className="h-6 w-6 flex-shrink-0">
                      {mostrarAvatarGrupo && <Avatar name={m.emisorNombre || '?'} size="sm" ring={oscuro ? 'brand' : 'white'} />}
                    </div>
                  )}
                  {/* Barra de reacciones rápidas — aparece al hacer hover del mensaje */}
                  {reaccionandoId === m.id && (
                    <div
                      className={clsx(
                        'absolute -top-8 z-20 flex items-center gap-0.5 rounded-full border px-1 py-1 shadow-lg',
                        esMio ? 'right-0' : 'left-0',
                        oscuro ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white',
                      )}
                    >
                      {REACCIONES_RAPIDAS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaccionar(m.id, emoji)}
                          className={clsx(
                            'flex h-6 w-6 items-center justify-center rounded-full text-sm transition-transform hover:scale-125',
                            miReaccion === emoji && 'bg-brand-light',
                          )}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setPickerReaccionId(m.id)}
                        className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', oscuro ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100')}
                        title="Más emojis"
                      >
                        <Smile size={13} />
                      </button>
                      {esMio && (
                        <button
                          onClick={() => setMenuMensajeId((v) => (v === m.id ? null : m.id))}
                          className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', oscuro ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100')}
                          title="Más opciones"
                        >
                          <MoreVertical size={13} />
                        </button>
                      )}
                      {pickerReaccionId === m.id && (
                        <div className={clsx('absolute top-8 z-30', esMio ? 'right-0' : 'left-0')}>
                          <EmojiPicker
                            onSelect={(emoji) => handleReaccionar(m.id, emoji)}
                            onClose={() => setPickerReaccionId(null)}
                            className="w-72"
                          />
                        </div>
                      )}
                      {menuMensajeId === m.id && (
                        <div ref={menuRef} className={clsx('absolute top-8 right-0 z-30 w-36 overflow-hidden rounded-xl border shadow-lg animate-fade-in', oscuro ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-card')}>
                          <button
                            onClick={() => iniciarEdicion(m)}
                            className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-xs', oscuro ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50')}
                          >
                            <Pencil size={13} /> Editar
                          </button>
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
                        'max-w-[75%] rounded-2xl px-3 py-1.5 text-[0.8rem]',
                        esMio ? 'border border-white/15 shadow-lg backdrop-blur-md' : (!oscuro && 'border border-gray-200'),
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
                        className="w-full min-w-[140px] border-b bg-transparent text-[0.8rem] outline-none"
                        style={{ borderColor: textColor === 'white' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)', color: textColor }}
                      />
                      <div className="mt-1 flex items-center justify-end gap-1.5">
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
                    <div className="max-w-[75%]" style={{ display: 'table' }}>
                    {m.archivoUrl && !esImagen(m.archivoUrl) && !m.contenido ? (() => {
                      // Documento solo (sin texto) — la tarjeta del documento ES la
                      // burbuja, sin un segundo card de fondo alrededor envolviéndola.
                      const { Icono, color, bg, etiqueta } = tipoArchivo(m.archivoUrl)
                      const claro = textColor !== 'white'
                      return (
                        <div
                          className={clsx(
                            'w-[200px] overflow-hidden rounded-2xl transition-opacity',
                            esMio ? 'border border-white/15 shadow-lg backdrop-blur-md' : (!oscuro && 'border border-gray-200'),
                            m.estadoEnvio === 'enviando' && 'opacity-60',
                          )}
                          style={{ backgroundColor: bgColor, color: textColor }}
                        >
                          <div className="flex items-center gap-2 px-2.5 py-2">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
                              <Icono className="h-4 w-4" style={{ color }} />
                            </span>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="truncate text-xs font-semibold">{nombreDeUrl(m.archivoUrl)}</p>
                              <p className="text-[0.6rem] opacity-70">{etiqueta}</p>
                            </div>
                          </div>
                          <div className="flex border-t" style={{ borderColor: claro ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }}>
                            <a
                              href={m.archivoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[0.62rem] font-semibold hover:opacity-70"
                            >
                              <Eye className="h-3 w-3" /> Ver
                            </a>
                            <div className="w-px" style={{ background: claro ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }} />
                            <a
                              href={m.archivoUrl}
                              download
                              className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[0.62rem] font-semibold hover:opacity-70"
                            >
                              <Download className="h-3 w-3" /> Guardar
                            </a>
                          </div>
                        </div>
                      )
                    })() : (
                    <div
                      className={clsx(
                        'min-w-[56px] max-w-full overflow-hidden rounded-2xl px-3 py-1.5 text-[0.8rem] transition-opacity',
                        esMio ? 'border border-white/15 shadow-lg backdrop-blur-md' : (!oscuro && 'border border-gray-200'),
                        m.estadoEnvio === 'enviando' && 'opacity-60',
                      )}
                      style={{ backgroundColor: bgColor, color: textColor }}
                    >
                      {m.contenido && <p className="whitespace-pre-wrap break-words text-left">{m.contenido.trim()}</p>}
                      {m.archivoUrl && (
                        esImagen(m.archivoUrl) ? (
                          <a href={m.archivoUrl} target="_blank" rel="noreferrer" className="block mt-1">
                            <img src={m.archivoUrl} alt={nombreDeUrl(m.archivoUrl)} className="block w-full max-w-[180px] h-auto rounded-lg object-cover" />
                          </a>
                        ) : (
                          <div
                            className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.7rem] font-medium"
                            style={{ backgroundColor: textColor === 'white' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)' }}
                          >
                            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                            {esPrevisualizable(m.archivoUrl) ? (
                              <a href={m.archivoUrl} target="_blank" rel="noreferrer" className="truncate max-w-[110px] hover:underline">
                                {nombreDeUrl(m.archivoUrl)}
                              </a>
                            ) : (
                              <span className="truncate max-w-[110px]">{nombreDeUrl(m.archivoUrl)}</span>
                            )}
                            <a href={m.archivoUrl} download className="flex-shrink-0 hover:opacity-70" title="Descargar">
                              <Download className="h-3 w-3" />
                            </a>
                          </div>
                        )
                      )}
                    </div>
                    )}
                    <div className={clsx('flex items-center gap-1 text-[9px] mt-0.5 px-1 whitespace-nowrap', oscuro ? 'text-gray-500' : 'text-gray-400')}>
                      {m.editado && <span className="italic">editado ·</span>}
                      {m.estadoEnvio === 'enviando' ? (
                        <RotateCw size={9} className="animate-spin" />
                      ) : m.estadoEnvio === 'error' ? (
                        <button
                          onClick={() => reintentarEnvio(m)}
                          className="flex items-center gap-0.5 text-red-500 hover:underline"
                          title="Error al enviar — clic para reintentar"
                        >
                          <AlertCircle size={10} /> reintentar
                        </button>
                      ) : (
                        <span>{formatHora(m.fecha)}</span>
                      )}
                    </div>
                    </div>
                  )}
                </div>
                {confirmarEliminarId === m.id && (
                  <div className={clsx('mt-1 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[0.7rem]', oscuro ? 'border-red-900 bg-red-950/40' : 'border-red-200 bg-red-50')}>
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
                          'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[0.7rem] transition-colors',
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
              </div>
            )
          })
        )}
        {otrosEscribiendo && (
          <div className="mt-2 flex w-full items-start justify-start">
            <div className={clsx('inline-flex items-center rounded-2xl px-3 py-2', oscuro ? 'bg-gray-800' : 'bg-white border border-gray-200')}>
              <TypingDots className="bg-gray-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={clsx('border-t p-2 shrink-0', oscuro ? 'border-gray-700' : 'border-gray-100')}>
        {archivo && (
          <div className={clsx('mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.7rem]', oscuro ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700')}>
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate flex-1">{archivo.name}</span>
            <button onClick={() => setArchivo(null)} className="text-gray-400 hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleSeleccionArchivo} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
            title="Adjuntar archivo"
          >
            <Paperclip size={16} />
          </button>
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
              title="Insertar emoji"
            >
              <Smile size={16} />
            </button>
            {emojiOpen && (
              <div className="absolute bottom-10 left-0 z-30">
                <EmojiPicker onSelect={handleSeleccionEmoji} onClose={() => setEmojiOpen(false)} className="w-72" />
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
              el.style.height = `${Math.min(el.scrollHeight, 96)}px`
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
              'flex-1 resize-none rounded-3xl border px-3 py-1.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-brand/20',
              oscuro ? 'border-gray-700 bg-gray-800 text-gray-100 placeholder-gray-500' : 'border-gray-200 bg-white text-gray-900',
            )}
            style={{ maxHeight: 96, colorScheme: oscuro ? 'dark' : 'light' }}
          />
          <button
            onClick={handleEnviar}
            disabled={(!texto.trim() && !archivo) || enviar.isPending}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            style={(texto.trim() || archivo) ? { backgroundColor: hexToRgba(colorPropio, 0.55), color: textColorPropio } : { backgroundColor: oscuro ? 'rgb(var(--gray-800))' : 'rgb(var(--gray-100))', color: oscuro ? 'rgb(var(--gray-500))' : 'rgb(var(--gray-300))' }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {solicitarReunionModalidad && (
        <SolicitarReunionModal
          modalidadPreset={solicitarReunionModalidad}
          onClose={() => setSolicitarReunionModalidad(null)}
        />
      )}
    </div>
  )
}
