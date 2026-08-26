import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Star, MessageCircle, Search, RefreshCw,
  Newspaper, X, Send, ChevronRight, CalendarDays, User2,
  LayoutGrid, List, Trash2, StarOff, EyeOff, Eye,
  Award, Users, SlidersHorizontal, Pencil, ClipboardList, CheckCircle,
  ImagePlus, ChevronLeft,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { noticiasService } from '@/services/noticias.service'
import { useAuthStore } from '@/stores/auth.store'
import { useSocketEvent } from '@/hooks/useSocket'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CarouselManagerModal } from '@/components/ui/CarouselManagerModal'
import { CollageLayoutModal } from '@/components/ui/CollageLayoutModal'
import { ReactionPicker } from '@/components/ui/ReactionPicker'
import { HeroCarousel } from '@/components/ui/HeroCarousel'
import type { Noticia } from '@/types/noticia.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

/* ── Colores de categoría ── */
const CAT: Record<string, { text: string; bg: string; ring: string; solid: string }> = {
  Comunicado: { text: 'text-blue-700',   bg: 'bg-blue-50',   ring: 'ring-blue-200',   solid: 'bg-blue-500'   },
  Evento:     { text: 'text-purple-700', bg: 'bg-purple-50', ring: 'ring-purple-200', solid: 'bg-purple-500' },
  Noticia:    { text: 'text-emerald-700',bg: 'bg-emerald-50',ring: 'ring-emerald-200',solid: 'bg-emerald-500'},
  Urgente:    { text: 'text-red-700',    bg: 'bg-red-50',    ring: 'ring-red-200',    solid: 'bg-red-500'    },
}
const catStyle = (c: string) => CAT[c] ?? { text: 'text-gray-600', bg: 'bg-gray-100', ring: 'ring-gray-200', solid: 'bg-gray-500' }

