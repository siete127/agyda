import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Smile, Hand, PawPrint, Pizza, Volleyball, Plane, Lightbulb, Heart } from 'lucide-react'
import { clsx } from 'clsx'

interface Categoria {
  id: string
  nombre: string
  icon: typeof Smile
  emojis: string[]
}

const CATEGORIAS: Categoria[] = [
  {
    id: 'caritas', nombre: 'Caritas', icon: Smile,
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠'],
  },
  {
    id: 'gestos', nombre: 'Gestos y personas', icon: Hand,
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵'],
  },
  {
    id: 'animales', nombre: 'Animales y naturaleza', icon: PawPrint,
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦏','🐫','🐪','🦒','🐃','🐂','🐄','🐎','🐖','🐑','🐐','🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🍁','🍂','🍃'],
  },
  {
    id: 'comida', nombre: 'Comida y bebida', icon: Pizza,
    emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹'],
  },
  {
    id: 'actividades', nombre: 'Actividades', icon: Volleyball,
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','🤺','⛹️','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰'],
  },
  {
    id: 'viajes', nombre: 'Viajes y lugares', icon: Plane,
    emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🪝','⛽','🚧','🚦','🚥','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏘️','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🕋'],
  },
  {
    id: 'objetos', nombre: 'Objetos', icon: Lightbulb,
    emojis: ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🕹️','💽','💾','💿','📀','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','🧾','💎','⚖️','🪜','🧰','🔧','🔨','⚒️','🛠️','⛏️','🪓','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪃','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','🔭','🔬','🕳️','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧴','🧷','🧵','🧶','🪡','🪢'],
  },
  {
    id: 'simbolos', nombre: 'Símbolos y banderas', icon: Heart,
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏁','🚩','🎌','🏴','🏳️','🇲🇽','🇺🇸'],
  },
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  className?: string
}

export function EmojiPicker({ onSelect, onClose, className }: EmojiPickerProps) {
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0].id)
  const [busqueda, setBusqueda] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const emojisVisibles = useMemo(() => {
    if (busqueda.trim()) {
      return CATEGORIAS.flatMap((c) => c.emojis).filter((_, i) => i < 200)
    }
    return CATEGORIAS.find((c) => c.id === categoriaActiva)?.emojis ?? []
  }, [categoriaActiva, busqueda])

  return (
    <div
      ref={containerRef}
      className={clsx('w-80 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden flex flex-col', className)}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar categoría..."
            className="w-full rounded-lg border border-gray-200 pl-8 pr-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>

      {!busqueda.trim() && (
        <div className="flex items-center gap-0.5 border-b border-gray-100 px-1.5 py-1.5 overflow-x-auto">
          {CATEGORIAS.map((c) => {
            const Icon = c.icon
            return (
              <button
                key={c.id}
                onClick={() => setCategoriaActiva(c.id)}
                title={c.nombre}
                className={clsx(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                  categoriaActiva === c.id ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:bg-gray-100',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>
      )}

      {!busqueda.trim() && (
        <p className="px-3 pt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400">
          {CATEGORIAS.find((c) => c.id === categoriaActiva)?.nombre}
        </p>
      )}

      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-56 overflow-y-auto">
        {emojisVisibles.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
