import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'warning'
  isPending?: boolean
  /** Eleva el diálogo cuando se abre desde dentro de otro Modal */
  elevated?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  isPending = false,
  elevated = false,
}: ConfirmDialogProps) {
  const confirmCls = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 border-red-600'
    : 'bg-yellow-500 hover:bg-yellow-600 border-yellow-500'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" elevated={elevated}>
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button
            isLoading={isPending}
            onClick={() => { onConfirm(); onClose() }}
            className={confirmCls}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
