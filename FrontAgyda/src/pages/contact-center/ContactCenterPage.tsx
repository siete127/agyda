import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Headset, Send, Power, Loader2, Clock, CheckCircle2, ArrowRightLeft, Paperclip, PauseCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccService } from '@/services/cc.service'
import { livechatService } from '@/services/livechat.service'
import { getSocket } from '@/lib/socket'
import { useCurrentUser } from '@/hooks/useAuth'
import { useActionAccess } from '@/hooks/useActionAccess'
import { CANAL_ICONO, CANAL_LABEL, type CCInteraccion } from '@/types/cc.types'

function fmtHora(iso: string | null) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Item unificado en la bandeja: CC o livechat "web".
type ItemUnificado = {
  key: string
  origen: 'cc' | 'web'
  id: number
  titulo: string
  canalLabel: string
  canalIcono: string
  estado: string
  enCola: boolean
  subtitulo: string
  hora: string
}

export default function ContactCenterPage() {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const { can } = useActionAccess()
  const puedeAtender = can('contact-center', 'atender')
  const [sel, setSel] = useState<ItemUnificado | null>(null)

  const { data: ccActivas = [] } = useQuery({
    queryKey: ['cc-inter', 'activa'], queryFn: () => ccService.getInteracciones(), refetchInterval: 8000,
  })
  const { data: ccCola = [] } = useQuery({
    queryKey: ['cc-inter', 'en_cola'], queryFn: () => ccService.getInteracciones('en_cola'), refetchInterval: 8000,
  })
  const { data: webMias = [] } = useQuery({
    queryKey: ['lc-mias'], queryFn: () => livechatService.getMisConversaciones('activa'), refetchInterval: 8000,
  })
  const { data: webCola = [] } = useQuery({
    queryKey: ['lc-cola'], queryFn: () => livechatService.getMisConversaciones('esperando'), refetchInterval: 8000,
  })
  const { data: miEstado } = useQuery({
    queryKey: ['cc-mi-estado'], queryFn: () => ccService.getMiEstado(), refetchInterval: 20000,
  })

  const toggle = useMutation({
    mutationFn: async (v: boolean) => {
      await Promise.allSettled([ccService.setDisponible(v), livechatService.setDisponible(v)])
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-mi-estado'] }); qc.invalidateQueries({ queryKey: ['livechat-mi-estado'] }) },
    onError: () => toast.error('No se pudo cambiar la disponibilidad'),
  })

  // socket: refrescar bandeja
  useEffect(() => {
    if (!user?.id) return
    const s = getSocket()
    s.emit('joinUser', user.id)
    const refetch = () => {
      qc.invalidateQueries({ queryKey: ['cc-inter'] })
      qc.invalidateQueries({ queryKey: ['lc-mias'] })
      qc.invalidateQueries({ queryKey: ['lc-cola'] })
    }
    const eventos = ['cc:nueva_interaccion', 'cc:mensaje', 'cc:actividad', 'cc:interaccion_cerrada',
      'livechat:nueva_conversacion', 'livechat:nueva_en_cola', 'livechat:actividad_conversacion']
    eventos.forEach((e) => s.on(e, refetch))
    return () => { eventos.forEach((e) => s.off(e, refetch)) }
  }, [user?.id, qc])

  const items: ItemUnificado[] = [
    ...ccCola.map((i) => mapCc(i, true)),
    ...ccActivas.map((i) => mapCc(i, false)),
    ...webCola.map((c: any) => mapWeb(c, true)),
    ...webMias.map((c: any) => mapWeb(c, false)),
  ]
  const totalCola = ccCola.length + webCola.length

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Headset className="h-4 w-4" /></div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Contact Center</h1>
            <p className="text-[0.7rem] text-gray-400">Bandeja omnicanal{totalCola > 0 ? ` · ${totalCola} en cola` : ''}</p>
          </div>
        </div>
        {puedeAtender && (
          <div className="flex items-center gap-2">
            {miEstado?.enPausa && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[0.68rem] font-semibold text-amber-700">
                <PauseCircle className="h-3 w-3" /> En pausa
              </span>
            )}
            {miEstado?.enAcw && (
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[0.68rem] font-semibold text-blue-700">Wrap-up</span>
            )}
            <button
              onClick={() => toggle.mutate(!miEstado?.disponible)}
              disabled={toggle.isPending}
              className={clsx('flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white transition-colors',
                miEstado?.disponible ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600')}
            >
              {toggle.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              {miEstado?.disponible ? 'Disponible' : 'No disponible'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista */}
        <div className="w-80 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/50">
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-gray-400">No hay interacciones</p>
          )}
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => setSel(it)}
              className={clsx('flex w-full flex-col gap-0.5 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-white',
                sel?.key === it.key && 'bg-white')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 truncate">
                  <span>{it.canalIcono}</span> {it.titulo}
                </span>
                {it.enCola
                  ? <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-700"><Clock className="h-2.5 w-2.5" /> cola</span>
                  : <span className="text-[0.6rem] text-gray-400">{it.hora}</span>}
              </div>
              <span className="text-[0.7rem] text-gray-400 truncate">{it.canalLabel} · {it.subtitulo}</span>
            </button>
          ))}
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          {!sel ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">Selecciona una interacción</div>
          ) : sel.origen === 'cc' ? (
            <CCChatPanel interaccionId={sel.id} onClosed={() => { setSel(null); qc.invalidateQueries({ queryKey: ['cc-inter'] }) }} />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-gray-400">
              Esta conversación web se atiende desde <a href="/livechat" className="ml-1 text-blue-600 underline">Chat en Vivo</a>.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function mapCc(i: CCInteraccion, enCola: boolean): ItemUnificado {
  return {
    key: `cc-${i.id}`, origen: 'cc', id: i.id,
    titulo: i.clienteNombre || i.clienteTelefono || 'Cliente',
    canalLabel: CANAL_LABEL[i.tipo] || i.tipo, canalIcono: CANAL_ICONO[i.tipo] || '💬',
    estado: i.estado, enCola,
    subtitulo: i.grupoNombre || i.canalNombre || '',
    hora: fmtHora(i.fechaUltimoMsjCliente || i.fechaInicio),
  }
}
function mapWeb(c: any, enCola: boolean): ItemUnificado {
  return {
    key: `web-${c.id}`, origen: 'web', id: c.id,
    titulo: c.visitanteNombre || 'Visitante web',
    canalLabel: 'Web', canalIcono: '🌐',
    estado: c.estado, enCola,
    subtitulo: c.motivo ? String(c.motivo).slice(0, 40) : 'Chat en vivo',
    hora: fmtHora(c.fechaInicio),
  }
}

/* ── Panel de chat de una interacción CC ── */
function CCChatPanel({ interaccionId, onClosed }: { interaccionId: number; onClosed: () => void }) {
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
