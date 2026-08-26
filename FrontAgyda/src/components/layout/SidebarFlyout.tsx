import { createElement, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import type { RouteConfig } from '@/router/routes.config'

export interface FlyoutPosition {
  top: number
  left: number
  maxHeight: number
}

interface SidebarFlyoutProps {
  groupLabel: string
  groupIcon: string
  routes: RouteConfig[]
  position: FlyoutPosition
  onClose: () => void
}

function resolveIcon(name: string) {
  return (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle
}

// createElement en vez de <Icon/> con Icon resuelto dinámicamente: el ícono viene
// de un lookup por nombre en runtime, no de una definición de componente distinta
// por render, pero JSX con un identificador variable no permite expresar eso.
function renderIcon(name: string, className?: string) {
  return createElement(resolveIcon(name), { className })
}

export function SidebarFlyout({ groupLabel, groupIcon, routes, position, onClose }: SidebarFlyoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const panelRef = useRef<HTMLDivElement>(null)

  // Cerrar con clic afuera del panel. El listener se adjunta en el siguiente tick
  // (no en el mismo pointerdown que abrió el flyout), para que el clic que lo abrió
  // no burbujee hasta document y lo cierre de inmediato.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onClose])

  // Cerrar con Escape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Cerrar al navegar (cambia la ruta activa) — se omite el primer render (montaje),
  // usando el pathname de apertura como referencia en vez de contar renders (evita
  // falsos positivos con el doble-render de StrictMode en desarrollo).
  const openedAtPathname = useRef(location.pathname)
  useEffect(() => {
    if (location.pathname === openedAtPathname.current) return
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const hasDescriptions = routes.some((r) => r.description)

  const handleNavigate = (path: string) => {
    navigate(path)
    onClose()
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      className={clsx(
        'flex animate-flyout-in flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] shadow-2xl',
        hasDescriptions ? 'w-[340px]' : 'w-[260px]',
      )}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        zIndex: 2147483647,
      }}
    >
      {/* Cabecera */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-white/10 px-3.5 py-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
          {renderIcon(groupIcon, 'h-4 w-4')}
        </span>
        <p className="text-sm font-bold text-white">{groupLabel}</p>
      </div>

      {/* Contenido */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {hasDescriptions ? (
          <div className="grid gap-1.5">
            {routes.map((route) => {
              const isActive = location.pathname === route.path
              return (
                <button
                  key={route.path}
                  role="menuitem"
                  onClick={() => handleNavigate(route.path)}
                  className={clsx(
                    'group flex items-start gap-2.5 rounded-xl border p-2 text-left transition-all',
                    isActive
                      ? 'border-white/20 bg-white/10'
                      : 'border-transparent hover:border-white/10 hover:bg-white/[0.06]',
                  )}
                >
                  <span className={clsx(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg',
                    isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-[#B8C2E0]',
                  )}>
                    {renderIcon(route.icon, 'h-3.5 w-3.5')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={clsx('text-[0.8rem] font-semibold', isActive ? 'text-white' : 'text-[#DCE3F5]')}>
                      {route.label}
                    </p>
                    {route.description && (
                      <p className="mt-0.5 truncate text-[0.7rem] text-[#8E9FD4]">{route.description}</p>
                    )}
                  </div>
                  <ArrowRight className={clsx(
                    'mt-0.5 h-3.5 w-3.5 flex-shrink-0 transition-transform',
                    isActive ? 'text-white' : 'text-[#6B79AD] group-hover:translate-x-0.5 group-hover:text-[#8E9FD4]',
                  )} />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {routes.map((route) => {
              const isActive = location.pathname === route.path
              return (
                <button
                  key={route.path}
                  role="menuitem"
                  onClick={() => handleNavigate(route.path)}
                  className="flex w-full items-center rounded-lg py-1 text-left text-[0.8rem] font-medium transition-colors hover:bg-white/[0.06]"
                >
                  <span className={clsx(
                    'inline-flex items-center gap-2.5 rounded-full px-2 py-1.5 transition-colors',
                    isActive ? 'bg-white/15 text-white' : 'text-[#DCE3F5]',
                  )}>
                    {renderIcon(route.icon, 'h-3.5 w-3.5 flex-shrink-0')}
                    {route.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
