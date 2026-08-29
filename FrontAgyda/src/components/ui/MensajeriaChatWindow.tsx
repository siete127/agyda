import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Users, Minus, X, Smile, Phone, Video, MoreVertical, Pencil, Trash2, Check, AlertCircle, RotateCw, Paperclip, FileText, Download } from 'lucide-react'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { useCurrentUser } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import type { MensajeriaCanal, MensajeriaMensaje, MensajeriaReaccion } from '@/types/mensajeria.types'
import { parseMensajeriaMensaje } from '@/types/mensajeria.types'
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

const MAX_ADJUNTO_MB = 15

function esImagen(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url)
}

function esPrevisualizable(url: string): boolean {
  return /\.(pdf|txt|mp4|webm|mov|mp3|wav|ogg)$/i.test(url)
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const mensajesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
  const handlePegarArchivo = (e: React.ClipboardEvent<HTMLInputElement>) => {
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
      className="pointer-events-auto relative flex w-96 flex-col rounded-t-2xl border border-gray-200 bg-card shadow-2xl overflow-hidden"
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
          <Avatar name={canal.nombre ?? '?'} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{canal.nombre || 'Conversación'}</p>
          <p className="truncate text-[0.65rem] text-white/70 leading-tight">
            {otrosEscribiendo ? `${otrosEscribiendo} está escribiendo…` : 'Activo(a)'}
          </p>
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
        <button className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white/70 opacity-50 cursor-not-allowed" title="Llamada de voz (no disponible)" disabled>
          <Phone className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white/70 opacity-50 cursor-not-allowed" title="Videollamada (no disponible)" disabled>
          <Video className="h-3.5 w-3.5" />
        </button>
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
      <div ref={mensajesContainerRef} className="flex-1 overflow-y-auto bg-gray-50 px-3 py-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
          </div>
        ) : (
          mensajes.map((m, i) => {
            const esMio = m.emisorId === user?.id
            const grupos = agruparReacciones(m.reacciones)
            const miReaccion = m.reacciones.find((r) => r.usuarioId === user?.id)?.emoji
            // Mensajes consecutivos del mismo remitente quedan más pegados entre
            // sí (como WhatsApp agrupa una racha); más aire cuando cambia quién habla.
            const mismoRemitenteQueAnterior = i > 0 && mensajes[i - 1].emisorId === m.emisorId
            return (
              <div key={m.id} className={clsx('group/msg relative flex flex-col animate-fade-in', esMio ? 'items-end' : 'items-start', mismoRemitenteQueAnterior ? 'mt-0.5' : 'mt-3')}>
                <div
                  className={clsx('relative flex', esMio ? 'justify-end' : 'justify-start')}
                  onMouseEnter={() => setReaccionandoId(m.id)}
                  onMouseLeave={() => setReaccionandoId((v) => (v === m.id ? null : v))}
                >
                  {/* Barra de reacciones rápidas — aparece al hacer hover del mensaje */}
                  {reaccionandoId === m.id && (
                    <div
                      className={clsx(
                        'absolute -top-8 z-20 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-1 shadow-lg',
                        esMio ? 'right-0' : 'left-0',
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
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
                        title="Más emojis"
                      >
                        <Smile size={13} />
                      </button>
                      {esMio && (
                        <button
                          onClick={() => setMenuMensajeId((v) => (v === m.id ? null : m.id))}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
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
                        <div ref={menuRef} className="absolute top-8 right-0 z-30 w-36 overflow-hidden rounded-xl border border-gray-200 bg-card shadow-lg animate-fade-in">
                          <button
                            onClick={() => iniciarEdicion(m)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
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
                        esMio ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-gray-200 bg-card text-gray-800',
                      )}
                    >
                      <input
                        autoFocus
                        value={textoEdicion}
                        onChange={(e) => setTextoEdicion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') guardarEdicion(m.id)
                          if (e.key === 'Escape') setEditandoId(null)
                        }}
                        className={clsx(
                          'w-full min-w-[140px] border-b bg-transparent text-[0.8rem] outline-none',
                          esMio ? 'border-white/40 placeholder-white/60' : 'border-gray-300',
                        )}
                      />
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        <button onClick={() => setEditandoId(null)} className={clsx('text-[10px] opacity-80 hover:opacity-100', esMio && 'text-white')}>
                          Cancelar
                        </button>
                        <button
                          onClick={() => guardarEdicion(m.id)}
                          disabled={!textoEdicion.trim() || editarMensaje.isPending}
                          className={clsx(
                            'flex items-center gap-0.5 text-[10px] font-semibold opacity-90 hover:opacity-100 disabled:opacity-40',
                            esMio && 'text-white',
                          )}
                        >
                          <Check size={11} /> Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={clsx(
                        'inline-flex min-w-[56px] max-w-[75%] flex-col overflow-hidden rounded-2xl px-3 py-1.5 text-[0.8rem] transition-opacity',
                        esMio ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-gray-200 bg-card text-gray-800',
                        m.estadoEnvio === 'enviando' && 'opacity-60',
                      )}
                    >
                      {!esMio && canal.tipo === 'grupo' && (
                        <div className="text-[0.62rem] font-semibold text-brand mb-0.5">{m.emisorNombre}</div>
                      )}
                      {m.contenido && <p className="whitespace-pre-wrap break-words">{m.contenido.trim()}</p>}
                      {m.archivoUrl && (
                        esImagen(m.archivoUrl) ? (
                          <a href={m.archivoUrl} target="_blank" rel="noreferrer" className="block mt-1">
                            <img src={m.archivoUrl} alt={nombreDeUrl(m.archivoUrl)} className="block w-full max-w-[180px] h-auto rounded-lg object-cover" />
                          </a>
                        ) : (
                          <div
                            className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.7rem] font-medium"
                            style={esMio ? { backgroundColor: 'rgba(255,255,255,0.15)' } : { backgroundColor: 'rgba(0,0,0,0.06)' }}
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
                      <div className={clsx('flex items-center justify-end gap-1 text-[9px] mt-0.5 opacity-70 whitespace-nowrap', esMio && 'text-white')}>
                        {m.editado && <span className="italic">editado ·</span>}
                        {m.estadoEnvio === 'enviando' ? (
                          <RotateCw size={9} className="animate-spin" />
                        ) : m.estadoEnvio === 'error' ? (
                          <button
                            onClick={() => reintentarEnvio(m)}
                            className="flex items-center gap-0.5 text-red-200 hover:text-white"
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
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[0.7rem]">
                    <span className="text-red-700">¿Eliminar este mensaje?</span>
                    <button
                      onClick={() => eliminarMensaje.mutate(m.id)}
                      disabled={eliminarMensaje.isPending}
                      className="font-semibold text-red-600 hover:text-red-800"
                    >
                      Sí
                    </button>
                    <button onClick={() => setConfirmarEliminarId(null)} className="text-gray-500 hover:text-gray-700">
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
                            : 'border-gray-200 bg-white hover:bg-gray-50',
                        )}
                      >
                        <span>{emoji}</span>
                        {lista.length > 1 && <span className="text-gray-500">{lista.length}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-2 shrink-0">
        {archivo && (
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[0.7rem] text-gray-700">
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
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            title="Adjuntar archivo"
          >
            <Paperclip size={16} />
          </button>
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
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
          <input
            ref={inputRef}
            type="text"
            value={texto}
            onChange={(e) => handleChangeTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnviar()}
            onPaste={handlePegarArchivo}
            placeholder="Escribe un mensaje..."
            className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            onClick={handleEnviar}
            disabled={(!texto.trim() && !archivo) || enviar.isPending}
            className={clsx(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
              texto.trim() || archivo ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-gray-100 text-gray-300',
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
