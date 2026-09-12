import { useEffect, useRef, useState } from 'react'
import { Settings2, Check } from 'lucide-react'
import { clsx } from 'clsx'

// Selector de columnas visibles (Fase 3, 3.6 del plan basado en PSUP) —
// dropdown de checkboxes reutilizable para cualquier tabla del módulo
// Supervisor que use useColumnasVisibles.
export function SelectorColumnas({
  columnas, visibles, onToggle,
}: {
  columnas: { key: string; label: string }[]
  visibles: string[]
  onToggle: (key: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Settings2 className="h-3.5 w-3.5" /> Columnas
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
          {columnas.map((c) => {
            const activa = visibles.includes(c.key)
            return (
              <button
                key={c.key}
                onClick={() => onToggle(c.key)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <span className={clsx('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', activa ? 'border-brand bg-brand text-white' : 'border-gray-300')}>
                  {activa && <Check className="h-3 w-3" />}
                </span>
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
