import { useState, useEffect } from 'react'
import { useDraggablePosition } from '@/hooks/useDraggablePosition'
import { useQuery } from '@tanstack/react-query'
import {
  Music2, Play, Pause, SkipForward, SkipBack,
  ChevronDown, Volume2, X, ListMusic, Square,
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { useMusicStore } from '@/stores/music.store'

const HIDE_HINT = 'Ocultar — se vuelve a mostrar desde el menú de perfil'

interface Track { id: number; titulo: string; artista: string; emoji: string; url: string }

function parseTrack(r: Record<string, unknown>): Track {
  const s = (...keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id:      Number(r['id'] ?? r['ID'] ?? 0),
    titulo:  s('titulo', 'title', 'nombre'),
    artista: s('artista', 'artist', 'autor'),
    emoji:   s('emoji') || '🎵',
    url:     s('url', 'audioUrl', 'src'),
  }
}

function isYouTube(url: string) {
  return url.includes('youtube') || url.includes('youtu.be')
}

export function MusicBubble() {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<'general' | 'privado'>('general')
  const { pos, dragProps } = useDraggablePosition('widget-musica', {
    x: typeof window !== 'undefined' ? window.innerWidth - 80 : 900,
    y: typeof window !== 'undefined' ? window.innerHeight - 80 : 700,
  })

  const { tracks, setTracks, currentTrack, isPlaying, play, pause, resume, next, prev, stop } = useMusicStore()
  const setBubbleVisible = useMusicStore((s) => s.setBubbleVisible)

  /* ── Cargar lista ── */
  const { data: general = [] } = useQuery({
    queryKey: ['musica-general'],
    queryFn: async () => {
      const { data } = await api.get('/musica/general')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.tracks ?? [])
      return (list as Record<string, unknown>[]).map(parseTrack).filter((t) => t.url && !isYouTube(t.url))
    },
    staleTime: 120_000,
  })

  const { data: privado = [] } = useQuery({
    queryKey: ['musica-privado'],
    queryFn: async () => {
      const { data } = await api.get('/musica/privado')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.tracks ?? [])
      return (list as Record<string, unknown>[]).map(parseTrack).filter((t) => t.url && !isYouTube(t.url))
    },
    staleTime: 120_000,
  })

  const activeList = tab === 'general' ? general : privado

  /* Sincronizar tracks con el store sin causar loop.
     Usamos el ID del primer+último track como proxy de cambio real. */
  const listKey = activeList.map((t) => t.id).join(',')
  useEffect(() => {
    setTracks(activeList)
  // listKey y setTracks son suficientes — activeList no es estable entre renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])

  /* Cerrar con Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const togglePlayPause = () => {
    if (!currentTrack) {
      const first = activeList[0]
      if (first) play(first)
    } else if (isPlaying) {
      pause()
    } else {
      resume()
    }
  }

  /* ── Burbuja colapsada ── */
  if (!expanded) {
    return (
      <div
        {...dragProps}
        style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(-100%, -100%)', zIndex: 50, ...dragProps.style }}
      >
      <button
        onClick={() => setExpanded(true)}
        className={clsx(
          'flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-110 active:scale-95',
          isPlaying ? 'bg-brand ring-4 ring-brand/25' : 'bg-[#0B1730]',
        )}
        title="Abrir reproductor"
      >
        {/* Ícono animado cuando reproduce */}
        {isPlaying ? (
          <div className="flex items-end gap-0.5 h-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-1 rounded-full bg-card"
                style={{ height: `${35 + i * 25}%`, animation: `music-bar 0.7s ease-in-out ${i * 0.18}s infinite alternate` }} />
            ))}
          </div>
        ) : (
          <Music2 className="h-6 w-6 text-white" />
        )}
      </button>
      </div>
    )
  }

  /* ── Panel expandido ── */
  return (
    <div className="fixed z-50 w-80 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
      style={{ background: 'linear-gradient(160deg, #0B1730 0%, #14274E 100%)', left: pos.x, top: pos.y, transform: 'translate(-100%, -100%)' }}>

      {/* Cabecera — arrastrar desde aquí */}
      <div className="flex items-center justify-between px-4 py-3" {...dragProps}>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
            <Music2 className="h-4 w-4 text-white" />
          </div>
          <span className="text-[0.8rem] font-bold text-white">Música</span>
        </div>
        <div className="flex items-center gap-1">
          {currentTrack && (
            <button onClick={stop} title="Detener"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors">
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded(false)} title="Minimizar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={() => { stop(); setBubbleVisible(false) }} title={HIDE_HINT}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Now playing */}
      <div className="mx-3 mb-3 rounded-xl bg-white/10 px-3 py-3 border border-white/10">
        {currentTrack ? (
          <div className="flex items-center gap-3">
            {/* Emoji / visualizador */}
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl">
              {isPlaying ? (
                <div className="flex items-end gap-0.5 h-5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-1 rounded-full bg-card"
                      style={{ height: `${30 + i * 25}%`, animation: `music-bar 0.7s ease-in-out ${i * 0.18}s infinite alternate` }} />
                  ))}
                </div>
              ) : (
                <span>{currentTrack.emoji}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.8rem] font-semibold text-white truncate">{currentTrack.titulo}</p>
              <p className="text-[0.65rem] text-white/50 truncate">{currentTrack.artista || 'Artista desconocido'}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-white/40">
            <Volume2 className="h-5 w-5 flex-shrink-0" />
            <p className="text-[0.75rem]">Ninguna canción activa</p>
          </div>
        )}

        {/* Controles */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={prev} disabled={tracks.length < 2}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={togglePlayPause}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-brand shadow-lg transition-all hover:scale-105 active:scale-95">
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
          </button>
          <button onClick={next} disabled={tracks.length < 2}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mx-3">
        {(['general', 'privado'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx(
              'flex-1 pb-2 text-[0.68rem] font-semibold transition-colors',
              tab === t ? 'text-white border-b-2 border-white -mb-px' : 'text-white/40 hover:text-white/70',
            )}>
            {t === 'general' ? 'Lista General' : 'Mi Lista'}
          </button>
        ))}
      </div>

      {/* Lista de canciones */}
      <div className="max-h-52 overflow-y-auto px-3 py-2 space-y-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
        {activeList.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <ListMusic className="h-6 w-6 text-white/20" />
            <p className="text-[0.7rem] text-white/30">Sin canciones en esta lista</p>
          </div>
        ) : (
          activeList.map((track) => {
            const active = currentTrack?.id === track.id
            return (
              <button key={track.id} onClick={() => active && isPlaying ? pause() : play(track)}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all',
                  active ? 'bg-white/20 ring-1 ring-white/30' : 'hover:bg-white/10',
                )}>
                <div className={clsx(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm',
                  active ? 'bg-white/25' : 'bg-white/10',
                )}>
                  {active && isPlaying ? (
                    <div className="flex items-end gap-0.5 h-3.5">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-0.5 rounded-full bg-card"
                          style={{ height: `${35 + i * 25}%`, animation: `music-bar 0.7s ease-in-out ${i * 0.18}s infinite alternate` }} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs">{track.emoji}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={clsx('text-[0.73rem] font-semibold truncate', active ? 'text-white' : 'text-white/80')}>{track.titulo}</p>
                  {track.artista && <p className="text-[0.6rem] text-white/40 truncate">{track.artista}</p>}
                </div>
                {active && isPlaying && (
                  <div className="flex-shrink-0">
                    <Pause className="h-3 w-3 text-white/60" />
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Ir a la página completa */}
      <div className="border-t border-white/10 px-3 py-2.5">
        <a href="/musica"
          className="flex items-center justify-center gap-1.5 text-[0.68rem] font-medium text-white/40 hover:text-white/70 transition-colors">
          <ListMusic className="h-3.5 w-3.5" />
          Abrir página completa
        </a>
      </div>
    </div>
  )
}