/* ────────────────────────────────────────────────
   SKELETON LOADER
──────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="card flex flex-col overflow-hidden animate-pulse">
      <div className="h-44 bg-gray-100" />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex gap-2">
          <div className="h-3 w-16 rounded-full bg-gray-100" />
          <div className="h-3 w-20 rounded-full bg-gray-100" />
        </div>
        <div className="h-4 w-4/5 rounded-lg bg-gray-100" />
        <div className="h-3 w-full rounded-lg bg-gray-100" />
        <div className="h-3 w-3/4 rounded-lg bg-gray-100" />
      </div>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="card flex gap-4 p-4 animate-pulse">
      <div className="h-20 w-28 flex-shrink-0 rounded-xl bg-gray-100" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-3 w-16 rounded-full bg-gray-100" />
        <div className="h-4 w-3/4 rounded-lg bg-gray-100" />
        <div className="h-3 w-full rounded-lg bg-gray-100" />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────
   CARD DE NOTICIA — vista grid
──────────────────────────────────────────────── */
function NoticiaCard({ noticia, onOpen, index }: { noticia: Noticia; onOpen: (n: Noticia) => void; index: number }) {
  const [hovered, setHovered] = useState(false)
  const qc = useQueryClient()
  const st = catStyle(noticia.categoria)
  const fecha = new Date(noticia.fechaCreacion).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <article
      className={clsx(
        'group flex flex-col overflow-hidden rounded-2xl bg-white border border-gray-200/60 cursor-pointer transition-all duration-200',
        hovered ? '-translate-y-1 shadow-card-lg border-gray-300/60' : 'shadow-card',
      )}
      style={{ animationDelay: `${index * 40}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(noticia)}
    >
      {/* Imagen */}
      {noticia.imagenPortada ? (
        <div className="relative h-44 overflow-hidden bg-gray-100 flex-shrink-0">
          <img
            src={noticia.imagenPortada}
            alt={noticia.titulo}
            className={clsx('h-full w-full object-cover transition-transform duration-500', hovered && 'scale-[1.04]')}
          />
          {noticia.destacada && (
            <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[0.68rem] font-bold text-yellow-900 shadow">
              <Star className="h-3 w-3 fill-yellow-900" /> Destacada
            </span>
          )}
          <span className={clsx('absolute bottom-2.5 left-2.5 news-badge', st.bg, st.text, st.ring)}>
            {noticia.categoria}
          </span>
        </div>
      ) : (
        <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8] overflow-hidden flex-shrink-0">
          <Newspaper className="h-10 w-10 text-white/20" />
          {noticia.destacada && (
            <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[0.68rem] font-bold text-yellow-900 shadow">
              <Star className="h-3 w-3 fill-yellow-900" /> Destacada
            </span>
          )}
          <span className={clsx('absolute bottom-2.5 left-2.5 news-badge', st.bg, st.text, st.ring)}>
            {noticia.categoria}
          </span>
        </div>
      )}

      {/* Contenido */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-3 text-[0.68rem] text-gray-400">
          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fecha}</span>
          <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{noticia.autorNombre}</span>
        </div>
        <h3 className={clsx('text-[0.88rem] font-bold leading-snug line-clamp-2 transition-colors', hovered ? 'text-brand' : 'text-gray-900')}>
          {noticia.titulo}
        </h3>
        <p className="text-[0.78rem] text-gray-500 line-clamp-2 leading-relaxed flex-1">
          {noticia.contenido.replace(/<[^>]*>/g, '').slice(0, 130)}…
        </p>

        <div
          className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <ReactionPicker
            noticiaId={noticia.id}
            miReaccion={noticia.miReaccion}
            total={noticia.reaccionesTotal}
          />
          <button
            onClick={() => onOpen(noticia)}
            className={clsx('flex items-center gap-1 text-[0.72rem] font-semibold transition-colors', hovered ? 'text-brand' : 'text-gray-400')}
          >
            Leer más <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  )
}

/* ────────────────────────────────────────────────
   CARD DE NOTICIA — vista lista
──────────────────────────────────────────────── */
function NoticiaRow({ noticia, onOpen, index }: { noticia: Noticia; onOpen: (n: Noticia) => void; index: number }) {
  const [hovered, setHovered] = useState(false)
  const st = catStyle(noticia.categoria)
  const fecha = new Date(noticia.fechaCreacion).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <article
      className={clsx(
        'flex gap-4 overflow-hidden rounded-2xl bg-white border border-gray-200/60 cursor-pointer transition-all duration-200 p-0',
        hovered ? '-translate-y-0.5 shadow-card-md border-gray-300/60' : 'shadow-card',
      )}
      style={{ animationDelay: `${index * 30}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(noticia)}
    >
      {/* Miniatura */}
      <div className="relative h-24 w-32 flex-shrink-0 overflow-hidden rounded-l-2xl bg-gray-100">
        {noticia.imagenPortada ? (
          <img
            src={noticia.imagenPortada}
            alt={noticia.titulo}
            className={clsx('h-full w-full object-cover transition-transform duration-500', hovered && 'scale-[1.06]')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8]">
            <Newspaper className="h-7 w-7 text-white/25" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-center gap-1.5 py-3 pr-4 min-w-0">
        <div className="flex items-center gap-2">
          <span className={clsx('news-badge', st.bg, st.text, st.ring)}>{noticia.categoria}</span>
          {noticia.destacada && (
            <span className="flex items-center gap-1 text-[0.65rem] font-semibold text-yellow-600">
              <Star className="h-2.5 w-2.5 fill-yellow-500" /> Destacada
            </span>
          )}
        </div>
        <h3 className={clsx('text-[0.85rem] font-bold leading-snug line-clamp-1 transition-colors', hovered ? 'text-brand' : 'text-gray-900')}>
          {noticia.titulo}
        </h3>
        <p className="text-[0.74rem] text-gray-400 line-clamp-1">
          {noticia.contenido.replace(/<[^>]*>/g, '').slice(0, 100)}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[0.65rem] text-gray-400">
            <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fecha}</span>
            <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{noticia.autorNombre}</span>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <ReactionPicker
              noticiaId={noticia.id}
              miReaccion={noticia.miReaccion}
              total={noticia.reaccionesTotal}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

/* ────────────────────────────────────────────────
   LIGHTBOX
──────────────────────────────────────────────── */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

/* ────────────────────────────────────────────────
   GALERÍA DE IMÁGENES INFORMATIVAS (en detalle)
──────────────────────────────────────────────── */
function NoticiaImagenInformativa({ imagenes }: { imagenes: string[] }) {
  const [idx, setIdx] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const imgs = imagenes.filter(Boolean)
  if (imgs.length === 0) return null

  const prev = () => setIdx((i) => (i - 1 + imgs.length) % imgs.length)
  const next = () => setIdx((i) => (i + 1) % imgs.length)

  return (
    <>
      <div className="mt-5">
        <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">
          Imágenes informativas {imgs.length > 1 && `(${idx + 1} / ${imgs.length})`}
        </p>

        {/* Imagen principal */}
        <div className="relative overflow-hidden rounded-xl bg-gray-100">
          <img
            src={imgs[idx]}
            alt={`Imagen ${idx + 1}`}
            onClick={() => setLightbox(imgs[idx])}
            className="w-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
            style={{ maxHeight: 320 }}
          />
          {/* Flechas navegación */}
          {imgs.length > 1 && (
            <>
              <button onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Miniaturas */}
        {imgs.length > 1 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {imgs.map((src, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={clsx('h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                  i === idx ? 'border-brand shadow-sm' : 'border-transparent opacity-60 hover:opacity-90')}>
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[0.65rem] text-gray-400 text-center">Haz clic en la imagen para ampliar</p>
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

/* ────────────────────────────────────────────────
   DETALLE MODAL
──────────────────────────────────────────────── */
export function NoticiaDetalle({ noticia, onClose }: { noticia: Noticia; onClose: () => void }) {
  const [comentario, setComentario] = useState('')
  const qc = useQueryClient()
  const st = catStyle(noticia.categoria)
  const { user } = useAuthStore()

  const { data: comentarios = [], isLoading: loadingComentarios } = useQuery({
    queryKey: ['noticia-comentarios', noticia.id],
    queryFn: () => noticiasService.getComentarios(noticia.id),
  })

  const addComentario = useMutation({
    mutationFn: (texto: string) => noticiasService.addComentario(noticia.id, texto, user!.id, user!.nombres),
    onSuccess: () => {
      setComentario('')
      qc.invalidateQueries({ queryKey: ['noticia-comentarios', noticia.id] })
      toast.success('Comentario publicado')
    },
    onError: () => toast.error('No se pudo publicar el comentario'),
  })

  const fecha = new Date(noticia.fechaCreacion).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-8 animate-fade-in">
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {noticia.imagenPortada ? (
          <img src={noticia.imagenPortada} alt={noticia.titulo} className="w-full object-contain max-h-[60vh] bg-black/5" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-gradient-to-br from-[#0D1B3E] to-[#1B4FD8]">
            <Newspaper className="h-14 w-14 text-white/20" />
          </div>
        )}

        <div className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className={clsx('news-badge', st.bg, st.text, st.ring)}>{noticia.categoria}</span>
            {noticia.destacada && (
              <span className="flex items-center gap-1 text-xs font-semibold text-yellow-600">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" /> Destacada
              </span>
            )}
          </div>

          <h2 className="mb-2 text-xl font-bold text-gray-900 leading-tight">{noticia.titulo}</h2>

          <div className="mb-5 flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{noticia.autorNombre}</span>
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            <span className="flex items-center gap-1 capitalize"><CalendarDays className="h-3 w-3" />{fecha}</span>
          </div>

          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: noticia.contenido }} />

          <NoticiaImagenInformativa imagenes={noticia.imagenes} />

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
            <ReactionPicker
              noticiaId={noticia.id}
              miReaccion={noticia.miReaccion}
              total={noticia.reaccionesTotal}
            />
          </div>

          {noticia.comentariosHabilitados && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <MessageCircle className="h-4 w-4 text-brand" />
                Comentarios
              </h4>

              {loadingComentarios ? (
                <div className="space-y-2.5 mb-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="h-7 w-7 rounded-full bg-gray-100 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-24 rounded-full bg-gray-100" />
                        <div className="h-2 w-full rounded-full bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-4 max-h-52 space-y-2.5 overflow-y-auto pr-1">
                  {comentarios.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-4">Sin comentarios aún. ¡Sé el primero!</p>
                  ) : (
                    comentarios.map((c) => (
                      <div key={c.id} className="flex gap-3">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[0.7rem] font-bold text-brand">
                          {c.autorNombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                          <div className="mb-0.5 flex items-baseline gap-2">
                            <span className="text-[0.76rem] font-semibold text-gray-800">{c.autorNombre}</span>
                            <span className="text-[0.65rem] text-gray-400">
                              {new Date(c.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <p className="text-[0.78rem] text-gray-600 leading-relaxed">{c.contenido}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Escribe un comentario..."
                  className="field flex-1 py-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && comentario.trim()) {
                      e.preventDefault()
                      addComentario.mutate(comentario.trim())
                    }
                  }}
                />
                <Button
                  size="sm"
                  isLoading={addComentario.isPending}
                  disabled={!comentario.trim()}
                  onClick={() => addComentario.mutate(comentario.trim())}
                  className="px-3 py-2"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  )
}

/* ────────────────────────────────────────────────
   MODAL CREAR / EDITAR NOTICIA
──────────────────────────────────────────────── */
const CATEGORIAS = ['Comunicado', 'Evento', 'Noticia', 'Urgente', 'PLATA']

async function uploadImageBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const base64 = reader.result as string
        const ts = Date.now()
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = `noticia_${ts}.${ext}`
        const { data } = await api.post('/uploads/noticias', { base64, filename })
        if (data?.url) resolve(data.url)
        else reject(new Error('Sin URL en respuesta'))
      } catch (e) { reject(e) }
    }
    reader.onerror = () => reject(new Error('Error leyendo archivo'))
    reader.readAsDataURL(file)
  })
}

function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={onChange}
        className={clsx('h-4 w-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0',
          checked ? 'bg-brand border-brand' : 'border-gray-300')}>
        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ visibility: checked ? 'visible' : 'hidden' }}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </div>
      <span className="text-[0.78rem] text-gray-700">{label}</span>
    </label>
  )
}

/* sub-componente reutilizable para subir una imagen */
function ImageUploadField({
  label, value, onChange, uploading, onUploadStart, onUploadEnd,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  uploading: boolean
  onUploadStart: () => void
  onUploadEnd: () => void
}) {
  const [preview, setPreview] = useState(value)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const local = URL.createObjectURL(file)
    setPreview(local)
    onUploadStart()
    try {
      const url = await uploadImageBase64(file)
      onChange(url)
      setPreview(url)
      toast.success('Imagen subida')
    } catch {
      toast.error('Error al subir imagen')
      setPreview(value)
    } finally {
      onUploadEnd()
    }
  }

  const clear = () => { onChange(''); setPreview('') }

  // sync cuando value cambia desde afuera (ej: limpiar)
  const prevValue = preview
  if (value === '' && prevValue !== '') setPreview('')

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="flex gap-3 items-start">
        <label className={clsx(
          'relative flex h-24 w-36 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          uploading ? 'border-brand/40 bg-brand/5' : 'border-gray-200 hover:border-brand/40 hover:bg-brand/5',
        )}>
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-300">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12h.008v.008H13.5V12zm-3 6.75h9a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 5.25v10.5A2.25 2.25 0 005.25 18.75h1.5" />
              </svg>
              <span className="text-[0.6rem] font-medium">Subir imagen</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            </div>
          )}
          <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
        </label>
        <div className="flex-1 space-y-2">
          <p className="text-[0.68rem] text-gray-400">Haz clic en el recuadro para subir un archivo, o pega una URL:</p>
          <input
            value={value}
            onChange={(e) => { onChange(e.target.value); setPreview(e.target.value) }}
            className="field text-xs"
            placeholder="https://..."
          />
          <button
            onClick={clear}
            style={{ visibility: preview ? 'visible' : 'hidden' }}
            className="text-[0.68rem] text-red-400 hover:text-red-600 transition-colors"
          >
            Quitar imagen
          </button>
        </div>
      </div>
    </div>
  )
}

/* sub-componente: galería editable de imágenes informativas */
function ImagenesInformativasEditor({
  imagenes, onChange,
}: { imagenes: string[]; onChange: (imgs: string[]) => void }) {
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingIdx(idx)
    try {
      const url = await uploadImageBase64(file)
      const next = [...imagenes]
      if (idx < next.length) {
        next[idx] = url
      } else {
        next.push(url)
      }
      onChange(next)
      toast.success('Imagen subida')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploadingIdx(null)
      // reset input
      e.target.value = ''
    }
  }

  const handleUrl = (url: string, idx: number) => {
    const next = [...imagenes]
    next[idx] = url
    onChange(next)
  }

  const remove = (idx: number) => {
    onChange(imagenes.filter((_, i) => i !== idx))
  }

  const addBlank = () => onChange([...imagenes, ''])

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Imágenes informativas <span className="normal-case text-gray-400 font-normal">({imagenes.length})</span>
        </label>
        <button type="button" onClick={addBlank}
          className="flex items-center gap-1 rounded-lg border border-dashed border-brand/40 px-2.5 py-1 text-[0.72rem] font-semibold text-brand hover:bg-brand/5 transition-colors">
          <ImagePlus className="h-3.5 w-3.5" /> Agregar imagen
        </button>
      </div>

      <div className="space-y-3">
        {imagenes.map((url, idx) => (
          <div key={idx} className="flex gap-3 items-start rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            {/* Preview / upload */}
            <label className={clsx(
              'relative flex h-20 w-28 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors',
              uploadingIdx === idx ? 'border-brand/40 bg-brand/5' : 'border-gray-200 hover:border-brand/40 hover:bg-brand/5',
            )}>
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-300">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12h.008v.008H13.5V12zm-3 6.75h9a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 5.25v10.5A2.25 2.25 0 005.25 18.75h1.5" />
                  </svg>
                  <span className="text-[0.58rem] font-medium">Subir</span>
                </div>
              )}
              {uploadingIdx === idx && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                </div>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFile(e, idx)} />
            </label>

            {/* URL + acciones */}
            <div className="flex-1 space-y-1.5 min-w-0">
              <p className="text-[0.65rem] text-gray-400">Sube un archivo o pega una URL:</p>
              <input
                value={url}
                onChange={(e) => handleUrl(e.target.value, idx)}
                className="field text-xs"
                placeholder="https://..."
              />
              <button type="button" onClick={() => remove(idx)}
                className="text-[0.65rem] text-red-400 hover:text-red-600 transition-colors">
                Quitar imagen {idx + 1}
              </button>
            </div>
          </div>
        ))}

        {imagenes.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-5 text-gray-400 text-[0.75rem]">
            Sin imágenes informativas — haz clic en "Agregar imagen"
          </div>
        )}
      </div>
    </div>
  )
}

