import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug, Users, Tags, Gauge, FlaskConical, Layers, Check, Loader2, Plus, Trash2, Copy, QrCode, LogOut,
  MessageCircle, Camera, Globe, X, Save, Megaphone, Target, Headphones, MoreVertical, Pencil, LayoutGrid, List as ListIcon,
  ChevronRight, ArrowLeft as ArrowLeftIcon, ClipboardList, Mail, Phone, UserCog, Download, Search, StickyNote, ChevronLeft,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { api } from '@/lib/axios'
import { ccService } from '@/services/cc.service'
import { CANAL_LABEL, type CCCanalTipo, type CCBaileysEstado, type CCFcaEstado, type CCIgpEstado } from '@/types/cc.types'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { TIPIFICACIONES_LLAMADA } from '@/constants/tipificacionesLlamada'
import { NotasPostulanteModal } from './NotasPostulanteModal'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-[0.72rem] font-semibold text-ink-secondary'
const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
// Variante sin padding para tarjetas con secciones propias (header/body/footer
// cada una con su padding) — CanalCard es el único caso hoy.
const cardBare = 'rounded-2xl border border-gray-100 bg-card shadow-card'

function Header({ icon: Icon, titulo, subtitulo }: { icon: React.ElementType; titulo: string; subtitulo: string }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="text-base font-bold text-ink">{titulo}</h2>
          <p className="mt-0.5 text-[0.8rem] text-ink-tertiary">{subtitulo}</p>
        </div>
      </div>
    </div>
  )
}

// Icono + color por tipo de canal — mismo lenguaje visual en la card y en el
// selector "Tipo de canal" del formulario de alta.
const CANAL_ICONOS: Record<CCCanalTipo, { icon: React.ElementType; bg: string; fg: string }> = {
  whatsapp: { icon: MessageCircle, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
  whatsapp_baileys: { icon: MessageCircle, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
  messenger: { icon: MessageCircle, bg: 'bg-blue-100', fg: 'text-blue-600' },
  messenger_fca: { icon: MessageCircle, bg: 'bg-blue-100', fg: 'text-blue-600' },
  instagram: { icon: Camera, bg: 'bg-pink-100', fg: 'text-pink-600' },
  instagram_privado: { icon: Camera, bg: 'bg-pink-100', fg: 'text-pink-600' },
  web_publica: { icon: Globe, bg: 'bg-cyan-100', fg: 'text-cyan-600' },
  test: { icon: FlaskConical, bg: 'bg-violet-100', fg: 'text-violet-600' },
}

// Toggle tipo switch reutilizable — reemplaza el checkbox plano de "Habilitado".
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors',
        checked ? 'bg-violet-600' : 'bg-gray-200',
      )}
    >
      <span className={clsx(
        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-[22px]' : 'translate-x-0.5',
      )} />
    </button>
  )
}

/* ═══ Canales ═══ */
export function CCCanalesTab() {
  const qc = useQueryClient()
  const { data: canales = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales() })
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos-all'], queryFn: () => ccService.getGrupos() })
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const [nuevoTipo, setNuevoTipo] = useState<CCCanalTipo>('test')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const inval = () => qc.invalidateQueries({ queryKey: ['cc-canales'] })

  const crear = useMutation({
    mutationFn: () => ccService.createCanal({ tipo: nuevoTipo, nombre: nuevoNombre }),
    onSuccess: () => { setNuevoNombre(''); inval(); toast.success('Canal creado') },
  })

  const NuevoIcono = CANAL_ICONOS[nuevoTipo].icon

  return (
    <div className="space-y-4 pb-20">
      <Header icon={Plug} titulo="Canales" subtitulo="Conecta WhatsApp, Messenger o Instagram por tenant. El canal 'prueba' funciona sin Meta." />

      <div className={card}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <label className="block">
            <span className={label}>Tipo de canal</span>
            <div className="relative">
              <span className={clsx('pointer-events-none absolute left-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md', CANAL_ICONOS[nuevoTipo].bg, CANAL_ICONOS[nuevoTipo].fg)}>
                <NuevoIcono className="h-3.5 w-3.5" />
              </span>
              <select className={clsx(field, 'pl-10')} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as CCCanalTipo)}>
                <option value="test">Prueba</option>
                <option value="whatsapp">WhatsApp (API oficial de Meta)</option>
                <option value="messenger">Messenger</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp_baileys">WhatsApp por QR (no oficial)</option>
                <option value="messenger_fca">Messenger por appstate (no oficial)</option>
                <option value="instagram_privado">Instagram por usuario/password (no oficial)</option>
                <option value="web_publica">Web pública (widget del sitio)</option>
              </select>
            </div>
          </label>
          <label className="block">
            <span className={label}>Nombre del canal</span>
            <input className={field} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. WhatsApp Ventas" />
          </label>
          <button onClick={() => crear.mutate()} disabled={!nuevoNombre.trim() || crear.isPending}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar canal
          </button>
        </div>
      </div>

      {canales.map((c) => (
        <CanalCard key={c.id} canal={c} grupos={grupos} campanias={campanias} onChanged={inval} />
      ))}
    </div>
  )
}

