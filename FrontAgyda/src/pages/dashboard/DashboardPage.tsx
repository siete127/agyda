import { useState, useEffect, useMemo } from 'react'
// TEMPORAL — prueba visual local, no se guarda en BD. Quitar y volver a
// MascotaTablero cuando se decida si se mantiene.
import heroAgydaInicio from '@/assets/hero-agyda-inicio.png'
// TEMPORAL — prueba visual local para "Bienvenida", no se guarda en BD
// (no sustituye el heroInicioUrl configurado en Configuración → Marca).
import heroBienvenida from '@/assets/hero-bienvenida.png'
import { useCurrentUser } from '@/hooks/useAuth'
import { useSocketStore } from '@/stores/socket.store'
import { useUIStore } from '@/stores/ui.store'
import { useThemeStore, resolveTheme } from '@/stores/theme.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  LifeBuoy,
  Newspaper, Megaphone, CheckSquare, FolderOpen as FolderOpenIcon, Quote, Lightbulb,
  Clock,
  ChevronRight, ArrowRight, ArrowLeft,
  X, FileText, Loader2, Upload, Trash2, Calendar,
  PlaneTakeoff, LayoutGrid, Plus, GripVertical, EyeOff, Check,
  MessageSquare, File as FileIcon,
} from 'lucide-react'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { api } from '@/lib/axios'
import { noticiasService } from '@/services/noticias.service'
import { ticketsService } from '@/services/tickets.service'
import { proyectosService } from '@/services/proyectos.service'
import { mensajeriaService } from '@/services/mensajeria.service'
import { Avatar } from '@/components/ui/Avatar'
import { NoticiaDetalle } from '@/pages/noticias/NoticiasPage'
import { type Noticia } from '@/types/noticia.types'
import { usePersonalizacion } from '@/providers/personalizacion.context'
// import { MascotaTablero } from '@/components/ui/MascotaTablero' // TEMPORAL: ver arriba
import { DASHBOARD_DEFAULT } from '@/providers/personalizacion.context'
import { personalizacionService, type DashboardCard, type Institucional } from '@/services/personalizacion.service'
import { RESUMEN_CARDS } from './resumenCards'
import { CARD_CATALOG_INDEX } from './cardCatalog'

/* ─── Empresa ───────────────────────────────────────────────── */
type EmpresaKey = 'mision' | 'vision' | 'valores' | 'legales'

const EMPRESA_ITEMS: { label: string; sub: string; img: string; key: EmpresaKey }[] = [
  { label: 'Misión',  sub: 'Conoce nuestro propósito', img: '/icons/mision-white.gif',   key: 'mision'  },
  { label: 'Visión',  sub: 'Hacia dónde vamos',         img: '/icons/vision-white.gif',   key: 'vision'  },
  { label: 'Valores', sub: 'Lo que nos define',         img: '/icons/valores-white.gif', key: 'valores' },
  { label: 'Legales', sub: 'Documentos y normativas',   img: '/icons/legales-white.gif', key: 'legales' },
]

type MvvInfo = { title: string; image: string; text?: string; chips?: string[] }

/* Textos de Misión/Visión/Valores por empresa — vienen de la personalización
   (Configuración → Apariencia → Misión, visión y valores). "Legales" es estático
   porque su contenido es la lista de documentos, no un texto. */
function mvvInfo(inst: Institucional): Record<EmpresaKey, MvvInfo> {
  return {
    mision:  { title: 'Nuestra Misión',    image: '/mision.png',  text: inst.mision || undefined },
    vision:  { title: 'Nuestra Visión',    image: '/vision.png',  text: inst.vision || undefined },
    valores: { title: 'Nuestros Valores',  image: '/valores.png', chips: inst.valores?.length ? inst.valores : undefined },
    legales: { title: 'Documentos Legales', image: '/legales.png' },
  }
}

/* ─── Evento ────────────────────────────────────────────────── */
interface Evento {
  id: number; titulo: string; fechaInicio: string
  todoElDia: boolean; color?: string; tipoEvento?: string; emoji?: string
}
function parseEvento(r: Record<string, unknown>): Evento {
  const s = (...keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id:         Number(r['idEvento'] ?? r['id_evento'] ?? r['id'] ?? 0),
    titulo:     s('titulo', 'title', 'nombre'),
    fechaInicio:s('fechaInicio', 'fecha_inicio', 'fecha', 'start'),
    todoElDia:  Boolean(r['todoElDia'] ?? r['todo_el_dia'] ?? false),
    color:      r['color'] ? String(r['color']) : undefined,
    tipoEvento: r['tipoEvento'] ? String(r['tipoEvento']) : undefined,
    emoji:      (r['emoji'] ?? (String(r['tipoEvento'] ?? '') === 'cumpleanos' ? '🎂' : '📅')) as string,
  }
}

/* ─── LegalesManager ────────────────────────────────────────── */
interface LegalDoc {
  id: number
  titulo: string
  categoria: string | null
  nombreArchivo: string
  fechaSubida: string
}

