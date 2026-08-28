import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LifeBuoy, X, Send } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { livechatInternoService, type MensajeLivechat } from '@/services/livechatInterno.service'
import { clsx } from 'clsx'

export function SoporteTIWidget() {
  const [abierto, setAbierto] = useState(false)
  const [conversacionId, setConversacionId] = useState<number | null>(null)
  const [estado, setEstado] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [mensajes, setMensajes] = useState<MensajeLivechat[]>([])
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [iniciando, setIniciando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes])

  useEffect(() => {
    if (!conversacionId) return
    const sock = getSocket()
    sock.emit('join_livechat_conversation', { conversacionId })
    return () => { sock.emit('leave_livechat_conversation', { conversacionId }) }
  }, [conversacionId])

  useSocketEvent<MensajeLivechat>('receive_livechat_message', (msg) => {
    if (msg.conversacionId !== conversacionId) return
    setMensajes((prev) => [...prev, msg])
  })

  useSocketEvent<{ conversacionId: number }>('livechat:conversacion_cerrada', (payload) => {
    if (payload.conversacionId !== conversacionId) return
    setEstado('cerrada')
  })

  async function iniciarChat() {
    if (!motivo.trim()) return
    setIniciando(true)
    try {
      const data = await livechatInternoService.iniciar(motivo.trim())
      setConversacionId(data.conversacionId)
      setEstado(data.estado)
      setTicketId(data.ticketId)
      const detalle = await livechatInternoService.getConversacion(data.conversacionId)
      setMensajes(detalle.mensajes)
      qc.invalidateQueries({ queryKey: ['tickets'] })
    } catch {
      toast.error('No se pudo iniciar el chat de soporte')
    } finally {
      setIniciando(false)
    }
  }

  async function enviar() {
    if (!nuevoMensaje.trim() || !conversacionId) return
    setEnviando(true)
    const texto = nuevoMensaje.trim()
    setNuevoMensaje('')
    try {
      await livechatInternoService.enviarMensaje(conversacionId, texto)
    } catch {
      toast.error('No se pudo enviar el mensaje')
    } finally {
      setEnviando(false)
    }
  }

  function cerrarPanel() {
    setAbierto(false)
  }

  function nuevaConversacion() {
    setConversacionId(null)
    setEstado(null)
    setTicketId(null)
    setMotivo('')
    setMensajes([])
  }

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-24 z-[195] flex flex-col items-end gap-2.5">
      {abierto && (
        <div className="pointer-events-auto flex h-[26rem] w-80 flex-col overflow-hidden rounded-2xl border border-surface-border bg-card shadow-xl">
          <div className="flex items-center justify-between bg-brand px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4" />
              <span className="text-sm font-semibold">Soporte TI</span>
            </div>
            <button onClick={cerrarPanel} className="text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!conversacionId ? (
            <div className="flex flex-1 flex-col gap-3 p-4">
              <p className="text-[0.8rem] text-ink-secondary">¿En qué necesitás ayuda? Describí brevemente tu problema y te conectamos con un técnico.</p>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={4}
                className="field resize-none text-sm"
                placeholder="Ej: No puedo entrar a mi correo..."
                autoFocus
              />
              <button
                onClick={iniciarChat}
                disabled={!motivo.trim() || iniciando}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {iniciando ? 'Conectando...' : 'Iniciar chat'}
              </button>
            </div>
          ) : (
            <>
              <div className="border-b border-surface-border px-4 py-2 text-[0.72rem] text-ink-tertiary">
                {estado === 'activa' ? 'Conectado con un técnico'
                  : estado === 'cerrada' ? 'Esta conversación fue cerrada'
                  : 'Esperando un técnico disponible...'}
                {ticketId && <span className="ml-1">· Ticket #{ticketId}</span>}
              </div>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={clsx(
                      'max-w-[85%] rounded-xl px-3 py-1.5 text-[0.78rem]',
                      m.emisor === 'visitante' ? 'ml-auto bg-brand text-white' :
                      m.emisor === 'sistema' ? 'mx-auto bg-surface text-ink-tertiary italic text-center' :
                      'bg-surface text-ink',
                    )}
                  >
                    {m.contenido}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-surface-border p-2.5">
                <input
                  value={nuevoMensaje}
                  onChange={(e) => setNuevoMensaje(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
                  disabled={estado === 'cerrada'}
                  className="field flex-1 py-1.5 text-sm disabled:opacity-50"
                  placeholder={estado === 'cerrada' ? 'Conversación cerrada' : 'Escribe un mensaje...'}
                />
                <button onClick={enviar} disabled={!nuevoMensaje.trim() || enviando || estado === 'cerrada'} className="rounded-lg bg-brand p-2 text-white disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              {estado !== 'activa' && (
                <button onClick={nuevaConversacion} className="border-t border-surface-border px-3 py-1.5 text-[0.68rem] text-ink-tertiary hover:text-ink">
                  Nueva conversación
                </button>
              )}
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105"
        title="Soporte TI"
      >
        <LifeBuoy className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  )
}
