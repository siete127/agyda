import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export interface OpcionAlcance {
  key: string
  label: string
  impacto: string // qué cambia en ese módulo si se aplica ahí
  valorActual?: string // cómo está hoy en ese módulo, para comparar
}

// Al guardar una configuración que comparten varios módulos: se elige a cuáles
// aplica el cambio (solo este, algunos o todos), viendo el impacto en cada uno.
// Montar solo mientras está abierto, para que la selección arranque limpia.
export function AlcanceCambioModal({ titulo, descripcion, opciones, actual, preseleccion, pending, onConfirm, onClose }: {
  titulo: string
  descripcion?: string
  opciones: OpcionAlcance[]
  actual?: string | null // key del módulo desde el que se edita
  preseleccion?: string[] // por defecto, solo `actual`
  pending?: boolean
  onConfirm: (keys: string[]) => void
  onClose: () => void
}) {
  const [seleccion, setSeleccion] = useState<string[]>(preseleccion ?? (actual ? [actual] : []))
  const actualLabel = actual ? opciones.find((o) => o.key === actual)?.label : undefined

  const toggle = (key: string) =>
    setSeleccion((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))

  return (
    // elevated: puede abrirse encima del formulario que se está guardando.
    <Modal isOpen onClose={onClose} title={titulo} size="md" elevated>
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50/70 px-3 py-2.5">
          <Share2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-[0.78rem] text-amber-800">
            {descripcion ?? 'Esta configuración la comparten varios módulos. Elige a cuáles aplica el cambio; los que no marques conservan su valor actual.'}
          </p>
        </div>

        <div className="flex gap-2">
          {actual && actualLabel && (
            <button type="button" onClick={() => setSeleccion([actual])}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:border-gray-300">
              Solo {actualLabel}
            </button>
          )}
          <button type="button" onClick={() => setSeleccion(opciones.map((o) => o.key))}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:border-gray-300">
            Todos
          </button>
        </div>

        <div className="space-y-2">
          {opciones.map((o) => {
            const marcado = seleccion.includes(o.key)
            return (
              <label key={o.key}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                  marcado ? 'border-violet-300 bg-violet-50/50' : 'border-gray-100',
                )}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600"
                  checked={marcado} onChange={() => toggle(o.key)} />
                <div className="min-w-0 text-[0.78rem]">
                  <p className="font-semibold text-gray-800">
                    {o.label}
                    {o.key === actual && <span className="ml-1.5 text-[0.65rem] font-medium text-violet-600">(este módulo)</span>}
                  </p>
                  <p className="text-gray-500">{o.impacto}</p>
                  {o.valorActual && <p className="mt-0.5 text-[0.7rem] text-gray-400">Hoy: {o.valorActual}</p>}
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(seleccion)} disabled={seleccion.length === 0} isLoading={pending}>
            Aplicar a {seleccion.length} {seleccion.length === 1 ? 'módulo' : 'módulos'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
