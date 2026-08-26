import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Variante de color del header */
  variant?: 'default' | 'corporate'
  /** Eleva el modal sobre otro ya abierto (diálogos anidados) */
  elevated?: boolean
}

const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/* Conteo de modales abiertos: con modales anidados (p. ej. un ConfirmDialog
   dentro de otro Modal), el que se cierra primero no debe liberar el scroll
   del body mientras el de abajo siga abierto. */
let openModalCount = 0

function lockBodyScroll() {
  openModalCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1)
  if (openModalCount === 0) document.body.style.overflow = ''
}

export function Modal({ isOpen, onClose, title, children, size = 'md', variant = 'default', elevated = false }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    lockBodyScroll()

    return () => {
      document.removeEventListener('keydown', handler)
      unlockBodyScroll()
    }
  }, [isOpen, onClose])

  const isCorporate = variant === 'corporate'

  // Siempre montado en el DOM — solo display cambia. Evita insertBefore/removeChild de React.
  return createPortal(
    <div
      className={clsx('fixed inset-0 flex items-center justify-center p-4', elevated ? 'z-[70]' : 'z-[60]')}
      style={{ display: isOpen ? 'flex' : 'none' }}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={clsx(
        'relative w-full rounded-2xl bg-white shadow-2xl border border-gray-100/50 overflow-hidden animate-slide-up flex flex-col max-h-[90vh]',
        sizeClasses[size],
      )}>
        {/* Header */}
        <div
          className={clsx(
            'flex items-center justify-between px-5 py-4',
            isCorporate ? 'bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8]' : 'border-b border-gray-100',
          )}
          style={{ display: title ? 'flex' : 'none' }}
        >
          <h2 className={clsx('text-sm font-semibold', isCorporate ? 'text-white' : 'text-gray-900')}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
              isCorporate ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
