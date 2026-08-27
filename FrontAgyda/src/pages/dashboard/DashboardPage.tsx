import { useState, useEffect } from 'react'
import { useCurrentUser } from '@/hooks/useAuth'
import { useSocketStore } from '@/stores/socket.store'
import { useNotificationStore } from '@/stores/notification.store'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  LifeBuoy, HardDrive,
  Newspaper, Megaphone, CheckSquare, FolderOpen as FolderOpenIcon, Quote, Lightbulb,
  Music2, Clock,
  Target, Eye, Heart, Scale, ChevronRight, ChevronDown,
  X, FileText, Loader2, Upload, Trash2, Gift, Calendar,
  PlaneTakeoff,
} from 'lucide-react'
import { useVentasAutoLogin } from '@/hooks/useVentasAutoLogin'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { noticiasService } from '@/services/noticias.service'
import { ticketsService } from '@/services/tickets.service'
import { proyectosService } from '@/services/proyectos.service'
import { NoticiaDetalle } from '@/pages/noticias/NoticiasPage'
import { type Noticia } from '@/types/noticia.types'
import { Avatar } from '@/components/ui/Avatar'

/* ─── Empresa ───────────────────────────────────────────────── */
type EmpresaKey = 'mision' | 'vision' | 'valores' | 'legales'

const EMPRESA_ITEMS: { label: string; icon: React.ElementType; key: EmpresaKey }[] = [
  { label: 'Misión',    icon: Target, key: 'mision'  },
  { label: 'Visión',    icon: Eye,    key: 'vision'  },
  { label: 'Valores',   icon: Heart,  key: 'valores' },
  { label: 'Legales', icon: Scale,  key: 'legales' },
]

