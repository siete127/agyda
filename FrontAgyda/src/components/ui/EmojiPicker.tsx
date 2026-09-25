import { useState, useMemo, useRef, useEffect, type RefObject } from 'react'
import { Search, Smile, Hand, PawPrint, Pizza, Volleyball, Plane, Lightbulb, Heart, Flag, Clock, X } from 'lucide-react'
import { clsx } from 'clsx'

// Catálogo completo de Unicode con nombres y palabras clave en español
// (emojibase-data). Se descarga aparte la primera vez que se abre el selector.
interface EmojiDato {
  emoji: string
  label: string
  tags?: string[]
  group?: number
  version: number
  skins?: { emoji: string; tone?: number | number[] }[]
}

interface Item {
  emoji: string
  nombre: string
  busqueda: string // nombre + palabras clave, sin acentos
  grupo: number
  tonos?: Record<number, string>
}

// Hasta Emoji 15: lo que Windows 10/11, Android e iOS ya dibujan. Los más
// nuevos saldrían como cuadritos en muchos equipos.
const VERSION_MAX = 15

const CATEGORIAS: { grupo: number; nombre: string; icon: typeof Smile }[] = [
  { grupo: 0, nombre: 'Caritas y emociones', icon: Smile },
  { grupo: 1, nombre: 'Personas y cuerpo', icon: Hand },
  { grupo: 3, nombre: 'Animales y naturaleza', icon: PawPrint },
  { grupo: 4, nombre: 'Comida y bebida', icon: Pizza },
  { grupo: 5, nombre: 'Viajes y lugares', icon: Plane },
  { grupo: 6, nombre: 'Actividades', icon: Volleyball },
  { grupo: 7, nombre: 'Objetos', icon: Lightbulb },
  { grupo: 8, nombre: 'Símbolos', icon: Heart },
  { grupo: 9, nombre: 'Banderas', icon: Flag },
]
const RECIENTES = -1

// Tonos de piel: 0 = amarillo (sin tono).
const TONOS = [
  { tono: 0, muestra: '✋' },
  { tono: 1, muestra: '✋🏻' },
  { tono: 2, muestra: '✋🏼' },
  { tono: 3, muestra: '✋🏽' },
  { tono: 4, muestra: '✋🏾' },
  { tono: 5, muestra: '✋🏿' },
]

// Sin acentos (NFD + quitar marcas): 'baño' encuentra 'bano' y al revés.
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

let catalogoPromesa: Promise<Item[]> | null = null
function cargarCatalogo(): Promise<Item[]> {
  catalogoPromesa ??= import('emojibase-data/es/data.json')
    .then((m) => (m.default as unknown as EmojiDato[])
      .filter((e) => e.group !== undefined && e.group !== 2 && e.version <= VERSION_MAX)
      .map((e) => {
        const tonos: Record<number, string> = {}
        for (const s of e.skins ?? []) if (typeof s.tone === 'number') tonos[s.tone] = s.emoji
        return {
          emoji: e.emoji,
          nombre: e.label,
          busqueda: normalizar([e.label, ...(e.tags ?? [])].join(' ')),
          grupo: e.group as number,
          tonos: Object.keys(tonos).length ? tonos : undefined,
        }
      }))
    .catch((err) => { catalogoPromesa = null; throw err })
  return catalogoPromesa
}

// Preferencias del selector en este navegador (recientes y tono). Si el
// almacenamiento no está disponible, simplemente no se recuerdan.
const LS_RECIENTES = 'agyda.emojis.recientes'
const LS_TONO = 'agyda.emojis.tono'
function leerLS<T>(clave: string, def: T): T {
  try { const v = localStorage.getItem(clave); return v ? (JSON.parse(v) as T) : def } catch { return def }
}
function guardarLS(clave: string, valor: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento */ }
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  className?: string
  /** Botón que abre el selector: un clic ahí no cuenta como "clic afuera". */
  anchorRef?: RefObject<HTMLElement | null>
}

