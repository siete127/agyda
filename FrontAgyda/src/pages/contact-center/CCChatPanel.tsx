import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, CheckCircle2, ArrowRightLeft, Paperclip } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccService } from '@/services/cc.service'
import { getSocket } from '@/lib/socket'
import { CANAL_ICONO, CANAL_LABEL, type CCInteraccion } from '@/types/cc.types'

export function fmtHora(iso: string | null) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Panel de chat de una interacción de Contact Center (WhatsApp/Messenger/
// Instagram/web pública) — compartido entre /contact-center y la bandeja
// unificada de Asesores (LivechatPage), que también atiende estos canales
// junto a las conversaciones del motor viejo de Livechat.
export function CCChatPanel({ interaccionId, onClosed }: { interaccionId: number; onClosed: () => void }) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [transfiriendo, setTransfiriendo] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: inter } = useQuery({
    queryKey: ['cc-inter-detalle', interaccionId],
    queryFn: () => ccService.getInteraccion(interaccionId),
    refetchInterval: 5000,
  })
  const { data: plantillas = [] } = useQuery({
    queryKey: ['cc-plantillas', inter?.grupoId],
    queryFn: () => ccService.getPlantillas(inter!.grupoId!),
    enabled: !!inter?.grupoId,
  })

  useEffect(() => {
    const s = getSocket()
    s.emit('join_livechat_conversation', { conversacionId: `cc-${interaccionId}` })
    const h = () => qc.invalidateQueries({ queryKey: ['cc-inter-detalle', interaccionId] })
    s.on('cc:mensaje', h)
    s.on('cc:interaccion_cerrada', h)
    return () => { s.off('cc:mensaje', h); s.off('cc:interaccion_cerrada', h) }
  }, [interaccionId, qc])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [inter?.mensajes?.length])

  const tomar = useMutation({
    mutationFn: () => ccService.tomar(interaccionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cc-inter-detalle', interaccionId] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo tomar'),
  })
  const enviar = useMutation({
    mutationFn: (t: string) => ccService.enviarMensaje(interaccionId, t),
    onSuccess: () => { setTexto(''); qc.invalidateQueries({ queryKey: ['cc-inter-detalle', interaccionId] }) },
    onError: (e: any) => {
      if (e?.response?.data?.code === 'FUERA_VENTANA_24H') toast.error(e.response.data.message)
      else toast.error(e?.response?.data?.message ?? 'No se pudo enviar')
    },
  })
  const subir = useMutation({
    mutationFn: (f: File) => ccService.subirMedia(interaccionId, f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cc-inter-detalle', interaccionId] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo enviar el archivo'),
  })

  if (!inter) return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>

  const enCola = inter.estado === 'en_cola'
  const cerrada = inter.estado === 'cerrada'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <div>
          <p className="text-sm font-bold text-gray-800">{CANAL_ICONO[inter.tipo]} {inter.clienteNombre || 'Cliente'}</p>
          <p className="text-[0.68rem] text-gray-400">{CANAL_LABEL[inter.tipo]} · {inter.grupoNombre || ''} · {inter.estado}</p>
        </div>
        {!enCola && !cerrada && (
          <div className="flex gap-1.5">
            <button onClick={() => setTransfiriendo((v) => !v)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.7rem] font-semibold text-gray-600 hover:bg-gray-50">
              <ArrowRightLeft className="h-3 w-3" /> Transferir
            </button>
            <button onClick={() => setCerrando((v) => !v)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Cerrar
            </button>
          </div>
        )}
      </div>

      {transfiriendo && <TransferirPopover interaccionId={interaccionId} onDone={() => { setTransfiriendo(false); onClosed() }} />}
      {cerrando && <CerrarPopover inter={inter} onDone={() => { setCerrando(false); onClosed() }} />}

      <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50/40 p-4">
        {(inter.mensajes || []).map((m) => (
          <div key={m.id} className={clsx('flex', m.emisor === 'agente' ? 'justify-end' : m.emisor === 'sistema' ? 'justify-center' : 'justify-start')}>
            {m.emisor === 'sistema' ? (
              <span className="rounded-full bg-gray-200 px-3 py-1 text-[0.68rem] italic text-gray-500">{m.contenido}</span>
            ) : (
              <div className={clsx('max-w-[70%] rounded-2xl px-3 py-2 text-sm',
                m.emisor === 'agente' ? 'rounded-br-sm bg-violet-600 text-white' : 'rounded-bl-sm bg-white text-gray-800 ring-1 ring-gray-200')}>
                {m.mediaId && m.mediaMime?.startsWith('image/') && (
                  <img src={ccService.mediaUrl(m.mediaId)} alt="" className="mb-1 max-h-48 rounded-lg" />
                )}
                {m.mediaId && m.mediaMime?.startsWith('audio/') && (
                  <audio src={ccService.mediaUrl(m.mediaId)} controls className="mb-1 max-w-full" />
                )}
                {m.mediaId && !m.mediaMime?.startsWith('image/') && !m.mediaMime?.startsWith('audio/') && (
                  <a href={ccService.mediaUrl(m.mediaId)} target="_blank" rel="noreferrer" className="mb-1 block text-xs underline">{m.mediaNombre || 'Archivo'}</a>
                )}
                {m.contenido}
                <div className={clsx('mt-0.5 text-[0.6rem]', m.emisor === 'agente' ? 'text-violet-200' : 'text-gray-400')}>
                  {fmtHora(m.fecha)}{m.emisor === 'agente' && m.estadoEntrega ? ` · ${m.estadoEntrega}` : ''}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {enCola ? (
        <div className="border-t border-gray-200 p-3">
          <button onClick={() => tomar.mutate()} disabled={tomar.isPending}
            className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
            {tomar.isPending ? 'Tomando…' : 'Tomar interacción'}
          </button>
        </div>
      ) : cerrada ? (
        <div className="border-t border-gray-200 p-3 text-center text-xs text-gray-400">Interacción cerrada</div>
      ) : (
        <div className="border-t border-gray-200 p-3">
          {plantillas.length > 0 && (
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
              {plantillas.map((pl) => (
                <button key={pl.id} onClick={() => setTexto(pl.contenido)}
                  className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[0.68rem] text-gray-600 hover:bg-gray-200">{pl.nombre}</button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir.mutate(f) }} />
            <button onClick={() => fileRef.current?.click()} className="mb-1 text-gray-400 hover:text-violet-600"><Paperclip className="h-4 w-4" /></button>
            <textarea
              value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (texto.trim()) enviar.mutate(texto) } }}
              rows={1} placeholder="Escribe un mensaje…"
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
            />
            <button onClick={() => texto.trim() && enviar.mutate(texto)} disabled={enviar.isPending || !texto.trim()}
              className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TransferirPopover({ interaccionId, onDone }: { interaccionId: number; onDone: () => void }) {
  const { data: agentes = [] } = useQuery({ queryKey: ['cc-transferibles', interaccionId], queryFn: () => ccService.agentesTransferibles(interaccionId) })
  const m = useMutation({
    mutationFn: (uid: number) => ccService.transferir(interaccionId, { nuevoAgenteId: uid }),
    onSuccess: () => { toast.success('Transferida'); onDone() },
    onError: () => toast.error('No se pudo transferir'),
  })
  return (
    <div className="border-b border-gray-200 bg-gray-50 p-3">
      <p className="mb-1.5 text-[0.7rem] font-semibold text-gray-500">Transferir a:</p>
      {agentes.length === 0 && <p className="text-[0.7rem] text-gray-400">Sin agentes en este skill</p>}
      <div className="flex flex-wrap gap-1.5">
        {agentes.map((a) => (
          <button key={a.usuarioId} onClick={() => m.mutate(a.usuarioId)} disabled={m.isPending || !a.disponible}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-gray-700 hover:bg-violet-50 disabled:opacity-40">
            {a.nombre} {a.disponible ? `(${a.activas})` : '· no disp.'}
          </button>
        ))}
      </div>
    </div>
  )
}

function CerrarPopover({ inter, onDone }: { inter: CCInteraccion; onDone: () => void }) {
  const { data: tipificaciones = [] } = useQuery({ queryKey: ['cc-tip', inter.campaniaId], queryFn: () => ccService.getTipificaciones(inter.campaniaId) })
  const { data: motivos = [] } = useQuery({ queryKey: ['cc-mot', inter.grupoId], queryFn: () => ccService.getMotivosCierre(inter.grupoId!), enabled: !!inter.grupoId })
  const [tipId, setTipId] = useState<number | ''>('')
  const [motId, setMotId] = useState<number | ''>('')
  const [comentario, setComentario] = useState('')
  const m = useMutation({
    mutationFn: () => ccService.cerrar(inter.id, {
      tipificacionId: tipId ? Number(tipId) : undefined,
      motivoCierreId: motId ? Number(motId) : undefined,
      comentario: comentario || undefined,
    }),
    onSuccess: () => { toast.success('Interacción cerrada'); onDone() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo cerrar'),
  })
  const field = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-violet-500'
  return (
    <div className="space-y-2 border-b border-gray-200 bg-gray-50 p-3">
      {tipificaciones.length > 0 && (
        <select className={field} value={tipId} onChange={(e) => setTipId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Tipificación…</option>
          {tipificaciones.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      )}
      {motivos.length > 0 && (
        <select className={field} value={motId} onChange={(e) => setMotId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Motivo de cierre…</option>
          {motivos.map((mo) => <option key={mo.id} value={mo.id}>{mo.motivo}</option>)}
        </select>
      )}
      <input className={field} placeholder="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <button onClick={() => m.mutate()} disabled={m.isPending}
        className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
        {m.isPending ? 'Cerrando…' : 'Confirmar cierre'}
      </button>
    </div>
  )
}