function NoticiaFormModal({ noticia, onClose }: { noticia?: Noticia; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!noticia
  const user = useAuthStore((s) => s.user)

  const [form, setForm] = useState({
    titulo:                noticia?.titulo ?? '',
    contenido:             noticia?.contenido ?? '',
    categoria:             noticia?.categoria ?? 'Comunicado',
    imagenPortada:         noticia?.imagenPortada ?? '',
    imagenFoco:            (noticia?.imagenFoco ?? 'center') as 'top' | 'center' | 'bottom',
    destacada:             noticia?.destacada ?? false,
    comentariosHabilitados: noticia?.comentariosHabilitados ?? true,
  })
  const [imagenes, setImagenes] = useState<string[]>(noticia?.imagenes?.filter(Boolean) ?? [])
  const [uploadingPortada, setUploadingPortada] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['noticias'] })
    qc.invalidateQueries({ queryKey: ['noticias-destacadas'] })
  }

  const buildPayload = () => ({
    titulo:                form.titulo,
    contenido:             form.contenido,
    categoria:             form.categoria,
    imagenPortada:         form.imagenPortada || null,
    imagenFoco:            form.imagenFoco,
    imagenes:              imagenes.filter(Boolean),
    destacada:             form.destacada,
    comentariosHabilitados: form.comentariosHabilitados,
  })

  const guardar = useMutation({
    mutationFn: () => isEdit
      ? noticiasService.update(noticia!.id, buildPayload())
      : noticiasService.create({
          ...buildPayload(),
          autorId: user?.id,
          autorNombre: user?.nombres,
        }),
    onSuccess: () => {
      invalidate()
      toast.success(isEdit ? 'Noticia actualizada' : 'Noticia publicada')
      onClose()
    },
    onError: () => toast.error('Error al guardar noticia'),
  })

  const canSave = form.titulo.trim() && form.contenido.trim() && !uploadingPortada

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar noticia' : 'Nueva noticia'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

        <ImageUploadField
          label="Imagen de portada"
          value={form.imagenPortada}
          onChange={(url) => setForm((f) => ({ ...f, imagenPortada: url }))}
          uploading={uploadingPortada}
          onUploadStart={() => setUploadingPortada(true)}
          onUploadEnd={() => setUploadingPortada(false)}
        />

        {/* Posición de la imagen en el carrusel */}
        {form.imagenPortada && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Posición de imagen en carrusel
            </label>
            <div className="flex gap-2">
              {([
                { val: 'top',    label: 'Arriba',  icon: '⬆️' },
                { val: 'center', label: 'Centro',  icon: '⬛' },
                { val: 'bottom', label: 'Abajo',   icon: '⬇️' },
              ] as { val: 'top'|'center'|'bottom'; label: string; icon: string }[]).map(({ val, label, icon }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, imagenFoco: val }))}
                  className={clsx(
                    'flex flex-1 flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[0.72rem] font-semibold transition-all',
                    form.imagenFoco === val
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-gray-200 text-gray-500 hover:border-brand/30',
                  )}
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[0.65rem] text-gray-400">
              Ajusta desde qué parte de la imagen se ancla el recorte en el carrusel del inicio.
            </p>
          </div>
        )}

        <ImagenesInformativasEditor imagenes={imagenes} onChange={setImagenes} />

        {/* Título */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título *</label>
          <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="field" placeholder="Título de la noticia" autoFocus />
        </div>

        {/* Categoría */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => (
              <button key={c} onClick={() => setForm({ ...form, categoria: c })}
                className={clsx(
                  'rounded-full px-3 py-1 text-[0.72rem] font-semibold border transition-all',
                  form.categoria === c
                    ? 'bg-brand text-white border-brand'
                    : 'border-gray-200 text-gray-500 hover:border-brand/30 hover:text-brand',
                )}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Contenido *</label>
          <textarea value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })}
            rows={6} className="field resize-none" placeholder="Cuerpo de la noticia..." />
        </div>

        {/* Opciones */}
        <div className="flex items-center gap-5 flex-wrap">
          <CheckBox checked={form.destacada} onChange={() => setForm({ ...form, destacada: !form.destacada })} label="Destacada (carrusel)" />
          <CheckBox checked={form.comentariosHabilitados} onChange={() => setForm({ ...form, comentariosHabilitados: !form.comentariosHabilitados })} label="Comentarios habilitados" />
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>
            {isEdit ? 'Guardar cambios' : 'Publicar noticia'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ────────────────────────────────────────────────
   BLOQUE ENCUESTAS DENTRO DE NOTICIAS
──────────────────────────────────────────────── */
function EncuestasEnNoticias() {
  const user = useAuthStore((s) => s.user)
  const [respondiendo, setRespondiendo] = useState<null | { id: number; titulo: string; descripcion: string; asignacionId: number | null; preguntas: { id: number; texto: string; tipo: string; opciones: string[] }[] }>(null)
  const qc = useQueryClient()

  const { data: encuestas = [] } = useQuery({
    queryKey: ['encuestas-noticias', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/encuestas/noticias', {
        params: { userId: user?.id, tipoUsuario: user?.tipoUsuario },
      })
      return (Array.isArray(data) ? data : (data?.data ?? [])) as {
        encuestaId: number; titulo: string; descripcion: string;
        totalPreguntas: number; respondida: number; asignado: number; asignacionId: number | null
      }[]
    },
    enabled: !!user?.id,
  })

  const enviar = useMutation({
    mutationFn: (payload: { encuestaId: number; asignacionId: number | null; usuarioId?: number; respuestas: { preguntaId: number; respuesta: string }[] }) =>
      api.post('/encuestas/responder', payload),
    onSuccess: () => {
      toast.success('¡Encuesta respondida!')
      setRespondiendo(null)
      qc.invalidateQueries({ queryKey: ['encuestas-noticias', user?.id] })
    },
    onError: () => toast.error('Error al enviar respuestas'),
  })

  if (encuestas.length === 0) return null

  if (respondiendo) {
    return (
      <EncuestaResponderInline
        encuesta={respondiendo}
        onClose={() => setRespondiendo(null)}
        onEnviar={(respuestas) => enviar.mutate({ encuestaId: respondiendo.id, asignacionId: respondiendo.asignacionId, usuarioId: user?.id ?? undefined, respuestas })}
        isPending={enviar.isPending}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-4 w-1 rounded-full bg-indigo-500" />
        <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Encuestas activas</span>
        <span className="chip bg-indigo-100 text-indigo-700 text-[0.65rem]">{encuestas.length}</span>
      </div>
      {encuestas.map((e) => (
        <div key={e.encuestaId} className="card p-4 border-l-4 border-indigo-400">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                <ClipboardList className="h-4.5 w-4.5 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.85rem] font-semibold text-gray-900">{e.titulo}</p>
                {e.descripcion && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{e.descripcion}</p>}
                <p className="text-[0.65rem] text-gray-400 mt-1">{e.totalPreguntas} pregunta{e.totalPreguntas !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {e.respondida ? (
              <div className="flex items-center gap-1 text-emerald-600 flex-shrink-0">
                <CheckCircle className="h-4 w-4" />
                <span className="text-[0.72rem] font-semibold">Respondida</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  // Cargar preguntas y abrir
                  api.get(`/encuestas/${e.encuestaId}`).then(({ data }) => {
                    const enc = data?.data ?? data
                    const preguntas = (enc.preguntas ?? []).map((p: Record<string, unknown>) => ({
                      id: Number(p['EPR_ID'] ?? p['id'] ?? 0),
                      texto: String(p['EPR_TEXTO'] ?? p['texto'] ?? ''),
                      tipo: String(p['EPR_TIPO'] ?? p['tipo'] ?? 'texto').toLowerCase(),
                      opciones: Array.isArray(p['opciones']) ? p['opciones'].map((o: Record<string, unknown>) => String(o['EOP_TEXTO'] ?? o['texto'] ?? o)) : [],
                    }))
                    setRespondiendo({ id: e.encuestaId, titulo: e.titulo, descripcion: e.descripcion, asignacionId: e.asignacionId, preguntas })
                  })
                }}
                className="flex-shrink-0 rounded-xl bg-indigo-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Contestar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function EncuestaResponderInline({
  encuesta, onClose, onEnviar, isPending,
}: {
  encuesta: { id: number; titulo: string; descripcion: string; preguntas: { id: number; texto: string; tipo: string; opciones: string[] }[] }
  onClose: () => void
  onEnviar: (respuestas: { preguntaId: number; respuesta: string }[]) => void
  isPending: boolean
}) {
  const [respuestas, setRespuestas] = useState<Record<number, string>>({})
  const todasRespondidas = encuesta.preguntas.every((p) => respuestas[p.id]?.trim())

  return (
    <div className="card overflow-hidden border-l-4 border-indigo-400">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-indigo-50/50">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-indigo-600" />
          <p className="text-[0.85rem] font-bold text-gray-900">{encuesta.titulo}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        {encuesta.descripcion && <p className="text-xs text-gray-500">{encuesta.descripcion}</p>}
        {encuesta.preguntas.map((p, i) => (
          <div key={p.id} className="space-y-2">
            <p className="text-[0.82rem] font-semibold text-gray-800">{i + 1}. {p.texto}</p>
            {(p.tipo === 'opcion_multiple' || p.tipo === 'cerrada') && p.opciones.length > 0 ? (
              <div className="space-y-1.5">
                {p.opciones.map((opt) => (
                  <label key={opt} className={clsx(
                    'flex items-center gap-3 cursor-pointer rounded-xl border px-3 py-2 transition-colors',
                    respuestas[p.id] === opt ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200',
                  )}>
                    <div className={clsx('h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      respuestas[p.id] === opt ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300')}>
                      {respuestas[p.id] === opt && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <input type="radio" className="sr-only" onChange={() => setRespuestas({ ...respuestas, [p.id]: opt })} />
                    <span className="text-sm text-gray-700">{opt}</span>
                  </label>
                ))}
              </div>
            ) : p.tipo === 'escala' ? (
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRespuestas({ ...respuestas, [p.id]: String(n) })}
                    className={clsx('h-9 w-9 rounded-xl text-sm font-semibold border transition-all',
                      respuestas[p.id] === String(n) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300')}>
                    {n}
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-1">1 = Muy malo · 5 = Excelente</span>
              </div>
            ) : (
              <textarea value={respuestas[p.id] ?? ''} onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
                rows={2} className="field resize-none text-sm" placeholder="Escribe tu respuesta..." />
            )}
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button
            disabled={!todasRespondidas || isPending}
            onClick={() => onEnviar(Object.entries(respuestas).map(([k, v]) => ({ preguntaId: Number(k), respuesta: v })))}
            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-[0.78rem] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Enviando...' : 'Enviar respuestas'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────
   PÁGINA PRINCIPAL
──────────────────────────────────────────────── */
type NoticiaTab = 'todas' | 'plata' | 'miarea'

export function NoticiasPage() {
  const [search,          setSearch]         = useState('')
  const [selected,        setSelected]       = useState<Noticia | null>(null)
  const [catFilter,       setCatFilter]      = useState<string>('Todos')
  const [view,            setView]           = useState<'grid' | 'list'>('grid')
  const [showCrear,       setShowCrear]      = useState(false)
  const [editando,        setEditando]       = useState<Noticia | null>(null)
  const [showCarousel,    setShowCarousel]   = useState(false)
  const [showCollage,     setShowCollage]    = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<number | null>(null)
  const [tab,             setTab]            = useState<NoticiaTab>('todas')

  const user    = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const qc      = useQueryClient()

  // PLATA visible para AD, CC, ST (igual que Flutter)
  const canSeePlata = ['AD', 'CC', 'ST'].includes(user?.tipoUsuario?.toUpperCase() ?? '')

  const { data: noticias = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['noticias'],
    queryFn: () => noticiasService.getAll(),
  })

  const { data: destacadas = [] } = useQuery({
    queryKey: ['noticias-destacadas'],
    queryFn: () => noticiasService.getDestacadas(),
  })

  // Reflejar en vivo las reacciones de cualquier usuario (llega por socket desde el backend)
  useSocketEvent<{ noticiaId: number; total: number }>('noticia:reaccion', ({ noticiaId, total }) => {
    const patch = (list: Noticia[] = []) =>
      list.map((n) => (n.id === noticiaId ? { ...n, reaccionesTotal: total } : n))
    qc.setQueryData<Noticia[]>(['noticias'], patch)
    qc.setQueryData<Noticia[]>(['noticias-destacadas'], patch)
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['noticias'] })
    qc.invalidateQueries({ queryKey: ['noticias-destacadas'] })
  }
  const eliminarMut    = useMutation({ mutationFn: (id: number) => noticiasService.delete(id),          onSuccess: invalidate, onError: () => toast.error('Error al eliminar') })
  const destacadaMut   = useMutation({ mutationFn: ({ id, val }: { id: number; val: boolean }) => noticiasService.toggleDestacada(id, val), onSuccess: invalidate, onError: () => toast.error('Error') })
  const activoMut      = useMutation({ mutationFn: (id: number) => noticiasService.toggleActivo(id),    onSuccess: invalidate, onError: () => toast.error('Error') })

  // Separar PLATA del resto (igual que Flutter)
  const noticiasPlata   = noticias.filter((n) => n.categoria?.toUpperCase() === 'PLATA')
  const noticiasComunes = noticias.filter((n) => n.categoria?.toUpperCase() !== 'PLATA')

  const sourceList = tab === 'plata' ? noticiasPlata : noticiasComunes
  const categorias = ['Todos', ...Array.from(new Set(sourceList.map((n) => n.categoria)))]

  const filtered = sourceList.filter((n) => {
    const q = search.toLowerCase()
    const matchSearch =
      n.titulo.toLowerCase().includes(q) ||
      n.categoria.toLowerCase().includes(q) ||
      n.autorNombre.toLowerCase().includes(q)
    const matchCat = catFilter === 'Todos' || n.categoria === catFilter
    return matchSearch && matchCat
  })

  const showCarousel_ = tab === 'todas' && !search && catFilter === 'Todos' && destacadas.length > 0
  const destacadasIds = new Set(destacadas.map((n) => n.id))
  const restantes = showCarousel_
    ? filtered.filter((n) => !destacadasIds.has(n.id))
    : filtered

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute right-20 bottom-0 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Noticias corporativas</h1>
              <p className="mt-0.5 text-xs text-blue-200/70">
                {noticias.length} publicaciones · Portal interno ArdaBytec
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()}
                className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {isAdmin && (
                <>
                  <button onClick={() => setShowCollage(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[0.75rem] font-medium text-white/80 hover:bg-white/20 transition-colors"
                    title="Editor de collage">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Collage</span>
                  </button>
                  <button onClick={() => setShowCarousel(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[0.75rem] font-medium text-white/80 hover:bg-white/20 transition-colors"
                    title="Gestionar carrusel del inicio">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Carrusel</span>
                  </button>
                  <Button onClick={() => setShowCrear(true)}
                    className="bg-white !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                    <Plus className="h-3.5 w-3.5" /> Nueva noticia
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs: Todas / PLATA / Mi Área */}
        <div className="flex border-b border-gray-100">
          <button onClick={() => { setTab('todas'); setCatFilter('Todos') }}
            className={clsx('flex items-center gap-1.5 px-5 py-3 text-[0.78rem] font-semibold transition-colors',
              tab === 'todas' ? 'text-brand border-b-2 border-brand -mb-px' : 'text-gray-400 hover:text-gray-600')}>
            <Newspaper className="h-3.5 w-3.5" /> Todas
          </button>
          {canSeePlata && (
            <button onClick={() => { setTab('plata'); setCatFilter('Todos') }}
              className={clsx('flex items-center gap-1.5 px-5 py-3 text-[0.78rem] font-semibold transition-colors',
                tab === 'plata' ? 'text-yellow-600 border-b-2 border-yellow-500 -mb-px' : 'text-gray-400 hover:text-gray-600')}>
              <Award className="h-3.5 w-3.5" /> PLATA
            </button>
          )}
          <button onClick={() => setTab('miarea')}
            className={clsx('flex items-center gap-1.5 px-5 py-3 text-[0.78rem] font-semibold transition-colors',
              tab === 'miarea' ? 'text-brand border-b-2 border-brand -mb-px' : 'text-gray-400 hover:text-gray-600')}>
            <Users className="h-3.5 w-3.5" /> Mi Área
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, categoría o autor..."
              className="field py-2 pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {categorias.map((cat) => {
                const active = catFilter === cat
                const st = cat !== 'Todos' ? catStyle(cat) : null
                return (
                  <button
                    key={cat}
                    onClick={() => setCatFilter(cat)}
                    className={clsx(
                      'whitespace-nowrap rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-all',
                      active
                        ? st
                          ? clsx(st.bg, st.text, 'ring-1 ring-inset', st.ring)
                          : 'bg-brand text-white shadow-sm shadow-brand/20'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                    )}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>

            {/* Toggle vista */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 ml-1 flex-shrink-0">
              <button
                onClick={() => setView('grid')}
                className={clsx('flex h-6 w-6 items-center justify-center rounded-md transition-all', view === 'grid' ? 'bg-white shadow-sm text-brand' : 'text-gray-400 hover:text-gray-600')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setView('list')}
                className={clsx('flex h-6 w-6 items-center justify-center rounded-md transition-all', view === 'list' ? 'bg-white shadow-sm text-brand' : 'text-gray-400 hover:text-gray-600')}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Mi Área ── */}
      {tab === 'miarea' && (
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-brand" />
            <h3 className="text-[0.9rem] font-bold text-gray-900">Directorio de colaboradores</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Consulta el directorio completo de tu organización.
          </p>
          <a href="/organigrama"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark transition-colors">
            <Users className="h-4 w-4" /> Ver directorio completo
          </a>
        </div>
      )}

      {/* ── Encuestas activas en noticias ── */}
      <EncuestasEnNoticias />

      {/* ── Badge PLATA ── */}
      {tab === 'plata' && noticiasPlata.length === 0 && !isLoading && (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <Award className="h-10 w-10 text-yellow-400" />
          <p className="text-sm font-semibold text-gray-700">Sin noticias PLATA</p>
          <p className="text-xs text-gray-400">Las noticias con categoría PLATA aparecerán aquí</p>
        </div>
      )}

      {/* ── Contenido ── */}
      {tab !== 'miarea' && isLoading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonList key={i} />)}
          </div>
        )
      ) : tab !== 'miarea' && filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <Newspaper className="h-7 w-7 text-brand/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin publicaciones</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {(search || catFilter !== 'Todos')
                ? 'No hay noticias que coincidan con tu búsqueda'
                : 'No hay noticias publicadas aún'}
            </p>
          </div>
          {(search || catFilter !== 'Todos') && (
            <button
              onClick={() => { setSearch(''); setCatFilter('Todos') }}
              className="text-xs font-medium text-brand hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : tab !== 'miarea' ? (
        <div className="space-y-4">
          {/* Contador */}
          <p className="text-[0.72rem] text-gray-400">
            {filtered.length === noticias.length
              ? `${noticias.length} publicaciones`
              : `${filtered.length} de ${noticias.length} publicaciones`}
          </p>

          {/* Carrusel de noticias destacadas */}
          {showCarousel_ && (
            <HeroCarousel items={destacadas} onOpen={setSelected} size="large" />
          )}

          {/* Grid o lista */}
          {view === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {restantes.map((n, i) => (
                <div key={n.id} className="relative group/admin">
                  <NoticiaCard noticia={n} onOpen={setSelected} index={i} />
                  {isAdmin && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/admin:opacity-100 transition-opacity z-10"
                      onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditando(n)} title="Editar"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-brand transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => destacadaMut.mutate({ id: n.id, val: !n.destacada })} title={n.destacada ? 'Quitar destacada' : 'Destacar'}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-yellow-500 transition-colors">
                        {n.destacada ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => activoMut.mutate(n.id)} title={n.activo ? 'Desactivar' : 'Activar'}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-brand transition-colors">
                        {n.activo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <div className="w-1" />
                      <button onClick={() => setConfirmEliminar(n.id)} title="Eliminar noticia"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {restantes.map((n, i) => (
                <div key={n.id} className="relative group/admin">
                  <NoticiaRow noticia={n} onOpen={setSelected} index={i} />
                  {isAdmin && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/admin:opacity-100 transition-opacity z-10"
                      onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditando(n)} title="Editar"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-brand transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => destacadaMut.mutate({ id: n.id, val: !n.destacada })} title={n.destacada ? 'Quitar destacada' : 'Destacar'}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-yellow-500 transition-colors">
                        {n.destacada ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => activoMut.mutate(n.id)} title={n.activo ? 'Desactivar' : 'Activar'}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-brand transition-colors">
                        {n.activo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <div className="w-1" />
                      <button onClick={() => setConfirmEliminar(n.id)} title="Eliminar noticia"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow text-gray-500 hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {selected  && (
        <NoticiaDetalle
          noticia={noticias.find((n) => n.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
        />
      )}
      {showCrear && <NoticiaFormModal onClose={() => setShowCrear(false)} />}
      {editando  && <NoticiaFormModal noticia={editando} onClose={() => setEditando(null)} />}
      <CarouselManagerModal isOpen={showCarousel} onClose={() => setShowCarousel(false)} />
      <CollageLayoutModal   isOpen={showCollage}  onClose={() => setShowCollage(false)} onNuevaNoticia={() => { setShowCollage(false); setShowCrear(true) }} />

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar !== null) eliminarMut.mutate(confirmEliminar) }}
        title="Eliminar noticia"
        message="¿Seguro que deseas eliminar esta noticia? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
