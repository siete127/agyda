import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Music2, Play, Pause, Upload, Link2, Share2, Trash2,
  ExternalLink, RefreshCw, Plus, Music,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface Track {
  id: number
  titulo: string
  artista: string
  emoji: string
  url: string
  compartidoPor?: number
  compartidoPorNombre?: string
}

function parseTrack(r: Record<string, unknown>): Track {
  const s = (...keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id:                  Number(r['id'] ?? r['ID'] ?? 0),
    titulo:              s('titulo', 'title', 'nombre'),
    artista:             s('artista', 'artist', 'autor'),
    emoji:               s('emoji') || '🎵',
    url:                 s('url', 'audioUrl', 'src'),
    compartidoPor:       r['compartidoPor'] ? Number(r['compartidoPor']) : undefined,
    compartidoPorNombre: r['compartidoPorNombre'] ? String(r['compartidoPorNombre']) : undefined,
  }
}

function isYouTube(url: string) {
  return url.includes('youtube') || url.includes('youtu.be')
}

/* ── Skeleton ── */
function SkeletonTrack() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-white/20 flex-shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="h-2.5 w-3/4 rounded-full bg-white/20" />
        <div className="h-2 w-1/2 rounded-full bg-white/10" />
      </div>
    </div>
  )
}

