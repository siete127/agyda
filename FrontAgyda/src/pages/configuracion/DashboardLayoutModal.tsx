import { useMemo, useState } from 'react'
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { X, GripVertical, EyeOff, RotateCcw, Check, Move } from 'lucide-react'
import { clsx } from 'clsx'
import type { DashboardCard } from '@/services/personalizacion.service'
import { CARD_CATALOG_INDEX } from '@/pages/dashboard/cardCatalog'
import { DASHBOARD_DEFAULT } from '@/providers/personalizacion.context'

const ROW_H = 40
const COLS = 12

/* Editor de tamaño/orden embebido en un modal — mismo ancho que el panel de
   Configuración. Trabaja sobre un borrador de DashboardCard[] y devuelve el
   resultado al cerrar con "Aplicar". No renderiza las cards reales: usa
   previews ligeros (icono + título) para no disparar 13 fetches. */
export function DashboardLayoutModal({
  cards, onAplicar, onClose,
}: {
  cards: DashboardCard[]
  onAplicar: (cards: DashboardCard[]) => void
  onClose: () => void
}) {
  const { width, containerRef } = useContainerWidth()
  const [draft, setDraft] = useState<DashboardCard[]>(() => cards.map((c) => ({ ...c })))

  const visibles = useMemo(
    () => draft.filter((c) => c.visible && CARD_CATALOG_INDEX[c.id]),
    [draft],
  )
  const ocultas = useMemo(
    () => draft.filter((c) => !c.visible && CARD_CATALOG_INDEX[c.id]),
    [draft],
  )

  const layout: Layout = useMemo(
    () => visibles.map((c) => ({ i: c.id, x: c.x, y: c.y, w: c.w, h: c.h, minW: 2, minH: 1 })),
    [visibles],
  )

  const onLayoutChange = (l: Layout) => {
    setDraft((prev) => prev.map((c) => {
      const it = l.find((x) => x.i === c.id)
      return it ? { ...c, x: it.x, y: it.y, w: it.w, h: it.h } : c
    }))
  }

  const setVisible = (id: string, visible: boolean) =>
    setDraft((prev) => {
      const exists = prev.some((c) => c.id === id)
      if (exists) return prev.map((c) => (c.id === id ? { ...c, visible } : c))
      const cat = CARD_CATALOG_INDEX[id]
      const maxY = prev.reduce((m, c) => Math.max(m, c.y + c.h), 0)
      return [...prev, { id, x: 0, y: maxY, w: cat?.size.w ?? 4, h: cat?.size.h ?? 3, visible }]
    })

  const restablecer = () => setDraft(DASHBOARD_DEFAULT.map((c) => ({ ...c })))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-4 w-full max-w-5xl rounded-2xl border border-gray-200 bg-card shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Move className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[0.98rem] font-bold text-gray-900">Ajustar diseño del inicio</h3>
            <p className="text-[0.75rem] text-gray-400">
              Arrastra la barra superior para mover · tira de la esquina inferior derecha para
              redimensionar.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tarjetas ocultas — pulsa para agregar de vuelta */}
        {ocultas.length > 0 && (
          <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3">
            <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">
              Ocultas — pulsa para colocar
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ocultas.map((c) => {
                const cat = CARD_CATALOG_INDEX[c.id]
                return (
                  <button
                    key={c.id}
                    onClick={() => setVisible(c.id, true)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-600 transition-colors hover:border-violet-300 hover:text-violet-600"
                  >
                    {cat && <cat.Icon className="h-3 w-3" />} {cat?.titulo ?? c.id}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Lienzo de la grilla */}
        <div ref={containerRef} className="max-h-[62vh] overflow-y-auto bg-gray-50/40 p-4">
          {visibles.length === 0 ? (
            <p className="py-16 text-center text-[0.8rem] text-gray-400">
              No hay tarjetas colocadas. Agrégalas desde la lista de arriba o cierra y elige
              tarjetas en el catálogo.
            </p>
          ) : width > 0 ? (
            <GridLayout
              width={width}
              layout={layout}
              onLayoutChange={onLayoutChange}
              gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [10, 10], containerPadding: [0, 0] }}
              dragConfig={{ enabled: true, bounded: false, handle: '.dlm-drag', threshold: 3 }}
              resizeConfig={{ enabled: true, handles: ['se'] }}
            >
              {visibles.map((c) => {
                const cat = CARD_CATALOG_INDEX[c.id]
                return (
                  <div key={c.id} className="overflow-hidden rounded-xl border border-violet-200 bg-card shadow-sm">
                    <div className="dlm-drag flex cursor-move items-center gap-1.5 bg-violet-500 px-2.5 py-1 text-[0.66rem] font-semibold text-white">
                      <GripVertical className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{cat?.titulo ?? c.id}</span>
                      <button
                        onClick={() => setVisible(c.id, false)}
                        className="ml-auto flex-shrink-0 rounded p-0.5 hover:bg-white/20"
                        title="Quitar del inicio"
                      >
                        <EyeOff className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex h-[calc(100%-1.5rem)] flex-col items-center justify-center gap-1.5 p-2 text-center">
                      {cat && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
                          <cat.Icon className="h-4 w-4" />
                        </div>
                      )}
                      <p className="text-[0.66rem] font-semibold leading-tight text-gray-500">
                        {cat?.titulo ?? c.id}
                      </p>
                      <span className="text-[0.6rem] text-gray-300">{c.w}×{c.h}</span>
                    </div>
                  </div>
                )
              })}
            </GridLayout>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3.5">
          <button
            onClick={restablecer}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.78rem] font-semibold text-gray-500 transition-colors hover:bg-gray-100"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Distribución por defecto
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-3.5 py-2 text-[0.78rem] font-semibold text-gray-500 transition-colors hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={() => { onAplicar(draft); onClose() }}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-[0.78rem] font-semibold text-white shadow-sm transition-all hover:bg-violet-700',
              )}
            >
              <Check className="h-3.5 w-3.5" /> Aplicar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
