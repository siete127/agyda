import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  ClienteExpediente, EXPEDIENTE_TAB_KEYS, EXPEDIENTE_SUB_DEFAULT, EXPEDIENTE_SUB_VALIDAS,
  type ExpedienteTab,
} from './ClienteExpediente'

// Panel lateral con el expediente del cliente — se abre desde la pestaña
// "Clientes" del módulo "Seguimiento de clientes" sin perder la lista detrás.
// Estado del expediente en la URL con prefijo `exp` para no chocar con el
// `tab` del shell: ?tab=clientes&id=5&exp=casos-pagos&sub=casos
export function ClienteDrawer({ contactoId, expParam, subParam, onExp, onSub, onClose }: {
  contactoId: number
  expParam: string | null
  subParam: string | null
  onExp: (t: ExpedienteTab) => void
  onSub: (s: string) => void
  onClose: () => void
}) {
  const [entrado, setEntrado] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setEntrado(true), 10)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const tab: ExpedienteTab = EXPEDIENTE_TAB_KEYS.includes(expParam as ExpedienteTab)
    ? (expParam as ExpedienteTab) : 'datos'
  const subGrupo = (tab === 'seguimiento' || tab === 'casos-pagos') ? tab : null
  const sub = subGrupo && subParam && EXPEDIENTE_SUB_VALIDAS[subGrupo].includes(subParam)
    ? subParam
    : subGrupo ? EXPEDIENTE_SUB_DEFAULT[subGrupo] : ''

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${entrado ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-3xl bg-gray-50 shadow-2xl transition-transform duration-300 ${entrado ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-card px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-500 uppercase tracking-wide">Expediente del cliente</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100%-49px)] overflow-y-auto p-4">
          <ClienteExpediente
            contactoId={contactoId}
            tab={tab}
            sub={sub}
            onTab={onExp}
            onSub={onSub}
            compact
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
