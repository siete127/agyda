import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import { PortalClienteSidebar } from '@/pages/portal-cliente/components/PortalClienteSidebar'
import { PortalClienteHeader } from '@/pages/portal-cliente/components/PortalClienteHeader'

/**
 * Layout del Portal de Cliente — deliberadamente independiente de AppLayout
 * (el layout del panel interno de AGYDA). No comparte Sidebar/Topbar/estilos
 * con el resto de la intranet: es una experiencia aparte para el rol CL,
 * aunque reutiliza el mismo login/auth/backend.
 */
export function PortalClienteLayout() {
  // Animación de entrada: sidebar y contenido arrancan fuera de pantalla
  // (izquierda/derecha) y se deslizan a su posición final al montar. El
  // cambio de estado se agenda en el siguiente frame para que el navegador
  // pinte primero el estado inicial (fuera de pantalla) — si `entered`
  // arrancara en `true`, no habría transición, solo aparecerían ya en su
  // lugar.
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    // h-screen (no min-h-screen) + overflow-hidden: el contenido del
    // dashboard (main) puede ser mucho más alto que la pantalla. Con
    // min-h-screen la fila crecía hasta ese alto y "estiraba" también al
    // <aside> (align-items: stretch por defecto), corriendo su footer
    // fuera de vista y obligando a scrollear TODA la página. Con h-screen
    // la fila queda fija al viewport, y min-h-0 en la columna derecha deja
    // que sea el <main> (con su propio overflow-y-auto) el que scrollee
    // internamente — el sidebar se mantiene siempre fijo y completo.
    <div className="flex h-screen overflow-hidden bg-surface">
      <PortalClienteSidebar
        className={clsx(
          'transition-[transform,opacity] duration-500 ease-out',
          entered ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        )}
      />
      <div
        className={clsx(
          'flex min-h-0 min-w-0 flex-1 flex-col transition-[transform,opacity] duration-500 ease-out',
          entered ? 'translate-x-0 opacity-100' : 'translate-x-16 opacity-0'
        )}
      >
        <PortalClienteHeader />
        {/* El <header> vive fuera de este <main> (es su hermano arriba, no
           un hijo) — por eso ya se queda fijo arriba sin moverse al
           scrollear: solo el <main> tiene overflow-y-auto y scrollea su
           propio contenido, el header nunca entra en esa zona. */}
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
