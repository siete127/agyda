import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Users, Minus, X, Smile, Phone, Video } from 'lucide-react'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { useCurrentUser } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import type { MensajeriaCanal, MensajeriaMensaje } from '@/types/mensajeria.types'
import { parseMensajeriaMensaje } from '@/types/mensajeria.types'
import { clsx } from 'clsx'

function formatHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

interface MensajeriaChatWindowProps {
  canal: MensajeriaCanal
  offset: number
}

export function MensajeriaChatWindow({ canal, offset }: MensajeriaChatWindowProps) {
  const user = useCurrentUser()
  const clearUnread = useMensajeriaStore((s) => s.clearUnread)
  const minimizarChatFlotante = useMensajeriaStore((s) => s.minimizarChatFlotante)
  const cerrarChatFlotante = useMensajeriaStore((s) => s.cerrarChatFlotante)

  const [mensajes, setMensajes] = useState<MensajeriaMensaje[]>([])
  const [texto, setTexto] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [otrosEscribiendo, setOtrosEscribiendo] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    setMensajes((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    if (msg.emisorId !== user?.id) {
      mensajeriaService.marcarLeido(canal.id).catch(() => {})
      clearUnread(canal.id)
    }
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const enviar = useMutation({
    mutationFn: (contenido: string) => mensajeriaService.enviarMensaje(canal.id, contenido),
    onSuccess: () => setTexto(''),
  })

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
    if (!contenido) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    emitTyping(false)
    enviar.mutate(contenido)
  }

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
      className="pointer-events-auto flex w-80 flex-col rounded-t-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
      style={{ height: 420, position: 'fixed', bottom: 0, right: 24 + offset * (320 + 16), zIndex: 190 }}
    >
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
      <div className="flex-1 overflow-y-auto bg-gray-50 px-3 py-3 space-y-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
          </div>
        ) : (
          mensajes.map((m) => {
            const esMio = m.emisorId === user?.id
            return (
              <div key={m.id} className={clsx('flex', esMio ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[75%] rounded-2xl px-3 py-1.5 text-[0.8rem]',
                    esMio ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800',
                  )}
                >
                  {!esMio && canal.tipo === 'grupo' && (
                    <div className="text-[0.62rem] font-semibold text-brand mb-0.5">{m.emisorNombre}</div>
                  )}
                  {m.contenido && <p className="whitespace-pre-wrap break-words">{m.contenido}</p>}
                  <div className={clsx('text-[9px] mt-0.5 opacity-70', esMio && 'text-white')}>{formatHora(m.fecha)}</div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-1.5 border-t border-gray-100 p-2 shrink-0">
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
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/20"
        />
        <button
          onClick={handleEnviar}
          disabled={!texto.trim() || enviar.isPending}
          className={clsx(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
            texto.trim() ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-gray-100 text-gray-300',
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
