import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessagesSquare, Send, Users, Plus, UserPlus, Paperclip, FileText, Download, X, HardDrive, Settings, Smile, Minus, MoreVertical, Pencil, Trash2, Check, AlertCircle, RotateCw, Search, Eye, FileSpreadsheet, FileImage, FileVideo, FileAudio, File as FileIcon, MailQuestion, Pin, LogOut } from 'lucide-react'
import { createPortal } from 'react-dom'
import { renderizarPrimeraPaginaPdf } from '@/lib/pdfPreview'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { getSocket } from '@/lib/socket'
import { useSocketEvent } from '@/hooks/useSocket'
import { useCurrentUser } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { TypingDots } from '@/components/ui/TypingDots'
import { NuevoGrupoModal } from './NuevoGrupoModal'
import { AgregarMiembrosModal } from './AgregarMiembrosModal'
import { DriveArchivoPicker } from './DriveArchivoPicker'
import type { MensajeriaCanal, MensajeriaMensaje, MensajeriaConfig, MensajeriaReaccion } from '@/types/mensajeria.types'
import { parseMensajeriaMensaje } from '@/types/mensajeria.types'
import { getContrastTextColor, hexToRgba } from '@/lib/color'
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

function nombreDeUrl(url: string): string {
  const partes = url.split('/')
  const archivo = partes[partes.length - 1] || 'archivo'
  return archivo.replace(/^msj_\d+_/, '')
}

// Ícono + color por tipo de archivo (estilo WhatsApp: tarjeta de color según
// extensión en vez de un ícono genérico para todo). `nombre` es el nombre de
// archivo o su URL — solo se usa la extensión.
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

function formatTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Tipos que se pueden mostrar dentro de un iframe/visor embebido (no todo lo
// "previsualizable" aplica — video/audio usan <video>/<audio>, no iframe).
function esIframeable(url: string): boolean {
  return /\.pdf$/i.test(url)
}

// Tarjeta de preview del archivo elegido, antes de enviarlo — imagen real si
// es foto, primera página renderizada si es PDF (vía pdf.js), o ícono de
// color para el resto. Mismo estilo que la burbuja final/el visor del chat.
function PreviewArchivoAdjunto({ archivo, oscuro, onQuitar }: { archivo: File; oscuro: boolean; onQuitar: () => void }) {
  const [pdfPreview, setPdfPreview] = useState<{ dataUrl: string; totalPaginas: number } | null>(null)
  const esImg = archivo.type.startsWith('image/')
  const esPdf = archivo.type === 'application/pdf'
  const { Icono, color, bg } = tipoArchivo(archivo.name)

  useEffect(() => {
    if (!esPdf) return
    let cancelado = false
    renderizarPrimeraPaginaPdf(archivo).then((r) => { if (!cancelado) setPdfPreview(r) })
    return () => { cancelado = true }
  }, [archivo, esPdf])

  return (
    <div className={clsx('relative mb-2 flex flex-col items-center gap-2 overflow-hidden rounded-xl px-4 py-5', oscuro ? 'bg-gray-800' : 'bg-gray-100')}>
      <button
        onClick={onQuitar}
        className={clsx('absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full', oscuro ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-500 hover:bg-gray-200')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {esImg ? (
        <img src={URL.createObjectURL(archivo)} alt={archivo.name} className="max-h-40 rounded-lg object-contain shadow" />
      ) : esPdf && pdfPreview ? (
        <img src={pdfPreview.dataUrl} alt={archivo.name} className="max-h-40 rounded-lg border border-black/10 object-contain shadow" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-xl" style={{ background: bg }}>
          <Icono className="h-7 w-7" style={{ color }} />
        </span>
      )}
      <div className="text-center">
        <p className={clsx('max-w-[220px] truncate text-xs font-semibold', oscuro ? 'text-gray-100' : 'text-gray-800')}>{archivo.name}</p>
        <p className={clsx('text-[0.65rem]', oscuro ? 'text-gray-400' : 'text-gray-500')}>
          {esPdf && pdfPreview ? `${pdfPreview.totalPaginas} página${pdfPreview.totalPaginas === 1 ? '' : 's'} · ` : ''}
          {formatTamano(archivo.size)}
        </p>
      </div>
    </div>
  )
}

// Modal de vista previa estilo WhatsApp: PDF en iframe, imágenes a tamaño
// completo, y para el resto solo el aviso de "sin vista previa" + descargar.
function VisorArchivoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const nombre = nombreDeUrl(url)
  const { Icono, color } = tipoArchivo(nombre)
  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 py-3">
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <p className="truncate px-4 text-sm font-medium text-white">{nombre}</p>
        <a href={url} download className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" title="Descargar">
          <Download className="h-5 w-5" />
        </a>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
        {esIframeable(url) ? (
          <iframe src={url} title={nombre} className="h-full w-full max-w-4xl rounded-xl bg-white" />
        ) : esImagen(url) ? (
          <img src={url} alt={nombre} className="max-h-full max-w-full rounded-xl object-contain" />
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl bg-[#0B1730] px-6 py-10 text-center">
            <Icono className="h-14 w-14" style={{ color }} />
            <p className="text-sm font-semibold text-white">No hay vista previa disponible</p>
            <a href={url} download className="mt-1 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20">
              Descargar archivo
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
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
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-full mt-2 z-20 w-72 rounded-xl border border-gray-200 bg-card shadow-lg">
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
    </>
  )
}

/* ── Item de la lista de conversaciones ── */
// Posición de pantalla donde abrir el menú contextual — clic derecho usa la
// posición del cursor; long-press (tablet/móvil) usa el punto donde se mantuvo
// presionado el dedo.
interface PosicionMenu { x: number; y: number }

// Menú contextual de una conversación — clic derecho (desktop) o mantener
// presionado (tablet/táctil). Grupos: salir, no leído, fijar/desfijar.
// Directos: no leído, fijar/desfijar, eliminar chat (oculta solo para mí).
function MenuContextualConversacion({
  canal, posicion, oscuro, onClose, onFijar, onMarcarNoLeido, onSalirDeGrupo, onEliminarChat,
}: {
  canal: MensajeriaCanal
  posicion: PosicionMenu
  oscuro: boolean
  onClose: () => void
  onFijar: () => void
  onMarcarNoLeido: () => void
  onSalirDeGrupo: () => void
  onEliminarChat: () => void
}) {
  const esGrupo = canal.tipo === 'grupo'
  // Evita que el menú se salga de la pantalla si se abre cerca del borde.
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(posicion.y, window.innerHeight - 220),
    left: Math.min(posicion.x, window.innerWidth - 220),
  }

  const itemClass = clsx(
    'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors',
    oscuro ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50',
  )

  return createPortal(
    <>
      <div className="fixed inset-0 z-[250]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        style={style}
        className={clsx(
          'z-[260] w-56 overflow-hidden rounded-xl border shadow-xl animate-fade-in',
          oscuro ? 'chat-tema-oscuro bg-gray-800 border-gray-700' : 'chat-tema-claro bg-card border-gray-200',
        )}
      >
        <button className={itemClass} onClick={() => { onMarcarNoLeido(); onClose() }}>
          <MailQuestion className="h-4 w-4" /> Marcar como no leído
        </button>
        <button className={itemClass} onClick={() => { onFijar(); onClose() }}>
          <Pin className="h-4 w-4" /> {canal.fijado ? 'Desfijar chat' : 'Fijar chat'}
        </button>
        {esGrupo ? (
          <button
            className={clsx(itemClass, 'text-red-500 hover:text-red-600')}
            onClick={() => {
              onClose()
              if (window.confirm(`¿Salir de "${canal.nombre || 'este grupo'}"? Dejarás de recibir sus mensajes.`)) onSalirDeGrupo()
            }}
          >
            <LogOut className="h-4 w-4" /> Salir del grupo
          </button>
        ) : (
          <button
            className={clsx(itemClass, 'text-red-500 hover:text-red-600')}
            onClick={() => {
              onClose()
              if (window.confirm(`¿Eliminar el chat con "${canal.nombre || 'este contacto'}"? Solo se elimina de tu lista.`)) onEliminarChat()
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar chat
          </button>
        )}
      </div>
    </>,
    document.body,
  )
}

function ConversacionItem({ canal, activa, oscuro, onClick, onFijar, onMarcarNoLeido, onSalirDeGrupo, onEliminarChat }: {
  canal: MensajeriaCanal
  activa: boolean
  oscuro: boolean
  onClick: () => void
  onFijar: () => void
  onMarcarNoLeido: () => void
  onSalirDeGrupo: () => void
  onEliminarChat: () => void
}) {
  const [menuPos, setMenuPos] = useState<PosicionMenu | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressDisparado = useRef(false)

  const abrirMenuEn = (x: number, y: number) => setMenuPos({ x, y })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    abrirMenuEn(e.clientX, e.clientY)
  }

  // Long-press táctil (tablet/móvil): mantener presionado ~500ms abre el menú
  // en vez de disparar el click normal de abrir la conversación.
  const handleTouchStart = (e: React.TouchEvent) => {
    longPressDisparado.current = false
    const touch = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      longPressDisparado.current = true
      abrirMenuEn(touch.clientX, touch.clientY)
    }, 500)
  }
  const cancelarLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }
  const handleClick = () => {
    if (longPressDisparado.current) { longPressDisparado.current = false; return }
    onClick()
  }

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelarLongPress}
        onTouchMove={cancelarLongPress}
        className={clsx(
          'w-full text-left px-4 py-3 border-b transition-colors flex items-center gap-3',
          oscuro ? 'border-gray-700' : 'border-gray-100',
          activa ? (oscuro ? 'bg-brand/15' : 'bg-blue-50') : (oscuro ? 'hover:bg-gray-800' : 'hover:bg-gray-50'),
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
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={clsx(
              'flex min-w-0 items-center gap-1 truncate text-sm',
              canal.noLeidos > 0 ? 'font-bold' : 'font-medium',
              canal.noLeidos > 0 ? (oscuro ? 'text-gray-100' : 'text-gray-900') : (oscuro ? 'text-gray-300' : 'text-gray-700'),
            )}>
              {canal.fijado && <Pin className={clsx('h-3 w-3 flex-shrink-0', oscuro ? 'text-gray-500' : 'text-gray-400')} />}
              <span className="truncate">{canal.nombre || 'Conversación'}</span>
            </span>
            <span className={clsx('flex-shrink-0 text-[0.65rem]', oscuro ? 'text-gray-500' : 'text-gray-400')}>{formatFechaCorta(canal.ultimoMensajeFecha)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={clsx('truncate text-xs', oscuro ? 'text-gray-400' : 'text-gray-500')}>{canal.ultimoMensajePreview || 'Sin mensajes aún'}</p>
            {canal.noLeidos > 0 && (
              <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[0.6rem] font-bold text-white">
                {canal.noLeidos > 9 ? '9+' : canal.noLeidos}
              </span>
            )}
          </div>
        </div>
      </button>

      {menuPos && (
        <MenuContextualConversacion
          canal={canal}
          posicion={menuPos}
          oscuro={oscuro}
          onClose={() => setMenuPos(null)}
          onFijar={onFijar}
          onMarcarNoLeido={onMarcarNoLeido}
          onSalirDeGrupo={onSalirDeGrupo}
          onEliminarChat={onEliminarChat}
        />
      )}
    </>
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
  const [miembrosOpen, setMiembrosOpen] = useState(false)
  const [agregarMiembrosOpen, setAgregarMiembrosOpen] = useState(false)
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
  const [archivoVisor, setArchivoVisor] = useState<string | null>(null)
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

  // Solo se piden al abrir el panel — no hace falta cargarlos en cada mensaje.
  const { data: canalDetalle, isLoading: cargandoMiembros } = useQuery({
    queryKey: ['mensajeria-canal-detalle', canal.id],
    queryFn: () => mensajeriaService.getCanal(canal.id),
    enabled: miembrosOpen && canal.tipo === 'grupo',
  })

  const quitarMiembro = useMutation({
    mutationFn: (usuarioId: number) => mensajeriaService.quitarMiembro(canal.id, usuarioId),
    onSuccess: () => {
      toast.success('Integrante eliminado')
      qc.invalidateQueries({ queryKey: ['mensajeria-canal-detalle', canal.id] })
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) toast.error('Solo el creador del grupo puede quitar integrantes')
      else toast.error('No se pudo eliminar al integrante')
    },
  })

  const oscuro = config?.tema === 'oscuro'
  const colorPropio = config?.colorMensajePropio ?? '#2563EB'
  // El blanco es el valor por defecto de "Recibidos" — si el usuario nunca lo
  // personalizó, en modo oscuro se usa un gris oscuro en su lugar (como
  // WhatsApp), para no dejar burbujas blancas sólidas en un chat oscuro. Si sí
  // lo personalizó a un color propio, se respeta tal cual en ambos temas.
  const colorAjenoDefault = oscuro ? '#2A2F3A' : '#FFFFFF'
  const colorAjeno = (!config?.colorMensajeAjeno || config.colorMensajeAjeno.toUpperCase() === '#FFFFFF')
    ? colorAjenoDefault
    : config.colorMensajeAjeno
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
      className={clsx('relative flex-1 flex min-h-0', oscuro ? 'chat-tema-oscuro bg-gray-900' : 'chat-tema-claro')}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
    <div className="relative flex-1 flex flex-col min-h-0 min-w-0">
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
          {otrosEscribiendo && (
            <p className="flex items-center gap-1.5 text-xs text-brand">
              {otrosEscribiendo} está escribiendo <TypingDots />
            </p>
          )}
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
            title="Detalles del grupo"
          >
            <Users className="h-4 w-4" />
          </button>
        )}
        {agregarMiembrosOpen && canalDetalle && (
          <AgregarMiembrosModal
            canalId={canal.id}
            yaMiembros={canalDetalle.miembros}
            onClose={() => setAgregarMiembrosOpen(false)}
            onAgregados={() => {
              setAgregarMiembrosOpen(false)
              qc.invalidateQueries({ queryKey: ['mensajeria-canal-detalle', canal.id] })
            }}
          />
        )}

      </div>

      <div ref={mensajesContainerRef} className={clsx('flex-1 overflow-y-auto px-5 py-4', oscuro ? 'bg-gray-900' : 'bg-gray-50')}>
        {mensajes.map((m, i) => {
          const esMio = m.emisorId === user?.id
          // El filtro vidrioso (blur + semitransparencia) solo aplica a lo que
          // YO mando — las burbujas ajenas se quedan con su color sólido normal.
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
                <div className="my-4 flex items-center justify-center">
                  <span className={clsx('rounded-full px-3 py-1 text-[0.68rem] font-medium', oscuro ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500 shadow-sm')}>
                    {formatFechaSeparador(m.fecha)}
                  </span>
                </div>
              )}
            <div className={clsx('flex w-full flex-col animate-fade-in', esMio ? 'items-end' : 'items-start', mismoRemitenteQueAnterior && !cambioDeDia ? 'mt-1' : 'mt-4')}>
              {mostrarAvatarGrupo && (
                <span className={clsx('mb-0.5 pl-9 text-[0.72rem] font-semibold', oscuro ? 'text-gray-300' : 'text-gray-700')}>{m.emisorNombre}</span>
              )}
              <div
                className={clsx('relative flex w-full items-start gap-2', esMio ? 'justify-end' : 'justify-start')}
                onMouseEnter={() => setReaccionandoId(m.id)}
                onMouseLeave={() => setReaccionandoId((v) => (v === m.id ? null : v))}
              >
                {!esMio && canal.tipo === 'grupo' && (
                  <div className="h-7 w-7 flex-shrink-0">
                    {mostrarAvatarGrupo && <Avatar name={m.emisorNombre || '?'} size="sm" ring={oscuro ? 'brand' : 'white'} />}
                  </div>
                )}
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
                      'max-w-[85%] rounded-2xl px-4 py-2 text-sm',
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
                  <div className="max-w-[85%]" style={{ display: 'table' }}>
                  {m.archivoUrl && !esImagen(m.archivoUrl) && !m.contenido ? (() => {
                    // Documento solo (sin texto) — la tarjeta del documento ES la
                    // burbuja, sin un segundo card de fondo alrededor envolviéndola.
                    const { Icono, color, bg, etiqueta } = tipoArchivo(m.archivoUrl)
                    const claro = textColor !== 'white'
                    return (
                      <div
                        className={clsx(
                          'w-[220px] overflow-hidden rounded-2xl transition-opacity',
                          esMio ? 'border border-white/15 shadow-lg backdrop-blur-md' : (!oscuro && 'border border-gray-200'),
                          m.estadoEnvio === 'enviando' && 'opacity-60',
                        )}
                        style={{ backgroundColor: bgColor, color: textColor }}
                      >
                        <div className="flex items-center gap-2.5 px-2.5 py-2.5">
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
                            <Icono className="h-5 w-5" style={{ color }} />
                          </span>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-xs font-semibold">{nombreDeUrl(m.archivoUrl)}</p>
                            <p className="text-[0.65rem] opacity-70">{etiqueta}</p>
                          </div>
                        </div>
                        <div className="flex border-t" style={{ borderColor: claro ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }}>
                          <button
                            type="button"
                            onClick={() => setArchivoVisor(m.archivoUrl)}
                            className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[0.68rem] font-semibold hover:opacity-70"
                          >
                            <Eye className="h-3 w-3" /> Ver
                          </button>
                          <div className="w-px" style={{ background: claro ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }} />
                          <a
                            href={m.archivoUrl}
                            download
                            className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[0.68rem] font-semibold hover:opacity-70"
                          >
                            <Download className="h-3 w-3" /> Guardar
                          </a>
                        </div>
                      </div>
                    )
                  })() : (
                  <div
                    className={clsx(
                      'min-w-[64px] max-w-full overflow-hidden rounded-2xl px-4 py-2 text-sm transition-opacity',
                      esMio ? 'border border-white/15 shadow-lg backdrop-blur-md' : (!esMio && !oscuro && 'border border-gray-200'),
                      m.estadoEnvio === 'enviando' && 'opacity-60',
                    )}
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    {m.contenido && <p className="whitespace-pre-wrap break-words text-left">{m.contenido.trim()}</p>}
                    {m.archivoUrl && (
                      esImagen(m.archivoUrl) ? (
                        <button type="button" onClick={() => setArchivoVisor(m.archivoUrl)} className="block mt-1">
                          <img src={m.archivoUrl} alt={nombreDeUrl(m.archivoUrl)} className="block w-full max-w-[220px] h-auto rounded-lg object-cover" />
                        </button>
                      ) : (() => {
                        const { Icono, color, bg, etiqueta } = tipoArchivo(m.archivoUrl)
                        const claro = textColor !== 'white'
                        return (
                          <div className="mt-1 w-full max-w-[220px] overflow-hidden rounded-xl" style={{ backgroundColor: claro ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)' }}>
                            <div className="flex items-center gap-2.5 px-2.5 py-2.5">
                              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
                                <Icono className="h-5 w-5" style={{ color }} />
                              </span>
                              <div className="min-w-0 flex-1 text-left">
                                <p className="truncate text-xs font-semibold">{nombreDeUrl(m.archivoUrl)}</p>
                                <p className="text-[0.65rem] opacity-70">{etiqueta}</p>
                              </div>
                            </div>
                            <div className="flex border-t" style={{ borderColor: claro ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }}>
                              <button
                                type="button"
                                onClick={() => setArchivoVisor(m.archivoUrl)}
                                className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[0.68rem] font-semibold hover:opacity-70"
                              >
                                <Eye className="h-3 w-3" /> Ver
                              </button>
                              <div className="w-px" style={{ background: claro ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }} />
                              <a
                                href={m.archivoUrl}
                                download
                                className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[0.68rem] font-semibold hover:opacity-70"
                              >
                                <Download className="h-3 w-3" /> Guardar
                              </a>
                            </div>
                          </div>
                        )
                      })()
                    )}
                  </div>
                  )}
                  <div className={clsx('flex items-center gap-1 text-[10px] mt-0.5 px-1 whitespace-nowrap', oscuro ? 'text-gray-500' : 'text-gray-400')}>
                    {m.editado && <span className="italic">editado ·</span>}
                    {m.estadoEnvio === 'enviando' ? (
                      <RotateCw size={10} className="animate-spin" />
                    ) : m.estadoEnvio === 'error' ? (
                      <button
                        onClick={() => reintentarEnvio(m)}
                        className="flex items-center gap-0.5 text-red-500 hover:underline"
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
            </div>
          )
        })}
        {otrosEscribiendo && (
          <div className="mt-2 flex w-full items-start justify-start">
            <div
              className={clsx('inline-flex items-center rounded-2xl px-4 py-3', oscuro ? 'bg-gray-800' : 'bg-white border border-gray-200')}
            >
              <TypingDots className={oscuro ? 'bg-gray-400' : 'bg-gray-400'} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={clsx('p-4 border-t shrink-0', oscuro ? 'border-gray-700' : 'border-gray-100')}>
        {archivo && (
          <PreviewArchivoAdjunto archivo={archivo} oscuro={oscuro} onQuitar={() => setArchivo(null)} />
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
              oscuro ? 'border-gray-700 bg-gray-800 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900',
            )}
            style={{ maxHeight: 120, colorScheme: oscuro ? 'dark' : 'light' }}
          />
          <Button
            onClick={handleEnviar}
            disabled={enviar.isPending || (!texto.trim() && !archivo)}
            style={{ backgroundColor: hexToRgba(colorPropio, 0.55), borderColor: colorPropio, color: textColorPropio }}
          >
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

      {archivoVisor && (
        <VisorArchivoModal url={archivoVisor} onClose={() => setArchivoVisor(null)} />
      )}
    </div>

    {miembrosOpen && canal.tipo === 'grupo' && (
      <PanelDetallesGrupo
        canal={canal}
        canalDetalle={canalDetalle}
        cargando={cargandoMiembros}
        oscuro={oscuro}
        esCreador={user?.id === canal.creadoPor}
        onAgregarMiembros={() => setAgregarMiembrosOpen(true)}
        onQuitarMiembro={(id) => quitarMiembro.mutate(id)}
        quitandoMiembro={quitarMiembro.isPending}
        miUsuarioId={user?.id}
        onCerrar={() => setMiembrosOpen(false)}
      />
    )}
    </div>
  )
}

// Panel lateral de "Detalles del grupo" — nombre, descripción (ya guardada en
// MC_DESCRIPCION, antes nunca mostrada en ninguna pantalla) y lista de
// integrantes. Reemplaza el popover flotante que antes abría el botón de
// Users en el header; mismos datos de siempre (getCanal), sin tocar backend.
function PanelDetallesGrupo({
  canal, canalDetalle, cargando, oscuro, esCreador, onAgregarMiembros, onQuitarMiembro, quitandoMiembro, miUsuarioId, onCerrar,
}: {
  canal: MensajeriaCanal
  canalDetalle: { miembros: { usuarioId: number; nombre: string; fotoUrl: string | null }[] } | undefined
  cargando: boolean
  oscuro: boolean
  esCreador: boolean
  onAgregarMiembros: () => void
  onQuitarMiembro: (usuarioId: number) => void
  quitandoMiembro: boolean
  miUsuarioId: number | undefined
  onCerrar: () => void
}) {
  const miembros = canalDetalle?.miembros ?? []
  // Avatares superpuestos del encabezado: hasta 3 fotos + un contador "+N" si hay más.
  const avataresHeader = miembros.slice(0, 3)
  const restanteHeader = miembros.length - avataresHeader.length

  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombreEdit, setNombreEdit] = useState(canal.nombre || '')
  const [descEdit, setDescEdit] = useState(canal.descripcion || '')
  const [verTodosArchivos, setVerTodosArchivos] = useState(false)

  const { data: archivosCanal = [], isLoading: cargandoArchivos } = useQuery({
    queryKey: ['mensajeria-archivos-canal', canal.id],
    queryFn: () => mensajeriaService.getArchivosCanal(canal.id),
  })

  const guardarGrupo = useMutation({
    mutationFn: () => mensajeriaService.actualizarGrupo(canal.id, { nombre: nombreEdit.trim(), descripcion: descEdit.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensajeria-canal-detalle', canal.id] })
      qc.invalidateQueries({ queryKey: ['mensajeria-canales'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar el grupo'),
  })

  const iniciarEdicion = () => {
    setNombreEdit(canal.nombre || '')
    setDescEdit(canal.descripcion || '')
    setEditando(true)
  }

  return (
    <div className={clsx('flex w-72 flex-shrink-0 flex-col border-l', oscuro ? 'border-gray-700 bg-gray-900' : 'border-gray-100 bg-card')}>
      <div className={clsx('flex items-center justify-between border-b px-4 py-3', oscuro ? 'border-gray-700' : 'border-gray-100')}>
        <p className={clsx('text-sm font-semibold', oscuro ? 'text-gray-100' : 'text-gray-800')}>Detalles del grupo</p>
        <button
          onClick={onCerrar}
          className={clsx('flex h-7 w-7 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Encabezado: avatares superpuestos de los integrantes + nombre + descripción */}
        <div className={clsx('flex flex-col items-center gap-2 border-b px-4 py-5 text-center', oscuro ? 'border-gray-700' : 'border-gray-100')}>
          {avataresHeader.length > 0 ? (
            <div className="flex -space-x-2.5">
              {avataresHeader.map((m) => (
                <div key={m.usuarioId} className={clsx('rounded-full ring-2', oscuro ? 'ring-gray-900' : 'ring-card')}>
                  <Avatar src={m.fotoUrl} name={m.nombre} size="md" />
                </div>
              ))}
              {restanteHeader > 0 && (
                <div className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full text-[0.68rem] font-bold ring-2',
                  oscuro ? 'bg-gray-800 text-gray-300 ring-gray-900' : 'bg-gray-100 text-gray-600 ring-card',
                )}>
                  +{restanteHeader}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Users className="h-7 w-7" />
            </div>
          )}
          {editando ? (
            <div className="flex w-full flex-col gap-2 px-1">
              <input
                autoFocus
                value={nombreEdit}
                onChange={(e) => setNombreEdit(e.target.value)}
                placeholder="Nombre del grupo"
                maxLength={100}
                className={clsx(
                  'w-full rounded-lg border px-2.5 py-1.5 text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-brand/20',
                  oscuro ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-200 bg-card text-gray-800',
                )}
              />
              <textarea
                value={descEdit}
                onChange={(e) => setDescEdit(e.target.value)}
                placeholder="Descripción del grupo (opcional)"
                maxLength={300}
                rows={2}
                className={clsx(
                  'w-full resize-none rounded-lg border px-2.5 py-1.5 text-center text-xs outline-none focus:ring-2 focus:ring-brand/20',
                  oscuro ? 'border-gray-700 bg-gray-800 text-gray-200 placeholder-gray-500' : 'border-gray-200 bg-card text-gray-600',
                )}
              />
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  disabled={guardarGrupo.isPending}
                  className={clsx('rounded-full px-3 py-1 text-xs font-semibold', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100')}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => guardarGrupo.mutate()}
                  disabled={guardarGrupo.isPending || !nombreEdit.trim()}
                  className="flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {guardarGrupo.isPending ? <Spinner size="sm" /> : <Check className="h-3 w-3" />} Guardar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <p className={clsx('font-semibold', oscuro ? 'text-gray-100' : 'text-gray-800')}>{canal.nombre || 'Grupo'}</p>
                {esCreador && (
                  <button
                    type="button"
                    onClick={iniciarEdicion}
                    title="Editar nombre y descripción"
                    className={clsx('flex h-5 w-5 items-center justify-center rounded-full transition-colors', oscuro ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600')}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {canal.descripcion ? (
                <p className={clsx('text-xs leading-relaxed', oscuro ? 'text-gray-400' : 'text-gray-500')}>{canal.descripcion}</p>
              ) : esCreador && (
                <button
                  type="button"
                  onClick={iniciarEdicion}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Agregar descripción
                </button>
              )}
            </>
          )}
        </div>

        {/* Integrantes */}
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={clsx('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', oscuro ? 'text-gray-400' : 'text-gray-500')}>
              <Users className="h-3.5 w-3.5" /> Integrantes ({miembros.length})
            </p>
            {esCreador && (
              <button
                type="button"
                onClick={onAgregarMiembros}
                title="Agregar integrantes"
                className="flex items-center gap-1 text-[0.68rem] font-semibold text-brand hover:underline"
              >
                <UserPlus className="h-3 w-3" /> Agregar
              </button>
            )}
          </div>
          {cargando ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : (
            <div className="space-y-0.5">
              {miembros.map((m) => (
                <div key={m.usuarioId} className={clsx('group flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors', oscuro ? 'hover:bg-gray-800' : 'hover:bg-gray-50')}>
                  <Avatar src={m.fotoUrl} name={m.nombre} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={clsx('truncate text-sm font-medium', oscuro ? 'text-gray-100' : 'text-gray-800')}>
                      {m.nombre}{m.usuarioId === miUsuarioId && ' (tú)'}
                    </p>
                    <p className={clsx('text-[0.65rem]', m.usuarioId === canal.creadoPor ? 'text-brand' : (oscuro ? 'text-gray-500' : 'text-gray-400'))}>
                      {m.usuarioId === canal.creadoPor ? 'Creador del grupo' : 'Integrante'}
                    </p>
                  </div>
                  {esCreador && m.usuarioId !== canal.creadoPor && (
                    <button
                      type="button"
                      onClick={() => onQuitarMiembro(m.usuarioId)}
                      disabled={quitandoMiembro}
                      title="Quitar del grupo"
                      className={clsx(
                        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full opacity-0 transition-colors group-hover:opacity-100',
                        oscuro ? 'text-gray-500 hover:bg-gray-700 hover:text-red-400' : 'text-gray-400 hover:bg-gray-100 hover:text-red-500',
                      )}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Archivos recientes — separado de Integrantes con borde propio */}
        <div className={clsx('border-t px-4 py-3', oscuro ? 'border-gray-700' : 'border-gray-100')}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={clsx('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', oscuro ? 'text-gray-400' : 'text-gray-500')}>
              <Paperclip className="h-3.5 w-3.5" /> Archivos recientes
            </p>
            {archivosCanal.length > 5 && (
              <button
                type="button"
                onClick={() => setVerTodosArchivos(true)}
                className="text-[0.68rem] font-semibold text-brand hover:underline"
              >
                Ver todos
              </button>
            )}
          </div>
          {cargandoArchivos ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : archivosCanal.length === 0 ? (
            <p className={clsx('text-xs', oscuro ? 'text-gray-500' : 'text-gray-400')}>Sin archivos compartidos todavía.</p>
          ) : (
            <div className="space-y-0.5">
              {archivosCanal.slice(0, 5).map((a) => {
                const { Icono, color, bg } = tipoArchivo(a.archivoUrl)
                return (
                  <a
                    key={a.id}
                    href={a.archivoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={clsx('flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors', oscuro ? 'hover:bg-gray-800' : 'hover:bg-gray-50')}
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
                      <Icono className="h-4 w-4" style={{ color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('truncate text-xs font-medium', oscuro ? 'text-gray-100' : 'text-gray-800')}>{nombreDeUrl(a.archivoUrl)}</p>
                      <p className={clsx('text-[0.62rem]', oscuro ? 'text-gray-500' : 'text-gray-400')}>{formatFechaCorta(a.fecha)}</p>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {verTodosArchivos && (
        <ArchivosCanalModal archivos={archivosCanal} oscuro={oscuro} onClose={() => setVerTodosArchivos(false)} />
      )}
    </div>
  )
}

// Botón de engranaje + popover de "Apariencia del chat" (tema y colores) — vive
// en el header general de Mensajería, no por conversación: es una preferencia
// del usuario, igual para todos sus chats.
function ApparienciaPicker() {
  const [abierto, setAbierto] = useState(false)
  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['mensajeria-mi-config'],
    queryFn: () => mensajeriaService.getMiConfig(),
    staleTime: 5 * 60 * 1000,
  })
  const oscuro = config?.tema === 'oscuro'

  const guardarApariencia = useMutation({
    mutationFn: (payload: Partial<MensajeriaConfig>) => mensajeriaService.actualizarMiConfig(payload),
    onSuccess: (nuevaConfig) => qc.setQueryData(['mensajeria-mi-config'], nuevaConfig),
    onError: () => toast.error('No se pudo guardar la apariencia'),
  })

  return (
    <div className="relative">
      <Button size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)} title="Apariencia del chat">
        <Settings size={14} />
      </Button>

      {abierto && config && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className={clsx(
            'absolute right-0 top-10 z-20 w-64 rounded-xl border shadow-lg p-3',
            oscuro ? 'chat-tema-oscuro bg-gray-800 border-gray-700' : 'chat-tema-claro bg-card border-gray-200',
          )}>
            <p className={clsx('mb-2 text-xs font-semibold uppercase tracking-wide', oscuro ? 'text-gray-400' : 'text-gray-500')}>Apariencia del chat</p>

            <label className={clsx('mb-1.5 block text-[0.68rem] font-semibold', oscuro ? 'text-gray-400' : 'text-gray-500')}>Tema</label>
            <select
              value={config.tema}
              onChange={(e) => guardarApariencia.mutate({ tema: e.target.value as MensajeriaConfig['tema'] })}
              className={clsx(
                'mb-3 w-full rounded-lg border px-2 py-1.5 text-sm focus:outline-none',
                oscuro ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900',
              )}
              style={{ colorScheme: oscuro ? 'dark' : 'light' }}
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
                  className={clsx('h-8 w-full cursor-pointer rounded-lg border', oscuro ? 'border-gray-700' : 'border-gray-200')}
                  style={{ colorScheme: oscuro ? 'dark' : 'light' }}
                />
              </div>
              <div>
                <label className={clsx('mb-1 block text-[0.65rem] font-semibold', oscuro ? 'text-gray-400' : 'text-gray-500')}>Recibidos</label>
                <input
                  type="color"
                  value={config.colorMensajeAjeno}
                  onChange={(e) => guardarApariencia.mutate({ colorMensajeAjeno: e.target.value })}
                  className={clsx('h-8 w-full cursor-pointer rounded-lg border', oscuro ? 'border-gray-700' : 'border-gray-200')}
                  style={{ colorScheme: oscuro ? 'dark' : 'light' }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Modal con el listado completo de archivos compartidos en el canal.
function ArchivosCanalModal({ archivos, oscuro, onClose }: { archivos: { id: number; archivoUrl: string; fecha: string; emisorNombre: string }[]; oscuro: boolean; onClose: () => void }) {
  return createPortal(
    <div className={clsx('fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4', oscuro ? 'chat-tema-oscuro' : 'chat-tema-claro')}>
      <div className={clsx('flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl', oscuro ? 'bg-gray-900' : 'bg-card')}>
        <div className={clsx('flex items-center justify-between border-b px-5 py-3.5', oscuro ? 'border-gray-700' : 'border-gray-100')}>
          <p className={clsx('text-sm font-semibold', oscuro ? 'text-gray-100' : 'text-gray-800')}>Archivos compartidos ({archivos.length})</p>
          <button onClick={onClose} className={clsx('flex h-7 w-7 items-center justify-center rounded-full', oscuro ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {archivos.map((a) => {
            const { Icono, color, bg } = tipoArchivo(a.archivoUrl)
            return (
              <a
                key={a.id}
                href={a.archivoUrl}
                target="_blank"
                rel="noreferrer"
                className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors', oscuro ? 'hover:bg-gray-800' : 'hover:bg-gray-50')}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
                  <Icono className="h-4.5 w-4.5" style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={clsx('truncate text-sm font-medium', oscuro ? 'text-gray-100' : 'text-gray-800')}>{nombreDeUrl(a.archivoUrl)}</p>
                  <p className={clsx('text-[0.68rem]', oscuro ? 'text-gray-500' : 'text-gray-400')}>{a.emisorNombre} · {formatFechaCorta(a.fecha)}</p>
                </div>
                <Download className={clsx('h-4 w-4 flex-shrink-0', oscuro ? 'text-gray-500' : 'text-gray-400')} />
              </a>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
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
  const [busquedaConv, setBusquedaConv] = useState('')

  const { data: canales = [], refetch } = useQuery({
    queryKey: ['mensajeria-canales'],
    queryFn: () => mensajeriaService.getMisCanales(),
  })

  // Mismo queryKey que ChatPanel — React Query lo deduplica, no hay petición
  // extra. Hace falta aquí para que la lista de conversaciones (fuera del
  // ChatPanel) también respete el tema oscuro elegido en Apariencia.
  const { data: configLista } = useQuery({
    queryKey: ['mensajeria-mi-config'],
    queryFn: () => mensajeriaService.getMiConfig(),
    staleTime: 5 * 60 * 1000,
  })
  const oscuroLista = configLista?.tema === 'oscuro'

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

  const fijarCanal = useMutation({
    mutationFn: ({ canalId, fijado }: { canalId: number; fijado: boolean }) => mensajeriaService.fijarCanal(canalId, fijado),
    onSuccess: () => refetch(),
    onError: () => toast.error('No se pudo fijar la conversación'),
  })

  const marcarNoLeido = useMutation({
    mutationFn: (canalId: number) => mensajeriaService.marcarNoLeido(canalId),
    onSuccess: () => refetch(),
    onError: () => toast.error('No se pudo marcar como no leído'),
  })

  const salirDeGrupoLista = useMutation({
    mutationFn: (canalId: number) => mensajeriaService.salirDeGrupo(canalId),
    onSuccess: (_data, canalId) => { toast.success('Saliste del grupo'); cerrarChat(canalId); refetch() },
    onError: () => toast.error('No se pudo salir del grupo'),
  })

  const eliminarChatLista = useMutation({
    mutationFn: (canalId: number) => mensajeriaService.ocultarCanal(canalId),
    onSuccess: (_data, canalId) => { toast.success('Chat eliminado'); cerrarChat(canalId); refetch() },
    onError: () => toast.error('No se pudo eliminar el chat'),
  })

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

  const canalesFiltrados = canales.filter((c) =>
    (c.nombre || 'Conversación').toLowerCase().includes(busquedaConv.trim().toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="text-brand" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Mensajería</h1>
        </div>
        <div className="flex items-center gap-2 relative">
          <Button size="sm" variant="primary" onClick={() => setPickerOpen((v) => !v)}>
            <Plus size={14} /> Nuevo mensaje
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setNuevoGrupoOpen(true)}>
            <UserPlus size={14} /> Nuevo grupo
          </Button>
          <ApparienciaPicker />

          {pickerOpen && (
            <NuevoDMPicker
              onClose={() => setPickerOpen(false)}
              onCreado={(canal) => { refetch(); abrirChat(canal.id) }}
            />
          )}
        </div>
      </div>

      <div className={clsx(
        'flex-1 flex rounded-xl border overflow-hidden min-h-0',
        oscuroLista ? 'chat-tema-oscuro bg-gray-900 border-gray-700' : 'chat-tema-claro bg-card border-gray-200',
      )}>
        <div className={clsx(
          'w-72 border-r flex flex-col shrink-0 relative',
          oscuroLista ? 'chat-tema-oscuro bg-gray-900 border-gray-700' : 'chat-tema-claro bg-card border-gray-100',
        )}>
          <div className={clsx('p-3 border-b', oscuroLista ? 'border-gray-700' : 'border-gray-100')}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busquedaConv}
                onChange={(e) => setBusquedaConv(e.target.value)}
                placeholder="Buscar conversaciones..."
                className={clsx(
                  'w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand/20',
                  oscuroLista ? 'border-gray-700 bg-gray-800 text-gray-100 placeholder-gray-500' : 'border-gray-200 bg-white text-gray-900',
                )}
                style={{ colorScheme: oscuroLista ? 'dark' : 'light' }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {canales.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <MessagesSquare size={28} className="mx-auto mb-2 opacity-40" />
                Sin conversaciones todavía
              </div>
            ) : canalesFiltrados.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Sin resultados para "{busquedaConv}"
              </div>
            ) : (
              canalesFiltrados.map((canal) => (
                <ConversacionItem
                  key={canal.id}
                  canal={canal}
                  activa={chatsAbiertos.includes(canal.id) && !minimizados[canal.id]}
                  oscuro={oscuroLista}
                  onClick={() => abrirChat(canal.id)}
                  onFijar={() => fijarCanal.mutate({ canalId: canal.id, fijado: !canal.fijado })}
                  onMarcarNoLeido={() => marcarNoLeido.mutate(canal.id)}
                  onSalirDeGrupo={() => salirDeGrupoLista.mutate(canal.id)}
                  onEliminarChat={() => eliminarChatLista.mutate(canal.id)}
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