export function EmojiPicker({ onSelect, onClose, className, anchorRef }: EmojiPickerProps) {
  const [catalogo, setCatalogo] = useState<Item[] | null>(null)
  const [error, setError] = useState(false)
  const [recientes, setRecientes] = useState<string[]>(() => leerLS<string[]>(LS_RECIENTES, []))
  const [categoria, setCategoria] = useState<number>(() => (recientes.length ? RECIENTES : 0))
  const [tono, setTono] = useState<number>(() => leerLS<number>(LS_TONO, 0))
  const [busqueda, setBusqueda] = useState('')
  const [hover, setHover] = useState<Item | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    cargarCatalogo().then((c) => { if (vivo) setCatalogo(c) }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef?.current?.contains(t)) return
      if (containerRef.current && !containerRef.current.contains(t)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const conTono = (it: Item) => (tono && it.tonos?.[tono]) || it.emoji

  const visibles = useMemo<Item[]>(() => {
    if (!catalogo) return []
    const q = normalizar(busqueda.trim())
    if (q) {
      const palabras = q.split(/\s+/)
      const hallados = catalogo.filter((it) => palabras.every((p) => it.busqueda.includes(p)))
      // Primero los que empiezan con lo buscado en el nombre.
      return hallados.sort((a, b) => Number(!normalizar(a.nombre).startsWith(q)) - Number(!normalizar(b.nombre).startsWith(q)))
    }
    if (categoria === RECIENTES) {
      const porEmoji = new Map(catalogo.map((it) => [it.emoji, it]))
      return recientes.map((e) => porEmoji.get(e) ?? { emoji: e, nombre: '', busqueda: '', grupo: RECIENTES })
    }
    return catalogo.filter((it) => it.grupo === categoria)
  }, [catalogo, busqueda, categoria, recientes])

  const elegir = (it: Item) => {
    const emoji = conTono(it)
    const nuevos = [it.emoji, ...recientes.filter((e) => e !== it.emoji)].slice(0, 32)
    setRecientes(nuevos)
    guardarLS(LS_RECIENTES, nuevos)
    onSelect(emoji)
  }

  const cambiarTono = (t: number) => { setTono(t); guardarLS(LS_TONO, t) }
  const buscando = busqueda.trim().length > 0
  const tituloCategoria = categoria === RECIENTES ? 'Recientes' : CATEGORIAS.find((c) => c.grupo === categoria)?.nombre

  return (
    <div
      ref={containerRef}
      className={clsx('w-80 rounded-2xl border border-gray-200 bg-card shadow-xl overflow-hidden flex flex-col', className)}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar: café, baño, reloj, feliz…"
            className="w-full rounded-lg border border-gray-200 pl-8 pr-7 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/20"
          />
          {buscando && (
            <button type="button" onClick={() => setBusqueda('')} title="Limpiar"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {!buscando && (
        <div className="flex items-center gap-0.5 border-b border-gray-100 px-1.5 py-1.5 overflow-x-auto">
          {[{ grupo: RECIENTES, nombre: 'Recientes', icon: Clock }, ...CATEGORIAS].map((c) => {
            const Icon = c.icon
            if (c.grupo === RECIENTES && !recientes.length) return null
            return (
              <button
                key={c.grupo}
                type="button"
                onClick={() => setCategoria(c.grupo)}
                title={c.nombre}
                className={clsx(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                  categoria === c.grupo ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:bg-gray-100',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>
      )}

      <p className="px-3 pt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400">
        {buscando ? `${visibles.length} resultado${visibles.length === 1 ? '' : 's'}` : tituloCategoria}
      </p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-0.5 p-2 h-56 overflow-y-auto content-start">
        {error ? (
          <p className="col-span-full py-8 text-center text-xs text-gray-400">No se pudo cargar el catálogo de emojis.</p>
        ) : !catalogo ? (
          <p className="col-span-full py-8 text-center text-xs text-gray-400">Cargando emojis…</p>
        ) : visibles.length === 0 ? (
          <p className="col-span-full py-8 text-center text-xs text-gray-400">Sin resultados para «{busqueda}»</p>
        ) : visibles.map((it, i) => (
          <button
            key={`${it.emoji}-${i}`}
            type="button"
            onClick={() => elegir(it)}
            onMouseEnter={() => setHover(it)}
            title={it.nombre}
            className="flex h-8 items-center justify-center rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            {conTono(it)}
          </button>
        ))}
      </div>

      <div className="flex h-9 items-center gap-2 border-t border-gray-100 pl-3 pr-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {hover ? (
            <>
              <span className="text-lg leading-none">{conTono(hover)}</span>
              <span className="truncate text-[0.7rem] text-gray-600 first-letter:uppercase">{hover.nombre}</span>
            </>
          ) : (
            <span className="text-[0.7rem] text-gray-400">{catalogo ? `${catalogo.length} emojis` : ''}</span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center" title="Tono de piel">
          {TONOS.map((t) => (
            <button key={t.tono} type="button" onClick={() => cambiarTono(t.tono)}
              className={clsx('flex h-6 w-6 items-center justify-center rounded-md text-xs transition-colors',
                tono === t.tono ? 'bg-brand/10 ring-1 ring-brand/40' : 'hover:bg-gray-100')}>
              {t.muestra}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
