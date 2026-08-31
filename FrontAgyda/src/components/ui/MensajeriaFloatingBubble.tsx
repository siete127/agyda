import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, X, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCurrentUser } from '@/hooks/useAuth'
import { useSocketEvent } from '@/hooks/useSocket'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { mensajeriaService } from '@/services/mensajeria.service'
import { parseMensajeriaMensaje, type MensajeriaMensaje } from '@/types/mensajeria.types'
import { Avatar } from '@/components/ui/Avatar'
import { MensajeriaChatWindow } from '@/components/ui/MensajeriaChatWindow'
import { clsx } from 'clsx'

interface Alerta {
  uid: number
  canalId: number
  emisorNombre: string
  preview: string
}

export function MensajeriaFloatingBubble() {
  const user = useCurrentUser()
  const location = useLocation()
  const canalAbiertoId = useMensajeriaStore((s) => s.canalAbiertoId)
  const canales = useMensajeriaStore((s) => s.canales)
  const chatsFlotantes = useMensajeriaStore((s) => s.chatsFlotantes)
  const minimizadosFlotantes = useMensajeriaStore((s) => s.minimizadosFlotantes)
  const abrirChatFlotante = useMensajeriaStore((s) => s.abrirChatFlotante)
  const restaurarChatFlotante = useMensajeriaStore((s) => s.restaurarChatFlotante)
  const cerrarChatFlotante = useMensajeriaStore((s) => s.cerrarChatFlotante)

  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [borradores, setBorradores] = useState<Record<number, string>>({})
  const counterRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const canalPorUidRef = useRef<Map<number, number>>(new Map())
  const locationRef = useRef(location)
  locationRef.current = location
  const canalAbiertoRef = useRef(canalAbiertoId)
  canalAbiertoRef.current = canalAbiertoId

  const { data: config } = useQuery({
    queryKey: ['mensajeria-mi-config'],
    queryFn: () => mensajeriaService.getMiConfig(),
    staleTime: 5 * 60 * 1000,
  })

  function dismiss(uid: number) {
    const timer = timersRef.current.get(uid)
    if (timer) { clearTimeout(timer); timersRef.current.delete(uid) }
    canalPorUidRef.current.delete(uid)
    setAlertas((prev) => prev.filter((a) => a.uid !== uid))
    setBorradores((prev) => { const next = { ...prev }; delete next[uid]; return next })
  }

  function armarTimer(uid: number, duracionSeg: number) {
    const existente = timersRef.current.get(uid)
    if (existente) clearTimeout(existente)
    const timer = setTimeout(() => dismiss(uid), duracionSeg * 1000)
    timersRef.current.set(uid, timer)
  }

  useSocketEvent<Record<string, unknown>>('mensajeria:nuevo_mensaje', (raw) => {
    const msg: MensajeriaMensaje = parseMensajeriaMensaje(raw)
    console.debug('[MensajeriaBubble] evento recibido', { msg, userId: user?.id, config, pathname: locationRef.current.pathname, canalAbierto: canalAbiertoRef.current })

    if (config?.burbujaActiva === false) { console.debug('[MensajeriaBubble] suprimida: burbujaActiva=false'); return }
    if (msg.emisorId === user?.id) { console.debug('[MensajeriaBubble] suprimida: es mi propio mensaje'); return }

    const enModuloConMismoCanal = locationRef.current.pathname === '/mensajeria' && canalAbiertoRef.current === msg.canalId
    if (enModuloConMismoCanal) { console.debug('[MensajeriaBubble] suprimida: ya viendo ese canal'); return }

    console.debug('[MensajeriaBubble] mostrando burbuja para canal', msg.canalId)

    setAlertas((prev) => {
      const existente = prev.find((a) => a.canalId === msg.canalId)
      if (existente) {
        // Reutiliza la burbuja del mismo canal en vez de duplicar, y actualiza el preview.
        if (config?.burbujaAutoocultar !== false) armarTimer(existente.uid, config?.burbujaDuracionSeg ?? 15)
        return prev.map((a) => (a.canalId === msg.canalId ? { ...a, preview: msg.contenido || '📎 Archivo adjunto', emisorNombre: msg.emisorNombre } : a))
      }
      const uid = ++counterRef.current
      canalPorUidRef.current.set(uid, msg.canalId)
      if (config?.burbujaAutoocultar !== false) armarTimer(uid, config?.burbujaDuracionSeg ?? 15)
      return [...prev, { uid, canalId: msg.canalId, emisorNombre: msg.emisorNombre, preview: msg.contenido || '📎 Archivo adjunto' }]
    })
  })

  // Al entrar al módulo de Mensajería, ocultar todas las burbujas (ya tiene la lista/chat visibles ahí).
  useEffect(() => {
    if (location.pathname === '/mensajeria') {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      canalPorUidRef.current.clear()
      setAlertas([])
    }
  }, [location.pathname])

  useEffect(() => {
    return () => { timersRef.current.forEach((t) => clearTimeout(t)) }
  }, [])

  const responder = useMutation({
    mutationFn: ({ canalId, contenido }: { canalId: number; contenido: string }) =>
      mensajeriaService.enviarMensaje(canalId, contenido),
  })

  function handleResponder(alerta: Alerta) {
    const contenido = (borradores[alerta.uid] || '').trim()
    if (!contenido) return
    responder.mutate({ canalId: alerta.canalId, contenido }, {
      onSuccess: () => {
        setBorradores((prev) => ({ ...prev, [alerta.uid]: '' }))
        if (config?.burbujaAutoocultar !== false) armarTimer(alerta.uid, config?.burbujaDuracionSeg ?? 15)
      },
      onError: () => toast.error('No se pudo enviar la respuesta'),
    })
  }

  function irAConversacion(alerta: Alerta) {
    dismiss(alerta.uid)
    abrirChatFlotante(alerta.canalId)
  }

  const panelesFlotantes = chatsFlotantes
    .filter((id) => !minimizadosFlotantes[id])
    .map((id) => canales.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)

  const minimizadosVisibles = chatsFlotantes
    .filter((id) => minimizadosFlotantes[id])
    .map((id) => canales.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)

  if (alertas.length === 0 && chatsFlotantes.length === 0) return null

  return createPortal(
    <>
    {panelesFlotantes.map((canal, i) => (
      <MensajeriaChatWindow key={canal.id} canal={canal} offset={i} />
    ))}

    {minimizadosVisibles.length > 0 && (
      <div className="pointer-events-auto fixed bottom-24 right-3 z-[190] flex flex-col items-end gap-2.5">
        {minimizadosVisibles.map((canal) => (
          <button
            key={canal.id}
            onClick={() => restaurarChatFlotante(canal.id)}
            className="group relative flex-shrink-0"
            title={canal.nombre || 'Conversación'}
          >
            <div className="rounded-full ring-2 ring-white shadow-lg transition-transform group-hover:scale-105">
              {canal.tipo === 'grupo' ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white">
                  <Users className="h-6 w-6" />
                </div>
              ) : (
                <Avatar name={canal.nombre ?? '?'} size="lg" />
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white" />
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); cerrarChatFlotante(canal.id) }}
              className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-400 text-white opacity-0 group-hover:opacity-100 hover:bg-gray-600 transition-all"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
    )}

    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {alertas.map((alerta) => (
        <div
          key={alerta.uid}
          className="pointer-events-auto rounded-2xl border border-gray-200 bg-card shadow-2xl overflow-hidden animate-fade-in"
        >
          <div
            className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => irAConversacion(alerta)}
          >
            <div className="relative flex-shrink-0">
              <Avatar name={alerta.emisorNombre} size="sm" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.78rem] font-bold text-gray-900 truncate">{alerta.emisorNombre}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(alerta.uid) }}
                  className="rounded-lg p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[0.78rem] text-gray-500 truncate mt-0.5">{alerta.preview}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-gray-100 p-2.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={borradores[alerta.uid] ?? ''}
              onChange={(e) => setBorradores((prev) => ({ ...prev, [alerta.uid]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleResponder(alerta)}
              placeholder="Responder..."
              className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <button
              onClick={() => handleResponder(alerta)}
              disabled={!borradores[alerta.uid]?.trim() || responder.isPending}
              className={clsx(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                borradores[alerta.uid]?.trim() ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-gray-100 text-gray-300',
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
    </>,
    document.body,
  )
}