function CanalCard({ canal, grupos, campanias, onChanged }: any) {
  const [form, setForm] = useState({
    nombre: canal.nombre, habilitado: canal.habilitado, grupoId: canal.grupoId ?? '', campaniaId: canal.campaniaId ?? '',
    modoSesion: canal.modoSesion ?? 'compartido',
    metaPageId: canal.metaPageId ?? '', metaBusinessId: canal.metaBusinessId ?? '', verifyToken: canal.verifyToken ?? '',
    accessToken: '', appSecret: '',
  })
  const dirty =
    form.nombre !== canal.nombre || form.habilitado !== canal.habilitado ||
    form.grupoId !== (canal.grupoId ?? '') || form.campaniaId !== (canal.campaniaId ?? '') ||
    form.modoSesion !== (canal.modoSesion ?? 'compartido') ||
    form.metaPageId !== (canal.metaPageId ?? '') || form.metaBusinessId !== (canal.metaBusinessId ?? '') ||
    form.verifyToken !== (canal.verifyToken ?? '') || !!form.accessToken || !!form.appSecret

  const resetForm = () => setForm({
    nombre: canal.nombre, habilitado: canal.habilitado, grupoId: canal.grupoId ?? '', campaniaId: canal.campaniaId ?? '',
    modoSesion: canal.modoSesion ?? 'compartido',
    metaPageId: canal.metaPageId ?? '', metaBusinessId: canal.metaBusinessId ?? '', verifyToken: canal.verifyToken ?? '',
    accessToken: '', appSecret: '',
  })

  const guardar = useMutation({
    mutationFn: () => ccService.updateCanal(canal.id, {
      nombre: form.nombre, habilitado: form.habilitado,
      grupoId: form.grupoId || null, campaniaId: form.campaniaId || null,
      modoSesion: form.modoSesion,
      metaPageId: form.metaPageId, metaBusinessId: form.metaBusinessId, verifyToken: form.verifyToken,
      ...(form.accessToken ? { accessToken: form.accessToken } : {}),
      ...(form.appSecret ? { appSecret: form.appSecret } : {}),
    }),
    onSuccess: () => { toast.success('Canal guardado'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const probar = useMutation({ mutationFn: () => ccService.probarCanal(canal.id), onSuccess: (r: any) => toast.success(r?.message ?? 'OK'), onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Falló') })
  const suscribir = useMutation({ mutationFn: () => ccService.suscribirCanal(canal.id), onSuccess: (r: any) => { toast.success(r?.message ?? 'OK'); onChanged() }, onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Falló') })
  const eliminar = useMutation({ mutationFn: () => ccService.deleteCanal(canal.id), onSuccess: () => { toast.success('Eliminado'); onChanged() } })
  const esTest = canal.tipo === 'test'
  const esBaileys = canal.tipo === 'whatsapp_baileys'
  const esFca = canal.tipo === 'messenger_fca'
  const esIgp = canal.tipo === 'instagram_privado'
  const esWeb = canal.tipo === 'web_publica'
  const esMeta = !esTest && !esBaileys && !esFca && !esIgp && !esWeb
  const esNoOficial = esBaileys || esFca || esIgp
  const esIndividual = form.modoSesion === 'individual'
  const { icon: TipoIcono, bg: tipoBg, fg: tipoFg } = CANAL_ICONOS[canal.tipo as CCCanalTipo]

  return (
    <div className={cardBare}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', tipoBg, tipoFg)}>
            <TipoIcono className="h-4.5 w-4.5" />
          </div>
          <p className="truncate font-bold text-ink">{CANAL_LABEL[canal.tipo as CCCanalTipo]} — {canal.nombre}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-tertiary">
            <Switch checked={form.habilitado} onChange={(v) => setForm({ ...form, habilitado: v })} /> Habilitado
          </label>
          <button onClick={() => eliminar.mutate()} title="Eliminar canal"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-ink-tertiary transition hover:border-red-200 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>Nombre del canal</span>
            <input className={field} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
          <label className="block"><span className={label}>Skill destino</span>
            <select className={field} value={form.grupoId} onChange={(e) => setForm({ ...form, grupoId: e.target.value })}>
              <option value="">—</option>{grupos.map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select></label>
          <label className="block"><span className={label}>Campaña</span>
            <select className={field} value={form.campaniaId} onChange={(e) => setForm({ ...form, campaniaId: e.target.value })}>
              <option value="">—</option>{campanias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
          {esNoOficial && (
            <label className="block sm:col-span-2">
              <span className={label}>Modo de conexión</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm({ ...form, modoSesion: 'compartido' })}
                  className={clsx('rounded-xl border p-2.5 text-left text-xs transition-colors',
                    !esIndividual ? 'border-brand bg-brand/5 font-semibold text-brand' : 'border-gray-200 text-ink-secondary hover:bg-gray-50')}>
                  Compartido de campaña
                  <p className="mt-0.5 font-normal text-ink-tertiary">Una sola cuenta para todos los agentes del skill (como hoy).</p>
                </button>
                <button type="button" onClick={() => setForm({ ...form, modoSesion: 'individual' })}
                  className={clsx('rounded-xl border p-2.5 text-left text-xs transition-colors',
                    esIndividual ? 'border-brand bg-brand/5 font-semibold text-brand' : 'border-gray-200 text-ink-secondary hover:bg-gray-50')}>
                  Individual por agente
                  <p className="mt-0.5 font-normal text-ink-tertiary">Cada agente del skill vincula su propia cuenta.</p>
                </button>
              </div>
              {form.modoSesion !== (canal.modoSesion ?? 'compartido') && (
                <p className="mt-1.5 text-[0.7rem] text-amber-600">Cambiar de modo no migra sesiones ya conectadas — guarda primero, luego vuelve a vincular.</p>
              )}
            </label>
          )}
          {esMeta && <>
            <label className="block"><span className={label}>Page ID / Phone Number ID</span>
              <input className={field} value={form.metaPageId} onChange={(e) => setForm({ ...form, metaPageId: e.target.value })} /></label>
            <label className="block"><span className={label}>Business ID / WABA ID</span>
              <input className={field} value={form.metaBusinessId} onChange={(e) => setForm({ ...form, metaBusinessId: e.target.value })} /></label>
            <label className="block"><span className={label}>Verify token</span>
              <input className={field} value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })} /></label>
            <label className="block"><span className={label}>Access token {canal.accessTokenConfigurado && <span className="text-emerald-600">· configurado</span>}</span>
              <input type="password" className={field} value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} placeholder={canal.accessTokenConfigurado ? '•••••• (vacío = no cambiar)' : ''} /></label>
            <label className="block"><span className={label}>App secret {canal.appSecretConfigurado && <span className="text-emerald-600">· configurado</span>}</span>
              <input type="password" className={field} value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} /></label>
          </>}
        </div>

        {esMeta && (
          <div className="mt-4 rounded-xl bg-gray-50 p-3.5 text-[0.72rem] text-ink-secondary">
            <p className="font-semibold text-ink-secondary">URL del webhook (pégala en el panel de Meta):</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-card px-2.5 py-1.5 ring-1 ring-gray-200">{canal.webhookUrl}</code>
              <button onClick={() => { navigator.clipboard.writeText(canal.webhookUrl); toast.success('Copiado') }} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-card hover:text-violet-600"><Copy className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        )}
        {esNoOficial && canal.modoSesion === 'individual' ? (
          <SesionesAgentesPanel canal={canal} tipo={canal.tipo} onChanged={onChanged} />
        ) : (
          <>
            {esBaileys && <BaileysQRPanel canal={canal} onChanged={onChanged} />}
            {esFca && <FcaAppStatePanel canal={canal} onChanged={onChanged} />}
            {esIgp && <IgPrivateLoginPanel canal={canal} onChanged={onChanged} />}
          </>
        )}
        {esWeb && <WebPublicaTokenPanel canal={canal} />}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
        {esMeta && <button onClick={() => probar.mutate()} disabled={probar.isPending} className="rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-ink-secondary transition hover:bg-gray-50">Probar conexión</button>}
        {esMeta && <button onClick={() => suscribir.mutate()} disabled={suscribir.isPending} className="rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-ink-secondary transition hover:bg-gray-50">Suscribir webhook</button>}
        {dirty && (
          <button onClick={resetForm} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-ink-secondary transition hover:bg-gray-50">
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        )}
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending || !dirty}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar cambios
        </button>
      </div>
    </div>
  )
}

/* ═══ WhatsApp vía Baileys — vinculación por QR (no oficial) ═══ */
function BaileysQRPanel({ canal, onChanged, usuarioId }: { canal: any; onChanged: () => void; usuarioId?: number }) {
  const [estado, setEstado] = useState<CCBaileysEstado>(canal.baileysEstado ?? 'desconectado')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(canal.baileysNumero ?? null)

  // Se une a la sala del canal (o a la del agente, en modo individual)
  // mientras este panel está montado, para recibir el QR y los cambios de
  // estado en vivo sin tener que refrescar la página.
  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_cc_baileys', { canalId: canal.id, usuarioId })
    return () => { socket.emit('leave_cc_baileys', { canalId: canal.id, usuarioId }) }
  }, [canal.id, usuarioId])

  useSocketEvent<{ canalId: number; usuarioId: number | null; estado: CCBaileysEstado; qrDataUrl: string | null; numero: string | null }>(
    'cc:baileys_estado',
    (payload) => {
      if (payload.canalId !== canal.id || (payload.usuarioId || undefined) !== usuarioId) return
      setEstado(payload.estado)
      setQrDataUrl(payload.qrDataUrl)
      setNumero(payload.numero)
      if (payload.estado === 'conectado') onChanged()
    },
  )

  const iniciar = useMutation({
    mutationFn: () => ccService.iniciarBaileys(canal.id, usuarioId),
    onSuccess: (r) => { setEstado(r.data.estado as CCBaileysEstado); setQrDataUrl(r.data.qrDataUrl); setNumero(r.data.numero) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo iniciar la sesión'),
  })
  const cerrar = useMutation({
    mutationFn: () => ccService.cerrarBaileys(canal.id, usuarioId),
    onSuccess: () => { setEstado('desconectado'); setQrDataUrl(null); setNumero(null); toast.success('Sesión cerrada'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className={clsx('h-2 w-2 rounded-full', estado === 'conectado' ? 'bg-emerald-500' : estado === 'esperando_qr' ? 'bg-amber-400' : 'bg-gray-300')} />
        <span className="font-semibold text-ink-secondary">
          {estado === 'conectado' ? `Conectado${numero ? ` — ${numero}` : ''}` : estado === 'esperando_qr' ? 'Esperando que escanees el QR' : 'Desconectado'}
        </span>
      </div>

      {estado === 'esperando_qr' && qrDataUrl && (
        <div className="mb-3 flex flex-col items-center gap-2">
          {/* El QR se mantiene siempre en blanco puro (no bg-card): necesita
              máximo contraste para que el celular lo escanee bien. */}
          <img src={qrDataUrl} alt="Código QR de WhatsApp" className="h-52 w-52 rounded-xl border border-gray-200 bg-white p-2" />
          <p className="text-[0.7rem] text-ink-tertiary">WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-[0.72rem] text-amber-800">
          ⚠️ Esta vía usa WhatsApp Web, no la API oficial de Meta — no requiere aprobación ni tokens, pero
          va por fuera de los Términos de Servicio de WhatsApp y conlleva riesgo real de que el número sea baneado.
        </p>

        {estado !== 'conectado' && (
          <button onClick={() => iniciar.mutate()} disabled={iniciar.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm hover:bg-gray-50 disabled:opacity-50">
            {iniciar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} Generar QR
          </button>
        )}
        {estado === 'conectado' && (
          <button onClick={() => cerrar.mutate()} disabled={cerrar.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-card px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══ Messenger vía FCA — vinculación pegando appstate.json (no oficial) ═══ */
function FcaAppStatePanel({ canal, onChanged, usuarioId }: { canal: any; onChanged: () => void; usuarioId?: number }) {
  const [estado, setEstado] = useState<CCFcaEstado>(canal.fcaEstado ?? 'desconectado')
  const [usuario, setUsuario] = useState<string | null>(canal.fcaUsuario ?? null)
  const [appStateTexto, setAppStateTexto] = useState('')

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_cc_fca', { canalId: canal.id, usuarioId })
    return () => { socket.emit('leave_cc_fca', { canalId: canal.id, usuarioId }) }
  }, [canal.id, usuarioId])

  useSocketEvent<{ canalId: number; usuarioId: number | null; estado: CCFcaEstado; usuario: string | null; mensaje: string | null }>(
    'cc:fca_estado',
    (payload) => {
      if (payload.canalId !== canal.id || (payload.usuarioId || undefined) !== usuarioId) return
      setEstado(payload.estado)
      setUsuario(payload.usuario)
      if (payload.estado === 'error' && payload.mensaje) toast.error(payload.mensaje)
      if (payload.estado === 'conectado') onChanged()
    },
  )

  const vincular = useMutation({
    mutationFn: () => ccService.vincularFca(canal.id, appStateTexto, usuarioId),
    onSuccess: (r) => { setEstado(r.data.estado as CCFcaEstado); setUsuario(r.data.usuario); setAppStateTexto(''); toast.success('Messenger vinculado'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo vincular — revisa el appstate.json'),
  })
  const cerrar = useMutation({
    mutationFn: () => ccService.cerrarFca(canal.id, usuarioId),
    onSuccess: () => { setEstado('desconectado'); setUsuario(null); toast.success('Sesión cerrada'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className={clsx('h-2 w-2 rounded-full', estado === 'conectado' ? 'bg-emerald-500' : estado === 'error' ? 'bg-red-400' : 'bg-gray-300')} />
        <span className="font-semibold text-ink-secondary">
          {estado === 'conectado' ? `Conectado${usuario ? ` — ID ${usuario}` : ''}` : estado === 'error' ? 'Error al conectar (revisa el appstate)' : 'Desconectado'}
        </span>
      </div>

      {estado !== 'conectado' && (
        <label className="mb-3 block">
          <span className={label}>
            appstate.json (cookies de sesión — obtenlas con una extensión como "C3C FbState")
          </span>
          <textarea
            className={clsx(field, 'h-28 font-mono text-[0.7rem]')}
            value={appStateTexto}
            onChange={(e) => setAppStateTexto(e.target.value)}
            placeholder='[{"key":"c_user","value":"..."}, ...]'
          />
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-[0.72rem] text-amber-800">
          ⚠️ Esta vía usa la cuenta PERSONAL de Facebook del agente (no una Página de negocio), no la API oficial de
          Meta — va por fuera de sus Términos de Servicio y conlleva riesgo real de checkpoint o baneo de esa cuenta.
          Las cookies de sesión (appstate) también expiran y hay que volver a extraerlas cuando eso pase.
        </p>

        {estado !== 'conectado' && (
          <button onClick={() => vincular.mutate()} disabled={!appStateTexto.trim() || vincular.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm hover:bg-gray-50 disabled:opacity-50">
            {vincular.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} Vincular
          </button>
        )}
        {estado === 'conectado' && (
          <button onClick={() => cerrar.mutate()} disabled={cerrar.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-card px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══ Instagram DM vía API privada — usuario/password (no oficial) ═══ */
function IgPrivateLoginPanel({ canal, onChanged, usuarioId }: { canal: any; onChanged: () => void; usuarioId?: number }) {
  const [estado, setEstado] = useState<CCIgpEstado>(canal.igpEstado ?? 'desconectado')
  const [usuario, setUsuario] = useState<string | null>(canal.igpUsuario ?? null)
  const [form, setForm] = useState({ usuario: '', password: '' })

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_cc_igp', { canalId: canal.id, usuarioId })
    return () => { socket.emit('leave_cc_igp', { canalId: canal.id, usuarioId }) }
  }, [canal.id, usuarioId])

  useSocketEvent<{ canalId: number; usuarioId: number | null; estado: CCIgpEstado; usuario: string | null; mensaje: string | null }>(
    'cc:igp_estado',
    (payload) => {
      if (payload.canalId !== canal.id || (payload.usuarioId || undefined) !== usuarioId) return
      setEstado(payload.estado)
      setUsuario(payload.usuario)
      if (payload.estado === 'error' && payload.mensaje) toast.error(payload.mensaje)
      if (payload.estado === 'conectado') onChanged()
    },
  )

  const vincular = useMutation({
    mutationFn: () => ccService.vincularIgPrivate(canal.id, form.usuario, form.password, usuarioId),
    onSuccess: (r) => { setEstado(r.data.estado as CCIgpEstado); setUsuario(r.data.usuario); setForm({ usuario: '', password: '' }); toast.success('Instagram vinculado'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo vincular — revisa usuario y contraseña'),
  })
  const cerrar = useMutation({
    mutationFn: () => ccService.cerrarIgPrivate(canal.id, usuarioId),
    onSuccess: () => { setEstado('desconectado'); setUsuario(null); toast.success('Sesión cerrada'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className={clsx('h-2 w-2 rounded-full', estado === 'conectado' ? 'bg-emerald-500' : estado === 'error' ? 'bg-red-400' : 'bg-gray-300')} />
        <span className="font-semibold text-ink-secondary">
          {estado === 'conectado' ? `Conectado${usuario ? ` — @${usuario}` : ''}` : estado === 'error' ? 'Error al conectar (revisa usuario/password)' : 'Desconectado'}
        </span>
      </div>

      {estado !== 'conectado' && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Usuario de Instagram</span>
            <input className={field} value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="usuario_ig" /></label>
          <label className="block"><span className={label}>Contraseña</span>
            <input type="password" className={field} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-[0.72rem] text-amber-800">
          ⚠️ Esta vía automatiza la cuenta PERSONAL de Instagram del agente (no hay concepto de "Página" como en
          Facebook), no la API oficial de Meta — riesgo real de checkpoint de seguridad o baneo de esa cuenta. La
          librería que la sostiene ya no recibe desarrollo activo, solo corrección de errores.
        </p>

        {estado !== 'conectado' && (
          <button onClick={() => vincular.mutate()} disabled={!form.usuario.trim() || !form.password.trim() || vincular.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm hover:bg-gray-50 disabled:opacity-50">
            {vincular.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} Vincular
          </button>
        )}
        {estado === 'conectado' && (
          <button onClick={() => cerrar.mutate()} disabled={cerrar.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-card px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══ Modo individual: una fila por agente del skill, cada uno con su propio
   panel de vinculación (BaileysQRPanel/FcaAppStatePanel/IgPrivateLoginPanel
   parametrizados con usuarioId) — reusa los mismos componentes de la sesión
   compartida, solo cambia a quién pertenece la sesión. ═══ */
function SesionesAgentesPanel({ canal, tipo, onChanged }: { canal: any; tipo: CCCanalTipo; onChanged: () => void }) {
  const [abierto, setAbierto] = useState<number | null>(null)
  const { data: agentes = [], isLoading, refetch } = useQuery({
    queryKey: ['cc-sesiones-agentes', canal.id],
    queryFn: () => ccService.listSesionesAgentesCanal(canal.id),
  })

  const estadoDe = (a: any) =>
    tipo === 'whatsapp_baileys' ? a.baileysEstado : tipo === 'messenger_fca' ? a.fcaEstado : a.igpEstado
  const detalleDe = (a: any) =>
    tipo === 'whatsapp_baileys' ? a.baileysNumero : tipo === 'messenger_fca' ? a.fcaUsuario : a.igpUsuario

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="mb-3 text-[0.72rem] text-ink-secondary">
        Este canal es de sesión <strong>individual</strong>: cada agente del skill vincula su propia cuenta. Los
        chats que le escriban a la cuenta de un agente se le asignan directo a él, sin pasar por la cola general.
      </p>
      {isLoading && <p className="text-xs text-ink-tertiary">Cargando agentes…</p>}
      {!isLoading && agentes.length === 0 && (
        <p className="text-xs text-ink-tertiary">Este skill todavía no tiene agentes asignados.</p>
      )}
      <div className="space-y-2">
        {agentes.map((a) => {
          const estado = estadoDe(a)
          const detalle = detalleDe(a)
          const isOpen = abierto === a.usuarioId
          return (
            <div key={a.usuarioId} className="rounded-lg border border-gray-200 bg-card">
              <button type="button" onClick={() => setAbierto(isOpen ? null : a.usuarioId)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className={clsx('h-2 w-2 flex-shrink-0 rounded-full', estado === 'conectado' ? 'bg-emerald-500' : estado === 'esperando_qr' ? 'bg-amber-400' : estado === 'error' ? 'bg-red-400' : 'bg-gray-300')} />
                  {a.nombre}
                </span>
                <span className="text-[0.7rem] text-ink-tertiary">
                  {estado === 'conectado' ? `Conectado${detalle ? ` — ${detalle}` : ''}` : estado === 'esperando_qr' ? 'Esperando QR' : estado === 'error' ? 'Error' : 'Sin vincular'}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 p-3">
                  {tipo === 'whatsapp_baileys' && <BaileysQRPanel canal={canal} usuarioId={a.usuarioId} onChanged={() => { onChanged(); refetch() }} />}
                  {tipo === 'messenger_fca' && <FcaAppStatePanel canal={canal} usuarioId={a.usuarioId} onChanged={() => { onChanged(); refetch() }} />}
                  {tipo === 'instagram_privado' && <IgPrivateLoginPanel canal={canal} usuarioId={a.usuarioId} onChanged={() => { onChanged(); refetch() }} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Widget web pública — token de campaña ═══
   No necesita QR ni token de Meta: cualquiera con este token puede iniciar
   el widget de chat apuntando a esta campaña/skill (ccWebPublicaController.
   getCanalWebPublica busca por CN_VERIFY_TOKEN). Sin token en la llamada del
   widget, el backend cae al primer canal 'web_publica' habilitado — por eso
   este panel deja claro cuál es "el default" cuando hay más de uno. */
function WebPublicaTokenPanel({ canal }: any) {
  const token = canal.verifyToken as string | null
  const copiar = (texto: string) => { navigator.clipboard.writeText(texto); toast.success('Copiado') }
  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="mb-3 text-[0.72rem] text-ink-secondary">
        Este canal no requiere vinculación: recibe los mensajes del widget de chat público del sitio web. Si el
        widget manda <code className="rounded bg-card px-1 py-0.5 ring-1 ring-gray-200">campaignToken</code>, se
        usa este canal solo cuando coincide con el token de abajo; si no manda ninguno, se usa el primer canal
        "Web pública" habilitado que exista (revisa que solo haya uno sin token asignado si quieres evitar ambigüedad).
      </p>
      {token ? (
        <div className="rounded-lg bg-card p-3 ring-1 ring-gray-200">
          <p className={label}>Token de campaña</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs ring-1 ring-gray-200">{token}</code>
            <button onClick={() => copiar(token)} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-gray-50 hover:text-violet-600"><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mt-2 text-[0.7rem] text-ink-tertiary">
            Envíalo desde el widget como <code className="rounded bg-gray-50 px-1 py-0.5 ring-1 ring-gray-200">{'{ campaignToken: "'}{token}{'" }'}</code> al llamar a <code className="rounded bg-gray-50 px-1 py-0.5 ring-1 ring-gray-200">/api/livechat/conversaciones</code>.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.72rem] text-amber-700 ring-1 ring-amber-200">
          Este canal no tiene token propio: actúa como el canal "Web pública" por defecto (el que recibe al widget
          cuando este no manda campaignToken).
        </p>
      )}
    </div>
  )
}

// Iconos de skill disponibles — el backend solo guarda un emoji libre
// (CG_ICONO), así que este selector es la forma real de elegir "tipo" de
// skill sin inventar una columna que no existe.
const SKILL_ICONOS = ['💬', '🎯', '🎧', '📞', '💼', '🛠️', '📦', '💳']

/* ═══ Campañas y skills ═══
   Punto de entrada del módulo: lista de campañas como tarjetas. Al abrir una
   se navega (estado local, sin depender del árbol de Configuración — ese
   árbol no soporta "detalle de un id" hoy) a CampaniaDetalle, que agrupa
   Canales + Skills/Agentes + Tipificaciones de ESA campaña — antes eran 3
   pantallas hermanas sin relación visual entre sí. */
export function CCSkillsTab() {
  const qc = useQueryClient()
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const [nueva, setNueva] = useState('')
  const [vista, setVista] = useState<'grid' | 'lista'>('lista')
  const [campaniaAbierta, setCampaniaAbierta] = useState<any | null>(null)
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-campanias'] }); qc.invalidateQueries({ queryKey: ['cc-grupos-all'] }) }
  const crear = useMutation({
    mutationFn: () => ccService.createCampania({ nombre: nueva }),
    onSuccess: () => { setNueva(''); inval(); toast.success('Campaña creada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  if (campaniaAbierta) {
    // Siempre se usa la copia más fresca de la lista (los contadores cambian
    // al agregar/quitar canales, skills o agentes desde el propio detalle).
    const actual = campanias.find((c) => c.id === campaniaAbierta.id) ?? campaniaAbierta
    return <CampaniaDetalle campania={actual} onVolver={() => setCampaniaAbierta(null)} onChanged={inval} />
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header con ilustración decorativa: 3 iconos representativos del CC
          flotando sobre el degradado violeta, mismo espíritu que la imagen 2. */}
      <div className={clsx(card, 'relative overflow-hidden')}>
        <div className="pointer-events-none absolute -right-4 top-1/2 hidden -translate-y-1/2 items-center gap-3 opacity-90 sm:flex">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-500 shadow-sm"><MessageCircle className="h-5 w-5" /></div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md"><Target className="h-6 w-6" /></div>
          <div className="mr-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-500 shadow-sm"><Headphones className="h-5 w-5" /></div>
        </div>
        <div className="relative flex items-center gap-3.5 sm:max-w-[70%]">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Layers className="h-5 w-5" /></div>
          <div>
            <h2 className="text-base font-bold text-ink">Campañas y skills</h2>
            <p className="mt-0.5 text-[0.8rem] text-ink-tertiary">Administra tus campañas y skills para una mejor asignación y rendimiento de tus agentes.</p>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Megaphone className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-bold text-ink">Nueva campaña</p>
            <p className="text-[0.72rem] text-ink-tertiary">Crea una campaña para agrupar agentes, canales y enrutadores que apunten a un mismo objetivo.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={clsx(field, 'flex-1')} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ingresa el nombre de la nueva campaña" />
          <button onClick={() => crear.mutate()} disabled={!nueva.trim() || crear.isPending}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear campaña
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-bold text-ink">Campañas y skills existentes</p>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-card p-0.5">
          <button onClick={() => setVista('grid')} title="Vista de cuadrícula"
            className={clsx('flex h-7 w-7 items-center justify-center rounded-md transition', vista === 'grid' ? 'bg-violet-100 text-violet-600' : 'text-ink-tertiary hover:bg-gray-50')}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setVista('lista')} title="Vista de lista"
            className={clsx('flex h-7 w-7 items-center justify-center rounded-md transition', vista === 'lista' ? 'bg-violet-100 text-violet-600' : 'text-ink-tertiary hover:bg-gray-50')}>
            <ListIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={clsx(vista === 'grid' && 'grid grid-cols-1 gap-4 lg:grid-cols-2', vista === 'lista' && 'space-y-3')}>
        {campanias.map((c) => <CampaniaCard key={c.id} campania={c} onChanged={inval} onAbrir={() => setCampaniaAbierta(c)} />)}
      </div>
    </div>
  )
}

// Tarjeta resumen — solo identidad + contadores + acciones rápidas. El
// detalle real (canales, skills, tipificaciones) vive en CampaniaDetalle,
// para no repetir dos veces la misma información en dos pantallas.
function CampaniaCard({ campania, onChanged, onAbrir }: any) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const delC = useMutation({ mutationFn: () => ccService.deleteCampania(campania.id), onSuccess: onChanged })

  return (
    <button type="button" onClick={onAbrir} className={clsx(cardBare, 'block w-full text-left transition hover:border-violet-200')}>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <p className="truncate text-sm font-bold uppercase tracking-wide text-ink">{campania.nombre}</p>
          <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">Activa</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-4 text-[0.72rem] text-ink-tertiary">
          <span className="hidden items-center gap-1.5 sm:flex"><Users className="h-3.5 w-3.5" /> {campania.agentesCount} Agentes</span>
          <span className="hidden items-center gap-1.5 sm:flex"><Plug className="h-3.5 w-3.5" /> {campania.canalesCount} Canales</span>
          <span className="hidden items-center gap-1.5 sm:flex"><Layers className="h-3.5 w-3.5" /> {campania.skillsCount} Skills</span>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMenuAbierto((v) => !v)} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-gray-50">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuAbierto && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
                <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-gray-100 bg-card py-1 shadow-lg">
                  <button
                    onClick={() => { setMenuAbierto(false); delC.mutate() }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar campaña
                  </button>
                </div>
              </>
            )}
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        </div>
      </div>
    </button>
  )
}

/* ═══ Detalle de campaña: Canales + Skills/Agentes + Tipificaciones ═══
   Antes eran 3 pantallas hermanas en el árbol de Configuración sin relación
   visual entre sí ("todo separado y revoltoso") — aquí quedan agrupadas bajo
   la campaña de la que realmente dependen en la BD (CN_CAMPANIA_ID /
   CG_CAMPANIA_ID / CT_CAMPANIA_ID apuntan los 3 al mismo CM2_ID). */
function CampaniaDetalle({ campania, onVolver, onChanged }: { campania: any; onVolver: () => void; onChanged: () => void }) {
  const [seccion, setSeccion] = useState<'canales' | 'skills' | 'supervisores' | 'tipificaciones' | 'postulantes' | 'contacto'>('canales')
  const { data: canalesTodos = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales() })
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos', campania.id], queryFn: () => ccService.getGrupos(campania.id) })
  const canalesDeCampania = canalesTodos.filter((c) => c.campaniaId === campania.id)

  const SECCIONES = [
    { key: 'canales' as const, label: 'Canales', icon: Plug, count: canalesDeCampania.length },
    { key: 'skills' as const, label: 'Skills y agentes', icon: Layers, count: grupos.length },
    { key: 'supervisores' as const, label: 'Supervisores', icon: UserCog, count: null },
    { key: 'tipificaciones' as const, label: 'Tipificaciones', icon: Tags, count: null },
    { key: 'postulantes' as const, label: 'Postulantes', icon: ClipboardList, count: null },
    { key: 'contacto' as const, label: 'Contacto público', icon: Phone, count: null },
  ]

  return (
    <div className="space-y-4 pb-20">
      <div className={card}>
        <div className="flex items-center gap-3.5">
          <button onClick={onVolver} title="Volver a Campañas"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-ink-tertiary transition hover:bg-gray-50">
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Campañas y skills</p>
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-bold text-ink">{campania.nombre}</h2>
              <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">Activa</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {SECCIONES.map((s) => (
          <button key={s.key} onClick={() => setSeccion(s.key)}
            className={clsx(
              'flex flex-shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
              seccion === s.key ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-gray-200 bg-card text-ink-secondary hover:bg-gray-50',
            )}>
            <s.icon className="h-4 w-4" /> {s.label}
            {s.count !== null && <span className="rounded-full bg-black/5 px-1.5 text-[0.68rem]">{s.count}</span>}
          </button>
        ))}
      </div>

      {seccion === 'canales' && <CanalesDeCampaniaPanel campania={campania} canales={canalesDeCampania} onChanged={onChanged} />}
      {seccion === 'skills' && <SkillsDeCampaniaPanel campania={campania} onChanged={onChanged} />}
      {seccion === 'supervisores' && (
        <div className={card}>
          <p className="mb-3 text-xs text-ink-tertiary">
            Supervisores de toda la campaña "{campania.nombre}" — ven todos sus skills. Para un supervisor acotado a un solo
            skill, asignalo desde "Skills y agentes" en vez de acá.
          </p>
          <AsignacionSupervisores nivel="campania" id={campania.id} onChanged={onChanged} />
        </div>
      )}
      {seccion === 'tipificaciones' && <TipificacionesDeCampaniaPanel campania={campania} />}
      {seccion === 'postulantes' && <PostulantesDeCampaniaPanel campania={campania} />}
      {seccion === 'contacto' && <ContactoPublicoPanel campania={campania} onChanged={onChanged} />}
    </div>
  )
}

// Lista de solicitudes recibidas desde la página pública de registro (ej.
// registro.html de Totis) — solo lectura, el envío ocurre sin login desde
// afuera de AGYDA.
function PostulantesDeCampaniaPanel({ campania }: any) {
  const { data: postulantes = [], isLoading } = useQuery({
    queryKey: ['cc-postulantes', campania.id],
    queryFn: () => ccService.getPostulantes(campania.id),
  })

  const descargarExcel = (
    <a
      href={ccService.tipificacionesExcelUrl(campania.id)}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
    >
      <Download className="h-3.5 w-3.5" /> Descargar tipificaciones (Excel)
    </a>
  )

  if (isLoading) {
    return <div className={clsx(card, 'flex items-center justify-center py-10 text-ink-tertiary')}><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  if (postulantes.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{descargarExcel}</div>
        <div className={clsx(card, 'py-10 text-center text-sm text-ink-tertiary')}>
          Todavía no hay postulaciones registradas para "{campania.nombre}".
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.75rem] font-semibold text-ink-tertiary">{postulantes.length} postulante{postulantes.length === 1 ? '' : 's'} registrado{postulantes.length === 1 ? '' : 's'}</p>
        {descargarExcel}
      </div>
      {postulantes.map((p) => (
        <div key={p.id} className={clsx(card, 'space-y-2')}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-ink">{p.nombre}</p>
            <span className="flex-shrink-0 text-[0.68rem] text-ink-tertiary">
              {new Date(p.fechaRegistro).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary">
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-tertiary" /> {p.telefono}</span>
            {p.correo && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-tertiary" /> {p.correo}</span>}
          </div>
          {p.redesSociales && (
            <p className="whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-[0.78rem] text-ink-secondary">{p.redesSociales}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══ Gestión de postulantes (transversal a campañas asignadas) ═══
   Apartado nuevo, independiente de PostulantesDeCampaniaPanel (que sigue
   siendo el listado simple dentro del detalle de cada campaña). Este ve
   postulantes de TODAS las campañas visibles para el usuario sin elegir
   campaña primero — el backend ya filtra por agente vs. gestor/admin. */
const TIPIFICACION_BADGE = 'inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold'

export function CCPostulantesGestionTab() {
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [notasDe, setNotasDe] = useState<number | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const pageSize = 20
  const qc = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading } = useQuery({
    queryKey: ['cc-postulantes-gestion', qDebounced, page],
    queryFn: () => ccService.getPostulantesGestion({ q: qDebounced || undefined, page, pageSize }),
  })

  const postulantes = data?.data ?? []
  const total = data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))

  const tipificar = useMutation({
    mutationFn: ({ id, tipificacion }: { id: number; tipificacion: string }) =>
      ccService.tipificarPostulante(id, { tipificacion }),
    onSuccess: () => {
      toast.success('Tipificación actualizada')
      qc.invalidateQueries({ queryKey: ['cc-postulantes-gestion'] })
    },
    onError: () => toast.error('No se pudo actualizar la tipificación'),
  })

  return (
    <div className="space-y-4">
      <Header icon={ClipboardList} titulo="Gestión de postulantes" subtitulo="Busca, tipifica y da seguimiento a los postulantes de tus campañas asignadas." />

      <div className={clsx(card, 'flex items-center gap-2.5')}>
        <Search className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
        />
        <button
          type="button"
          onClick={() => setNuevoOpen(true)}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white transition hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo postulante
        </button>
      </div>

      {isLoading ? (
        <div className={clsx(card, 'flex items-center justify-center py-10 text-ink-tertiary')}><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : postulantes.length === 0 ? (
        <div className={clsx(card, 'py-10 text-center text-sm text-ink-tertiary')}>
          {qDebounced ? 'Sin resultados para tu búsqueda.' : 'No tienes postulantes visibles todavía.'}
        </div>
      ) : (
        <div className={clsx(cardBare, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Campaña</th>
                <th className="px-4 py-3">Tipificación</th>
                <th className="px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody>
              {postulantes.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{p.nombre}</td>
                  <td className="px-4 py-3 text-ink-secondary">
                    <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-tertiary" /> {p.telefono}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{p.campaniaNombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={p.tipificacion ?? ''}
                        onChange={(e) => e.target.value && tipificar.mutate({ id: p.id, tipificacion: e.target.value })}
                        className={clsx(TIPIFICACION_BADGE, p.tipificacion ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-ink-tertiary', 'cursor-pointer border-0 outline-none')}
                      >
                        <option value="" disabled>Sin tipificar</option>
                        {TIPIFICACIONES_LLAMADA.map((t) => (
                          <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                        ))}
                      </select>
                    </div>
                    {p.tipificacionFecha && (
                      <p className="mt-1 text-[0.65rem] text-ink-tertiary">
                        {new Date(p.tipificacionFecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setNotasDe(p.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
                    >
                      <StickyNote className="h-3.5 w-3.5" /> Notas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-[0.75rem] text-ink-tertiary">
          <p>{total} postulante{total === 1 ? '' : 's'} · página {page} de {totalPaginas}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPaginas}
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold disabled:opacity-40"
            >
              Siguiente <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {notasDe !== null && (
        <NotasPostulanteModal postulanteId={notasDe} onClose={() => setNotasDe(null)} />
      )}

      {nuevoOpen && (
        <NuevoPostulanteModal
          onClose={() => setNuevoOpen(false)}
          onCreado={() => {
            setNuevoOpen(false)
            qc.invalidateQueries({ queryKey: ['cc-postulantes-gestion'] })
          }}
        />
      )}
    </div>
  )
}

function NuevoPostulanteModal({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [campaniaId, setCampaniaId] = useState<number | ''>('')

  const { data: campanias = [], isLoading: cargandoCampanias } = useQuery({
    queryKey: ['cc-campanias-para-postulante'],
    queryFn: () => ccService.getCampaniasParaPostulante(),
  })

  const crear = useMutation({
    mutationFn: () => ccService.crearPostulante({ nombre: nombre.trim(), telefono: telefono.trim(), campaniaId: Number(campaniaId) }),
    onSuccess: () => { toast.success('Postulante creado'); onCreado() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo crear el postulante')
    },
  })

  const valido = nombre.trim().length > 0 && telefono.replace(/\D/g, '').length >= 10 && campaniaId !== ''

  return (
    <Modal isOpen onClose={onClose} title="Nuevo postulante" size="sm">
      <div className="space-y-3">
        <div>
          <label className={label}>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={field} placeholder="Nombre completo" />
        </div>
        <div>
          <label className={label}>Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={field} placeholder="10 dígitos" maxLength={20} />
        </div>
        <div>
          <label className={label}>Campaña</label>
          {cargandoCampanias ? (
            <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" /></div>
          ) : (
            <select value={campaniaId} onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')} className={field}>
              <option value="">Selecciona una campaña...</option>
              {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!valido} onClick={() => crear.mutate()}>Crear</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ═══ Contacto público de la campaña ═══
   Datos que muestran páginas externas (ej. contacto.html de la postulación
   de Totis) vía el endpoint sin auth GET /publico/campanias/:slug/contacto —
   antes solo se podían editar con un script directo a la base de datos. */
function ContactoPublicoPanel({ campania, onChanged }: { campania: any; onChanged: () => void }) {
  const [form, setForm] = useState({
    slug: campania.slug ?? '', telefono: campania.contactoTelefono ?? '',
    facebookUrl: campania.contactoFacebookUrl ?? '', instagramUrl: campania.contactoInstagramUrl ?? '',
  })
  const dirty = form.slug !== (campania.slug ?? '') || form.telefono !== (campania.contactoTelefono ?? '') ||
    form.facebookUrl !== (campania.contactoFacebookUrl ?? '') || form.instagramUrl !== (campania.contactoInstagramUrl ?? '')

  const guardar = useMutation({
    mutationFn: () => ccService.updateCampania(campania.id, {
      slug: form.slug.trim() || undefined,
      contactoTelefono: form.telefono.trim() || null,
      contactoFacebookUrl: form.facebookUrl.trim() || null,
      contactoInstagramUrl: form.instagramUrl.trim() || null,
    }),
    onSuccess: () => { toast.success('Contacto guardado'); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al guardar'),
  })

  const endpointPublico = form.slug ? `/api/contact-center/publico/campanias/${form.slug}/contacto` : null

  return (
    <div className={clsx(card, 'space-y-4')}>
      <p className="text-[0.72rem] text-ink-secondary">
        Estos datos los consumen páginas externas públicas (ej. el formulario de postulación de Totis) para mostrar
        cómo contactar a esta campaña, sin necesitar sesión. El WhatsApp real se toma solo del canal conectado — aquí
        solo se captura lo que no sale de ningún canal (teléfono de llamadas, y Facebook/Instagram si Messenger/
        Instagram no oficiales no tienen un perfil público al que enlazar).
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Identificador público (slug)</span>
          <input className={field} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="ej. totis" />
        </label>
        <label className="block">
          <span className={label}>Teléfono para llamadas (en horario)</span>
          <input className={field} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Ej. 5512345678" />
        </label>
        <label className="block">
          <span className={label}>URL de Facebook</span>
          <input className={field} value={form.facebookUrl} onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })} placeholder="https://facebook.com/..." />
        </label>
        <label className="block">
          <span className={label}>URL de Instagram</span>
          <input className={field} value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} placeholder="https://instagram.com/..." />
        </label>
      </div>

      {endpointPublico && (
        <div className="rounded-xl bg-gray-50 p-3.5 text-[0.72rem] text-ink-secondary">
          <p className="font-semibold text-ink-secondary">Endpoint público (fuera de horario, sin sesión):</p>
          <code className="mt-1.5 block break-all rounded-lg bg-card px-2.5 py-1.5 ring-1 ring-gray-200">{endpointPublico}</code>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending || !dirty}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar cambios
        </button>
      </div>
    </div>
  )
}

// Reutiliza CanalCard tal cual (misma edición de Meta/Baileys/FCA/IG que ya
// existe en la pestaña "Canales" general) — aquí solo se filtra a los de esta
// campaña y se ofrece crear uno nuevo ya preasignado a ella.
function CanalesDeCampaniaPanel({ campania, canales, onChanged }: any) {
  const qc = useQueryClient()
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos', campania.id], queryFn: () => ccService.getGrupos(campania.id) })
  const [nuevoTipo, setNuevoTipo] = useState<CCCanalTipo>('test')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-canales'] }); onChanged() }
  const crear = useMutation({
    mutationFn: async () => {
      const r: any = await ccService.createCanal({ tipo: nuevoTipo, nombre: nuevoNombre })
      // Preasigna la campaña de una vez — evita el paso extra de editar el
      // canal para "adoptarlo" en esta campaña justo después de crearlo.
      if (r?.data?.id) await ccService.updateCanal(r.data.id, { campaniaId: campania.id })
    },
    onSuccess: () => { setNuevoNombre(''); inval(); toast.success('Canal creado') },
  })
  const NuevoIcono = CANAL_ICONOS[nuevoTipo].icon

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <label className="block">
            <span className={label}>Tipo de canal</span>
            <div className="relative">
              <span className={clsx('pointer-events-none absolute left-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md', CANAL_ICONOS[nuevoTipo].bg, CANAL_ICONOS[nuevoTipo].fg)}>
                <NuevoIcono className="h-3.5 w-3.5" />
              </span>
              <select className={clsx(field, 'pl-10')} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as CCCanalTipo)}>
                <option value="test">Prueba</option>
                <option value="whatsapp">WhatsApp (API oficial de Meta)</option>
                <option value="messenger">Messenger</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp_baileys">WhatsApp por QR (no oficial)</option>
                <option value="messenger_fca">Messenger por appstate (no oficial)</option>
                <option value="instagram_privado">Instagram por usuario/password (no oficial)</option>
                <option value="web_publica">Web pública (widget del sitio)</option>
              </select>
            </div>
          </label>
          <label className="block">
            <span className={label}>Nombre del canal</span>
            <input className={field} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. WhatsApp Ventas" />
          </label>
          <button onClick={() => crear.mutate()} disabled={!nuevoNombre.trim() || crear.isPending}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar canal a "{campania.nombre}"
          </button>
        </div>
      </div>

      {canales.length === 0 && (
        <div className={clsx(card, 'text-center text-sm text-ink-tertiary')}>Esta campaña todavía no tiene canales asignados.</div>
      )}
      {canales.map((c: any) => (
        <CanalCard key={c.id} canal={c} grupos={grupos} campanias={[{ id: campania.id, nombre: campania.nombre }]} onChanged={inval} />
      ))}
    </div>
  )
}

// Skills de la campaña + asignación de agentes integrada en el flujo (antes
// "Asignación de agentes" era una pantalla hermana suelta, sin ligar
// visualmente con la campaña ni el skill al que pertenece cada asignación).
function SkillsDeCampaniaPanel({ campania, onChanged }: any) {
  const qc = useQueryClient()
  const { data: grupos = [] } = useQuery({ queryKey: ['cc-grupos', campania.id], queryFn: () => ccService.getGrupos(campania.id) })
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [nuevoIcono, setNuevoIcono] = useState(SKILL_ICONOS[0])
  const [skillAbierto, setSkillAbierto] = useState<number | null>(null)
  const [subTab, setSubTab] = useState<'agentes' | 'supervisores'>('agentes')
  const inval = () => { qc.invalidateQueries({ queryKey: ['cc-grupos', campania.id] }); onChanged() }
  const crearG = useMutation({
    mutationFn: () => ccService.createGrupo({ campaniaId: campania.id, nombre: nuevoGrupo, icono: nuevoIcono }),
    onSuccess: () => { setNuevoGrupo(''); inval(); toast.success('Skill agregado') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const delG = useMutation({ mutationFn: (id: number) => ccService.deleteGrupo(id), onSuccess: inval, onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error') })

  return (
    <div className={card}>
      <div className="space-y-2">
        {grupos.map((g, i) => (
          <div key={g.id} className="rounded-xl bg-gray-50">
            <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
              <button onClick={() => setSkillAbierto((v) => (v === g.id ? null : g.id))} className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-violet-600">
                <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', skillAbierto === g.id && 'rotate-90')} />
                <span>{g.icono || '💬'}</span> {g.nombre}
              </button>
              {(g.esPrincipal ?? i === 0) && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.62rem] font-semibold text-violet-600">Skill principal</span>
              )}
              <span className="flex items-center gap-1.5 text-[0.72rem] text-ink-tertiary">
                <Users className="h-3.5 w-3.5" /> {g.agentesCount} Agentes asignados
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-700">Activo</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => delG.mutate(g.id)} title="Eliminar skill" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {skillAbierto === g.id && (
              <div className="border-t border-gray-200/60 px-3.5 py-3">
                <div className="mb-3 flex gap-1 rounded-lg bg-black/5 p-0.5">
                  <button onClick={() => setSubTab('agentes')}
                    className={clsx('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition', subTab === 'agentes' ? 'bg-card text-violet-700 shadow-sm' : 'text-ink-tertiary hover:text-ink')}>
                    Agentes
                  </button>
                  <button onClick={() => setSubTab('supervisores')}
                    className={clsx('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition', subTab === 'supervisores' ? 'bg-card text-violet-700 shadow-sm' : 'text-ink-tertiary hover:text-ink')}>
                    Supervisores
                  </button>
                </div>
                {subTab === 'agentes'
                  ? <AsignacionAgentesSkill grupoId={g.id} onChanged={inval} />
                  : <AsignacionSupervisores nivel="skill" id={g.id} onChanged={inval} />}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className={clsx(field, 'flex-1')} value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} placeholder="Nombre del nuevo skill" />
        <select className={clsx(field, 'sm:w-40')} value={nuevoIcono} onChange={(e) => setNuevoIcono(e.target.value)}>
          {SKILL_ICONOS.map((ic) => <option key={ic} value={ic}>{ic} Skill</option>)}
        </select>
        <button onClick={() => crearG.mutate()} disabled={!nuevoGrupo.trim() || crearG.isPending}
          className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
          {crearG.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Agregar skill
        </button>
      </div>
    </div>
  )
}

// Lista de agentes con checkbox de asignación a ESTE skill — mismo par de
// endpoints que ya usaba la pantalla "Asignación de agentes" general
// (asignarAgente/quitarAgente), solo que aquí acotado a un solo grupoId en
// vez de la matriz completa de todos los skills a la vez.
function AsignacionAgentesSkill({ grupoId, onChanged }: { grupoId: number; onChanged: () => void }) {
  const qc = useQueryClient()
  const { data: asignados = [] } = useQuery({ queryKey: ['cc-agentes-grupo', grupoId], queryFn: () => ccService.getAgentesDeGrupo(grupoId) })
  const { data: usuarios = [] } = useUsuariosSimple()
  const [busqueda, setBusqueda] = useState('')
  const toggle = useMutation({
    mutationFn: ({ usuarioId, on }: { usuarioId: number; on: boolean }) =>
      on ? ccService.asignarAgente(grupoId, usuarioId) : ccService.quitarAgente(grupoId, usuarioId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-agentes-grupo', grupoId] }); onChanged() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const idsAsignados = new Set(asignados.map((a) => a.usuarioId))
  // Separados en dos listas: los ya asignados quedan siempre visibles arriba
  // (antes se perdían mezclados con el resto de usuarios del sistema, sin
  // forma de verlos sin buscarlos uno por uno) y abajo solo los candidatos
  // a agregar, filtrados por la búsqueda.
  const disponibles = (usuarios as any[]).filter((u) => !idsAsignados.has(u.id) && u.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">
          Agentes asignados ({asignados.length})
        </p>
        {asignados.length === 0 ? (
          <p className="rounded-lg bg-black/5 px-2.5 py-2 text-xs text-ink-tertiary">Todavía no hay agentes asignados a este skill.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {asignados.map((a) => (
              <div key={a.usuarioId} className="flex items-center justify-between rounded-lg bg-violet-100/60 px-2.5 py-1.5 text-sm text-ink">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[0.6rem] font-bold text-white">
                    {a.nombre.charAt(0).toUpperCase()}
                  </span>
                  {a.nombre}
                </span>
                <button onClick={() => toggle.mutate({ usuarioId: a.usuarioId, on: false })} title="Quitar del skill"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Agregar más agentes</p>
        <input className={clsx(field, 'mb-2')} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar agente..." />
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {disponibles.map((u) => (
            <label key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-black/5">
              <input type="checkbox" className="h-3.5 w-3.5 accent-violet-600"
                checked={false}
                onChange={(e) => toggle.mutate({ usuarioId: u.id, on: e.target.checked })} />
              {u.nombre}
            </label>
          ))}
          {disponibles.length === 0 && <p className="px-2 py-2 text-xs text-ink-tertiary">{busqueda ? 'Sin resultados' : 'Todos los usuarios ya están asignados'}</p>}
        </div>
      </div>
    </div>
  )
}

// Asignación de supervisores — mismo patrón visual que AsignacionAgentesSkill,
// pero acotado a usuarios AD/TI (mismo filtro que ya usaba el módulo
// Supervisor > Administrar) y parametrizado por nivel: "campania" (toda la
// campaña, CC_CAMPANIAS_SUPERVISORES) o "skill" (un solo grupo, más granular,
// CCO_GRUPO_SUPERVISORES) — ambas tablas comparten la misma forma de fila
// { usuarioId, nombre }, así que la UI y el hook de mutación son idénticos.
function AsignacionSupervisores({ nivel, id, onChanged }: { nivel: 'campania' | 'skill'; id: number; onChanged?: () => void }) {
  const qc = useQueryClient()
  const queryKey = [nivel === 'campania' ? 'cc-supervisores-campania' : 'cc-supervisores-grupo', id]
  const { data: asignados = [] } = useQuery({
    queryKey,
    queryFn: () => (nivel === 'campania' ? ccService.getSupervisoresDeCampania(id) : ccService.getSupervisoresDeGrupo(id)),
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-todas-areas'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/todas-areas')
      return ((data?.data ?? []) as { id: number; nombre: string; tipoUsuario: string }[]).filter((u) => ['AD', 'TI'].includes(u.tipoUsuario))
    },
  })
  const [busqueda, setBusqueda] = useState('')
  const toggle = useMutation({
    mutationFn: ({ usuarioId, on }: { usuarioId: number; on: boolean }) => {
      if (nivel === 'campania') return on ? ccService.asignarSupervisorACampania(id, usuarioId) : ccService.quitarSupervisorDeCampania(id, usuarioId)
      return on ? ccService.asignarSupervisorAGrupo(id, usuarioId) : ccService.quitarSupervisorDeGrupo(id, usuarioId)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); onChanged?.() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const idsAsignados = new Set(asignados.map((a) => a.usuarioId))
  const disponibles = (usuarios as { id: number; nombre: string }[]).filter((u) => !idsAsignados.has(u.id) && u.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">
          Supervisores asignados ({asignados.length})
        </p>
        {asignados.length === 0 ? (
          <p className="rounded-lg bg-black/5 px-2.5 py-2 text-xs text-ink-tertiary">Todavía no hay supervisores asignados.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {asignados.map((a) => (
              <div key={a.usuarioId} className="flex items-center justify-between rounded-lg bg-violet-100/60 px-2.5 py-1.5 text-sm text-ink">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[0.6rem] font-bold text-white">
                    {a.nombre.charAt(0).toUpperCase()}
                  </span>
                  {a.nombre}
                </span>
                <button onClick={() => toggle.mutate({ usuarioId: a.usuarioId, on: false })} title="Quitar supervisor"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Agregar supervisor (AD/TI)</p>
        <input className={clsx(field, 'mb-2')} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar usuario..." />
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {disponibles.map((u) => (
            <label key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-black/5">
              <input type="checkbox" className="h-3.5 w-3.5 accent-violet-600"
                checked={false}
                onChange={(e) => toggle.mutate({ usuarioId: u.id, on: e.target.checked })} />
              {u.nombre}
            </label>
          ))}
          {disponibles.length === 0 && <p className="px-2 py-2 text-xs text-ink-tertiary">{busqueda ? 'Sin resultados' : 'Todos los usuarios AD/TI ya están asignados'}</p>}
        </div>
      </div>
    </div>
  )
}

// Tipificaciones globales + las propias de esta campaña — mismo contrato que
// ya usa CCTipificacionesTab (getTipificacionesCatalogo/create/delete), solo
// filtrado y con la campaña preseleccionada al crear una nueva.
function TipificacionesDeCampaniaPanel({ campania }: any) {
  const qc = useQueryClient()
  const { data: tips = [] } = useQuery({ queryKey: ['cc-tip-cat'], queryFn: () => ccService.getTipificacionesCatalogo() })
  const [nueva, setNueva] = useState({ nombre: '', requiereComentario: false })
  const inval = () => qc.invalidateQueries({ queryKey: ['cc-tip-cat'] })
  const crear = useMutation({
    mutationFn: () => ccService.createTipificacion({ nombre: nueva.nombre, campaniaId: campania.id, requiereComentario: nueva.requiereComentario }),
    onSuccess: () => { setNueva({ nombre: '', requiereComentario: false }); inval(); toast.success('Tipificación agregada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const del = useMutation({ mutationFn: (id: number) => ccService.deleteTipificacion(id), onSuccess: inval })

  const propias = tips.filter((t) => t.campaniaId === campania.id)
  const globales = tips.filter((t) => t.campaniaId == null)

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className={label}>Nueva tipificación de "{campania.nombre}"</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input className={clsx(field, 'flex-1')} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Ej. Cliente satisfecho" />
          <label className="flex flex-shrink-0 items-center gap-2 text-xs font-medium text-ink-secondary">
            <input type="checkbox" className="h-3.5 w-3.5 accent-violet-600" checked={nueva.requiereComentario} onChange={(e) => setNueva({ ...nueva, requiereComentario: e.target.checked })} /> Requiere comentario
          </label>
          <button onClick={() => crear.mutate()} disabled={!nueva.nombre.trim()}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>

      <div className={card}>
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Propias de esta campaña</p>
        {propias.length === 0 && <p className="pb-2 text-sm text-ink-tertiary">Ninguna todavía — solo aplican las globales de abajo.</p>}
        {propias.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0">
            <span className="text-ink">{t.nombre} {t.requiereComentario && <span className="text-[0.68rem] text-amber-600">· requiere comentario</span>}</span>
            <button onClick={() => del.mutate(t.id)} className="text-ink-tertiary hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      <div className={card}>
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Globales (aplican a todas las campañas)</p>
        {globales.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0">
            <span className="text-ink-secondary">{t.nombre} {t.requiereComentario && <span className="text-[0.68rem] text-amber-600">· requiere comentario</span>}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Asignación de agentes ═══ */
export function CCAgentesTab() {
  const qc = useQueryClient()
  const { data: matriz } = useQuery({ queryKey: ['cc-matriz'], queryFn: () => ccService.getMatrizAgentes() })
  const { data: usuarios = [] } = useUsuariosSimple()
  const toggle = useMutation({
    mutationFn: ({ grupoId, usuarioId, on }: { grupoId: number; usuarioId: number; on: boolean }) =>
      on ? ccService.asignarAgente(grupoId, usuarioId) : ccService.quitarAgente(grupoId, usuarioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cc-matriz'] }),
  })
  const grupos = matriz?.grupos ?? []
  const asignado = (u: number, g: number) => (matriz?.asignaciones ?? []).some((a) => a.usuarioId === u && a.grupoId === g)

  return (
    <div className="space-y-4">
      <Header icon={Users} titulo="Asignación de agentes" subtitulo="Marca qué skills atiende cada agente. El enrutador solo asigna interacciones de sus skills." />
      <div className={clsx(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-[0.7rem] text-gray-500">
            <th className="py-2 text-left">Agente</th>
            {grupos.map((g) => <th key={g.id} className="px-2 py-2 text-center">{g.icono} {g.nombre}</th>)}
          </tr></thead>
          <tbody>
            {usuarios.map((u: any) => (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-2">{u.nombre}</td>
                {grupos.map((g) => (
                  <td key={g.id} className="px-2 py-2 text-center">
                    <input type="checkbox" className="h-4 w-4 accent-violet-600"
                      checked={asignado(u.id, g.id)}
                      onChange={(e) => toggle.mutate({ grupoId: g.id, usuarioId: u.id, on: e.target.checked })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══ Tipificaciones ═══ */
export function CCTipificacionesTab() {
  const qc = useQueryClient()
  const { data: tips = [] } = useQuery({ queryKey: ['cc-tip-cat'], queryFn: () => ccService.getTipificacionesCatalogo() })
  const { data: campanias = [] } = useQuery({ queryKey: ['cc-campanias'], queryFn: () => ccService.getCampanias() })
  const [nueva, setNueva] = useState({ nombre: '', campaniaId: '', requiereComentario: false })
  const inval = () => qc.invalidateQueries({ queryKey: ['cc-tip-cat'] })
  const crear = useMutation({
    mutationFn: () => ccService.createTipificacion({ nombre: nueva.nombre, campaniaId: nueva.campaniaId || null, requiereComentario: nueva.requiereComentario }),
    onSuccess: () => { setNueva({ nombre: '', campaniaId: '', requiereComentario: false }); inval() },
  })
  const del = useMutation({ mutationFn: (id: number) => ccService.deleteTipificacion(id), onSuccess: inval })

  return (
    <div className="space-y-4">
      <Header icon={Tags} titulo="Tipificaciones" subtitulo="Categorías obligatorias al cerrar una interacción. Globales o por campaña." />
      <div className={clsx(card, 'flex flex-wrap items-end gap-2')}>
        <input className={clsx(field, 'flex-1')} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre" />
        <select className={field} value={nueva.campaniaId} onChange={(e) => setNueva({ ...nueva, campaniaId: e.target.value })}>
          <option value="">Global</option>{campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" className="h-3.5 w-3.5 accent-violet-600" checked={nueva.requiereComentario} onChange={(e) => setNueva({ ...nueva, requiereComentario: e.target.checked })} /> Requiere comentario</label>
        <button onClick={() => crear.mutate()} disabled={!nueva.nombre.trim()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Agregar</button>
      </div>
      <div className={card}>
        {tips.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0">
            <span>{t.nombre} {t.campaniaId ? <span className="text-[0.68rem] text-gray-400">(campaña {t.campaniaId})</span> : <span className="text-[0.68rem] text-gray-400">(global)</span>} {t.requiereComentario && <span className="text-[0.68rem] text-amber-600">· comentario</span>}</span>
            <button onClick={() => del.mutate(t.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Config SLA/ACW ═══ */
export function CCConfigTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['cc-config'], queryFn: () => ccService.getConfig() })
  const [form, setForm] = useState<any>(null)
  const [seed, setSeed] = useState<string>('')
  if (data && JSON.stringify(data) !== seed) { setSeed(JSON.stringify(data)); setForm({ ...data }) }
  const guardar = useMutation({
    mutationFn: () => ccService.updateConfig(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cc-config'] }); toast.success('Guardado') },
  })
  if (!form) return <p className="text-sm text-gray-400">Cargando…</p>
  const num = (k: string, label: string, hint: string) => (
    <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">{label}</span>
      <input type="number" className={field} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
      <span className="mt-0.5 block text-[0.65rem] text-gray-400">{hint}</span></label>
  )
  return (
    <div className="space-y-4">
      <Header icon={Gauge} titulo="SLA, ACW y horario" subtitulo="Umbrales de servicio, tiempo de wrap-up y autocierre por inactividad." />
      <div className={clsx(card, 'grid grid-cols-1 gap-3 sm:grid-cols-2')}>
        {num('slaPrimeraRespuestaSeg', 'SLA primera respuesta (seg)', 'Tiempo objetivo antes de que un agente tome la interacción')}
        {num('slaRespuestaSeg', 'SLA respuesta (seg)', 'Tiempo objetivo para responder a un mensaje del cliente')}
        {num('acwSeg', 'ACW / wrap-up (seg)', 'Tiempo tras cerrar antes de recibir otra interacción')}
        {num('maxInteraccionesPorAgente', 'Máx. interacciones por agente', 'Capacidad simultánea (una campaña puede sobreescribir)')}
        {num('autocierreInactividadMin', 'Autocierre por inactividad (min)', 'Cierra la interacción si el cliente no responde')}
        <label className="block"><span className="mb-1 block text-[0.7rem] font-semibold text-gray-500">Mensaje de bienvenida</span>
          <input className={field} value={form.msgBienvenida} onChange={(e) => setForm({ ...form, msgBienvenida: e.target.value })} /></label>
      </div>
      <div className="flex justify-end">
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>
    </div>
  )
}

/* ═══ Simulador ═══ */
export function CCSimuladorTab() {
  const { data: canales = [] } = useQuery({ queryKey: ['cc-canales'], queryFn: () => ccService.getCanales() })
  const testCanales = canales.filter((c) => c.tipo === 'test')
  const [form, setForm] = useState({ canalId: '', clienteNombre: 'Cliente de prueba', mensaje: '' })
  const [sim, setSim] = useState<{ interaccionId: number; simToken: string } | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const { data: hilo, refetch } = useQuery({
    queryKey: ['cc-sim-hilo', sim?.simToken],
    queryFn: async () => { const { publicApi } = await import('@/lib/axios-public'); return (await publicApi.get(`/contact-center/sim/${sim!.simToken}`)).data.data },
    enabled: !!sim, refetchInterval: 4000,
  })
  const crear = useMutation({
    mutationFn: () => ccService.simCrear({ canalId: Number(form.canalId), clienteNombre: form.clienteNombre, mensaje: form.mensaje }),
    onSuccess: (r) => { setSim(r.data); setForm({ ...form, mensaje: '' }); toast.success('Interacción de prueba creada') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  })
  const responder = useMutation({
    mutationFn: async () => { const { publicApi } = await import('@/lib/axios-public'); return publicApi.post(`/contact-center/sim/${sim!.simToken}/mensajes`, { mensaje: respuesta }) },
    onSuccess: () => { setRespuesta(''); refetch() },
  })

  return (
    <div className="space-y-4">
      <Header icon={FlaskConical} titulo="Simulador de prueba" subtitulo="Crea una interacción ficticia y responde como si fueras el cliente. Sin Meta." />
      {testCanales.length === 0 && <div className={clsx(card, 'text-sm text-amber-700')}>Primero crea un canal de tipo "prueba" en la pestaña Canales.</div>}
      <div className={clsx(card, 'space-y-3')}>
        <select className={field} value={form.canalId} onChange={(e) => setForm({ ...form, canalId: e.target.value })}>
          <option value="">Selecciona canal de prueba…</option>
          {testCanales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className={field} value={form.clienteNombre} onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })} placeholder="Nombre del cliente" />
        <input className={field} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} placeholder="Primer mensaje del cliente" />
        <button onClick={() => crear.mutate()} disabled={!form.canalId || !form.mensaje.trim() || crear.isPending}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Crear interacción</button>
      </div>
      {sim && (
        <div className={clsx(card, 'space-y-2')}>
          <p className="text-xs text-gray-500">Consola del cliente · interacción #{sim.interaccionId} · estado: {hilo?.estado} {hilo?.agenteNombre ? `· agente: ${hilo.agenteNombre}` : ''}</p>
          <p className="text-[0.68rem] text-gray-400">Página pública: <code className="rounded bg-gray-100 px-1">/cc-cliente?t={sim.simToken}</code></p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl bg-gray-50 p-3">
            {(hilo?.mensajes ?? []).map((m: any) => (
              <div key={m.id} className={clsx('flex', m.emisor === 'cliente' ? 'justify-end' : 'justify-start')}>
                <span className={clsx('rounded-xl px-3 py-1.5 text-sm', m.emisor === 'cliente' ? 'bg-violet-600 text-white' : 'bg-white ring-1 ring-gray-200')}>{m.contenido}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={field} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && respuesta.trim()) responder.mutate() }} placeholder="Responder como cliente…" />
            <button onClick={() => responder.mutate()} disabled={!respuesta.trim()} className="rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">Enviar</button>
          </div>
        </div>
      )}
    </div>
  )
}
