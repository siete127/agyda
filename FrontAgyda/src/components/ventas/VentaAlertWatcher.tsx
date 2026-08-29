import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useVentasWatcher } from '@/hooks/useVentasWatcher'
import { useVentasNotifStore, type VentaNotif } from '@/stores/ventasNotif.store'
import { playVentaSound, playRechazoSound } from '@/lib/ventaSounds'
import { VentaResumenModal } from './VentaResumenModal'
import type { Venta } from '@/types/ventas.types'

const ESTADO_ES_RECHAZO = (e: string) =>
  ['rechazada', 'declinado', 'cancelada'].includes(e.toLowerCase())

/* Headless: corre el watcher global de ventas y muestra un toast flotante
   (con sonido) por cada venta nueva. Al hacer click abre el resumen. */
export function VentaAlertWatcher() {
  useVentasWatcher()

  const items = useVentasNotifStore((s) => s.items)
  const marcarLeida = useVentasNotifStore((s) => s.marcarLeida)

  // Toasts en pantalla (los últimos no leídos, máx 3).
  const [toasts, setToasts] = useState<VentaNotif[]>([])
  const sonadosRef = useRef<Set<number>>(new Set())
  const [detalle, setDetalle] = useState<Venta | null>(null)

  useEffect(() => {
    const nuevos = items.filter((i) => !i.leida && !sonadosRef.current.has(i.id))
    if (nuevos.length === 0) return

    for (const n of nuevos) {
      sonadosRef.current.add(n.id)
      if (ESTADO_ES_RECHAZO(n.venta.estatus)) playRechazoSound()
      else playVentaSound()
    }
    setToasts((prev) => [...nuevos, ...prev].slice(0, 3))

    // Auto-descartar cada toast a los 12s.
    const timers = nuevos.map((n) =>
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), 12_000),
    )
    return () => timers.forEach(clearTimeout)
  }, [items])

  const cerrarToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    marcarLeida(id)
  }

  const abrirDetalle = (n: VentaNotif) => {
    setDetalle(n.venta)
    cerrarToast(n.id)
  }

  return createPortal(
    <>
      <div className="pointer-events-none fixed right-4 top-16 z-[9998] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((n) => {
          const rechazo = ESTADO_ES_RECHAZO(n.venta.estatus)
          const acento = rechazo ? '#EF4444' : '#10B981'
          return (
            <button
              key={n.id}
              onClick={() => abrirDetalle(n)}
              className="pointer-events-auto flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-gray-200 bg-card p-3 text-left shadow-2xl animate-slide-up hover:border-gray-300"
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ background: `${acento}18` }}
              >
                {rechazo ? '❌' : '💰'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.7rem] font-bold uppercase tracking-wider" style={{ color: acento }}>
                  {rechazo ? 'Venta rechazada' : 'Nueva venta'}
                </p>
                <p className="truncate text-[0.84rem] font-bold text-gray-900">
                  {n.venta.nombreAgente || 'Agente'}
                </p>
                <p className="truncate text-[0.72rem] text-gray-400">
                  {n.venta.nombreCliente || 'Cliente'} · {n.venta.telefonoCliente || 's/n'}
                </p>
                <p className="mt-0.5 text-[0.68rem] font-semibold text-brand">Ver resumen →</p>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); cerrarToast(n.id) }}
                className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-gray-100 hover:text-gray-500')}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </button>
          )
        })}
      </div>

      {detalle && <VentaResumenModal venta={detalle} onClose={() => setDetalle(null)} />}
    </>,
    document.body,
  )
}