function LegalesManager({ isAdmin }: { isAdmin: boolean }) {
  const [docs, setDocs]           = useState<LegalDoc[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [uploadTitulo, setUploadTitulo] = useState('')
  const [pendingFile, setPendingFile]   = useState<File | null>(null)
  const [docAbierto, setDocAbierto]     = useState<LegalDoc | null>(null)

  const fetchDocs = async () => {
    setLoading(true); setError(null)
    try { const { data } = await api.get('/legales'); setDocs(Array.isArray(data?.data) ? data.data : []) }
    catch { setError('Error al cargar documentos') }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchDocs() }, [])

  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.pdf,.doc,.docx'
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return
      setPendingFile(file)
      setUploadTitulo(file.name.replace(/\.[^/.]+$/, ''))
    }
    input.click()
  }

  const confirmUpload = async () => {
    if (!pendingFile || !uploadTitulo.trim()) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('documento', pendingFile)
      form.append('titulo', uploadTitulo.trim())
      await api.post('/legales/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPendingFile(null); setUploadTitulo('')
      await fetchDocs()
    }
    catch { setError('Error al subir documento') }
    finally { setLoading(false) }
  }

  const cancelUpload = () => { setPendingFile(null); setUploadTitulo('') }

  const deleteDoc = async (filename: string) => {
    if (!confirm(`¿Eliminar "${filename}"?`)) return
    setLoading(true)
    try { await api.delete(`/legales/${encodeURIComponent(filename)}`); await fetchDocs() }
    catch { setError('Error al eliminar') }
    finally { setLoading(false) }
  }

  // Con un documento abierto, el modal muestra solo su iframe (ver arriba en
  // EmpresaModal: el header cambia a solo un botón "Volver").
  if (docAbierto) {
    return (
      <div className="flex h-[70vh] w-full flex-col">
        <button onClick={() => setDocAbierto(null)}
          className="mb-2 flex w-fit items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[0.75rem] font-semibold text-[#19b6bc] hover:bg-[#19b6bc]/10 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la lista
        </button>
        <iframe
          src={`/intranet/Legales/${docAbierto.nombreArchivo}`}
          title={docAbierto.titulo}
          className="w-full flex-1 rounded-xl border border-surface-border"
        />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[0.78rem] font-semibold text-ink-secondary">Documentos disponibles</p>
        {isAdmin && !pendingFile && (
          <button onClick={pickFile} disabled={loading}
            className="flex items-center gap-1.5 rounded-full border border-[#19b6bc]/30 bg-[#19b6bc]/10 px-3 py-1.5 text-[0.72rem] font-semibold text-[#19b6bc] hover:bg-[#19b6bc]/20 transition-colors disabled:opacity-50">
            <Upload className="h-3 w-3" /> Subir
          </button>
        )}
      </div>
      {isAdmin && pendingFile && (
        <div className="mb-3 space-y-2 rounded-xl border border-[#19b6bc]/30 bg-[#19b6bc]/5 p-3">
          <p className="text-[0.72rem] text-ink-secondary truncate">Archivo: {pendingFile.name}</p>
          <input
            type="text"
            required
            value={uploadTitulo}
            onChange={(e) => setUploadTitulo(e.target.value)}
            placeholder="Título del documento"
            className="w-full rounded-lg border border-surface-border bg-card px-2.5 py-1.5 text-[0.78rem] text-ink focus:border-[#19b6bc] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={cancelUpload} disabled={loading}
              className="rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-tertiary hover:bg-surface transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={confirmUpload} disabled={loading || !uploadTitulo.trim()}
              className="flex items-center gap-1.5 rounded-full border border-[#19b6bc]/30 bg-[#19b6bc]/10 px-3 py-1.5 text-[0.72rem] font-semibold text-[#19b6bc] hover:bg-[#19b6bc]/20 transition-colors disabled:opacity-50">
              <Upload className="h-3 w-3" /> Confirmar
            </button>
          </div>
        </div>
      )}
      {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#19b6bc]" /></div>}
      {error   && <p className="text-[0.72rem] text-red-500">{error}</p>}
      {!loading && docs.length === 0 && <p className="text-[0.72rem] text-ink-tertiary text-center py-4">No hay documentos.</p>}
      <div className="space-y-2">
        {docs.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2.5 hover:border-[#19b6bc]/30 transition-colors">
            <FileText className="h-4 w-4 flex-shrink-0 text-[#00537f]/70" />
            <button onClick={() => setDocAbierto(doc)}
              className="min-w-0 flex-1 text-left text-[0.78rem] font-medium text-ink-secondary hover:text-[#19b6bc] truncate transition-colors">
              {doc.titulo}
            </button>
            {isAdmin && (
              <button onClick={() => deleteDoc(doc.nombreArchivo)} disabled={loading}
                className="flex-shrink-0 rounded-lg p-1 text-ink-tertiary hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── EmpresaModal ──────────────────────────────────────────── */
function EmpresaModal({ empresaKey, isAdmin, onClose }: { empresaKey: EmpresaKey; isAdmin: boolean; onClose: () => void }) {
  const { institucional } = usePersonalizacion()
  const info = mvvInfo(institucional)[empresaKey]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        'relative w-full rounded-2xl bg-card shadow-2xl animate-fade-in overflow-hidden',
        empresaKey === 'legales' ? 'max-w-2xl' : 'max-w-md',
      )}>
        <div className="flex items-center gap-3 border-b border-surface-border px-5 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f]">
            {empresaKey === 'mision'  && <img src="/icons/mision-white.gif"   alt="" className="h-7 w-7 object-contain" />}
            {empresaKey === 'vision'  && <img src="/icons/vision-white.gif"   alt="" className="h-7 w-7 object-contain" />}
            {empresaKey === 'valores' && <img src="/icons/valores-white.gif"  alt="" className="h-7 w-7 object-contain" />}
            {empresaKey === 'legales' && <img src="/icons/legales-white.gif"  alt="" className="h-7 w-7 object-contain" />}
          </div>
          <h2 className="flex-1 text-[1rem] font-bold text-ink">{info.title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface hover:text-ink-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        {empresaKey === 'legales' ? (
          <div className="p-5">
            <LegalesManager isAdmin={isAdmin} />
          </div>
        ) : (
          <div className="flex flex-col items-center p-6 gap-5">
            <img src={info.image} alt={info.title} className="h-40 w-40 rounded-2xl object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            {info.text && <p className="text-center text-[0.9rem] text-ink-secondary leading-relaxed max-w-xs">{info.text}</p>}
            {info.chips && (
              <div className="flex flex-wrap justify-center gap-2">
                {info.chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-brand/20 bg-brand-light px-3 py-1 text-[0.72rem] font-semibold text-brand">{chip}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── TarjetaLegales ────────────────────────────────────────── */
// Misión/Visión/Valores se despliegan inline (acordeón) debajo de su propia
// fila — no ameritan un modal para un par de líneas de texto o unos chips.
// Legales sigue abriendo el modal grande: ahí vive el gestor de documentos
// completo (subir/listar PDFs), que necesita más espacio para ser usable.
function TarjetaLegales({ onAbrirLegales }: { onAbrirLegales: () => void }) {
  const { institucional } = usePersonalizacion()
  const info = mvvInfo(institucional)
  const [abierto, setAbierto] = useState<EmpresaKey | null>(null)

  return (
    <div className="dash-card h-full overflow-auto rounded-2xl border border-surface-border bg-card p-5">
      <h3 className="text-[0.9rem] font-semibold text-ink mb-3">Identidad corporativa</h3>
      <div className="flex flex-col gap-2.5">
        {EMPRESA_ITEMS.map((item) => {
          const esInline = item.key !== 'legales'
          const desplegado = esInline && abierto === item.key
          return (
            <div key={item.label}>
              <button
                onClick={() => esInline ? setAbierto((v) => (v === item.key ? null : item.key)) : onAbrirLegales()}
                className="group flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-surface"
              >
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] shadow-sm">
                  <img src={item.img} alt="" className="h-8 w-8 object-contain" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.82rem] font-bold text-ink">{item.label}</p>
                  <p className="text-[0.7rem] text-ink-tertiary">{item.sub}</p>
                </div>
                <ChevronRight className={clsx(
                  'h-4 w-4 flex-shrink-0 text-ink-tertiary transition-transform group-hover:text-[#19b6bc]',
                  desplegado && 'rotate-90',
                )} />
              </button>
              {esInline && (
                <div
                  className="overflow-hidden pl-[3.25rem] pr-2 transition-all duration-200"
                  style={{ maxHeight: desplegado ? '320px' : '0px', opacity: desplegado ? 1 : 0, marginTop: desplegado ? '0.5rem' : 0 }}
                >
                  {info[item.key].text && (
                    <p className="pb-3 text-[0.78rem] leading-relaxed text-ink-secondary">{info[item.key].text}</p>
                  )}
                  {info[item.key].chips && (
                    <ul className="flex flex-col gap-1 pb-3">
                      {info[item.key].chips!.map((chip) => (
                        <li key={chip} className="flex items-start gap-2 text-[0.78rem] leading-relaxed text-ink-secondary">
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#19b6bc]" />
                          {chip}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!info[item.key].text && !info[item.key].chips && (
                    <p className="pb-3 text-[0.75rem] text-ink-tertiary">Aún no se ha configurado este contenido.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── NewsCard ──────────────────────────────────────────────── */
// Categoría de noticia → color de acento (mismo turquesa/azul de marca que ya
// usamos en sidebar y portal, más un par de variantes para distinguir áreas).
const NEWS_CAT_COLORS: Record<string, { text: string; bg: string }> = {
  COMUNICADO: { text: 'text-[#00537f]', bg: 'bg-[#00537f]/10' },
  PLATA:      { text: 'text-purple-600', bg: 'bg-purple-500/10' },
  VENTAS:     { text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  RRHH:       { text: 'text-pink-600', bg: 'bg-pink-500/10' },
  TI:         { text: 'text-[#19b6bc]', bg: 'bg-[#19b6bc]/10' },
  GENERAL:    { text: 'text-gray-600', bg: 'bg-gray-500/10' },
  MARKETING:  { text: 'text-violet-600', bg: 'bg-violet-500/10' },
}
function newsCatColor(categoria: string | null | undefined) {
  return NEWS_CAT_COLORS[categoria?.toUpperCase() ?? ''] ?? NEWS_CAT_COLORS.GENERAL
}
function newsFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Noticia destacada (la más reciente) — imagen grande arriba, categoría como
// pill sobre la imagen, título y fecha debajo.
function NewsCardDestacada({ n, onOpen }: { n: Noticia; onOpen: (n: Noticia) => void }) {
  const cat = newsCatColor(n.categoria)
  return (
    <button onClick={() => onOpen(n)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl text-left transition-opacity hover:opacity-95">
      <div className="relative min-h-0 flex-1 w-full overflow-hidden rounded-xl bg-surface">
        {n.imagenPortada
          ? <img src={n.imagenPortada} alt={n.titulo} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="h-full w-full bg-gradient-to-br from-[#19b6bc] to-[#00537f]" />}
        <span className={clsx('absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.65rem] font-bold text-white shadow', 'bg-[#00537f]/90')}>
          {n.categoria || 'General'}
        </span>
      </div>
      <div className="flex-shrink-0 pt-3">
        <h4 className="text-[0.95rem] font-bold text-ink line-clamp-2 leading-snug group-hover:text-[#19b6bc] transition-colors">{n.titulo}</h4>
        <p className="mt-1.5 text-[0.72rem] text-ink-tertiary line-clamp-2 leading-relaxed">
          {n.contenido.replace(/<[^>]*>/g, '').slice(0, 120)}
        </p>
        <p className="mt-2 text-[0.68rem] text-ink-tertiary">{newsFecha(n.fechaCreacion)}</p>
      </div>
    </button>
  )
}

// Fila compacta para la lista lateral: categoría en color arriba, título y
// fecha debajo, sin imagen (el layout de referencia solo muestra imagen en
// la noticia destacada).
function NewsCard({ n, onOpen }: { n: Noticia; onOpen: (n: Noticia) => void }) {
  const cat = newsCatColor(n.categoria)
  return (
    <button onClick={() => onOpen(n)}
      className="group flex w-full flex-col items-start gap-1 rounded-xl p-2 text-left transition-colors hover:bg-surface">
      <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', cat.text, cat.bg)}>
        {n.categoria || 'General'}
      </span>
      <h4 className="text-[0.78rem] font-semibold text-ink line-clamp-2 leading-snug group-hover:text-[#19b6bc] transition-colors">{n.titulo}</h4>
      <p className="text-[0.65rem] text-ink-tertiary">{newsFecha(n.fechaCreacion)}</p>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════════════════ */
export function DashboardPage() {
  const user         = useCurrentUser()
  const socketStatus = useSocketStore((s) => s.status)
  const isConnected  = socketStatus === 'connected'
  const navigate     = useNavigate()
  const isDarkMode   = resolveTheme(useThemeStore((s) => s.theme)) === 'dark'

  const [selected,     setSelected]     = useState<Noticia | null>(null)
  const [empresaModal, setEmpresaModal] = useState<EmpresaKey | null>(null)
  const { branding } = usePersonalizacion() // TEMPORAL: 'mascota' sin usar mientras la tarjeta muestra la imagen local
  const heroInicioUrl = personalizacionService.assetUrl(branding.heroInicioId)

  const isAdmin    = ['AD', 'ADMIN'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
  const { isAllowed } = useModuleAccess()

  const now   = new Date()
  const mes   = now.getMonth() + 1
  const anio  = now.getFullYear()
  const hour  = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const { data: noticias   = [] } = useQuery({ queryKey: ['noticias'],            queryFn: () => noticiasService.getAll(), staleTime: 60_000, enabled: isAllowed('noticias') })
  const { data: tickets    = [] } = useQuery({ queryKey: ['tickets'],             queryFn: () => ticketsService.getAll(), staleTime: 60_000, enabled: isAllowed('tickets') })
  const { data: proyectos  = [] } = useQuery({ queryKey: ['proyectos'],           queryFn: () => proyectosService.getAll(), staleTime: 60_000, enabled: isAllowed('proyectos') })
  const { data: canalesMsj = [] } = useQuery({ queryKey: ['dashboard-mensajeria'], queryFn: () => mensajeriaService.getMisCanales(), staleTime: 60_000, enabled: isAllowed('mensajeria') })

  // Documentos recientes: archivos de la raíz de Drive (visible para el
  // usuario), ordenados por fecha de subida — el backend los devuelve
  // alfabéticos, así que el orden "reciente" se resuelve aquí.
  const { data: documentosRecientes = [] } = useQuery({
    queryKey: ['dashboard-documentos'],
    queryFn: async () => {
      const { data } = await api.get('/drive/archivos')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[])
        .map((r) => ({
          id: Number(r['id'] ?? 0),
          nombre: String(r['nombre'] ?? ''),
          extension: String(r['extension'] ?? '').replace('.', ''),
          fechaSubida: String(r['fechaSubida'] ?? r['fecha_subida'] ?? ''),
          subidoPorNombre: String(r['subidoPorNombre'] ?? r['subidoPorUsuario'] ?? ''),
        }))
        .sort((a, b) => new Date(b.fechaSubida).getTime() - new Date(a.fechaSubida).getTime())
    },
    staleTime: 60_000,
    enabled: isAllowed('drive'),
  })

  const { data: cumpleanos = [] } = useQuery({
    queryKey: ['cumpleanos-dashboard', mes, anio],
    queryFn: async () => {
      const { data } = await api.get('/calendario/cumpleanos-mes', { params: { mes, anio } })
      const list = Array.isArray(data) ? data : (data?.cumpleanos ?? data?.data ?? [])
      return list as { nombre: string; fecha_cumpleanos: string; dia_cumpleanos: number }[]
    },
    staleTime: 300_000,
  })

  const { data: eventos = [] } = useQuery({
    queryKey: ['eventos-proximos-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/eventos/proximos', { params: { dias: 14, limite: 5 } })
      const list = Array.isArray(data) ? data : (data?.data ?? data?.eventos ?? [])
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
      const seen = new Set<string>()
      return (list as Record<string, unknown>[]).map(parseEvento)
        .filter((e) => {
          if (new Date(e.fechaInicio) < hoy) return false
          const key = `${e.titulo}|${e.fechaInicio.split('T')[0]}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())
        .slice(0, 4)
    },
    staleTime: 60_000,
  })

  const ticketsAbiertos  = tickets.filter((t) => !['cerrado', 'resuelto', 'cancelado'].includes(t.estado?.toLowerCase() ?? '')).length
  const proyectosActivos = proyectos.filter((p) => p.estado === 'Activo').length

  const cumpleHoy = cumpleanos.filter((c) => c.dia_cumpleanos === now.getDate())
  const cumpleMes = cumpleanos
    .filter((c) => c.dia_cumpleanos > now.getDate())
    .sort((a, b) => a.dia_cumpleanos - b.dia_cumpleanos)
    .slice(0, 5)
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  const RESUMEN = [
    isAllowed('noticias')  && { icon: Megaphone,      value: noticias.length,   label: 'Noticias nuevas',   sub: noticias.length > 0 ? 'Revisa lo último' : 'Sin novedades',    to: '/noticias'  },
    isAllowed('tickets')   && { icon: CheckSquare,    value: ticketsAbiertos,   label: 'Tickets abiertos',  sub: ticketsAbiertos > 0 ? 'En proceso' : 'Todo al día',           to: '/tickets'   },
    isAllowed('proyectos') && { icon: FolderOpenIcon, value: proyectosActivos,  label: 'Proyectos activos', sub: proyectosActivos > 0 ? 'En curso' : 'Sin proyectos activos',  to: '/proyectos' },
  ].filter(Boolean) as { icon: typeof Megaphone; value: number; label: string; sub: string; to: string }[]

  /* ═══ Cards del dashboard — cada una es un bloque re-ubicable ═══ */
  const CARDS: Record<string, { label: string; node: React.ReactNode }> = {
    bienvenida: {
      label: 'Bienvenida',
      node: (
        <div className="dash-card relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-surface-border p-8">
          <div
            className="hero-background absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroBienvenida})` }}
          />
          <div className="hero-overlay pointer-events-none absolute inset-0" />
          <div className="hero-content relative z-10 max-w-[230px]">
            <p className="hero-text-secondary text-[0.9rem]">Bienvenido a</p>
            <h2 className="hero-text text-3xl font-extrabold">{branding.nombreCorto}</h2>
            <p className="hero-text-secondary mt-3 text-[0.85rem] leading-relaxed">
              {branding.eslogan || 'Un espacio para conectar, colaborar y hacer crecer nuestro equipo.'}
            </p>
            <div className="mt-3 h-[3px] w-16 rounded-full bg-[#19b6bc]" />
            <span className={clsx(
              'mt-4 flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6rem] font-medium',
              isConnected ? 'border-[#19b6bc]/30 text-[#19b6bc]' : 'border-surface-border text-ink-tertiary',
            )}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', isConnected ? 'bg-[#19b6bc] animate-pulse' : 'bg-ink-tertiary')} />
              {isConnected ? 'En línea' : 'Sin conexión'}
            </span>
          </div>
        </div>
      ),
    },
    legales: {
      label: 'Misión / Visión / Valores / Legales',
      node: <TarjetaLegales onAbrirLegales={() => setEmpresaModal('legales')} />,
    },
    marca: {
      label: 'Marca / mascota',
      node: (
        <div className="dash-card relative flex h-full items-center justify-start overflow-hidden rounded-2xl border border-surface-border p-5 text-left">
          <img src={heroAgydaInicio} alt="AGYDA" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 min-w-0 max-w-[60%]">
            <p className="text-[0.62rem] capitalize text-black">
              {now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h3 className="mt-0.5 text-sm font-bold text-black">
              ¡{greeting}, {user?.perfilAlias ?? user?.nombres?.split(' ')[0] ?? 'Usuario'}!
            </h3>
            <p className="mt-1 text-[0.65rem] text-black/70">
              Que tengas un gran día. Aquí encontrarás todo lo que necesitas para tu trabajo diario.
            </p>
          </div>
        </div>
      ),
    },
    'lo-importante': {
      label: 'Lo importante, al día',
      node: (
        <div className="dash-card h-full rounded-2xl border border-surface-border bg-card p-5 overflow-auto">
          <h3 className="text-[0.9rem] font-semibold text-ink mb-3">Lo importante, al día</h3>
          <div className="flex flex-col">
            {RESUMEN.map((s, i) => (
              <Link key={s.to} to={s.to}
                className={clsx('group flex items-center gap-3 py-2.5', i > 0 && 'border-t border-gray-100')}>
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-light">
                  <s.icon className="h-4 w-4 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.95rem] font-bold leading-none text-ink tabular-nums">{s.value}</p>
                  <p className="mt-1 text-[0.72rem] text-ink-secondary">{s.label}</p>
                  <p className="text-[0.62rem] text-ink-tertiary">{s.sub}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-surface-border group-hover:text-brand transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      ),
    },
    cita: {
      label: 'Cita',
      node: (
        <div className="dash-card h-full rounded-2xl px-4 py-4 flex gap-2.5 items-start" style={{ backgroundColor: '#EEF3FE' }}>
          <Quote className="h-4 w-4 flex-shrink-0 mt-0.5 text-brand" />
          <p className="text-[0.75rem] font-medium leading-snug" style={{ color: '#1E3A6E' }}>
            La tecnología es mejor cuando conecta personas y simplifica procesos.
          </p>
        </div>
      ),
    },
    'ultimas-noticias': {
      label: 'Últimas noticias',
      node: (
        <div className="dash-card flex h-full flex-col rounded-2xl border border-surface-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <img src="/icons/noticias-teal.gif" alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
              <h3 className="text-[0.9rem] font-semibold text-ink">Noticias</h3>
            </div>
            {noticias.length > 0 && (
              <button onClick={() => navigate('/noticias')}
                className="flex items-center gap-1 text-[0.75rem] font-medium text-[#19b6bc] hover:text-[#00537f] transition-colors">
                Ver todas <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {noticias.length > 0 ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2">
              <div className="min-h-0"><NewsCardDestacada n={noticias[0]} onOpen={setSelected} /></div>
              <div className="flex min-h-0 flex-col gap-1 overflow-auto">
                {noticias.slice(1, 5).map((n) => (
                  <div key={n.id} className="py-1"><NewsCard n={n} onOpen={setSelected} /></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
              <Newspaper className="h-[30px] w-[30px] mb-3" style={{ color: '#C9D6F0' }} />
              <p className="text-[0.8rem] font-medium text-ink">Aún no hay noticias para mostrar.</p>
              <p className="mt-1 text-[0.7rem] text-ink-tertiary">Las novedades de la empresa aparecerán aquí.</p>
            </div>
          )}
        </div>
      ),
    },
    mensajeria: {
      label: 'Mensajería',
      node: (
        <div className="dash-card h-full rounded-2xl border border-surface-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <img src="/icons/mensajeria-teal.gif" alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
              <h3 className="text-[0.9rem] font-semibold text-ink">Mensajería</h3>
            </div>
            {canalesMsj.length > 0 && (
              <button onClick={() => navigate('/mensajeria')}
                className="flex items-center gap-1 text-[0.75rem] font-medium text-[#19b6bc] hover:text-[#00537f] transition-colors">
                Ver todas <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {canalesMsj.length > 0 ? (
            <div className="divide-y divide-surface-border/60 overflow-auto">
              {canalesMsj.slice(0, 4).map((c) => (
                <button key={c.id} onClick={() => navigate('/mensajeria')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors">
                  <Avatar name={c.nombre ?? '?'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.78rem] font-semibold text-ink truncate">{c.nombre || 'Conversación'}</p>
                    <p className="text-[0.7rem] text-ink-tertiary truncate">{c.ultimoMensajePreview || 'Sin mensajes'}</p>
                  </div>
                  {c.ultimoMensajeFecha && (
                    <span className="flex-shrink-0 text-[0.62rem] text-ink-tertiary">
                      {new Date(c.ultimoMensajeFecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {c.noLeidos > 0 && (
                    <span className="flex-shrink-0 rounded-full bg-[#19b6bc] px-1.5 py-0.5 text-[0.6rem] font-bold text-white leading-none">
                      {c.noLeidos > 9 ? '9+' : c.noLeidos}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <MessageSquare className="h-6 w-6 mb-2" style={{ color: '#C9D6F0' }} />
              <p className="text-[0.75rem] font-medium text-ink">Sin conversaciones recientes.</p>
            </div>
          )}
        </div>
      ),
    },
    'documentos-recientes': {
      label: 'Documentos recientes',
      node: (
        <div className="dash-card h-full rounded-2xl border border-surface-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <img src="/icons/documentos-recientes-teal.gif" alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
              <h3 className="text-[0.9rem] font-semibold text-ink">Documentos recientes</h3>
            </div>
            {documentosRecientes.length > 0 && (
              <button onClick={() => navigate('/drive')}
                className="flex items-center gap-1 text-[0.75rem] font-medium text-[#19b6bc] hover:text-[#00537f] transition-colors">
                Ver todos <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {documentosRecientes.length > 0 ? (
            <div className="divide-y divide-surface-border/60 overflow-auto">
              {documentosRecientes.slice(0, 4).map((d) => (
                <button key={d.id} onClick={() => navigate('/drive')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-light">
                    <FileIcon className="h-4 w-4 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.78rem] font-semibold text-ink truncate">{d.nombre}</p>
                    <p className="text-[0.7rem] text-ink-tertiary truncate">{d.subidoPorNombre || 'Área de TI'}</p>
                  </div>
                  {d.fechaSubida && (
                    <span className="flex-shrink-0 text-[0.62rem] text-ink-tertiary">
                      {new Date(d.fechaSubida).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <FolderOpenIcon className="h-6 w-6 mb-2" style={{ color: '#C9D6F0' }} />
              <p className="text-[0.75rem] font-medium text-ink">Sin documentos recientes.</p>
            </div>
          )}
        </div>
      ),
    },
    'proximos-eventos': {
      label: 'Próximos eventos',
      node: (
        <div className="dash-card h-full rounded-2xl border border-surface-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <img src="/icons/eventos-blue.gif" alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
              <h3 className="text-[0.9rem] font-semibold text-ink">Próximos eventos</h3>
            </div>
            {eventos.length > 0 && (
              <button onClick={() => navigate('/calendario')}
                className="flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:text-brand-dark transition-colors">
                Ver calendario <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {eventos.length > 0 ? (
            <div className="divide-y divide-surface-border/60 overflow-auto">
              {eventos.slice(0, 3).map((e) => {
                const [y, m, d] = (e.fechaInicio || '').split('T')[0].split('-').map(Number)
                const hora = e.fechaInicio.includes('T') ? e.fechaInicio.split('T')[1]?.slice(0, 5) : null
                const hex  = e.color?.startsWith('#') ? e.color : '#2F6FED'
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center"
                      style={{ backgroundColor: `${hex}14`, border: `1px solid ${hex}30` }}>
                      <span className="text-[0.5rem] font-bold uppercase" style={{ color: hex }}>
                        {new Date(y, m - 1, d).toLocaleDateString('es-MX', { month: 'short' })}
                      </span>
                      <span className="text-[0.85rem] font-black leading-none" style={{ color: hex }}>{d}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.76rem] font-semibold text-ink truncate">{e.titulo}</p>
                      <p className="text-[0.62rem] text-ink-tertiary flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        {e.todoElDia ? 'Todo el día' : hora ?? 'Todo el día'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center px-5 py-6 text-center">
              <Calendar className="h-6 w-6 mb-2" style={{ color: '#C9D6F0' }} />
              <p className="text-[0.75rem] font-medium text-ink">No hay eventos próximos.</p>
            </div>
          )}
        </div>
      ),
    },
    cumpleanos: {
      label: 'Cumpleaños del mes',
      node: (
        <div className="dash-card h-full rounded-2xl border border-surface-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <img src="/icons/cumpleanos-blue.gif" alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
              <h3 className="text-[0.82rem] font-bold text-ink">Cumpleaños del mes</h3>
            </div>
            <button onClick={() => navigate('/calendario')}
              className="flex items-center gap-1 text-[0.65rem] font-semibold text-brand hover:text-brand-dark transition-colors">
              Ver todos <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {cumpleHoy.length === 0 && cumpleMes.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.72rem] text-ink-tertiary">Sin cumpleaños próximos este mes.</p>
          ) : (
            <div className="divide-y divide-surface-border">
              {cumpleHoy.map((c, i) => (
                <div key={`hoy-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light">
                    <img src="/icons/cumpleanos-blue.gif" alt="" className="h-[22px] w-[22px] object-contain" />
                  </div>
                  <div>
                    <p className="text-[0.8rem] font-bold text-ink">{c.nombre}</p>
                    <p className="text-[0.65rem] text-ink-tertiary">{c.dia_cumpleanos} de {MESES[mes - 1]}</p>
                  </div>
                  <img src="/icons/feliz-cumpleanos-blue.gif" alt="" className="ml-auto h-[22px] w-[22px] object-contain" />
                </div>
              ))}
              {cumpleMes.map((c, i) => (
                <div key={`mes-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light">
                    <img src="/icons/cumpleanos-blue.gif" alt="" className="h-[22px] w-[22px] object-contain" />
                  </div>
                  <div>
                    <p className="text-[0.8rem] font-bold text-ink">{c.nombre}</p>
                    <p className="text-[0.65rem] text-ink-tertiary">{c.dia_cumpleanos} de {MESES[mes - 1]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    // TEMPORAL: tarjeta 'soporte' oculta solo en este código local para
    // probar el layout sin ella — el layout guardado en BD no se tocó, así
    // que esto no afecta producción. Descomentar para restaurarla.
    // soporte: {
    //   label: 'Soporte y sugerencias',
    //   node: (
    //     <div className="dash-card h-full rounded-2xl border border-surface-border bg-card overflow-hidden">
    //       <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
    //         <h3 className="text-[0.9rem] font-semibold text-ink">Soporte y sugerencias</h3>
    //       </div>
    //       <div className="flex items-center gap-3 px-5 py-4">
    //         <LifeBuoy className="h-5 w-5 flex-shrink-0 text-brand" />
    //         <p className="flex-1 text-[0.78rem] font-medium text-ink">¿Necesitas ayuda?</p>
    //         <button onClick={() => navigate('/tickets')}
    //           className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-brand-dark transition-colors">
    //           <Lightbulb className="h-3.5 w-3.5" /> Sugerir
    //         </button>
    //       </div>
    //     </div>
    //   ),
    // },
    'accesos-rapidos': {
      label: 'Accesos rápidos',
      node: (
        <div className="dash-card h-full rounded-2xl border border-surface-border bg-card overflow-hidden">
          <div className="px-5 py-4">
            <h3 className="text-[0.9rem] font-semibold text-ink">Accesos rápidos</h3>
          </div>
          <div className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-6">
            {([
              { img: '/icons/proyectos.gif',   imgDark: '/icons/proyectos-dark.gif',   label: 'Proyectos',   to: '/proyectos'   },
              { img: '/icons/tickets.gif',     imgDark: '/icons/tickets-dark.gif',     label: 'Tickets',     to: '/tickets'     },
              { img: '/icons/vacaciones.gif',  imgDark: '/icons/vacaciones-dark.gif',  label: 'Vacaciones',  to: '/vacaciones'  },
              { img: '/icons/organigrama.gif', imgDark: '/icons/organigrama-dark.gif', label: 'Organigrama', to: '/organigrama' },
              { img: '/icons/drive.gif',       imgDark: '/icons/drive-dark.gif',       label: 'Drive',       to: '/drive'       },
              { img: '/icons/musica.gif',      imgDark: '/icons/musica-dark.gif',      label: 'Música',      to: '/musica'      },
            ] as { icon?: React.ComponentType<{ className?: string }>; img?: string; imgDark?: string; label: string; to: string }[]).map((m) => (
              <button key={m.label} onClick={() => navigate(m.to)}
                className="group flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-colors hover:bg-brand-light">
                {m.img ? (
                  <span className="relative h-9 w-9">
                    <img src={isDarkMode ? m.imgDark : m.img} alt=""
                      className="absolute inset-0 h-9 w-9 object-contain group-hover:opacity-0 transition-opacity" />
                    <img src={m.img} alt=""
                      className="absolute inset-0 h-9 w-9 object-contain opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light">
                    {m.icon && <m.icon className="h-4 w-4 text-brand" />}
                  </div>
                )}
                <span className="text-[0.65rem] font-semibold text-ink-secondary group-hover:text-brand transition-colors text-center leading-tight">{m.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-surface-border px-5 py-3">
            <PlaneTakeoff className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
            <p className="text-[0.72rem] text-ink-tertiary">Fuera de oficina · Sin datos aún — aquí se mostrará quién está de vacaciones hoy</p>
          </div>
        </div>
      ),
    },
  }

  // Cards de resumen de módulos (catálogo). Solo se registran las de módulos
  // que la empresa tiene activos — el resto ni siquiera se instancian.
  for (const rc of RESUMEN_CARDS) {
    if (rc.moduleKey && !isAllowed(rc.moduleKey)) continue
    CARDS[rc.id] = { label: rc.titulo, node: rc.render() }
  }

  return (
    <>
      <DashboardGrid cards={CARDS} />
      {selected && <NoticiaDetalle noticia={selected} onClose={() => setSelected(null)} />}
      {empresaModal && <EmpresaModal empresaKey={empresaModal} isAdmin={isAdmin} onClose={() => setEmpresaModal(null)} />}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   GRID DEL DASHBOARD — vista + modo edición (react-grid-layout)
═══════════════════════════════════════════════════════════ */
const ROW_H = 64
const COLS = 12

function DashboardGrid({ cards }: {
  cards: Record<string, { label: string; node: React.ReactNode }>
}) {
  const qc = useQueryClient()
  const { dashboard } = usePersonalizacion()
  const { width, containerRef } = useContainerWidth()

  // El editor se controla desde el topbar (botón "Editar diseño", armado en
  // Configuración → Diseño del inicio). Aquí solo se lee/reacciona.
  const editando = useUIStore((s) => s.dashboardEditMode)
  const setEditMode = useUIStore((s) => s.setDashboardEditMode)
  const setEditArmed = useUIStore((s) => s.setDashboardEditArmed)
  const salirEdicion = () => { setEditMode(false); setEditArmed(false) }

  const guardada = dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT

  const [draft, setDraft] = useState<DashboardCard[]>(guardada)
  const [seed, setSeed] = useState(guardada)
  if (dashboard.cards !== seed && !editando) {
    setSeed(dashboard.cards)
    setDraft(dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT)
  }
  // Al entrar en modo edición, sembrar el borrador con lo guardado.
  const [prevEditando, setPrevEditando] = useState(editando)
  if (editando !== prevEditando) {
    setPrevEditando(editando)
    if (editando) setDraft(dashboard.cards.length > 0 ? dashboard.cards : DASHBOARD_DEFAULT)
  }

  const activos = editando ? draft : guardada
  const visibles = activos.filter((c) => c.visible && cards[c.id])
  const ocultas = activos.filter((c) => !c.visible || !cards[c.id])

  const layout: Layout = useMemo(
    () => visibles.map((c) => ({ i: c.id, x: c.x, y: c.y, w: c.w, h: c.h, minW: 2, minH: 1 })),
    [visibles],
  )

  const guardar = useMutation({
    mutationFn: async () => { await personalizacionService.updateDashboard(draft) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Diseño del inicio guardado')
      salirEdicion()
    },
    onError: () => toast.error('No se pudo guardar el diseño'),
  })

  const onLayoutChange = (l: Layout) => {
    if (!editando) return
    setDraft((prev) => prev.map((c) => {
      const item = l.find((x) => x.i === c.id)
      return item ? { ...c, x: item.x, y: item.y, w: item.w, h: item.h } : c
    }))
  }

  const setVisible = (id: string, visible: boolean) =>
    setDraft((prev) => {
      const exists = prev.some((c) => c.id === id)
      if (exists) return prev.map((c) => (c.id === id ? { ...c, visible } : c))
      const def = DASHBOARD_DEFAULT.find((c) => c.id === id)
      const cat = CARD_CATALOG_INDEX[id]
      const base = def ?? { id, x: 0, y: 99, w: cat?.size.w ?? 4, h: cat?.size.h ?? 3 }
      return [...prev, { ...base, visible }]
    })

  return (
    <div className="animate-fade-in" ref={containerRef}>
      {/* Toolbar — solo mientras se edita (el botón para entrar vive en el topbar) */}
      {editando && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/[0.04] px-3 py-2 text-[0.78rem]">
          <GripVertical className="h-4 w-4 text-ink-tertiary" />
          <span className="text-ink-tertiary">Arrastra las tarjetas para moverlas; la esquina inferior derecha para redimensionarlas.</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={salirEdicion}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold text-ink-tertiary hover:bg-gray-100">
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
            <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar diseño
            </button>
          </div>
        </div>
      )}

      {/* Tarjetas ocultas (solo en edición) */}
      {editando && ocultas.length > 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-surface-border bg-surface/50 p-3">
          <p className="mb-2 text-[0.72rem] font-semibold text-ink-tertiary">Tarjetas ocultas — pulsa para agregar</p>
          <div className="flex flex-wrap gap-2">
            {ocultas.filter((c) => cards[c.id]).map((c) => (
              <button key={c.id} onClick={() => setVisible(c.id, true)}
                className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-card px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-secondary hover:border-brand hover:text-brand transition-colors">
                <Plus className="h-3 w-3" /> {cards[c.id].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-surface-border bg-card py-16 text-center">
          <LayoutGrid className="h-7 w-7 text-ink-tertiary" />
          <p className="text-sm font-semibold text-ink-secondary">Sin tarjetas en el inicio</p>
          <p className="text-[0.75rem] text-ink-tertiary">Un administrador puede agregarlas desde Configuración → Diseño del inicio.</p>
        </div>
      ) : width > 0 && width < 768 && !editando ? (
        /* Móvil: pila vertical según el orden guardado (y, x). El editor sigue
           usando la grilla — solo se recomienda en pantalla ancha. */
        <div className="space-y-4">
          {[...visibles].sort((a, b) => a.y - b.y || a.x - b.x).map((c) => (
            <div key={c.id} style={{ minHeight: c.h * ROW_H }}>{cards[c.id].node}</div>
          ))}
        </div>
      ) : width > 0 ? (
        <GridLayout
          width={width}
          layout={layout}
          onLayoutChange={onLayoutChange}
          gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [16, 16], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editando, bounded: false, handle: '.dash-drag', threshold: 3 }}
          resizeConfig={{ enabled: editando, handles: ['se'] }}
          className={clsx(editando && 'dash-editing')}
        >
          {visibles.map((c) => (
            <div key={c.id} className="relative">
              {editando && (
                <div className="dash-drag absolute inset-x-0 top-0 z-10 flex cursor-move items-center gap-1.5 rounded-t-2xl bg-brand/90 px-3 py-1 text-[0.68rem] font-semibold text-white">
                  <GripVertical className="h-3 w-3" /> {cards[c.id].label}
                  <button onClick={() => setVisible(c.id, false)}
                    className="ml-auto rounded p-0.5 hover:bg-white/20" title="Ocultar">
                    <EyeOff className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className={clsx('h-full', editando && 'pointer-events-none pt-6 opacity-95')}>
                {cards[c.id].node}
              </div>
            </div>
          ))}
        </GridLayout>
      ) : null}
    </div>
  )
}