/* ── Tile de canción ── */
function TrackTile({
  track, isPlaying, canDelete, onPlayPause, onOpen, onShare, onDelete,
}: {
  track: Track
  isPlaying: boolean
  canDelete?: boolean
  onPlayPause?: () => void
  onOpen: () => void
  onShare?: () => void
  onDelete?: () => void
}) {
  const isAudio = track.url && !isYouTube(track.url)

  return (
    <div className={clsx(
      'flex items-center gap-2.5 rounded-xl px-3 py-3 border transition-all h-full',
      isPlaying
        ? 'bg-white/22 border-white/50'
        : 'bg-white/10 border-white/20 hover:bg-white/15',
    )}>
      {/* Play / emoji */}
      {isAudio && onPlayPause ? (
        <button
          onClick={onPlayPause}
          className={clsx(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all',
            isPlaying ? 'bg-white/30' : 'bg-white/15 hover:bg-white/25',
          )}
        >
          {isPlaying
            ? <Pause  className="h-3.5 w-3.5 text-white" />
            : <Play   className="h-3.5 w-3.5 text-white" />}
        </button>
      ) : (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-base select-none">
          {track.emoji}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className={clsx('text-[0.8rem] font-semibold truncate', isPlaying ? 'text-white' : 'text-white/90')}>
          {track.titulo}
        </p>
        {(track.artista || track.compartidoPorNombre) && (
          <p className="text-[0.65rem] text-white/50 truncate">
            {track.artista || `Compartido por ${track.compartidoPorNombre}`}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Abrir YouTube */}
        {isYouTube(track.url) && (
          <button onClick={onOpen} title="Abrir en YouTube"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/15 hover:text-white transition-colors">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Compartir a general */}
        {onShare && (
          <button onClick={onShare} title="Compartir a Lista General"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/15 hover:text-white transition-colors">
            <Share2 className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Eliminar */}
        {canDelete && onDelete && (
          <button onClick={onDelete} title="Eliminar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-red-500/20 hover:text-red-300 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Modal agregar por URL ── */
function AddUrlModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: () => void }) {
  const [titulo,  setTitulo]  = useState('')
  const [artista, setArtista] = useState('')
  const [url,     setUrl]     = useState('')
  const [emoji,   setEmoji]   = useState('🎵')
  const [error,   setError]   = useState('')

  const add = useMutation({
    mutationFn: () => api.post('/musica/privado', { titulo: titulo.trim(), artista: artista.trim(), url: url.trim(), emoji: emoji.trim() || '🎵' }),
    onSuccess: () => { toast.success('Canción agregada'); onAdded(); onClose(); setTitulo(''); setArtista(''); setUrl(''); setEmoji('🎵') },
    onError: () => setError('No se pudo guardar. Verifica los datos.'),
  })

  const handleSubmit = () => {
    setError('')
    if (!titulo.trim()) return setError('El título es obligatorio.')
    if (!url.trim() || !url.startsWith('http')) return setError('Ingresa una URL de YouTube válida.')
    add.mutate()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar canción por URL" size="sm">
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        <div>
          <label className="text-xs font-medium text-gray-600">Título *</label>
          <input className="field mt-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre de la canción" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Artista</label>
          <input className="field mt-1" value={artista} onChange={(e) => setArtista(e.target.value)} placeholder="Nombre del artista" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">URL de YouTube *</label>
          <input className="field mt-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." type="url" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Emoji</label>
          <input className="field mt-1 w-20" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={add.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={add.isPending}>Agregar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal subir MP3 ── */
function UploadMp3Modal({ isOpen, onClose, onUploaded }: { isOpen: boolean; onClose: () => void; onUploaded: () => void }) {
  const [file,    setFile]    = useState<File | null>(null)
  const [titulo,  setTitulo]  = useState('')
  const [artista, setArtista] = useState('')
  const [emoji,   setEmoji]   = useState('🎵')
  const [error,   setError]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setTitulo(f.name.replace(/\.(mp3|wav|ogg|m4a|aac)$/i, ''))
  }

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', file!)
      fd.append('titulo', titulo.trim())
      fd.append('artista', artista.trim())
      fd.append('emoji', emoji.trim() || '🎵')
      return api.post('/musica/privado/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { toast.success('Canción subida'); onUploaded(); onClose(); setFile(null); setTitulo(''); setArtista(''); setEmoji('🎵') },
    onError: () => setError('No se pudo subir el archivo.'),
  })

  const handleSubmit = () => {
    setError('')
    if (!file) return setError('Selecciona un archivo de audio.')
    if (!titulo.trim()) return setError('El título es obligatorio.')
    upload.mutate()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Subir archivo de audio" size="sm">
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        {/* Selector de archivo */}
        <div
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-6 transition hover:border-brand/40 hover:bg-brand/5"
        >
          <Upload className="h-6 w-6 text-gray-300" />
          <p className="text-xs text-gray-500">
            {file ? <span className="font-semibold text-brand">{file.name}</span> : 'Haz clic para seleccionar MP3, WAV, OGG...'}
          </p>
          <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Título *</label>
          <input className="field mt-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre de la canción" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Artista</label>
          <input className="field mt-1" value={artista} onChange={(e) => setArtista(e.target.value)} placeholder="Nombre del artista" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Emoji</label>
          <input className="field mt-1 w-20" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={upload.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={upload.isPending}>Subir</Button>
        </div>
      </div>
    </Modal>
  )
}

// Burbujas del efecto de agua del panel — mismo patrón que el fondo del Sidebar
const BUBBLES = [
  { left: 5,  size: 9,  opacity: 0.3,  duration: 11, delay: 0   },
  { left: 18, size: 14, opacity: 0.22, duration: 14, delay: 3   },
  { left: 30, size: 7,  opacity: 0.35, duration: 9,  delay: 1.5 },
  { left: 44, size: 18, opacity: 0.16, duration: 17, delay: 5   },
  { left: 58, size: 10, opacity: 0.28, duration: 12, delay: 7   },
  { left: 70, size: 8,  opacity: 0.3,  duration: 10, delay: 2.5 },
  { left: 82, size: 13, opacity: 0.2,  duration: 15, delay: 8.5 },
  { left: 92, size: 6,  opacity: 0.35, duration: 8,  delay: 4.5 },
]

/* ══════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════════ */
export function MusicaPage() {
  const user      = useAuthStore((s) => s.user)
  const isAdmin   = user?.tipoUsuario?.toUpperCase() === 'AD' || user?.tipoUsuario?.toUpperCase() === 'ADMIN'
  const userId    = user?.id
  const qc        = useQueryClient()

  const [tab,            setTab]           = useState<'general' | 'privado'>('general')
  const [playingUrl,     setPlayingUrl]    = useState<string | null>(null)
  const [isPlaying,      setIsPlaying]     = useState(false)
  const [addUrlOpen,     setAddUrlOpen]    = useState(false)
  const [uploadOpen,     setUploadOpen]    = useState(false)
  const [confirmId,      setConfirmId]     = useState<{ id: number; tab: 'general' | 'privado' } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /* ── Queries ── */
  const general = useQuery({
    queryKey: ['musica-general'],
    queryFn: async () => {
      const { data } = await api.get('/musica/general')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.tracks ?? [])
      return (list as Record<string, unknown>[]).map(parseTrack)
    },
  })

  const privado = useQuery({
    queryKey: ['musica-privado'],
    queryFn: async () => {
      const { data } = await api.get('/musica/privado')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.tracks ?? [])
      return (list as Record<string, unknown>[]).map(parseTrack)
    },
  })

  /* ── Reproductor ── */
  const togglePlay = (url: string) => {
    if (playingUrl === url) {
      if (isPlaying) {
        audioRef.current?.pause()
        setIsPlaying(false)
      } else {
        audioRef.current?.play()
        setIsPlaying(true)
      }
    } else {
      audioRef.current?.pause()
      const el = new Audio(url)
      el.onended = () => { setIsPlaying(false); setPlayingUrl(null) }
      el.onerror = () => { setIsPlaying(false); setPlayingUrl(null); toast.error('No se pudo reproducir') }
      el.play().catch(() => toast.error('No se pudo reproducir'))
      audioRef.current = el
      setPlayingUrl(url)
      setIsPlaying(true)
    }
  }

  // Parar audio al desmontar
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const openYouTube = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

  /* ── Mutations ── */
  const compartir = useMutation({
    mutationFn: (id: number) => api.post(`/musica/privado/${id}/compartir`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['musica-general'] }); toast.success('Compartido en Lista General') },
    onError: () => toast.error('Error al compartir'),
  })

  const eliminar = useMutation({
    mutationFn: ({ id, tab }: { id: number; tab: 'general' | 'privado' }) =>
      tab === 'general' ? api.delete(`/musica/general/${id}`) : api.delete(`/musica/privado/${id}`),
    onSuccess: (_, { tab }) => {
      qc.invalidateQueries({ queryKey: tab === 'general' ? ['musica-general'] : ['musica-privado'] })
      toast.success('Canción eliminada')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const tracks   = tab === 'general' ? (general.data ?? []) : (privado.data ?? [])
  const loading  = tab === 'general' ? general.isLoading : privado.isLoading
  const hasError = tab === 'general' ? general.isError : privado.isError
  const refetch  = tab === 'general' ? general.refetch : privado.refetch

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div
        className="animate-gradient-x overflow-hidden rounded-2xl"
        style={{
          backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
          backgroundSize: '200% 100%',
        }}
      >
        <div className="relative px-6 py-5">
          <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-6 left-1/3 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Music2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Música 🎶</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">Lista compartida del equipo</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Panel principal ── */}
      <div
        className="relative overflow-hidden rounded-2xl shadow-card-md"
        style={{ background: 'linear-gradient(135deg, #1B4FD8 0%, #5FA8FF 100%)' }}
      >
        {/* Efecto de flujo de agua: blobs de luz + burbujas ascendentes */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className="animate-water-a absolute -left-1/4 -top-1/4 h-[85%] w-[85%] rounded-full opacity-60 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(200,225,255,0.6) 0%, transparent 65%)' }}
          />
          <div
            className="animate-water-b absolute -bottom-1/4 -right-1/4 h-[80%] w-[80%] rounded-full opacity-50 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(180,215,255,0.55) 0%, transparent 65%)' }}
          />
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="animate-bubble-rise absolute rounded-full bg-white"
              style={{
                left: `${b.left}%`,
                bottom: `-${b.size}px`,
                width: b.size,
                height: b.size,
                opacity: b.opacity,
                animationDuration: `${b.duration}s`,
                animationDelay: `${b.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 p-5">

          {/* Header con tabs y acciones */}
          <div className="mb-4 flex items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex rounded-xl bg-white/10 p-0.5 gap-0.5">
              {(['general', 'privado'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    'rounded-lg px-4 py-1.5 text-xs font-semibold transition-all',
                    tab === t ? 'bg-white text-brand shadow-sm' : 'text-white/70 hover:text-white',
                  )}
                >
                  {t === 'general' ? 'Lista General' : 'Mi Lista'}
                </button>
              ))}
            </div>

            {/* Acciones (solo en Mi Lista) */}
            {tab === 'privado' && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
                  title="Subir MP3"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">MP3</span>
                </button>
                <button
                  onClick={() => setAddUrlOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
                  title="Agregar por URL"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">URL</span>
                </button>
              </div>
            )}

            {/* Refrescar */}
            <button
              onClick={() => refetch()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/15 hover:text-white transition-colors"
            >
              <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
          </div>

          {/* Lista */}
          <div className="max-h-[420px] overflow-y-auto pr-0.5">
            {loading ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonTrack key={i} />)}
              </div>
            ) : hasError ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <p className="text-sm text-white/60">Error al cargar canciones</p>
                <button onClick={() => refetch()} className="text-xs text-white/80 underline hover:text-white">
                  Reintentar
                </button>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Music className="h-6 w-6 text-white/30" />
                </div>
                <p className="text-sm text-white/60 text-center">
                  {tab === 'general'
                    ? 'Aún no hay canciones compartidas.'
                    : 'Tu lista está vacía.\n¡Agrega una canción con los botones de arriba!'}
                </p>
                {tab === 'privado' && (
                  <div className="flex gap-2">
                    <button onClick={() => setUploadOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25 transition-colors">
                      <Upload className="h-3.5 w-3.5" /> Subir MP3
                    </button>
                    <button onClick={() => setAddUrlOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/25 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Agregar URL
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {tracks.map((track) => {
                  const isAudio  = track.url && !isYouTube(track.url)
                  const isOwner  = track.compartidoPor === userId || !track.compartidoPor
                  const canDel   = tab === 'general' ? (isAdmin || isOwner) : true

                  return (
                    <TrackTile
                      key={track.id}
                      track={track}
                      isPlaying={playingUrl === track.url && isPlaying}
                      canDelete={canDel}
                      onPlayPause={isAudio ? () => togglePlay(track.url) : undefined}
                      onOpen={() => openYouTube(track.url)}
                      onShare={tab === 'privado' ? () => compartir.mutate(track.id) : undefined}
                      onDelete={() => setConfirmId({ id: track.id, tab })}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Now playing */}
          {playingUrl && isPlaying && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 border border-white/20">
              <div className="flex gap-0.5 items-end h-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-1 rounded-full bg-white/80"
                    style={{ height: `${40 + i * 20}%`, animation: `music-bar 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
                ))}
              </div>
              <p className="text-xs text-white/70 truncate flex-1">
                {tracks.find((t) => t.url === playingUrl)?.titulo ?? 'Reproduciendo...'}
              </p>
              <button onClick={() => { audioRef.current?.pause(); setIsPlaying(false) }}
                className="text-white/50 hover:text-white transition-colors">
                <Pause className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      <AddUrlModal   isOpen={addUrlOpen}  onClose={() => setAddUrlOpen(false)}  onAdded={() => qc.invalidateQueries({ queryKey: ['musica-privado'] })} />
      <UploadMp3Modal isOpen={uploadOpen}  onClose={() => setUploadOpen(false)}  onUploaded={() => qc.invalidateQueries({ queryKey: ['musica-privado'] })} />

      <ConfirmDialog
        isOpen={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId) eliminar.mutate(confirmId) }}
        title="Eliminar canción"
        message="¿Seguro que deseas eliminar esta canción de la lista?"
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