const MVV_INFO: Record<EmpresaKey, { title: string; image: string; text?: string; chips?: string[] }> = {
  mision:  { title: 'Nuestra Misión',    image: '/mision.png',  text: 'Soporte TI, marcación y software que hacen crecer tu negocio.' },
  vision:  { title: 'Nuestra Visión',    image: '/vision.png',  text: 'Liderar la automatización con IA en soluciones empresariales.' },
  valores: { title: 'Nuestros Valores',  image: '/valores.png', chips: ['Innovación','Enfoque al cliente','Aprendizaje','Calidad','Integridad','Trabajo en equipo','Confianza'] },
  legales: { title: 'Documentos Legales',image: '/legales.png' },
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

  const fetchDocs = async () => {
    setLoading(true); setError(null)
    try { const { data } = await api.get('/legales'); setDocs(Array.isArray(data?.data) ? data.data : []) }
    catch { setError('Error al cargar documentos') }
    finally { setLoading(false) }
  }
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[0.78rem] font-semibold text-ink-secondary">Documentos disponibles</p>
        {isAdmin && !pendingFile && (
          <button onClick={pickFile} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-light px-2.5 py-1.5 text-[0.72rem] font-semibold text-brand hover:bg-brand/10 transition-colors disabled:opacity-50">
            <Upload className="h-3 w-3" /> Subir
          </button>
        )}
      </div>
      {isAdmin && pendingFile && (
        <div className="mb-3 space-y-2 rounded-xl border border-brand/30 bg-brand-light/40 p-3">
          <p className="text-[0.72rem] text-ink-secondary truncate">Archivo: {pendingFile.name}</p>
          <input
            type="text"
            required
            value={uploadTitulo}
            onChange={(e) => setUploadTitulo(e.target.value)}
            placeholder="Título del documento"
            className="w-full rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-[0.78rem] text-ink focus:border-brand focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={cancelUpload} disabled={loading}
              className="rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-tertiary hover:bg-surface transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={confirmUpload} disabled={loading || !uploadTitulo.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-light px-2.5 py-1.5 text-[0.72rem] font-semibold text-brand hover:bg-brand/10 transition-colors disabled:opacity-50">
              <Upload className="h-3 w-3" /> Confirmar
            </button>
          </div>
        </div>
      )}
      {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>}
      {error   && <p className="text-[0.72rem] text-red-500">{error}</p>}
      {!loading && docs.length === 0 && <p className="text-[0.72rem] text-ink-tertiary text-center py-4">No hay documentos.</p>}
      <div className="space-y-2">
        {docs.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 hover:border-brand/30 transition-colors">
            <FileText className="h-4 w-4 flex-shrink-0 text-brand/60" />
            <button onClick={() => window.open(`/intranet/Legales/${doc.nombreArchivo}`, '_blank')}
              className="min-w-0 flex-1 text-left text-[0.72rem] font-medium text-ink-secondary hover:text-brand truncate transition-colors">
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
  const info = MVV_INFO[empresaKey]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
        <div className="flex items-center gap-3 border-b border-surface-border px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light">
            {empresaKey === 'mision'  && <Target className="h-5 w-5 text-brand" />}
            {empresaKey === 'vision'  && <Eye    className="h-5 w-5 text-brand" />}
            {empresaKey === 'valores' && <Heart  className="h-5 w-5 text-brand" />}
            {empresaKey === 'legales' && <Scale  className="h-5 w-5 text-brand" />}
          </div>
          <h2 className="flex-1 text-[1rem] font-bold text-ink">{info.title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface hover:text-ink-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
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
          {empresaKey === 'legales' && <div className="w-full"><LegalesManager isAdmin={isAdmin} /></div>}
        </div>
      </div>
    </div>
  )
}

/* ─── NewsCard ──────────────────────────────────────────────── */
function NewsCard({ n, onOpen }: { n: Noticia; onOpen: (n: Noticia) => void }) {
  const CATCOLORS: Record<string, string> = {
    COMUNICADO: 'bg-blue-500', PLATA: 'bg-purple-500', VENTAS: 'bg-emerald-500',
    RRHH: 'bg-pink-500', TI: 'bg-cyan-500', GENERAL: 'bg-gray-500',
  }
  const color  = CATCOLORS[n.categoria?.toUpperCase() ?? ''] ?? 'bg-gray-400'
  const mins   = Math.max(1, Math.ceil(n.contenido.replace(/<[^>]*>/g, '').length / 200))
  const fecha  = new Date(n.fechaCreacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <button onClick={() => onOpen(n)}
      className="group flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface">
      <div className="relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-surface">
        {n.imagenPortada
          ? <img src={n.imagenPortada} alt={n.titulo} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="h-full w-full bg-gradient-to-br from-[#0B1730] to-brand" />}
        <span className={clsx('absolute bottom-1 left-1 rounded px-1 text-[0.55rem] font-bold text-white', color)}>{n.categoria}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.58rem] text-ink-tertiary mb-0.5">{mins} min · {fecha}</p>
        <h4 className="text-[0.78rem] font-semibold text-ink line-clamp-2 leading-snug group-hover:text-brand transition-colors">{n.titulo}</h4>
        <p className="mt-1 text-[0.68rem] text-ink-tertiary line-clamp-1 leading-relaxed">
          {n.contenido.replace(/<[^>]*>/g, '').slice(0, 80)}
        </p>
      </div>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════════════════ */
export function DashboardPage() {
  const user         = useCurrentUser()
  const socketStatus = useSocketStore((s) => s.status)
  const unreadCount  = useNotificationStore((s) => s.unreadCount)
  const isConnected  = socketStatus === 'connected'
  const navigate     = useNavigate()

  const [selected,     setSelected]     = useState<Noticia | null>(null)
  const [empresaModal, setEmpresaModal] = useState<EmpresaKey | null>(null)

  const isAdmin    = ['AD', 'ADMIN'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
  const { openVentas, loading: ventasLoading } = useVentasAutoLogin()
  const { isAllowed } = useModuleAccess()

  const now   = new Date()
  const mes   = now.getMonth() + 1
  const anio  = now.getFullYear()
  const hour  = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const { data: noticias   = [] } = useQuery({ queryKey: ['noticias'],            queryFn: () => noticiasService.getAll(), staleTime: 60_000, enabled: isAllowed('noticias') })
  const { data: tickets    = [] } = useQuery({ queryKey: ['tickets'],             queryFn: () => ticketsService.getAll(), staleTime: 60_000, enabled: isAllowed('tickets') })
  const { data: proyectos  = [] } = useQuery({ queryKey: ['proyectos'],           queryFn: () => proyectosService.getAll(), staleTime: 60_000, enabled: isAllowed('proyectos') })

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
  const cumpleMes = cumpleanos.filter((c) => c.dia_cumpleanos > now.getDate()).slice(0, 3)
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  const RESUMEN = [
    isAllowed('noticias')  && { icon: Megaphone,      value: noticias.length,   label: 'Noticias nuevas',   sub: noticias.length > 0 ? 'Revisa lo último' : 'Sin novedades',    to: '/noticias'  },
    isAllowed('tickets')   && { icon: CheckSquare,    value: ticketsAbiertos,   label: 'Tickets abiertos',  sub: ticketsAbiertos > 0 ? 'En proceso' : 'Todo al día',           to: '/tickets'   },
    isAllowed('proyectos') && { icon: FolderOpenIcon, value: proyectosActivos,  label: 'Proyectos activos', sub: proyectosActivos > 0 ? 'En curso' : 'Sin proyectos activos',  to: '/proyectos' },
  ].filter(Boolean) as { icon: typeof Megaphone; value: number; label: string; sub: string; to: string }[]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Fila 1: saludo+accesos | ilustración de marca | lo importante+cita ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr_0.9fr]">

        {/* Columna 1: bienvenida + accesos rápidos empresa */}
        <div className="flex flex-col gap-5 min-w-0">
          <div className="rounded-2xl border border-surface-border bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
                  ¡{greeting}, {user?.perfilAlias ?? user?.nombres?.split(' ')[0] ?? 'Usuario'}! <span>👋</span>
                </h1>
                <p className="mt-1 text-[0.8rem] text-ink-tertiary capitalize">
                  {now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              {user && (
                <Link
                  to="/perfil"
                  className="flex flex-shrink-0 items-center gap-2 rounded-full border border-surface-border pl-1 pr-3 py-1 group hover:border-brand/30 hover:bg-brand-light transition-colors"
                >
                  <Avatar src={user.perfilFotoUrl} name={user.nombres} size="sm" ring="brand" />
                  <div className="hidden text-left leading-none sm:block">
                    <p className="text-[0.78rem] font-semibold text-ink group-hover:text-brand transition-colors">
                      {user.perfilAlias ?? user.nombres.split(' ')[0]}
                    </p>
                    <p className="text-[0.65rem] text-ink-tertiary capitalize mt-0.5">{user.tipoUsuario}</p>
                  </div>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-ink-tertiary group-hover:text-brand transition-colors sm:block" />
                </Link>
              )}
            </div>
            <p className="mt-4 text-[0.8rem] text-ink-secondary">Conectados hoy, resolvemos el mañana.</p>
            <p className="mt-1 text-[0.8rem] font-medium text-brand">Soluciones en tecnología que impulsan a tu equipo.</p>

            <div className="mt-4 flex items-center gap-2">
              <span className={clsx(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-medium',
                isConnected ? 'border-success/20 bg-success/10 text-success' : 'border-surface-border bg-surface text-ink-tertiary',
              )}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', isConnected ? 'bg-success animate-pulse' : 'bg-ink-tertiary')} />
                {isConnected ? 'En línea' : 'Sin conexión'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-surface-border bg-white p-6">
            <h3 className="text-[0.9rem] font-semibold text-ink mb-4">Legales</h3>
            <div className="flex items-start justify-between">
              {EMPRESA_ITEMS.map((item) => (
                <button key={item.label} onClick={() => setEmpresaModal(item.key)}
                  className="group flex w-16 flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand/20 group-hover:border-brand/50 group-hover:bg-brand-light transition-colors">
                    <item.icon className="h-[18px] w-[18px] text-brand" />
                  </div>
                  <span className="text-center text-[0.68rem] leading-tight text-ink-secondary">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Columna 2: card de marca / animación de la mascota */}
        <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-white p-3 flex items-center justify-center min-h-[220px] lg:min-h-0">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl"
            style={{ background: 'linear-gradient(160deg, #10203F 0%, #0B1730 100%)' }}>
            <video
              src="/dashboard-mascota.mp4"
              poster="/dashboard-mascota-poster.jpg"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Columna 3: lo importante al día + cita */}
        <div className="flex flex-col gap-5 min-w-0">
          <div className="rounded-2xl border border-surface-border bg-white p-5">
            <h3 className="text-[0.9rem] font-semibold text-ink mb-3">Lo importante, al día</h3>
            <div className="flex flex-col">
              {RESUMEN.map((s, i) => (
                <Link key={s.to} to={s.to}
                  className={clsx('group flex items-center gap-3 py-2.5', i > 0 && 'border-t border-[#F0F2F6]')}>
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
          <div className="rounded-2xl px-4 py-4 flex gap-2.5" style={{ backgroundColor: '#EEF3FE' }}>
            <Quote className="h-4 w-4 flex-shrink-0 mt-0.5 text-brand" />
            <p className="text-[0.75rem] font-medium leading-snug" style={{ color: '#1E3A6E' }}>
              La tecnología es mejor cuando conecta personas y simplifica procesos.
            </p>
          </div>
        </div>
      </div>

      {/* ── Fila 2: noticias (ancha) | eventos + soporte + cumpleaños (columna angosta) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:items-start">

        {/* Últimas noticias */}
        <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="text-[0.9rem] font-semibold text-ink">Últimas noticias</h3>
            {noticias.length > 0 && (
              <button onClick={() => navigate('/noticias')}
                className="flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:text-brand-dark transition-colors">
                Ver todas <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {noticias.length > 0 ? (
            <div className="divide-y divide-surface-border/60">
              {noticias.slice(0, 5).map((n) => (
                <div key={n.id} className="px-3 py-2">
                  <NewsCard n={n} onOpen={setSelected} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <Newspaper className="h-[30px] w-[30px] mb-3" style={{ color: '#C9D6F0' }} />
              <p className="text-[0.8rem] font-medium text-ink">Aún no hay noticias para mostrar.</p>
              <p className="mt-1 text-[0.7rem] text-ink-tertiary">Las novedades de la empresa aparecerán aquí.</p>
            </div>
          )}
        </div>

        {/* Columna angosta: eventos + soporte + cumpleaños */}
        <div className="flex flex-col gap-5 min-w-0">

          {/* Próximos eventos */}
          <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="text-[0.9rem] font-semibold text-ink">Próximos eventos</h3>
              {eventos.length > 0 && (
                <button onClick={() => navigate('/calendario')}
                  className="flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:text-brand-dark transition-colors">
                  Ver calendario <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            {eventos.length > 0 ? (
              <div className="divide-y divide-surface-border/60">
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

          {/* Cumpleaños del mes */}
          {(cumpleHoy.length > 0 || cumpleMes.length > 0) && (
            <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-brand" />
                  <h3 className="text-[0.82rem] font-bold text-ink">Cumpleaños del mes</h3>
                </div>
                <button onClick={() => navigate('/calendario')}
                  className="text-[0.65rem] font-semibold text-brand hover:text-brand-dark transition-colors">
                  Ver todos
                </button>
              </div>
              {cumpleHoy.map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-base">🎂</div>
                  <div>
                    <p className="text-[0.8rem] font-bold text-ink">{c.nombre}</p>
                    <p className="text-[0.65rem] text-ink-tertiary">{c.dia_cumpleanos} de {MESES[mes - 1]}</p>
                  </div>
                  <span className="ml-auto text-lg">🎉</span>
                </div>
              ))}
              {cumpleHoy.length === 0 && cumpleMes.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-base">🎂</div>
                  <div>
                    <p className="text-[0.8rem] font-bold text-ink">{cumpleMes[0].nombre}</p>
                    <p className="text-[0.65rem] text-ink-tertiary">{cumpleMes[0].dia_cumpleanos} de {MESES[mes - 1]}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Soporte y sugerencias */}
          <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="text-[0.9rem] font-semibold text-ink">Soporte y sugerencias</h3>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <LifeBuoy className="h-5 w-5 flex-shrink-0 text-brand" />
              <p className="flex-1 text-[0.78rem] font-medium text-ink">¿Necesitas ayuda?</p>
              <button onClick={() => navigate('/tickets')}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-brand-dark transition-colors">
                <Lightbulb className="h-3.5 w-3.5" /> Sugerir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Módulos + Fuera de oficina, en una sola card */}
      <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border">
          <h3 className="text-[0.9rem] font-semibold text-ink">Accesos rápidos</h3>
        </div>
        <div className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-6">
          {([
            { img: '/icons/proyectos.gif',    label: 'Proyectos',    to: '/proyectos'   },
            { img: '/icons/tickets.gif',      label: 'Tickets',      to: '/tickets'     },
            { img: '/icons/vacaciones.gif',   label: 'Vacaciones',   to: '/vacaciones'  },
            { img: '/icons/organigrama.gif',  label: 'Organigrama',  to: '/organigrama' },
            { icon: HardDrive,                label: 'Drive',        to: '/drive'       },
            { icon: Music2,                   label: 'Música',       to: '/musica'      },
          ] as { icon?: React.ElementType; img?: string; label: string; to: string }[]).map((m) => (
            <button key={m.label} onClick={() => navigate(m.to)}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-colors hover:bg-brand-light">
              {m.img ? (
                <img src={m.img} alt="" className="h-9 w-9 object-contain" />
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

      {/* Modales */}
      {selected && <NoticiaDetalle noticia={selected} onClose={() => setSelected(null)} />}
      {empresaModal && <EmpresaModal empresaKey={empresaModal} isAdmin={isAdmin} onClose={() => setEmpresaModal(null)} />}
    </div>
  )
}
