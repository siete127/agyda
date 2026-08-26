import { useNavigate, useLocation } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { clsx } from 'clsx'
import { useWebphoneStore } from '@/stores/webphone.store'

interface SidebarItemProps {
  to: string
  label: string
  icon: string
  isCollapsed: boolean
  badge?: number
  onClick?: () => void
}

export function SidebarItem({ to, label, icon, isCollapsed, badge, onClick }: SidebarItemProps) {
  const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[icon] ?? Icons.Circle
  const navigate  = useNavigate()
  const location  = useLocation()
  const isActive  = location.pathname === to || location.pathname.startsWith(to + '/')
  const onNavigateAway = useWebphoneStore((s) => s.onNavigateAway)

  const handleClick = (e: React.MouseEvent) => {
    // Bloquear clic medio o modificadores que abrirían nueva pestaña
    e.preventDefault()
    // Si hay un Webphone activo y navegamos a OTRO módulo, se abre la ventana
    // flotante en el mismo click (único momento con gesto de usuario válido
    // para la Document Picture-in-Picture API) — antes de cambiar de ruta.
    if (to !== location.pathname) onNavigateAway?.()
    onClick?.()
    navigate(to)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={clsx(
        'group relative flex w-full items-center gap-3 rounded-xl text-[0.85rem] font-medium',
        'transition-all duration-150 select-none outline-none',
        isCollapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5',
        isActive
          ? 'text-brand-muted'
          : 'text-[#B8C2E0] hover:bg-white/[0.05] hover:text-[#DCE3F5]',
      )}
      style={isActive ? { backgroundColor: 'rgba(47,111,237,0.16)' } : undefined}
    >
      {/* Tooltip en modo colapsado */}
      {isCollapsed && (
        <span className="pointer-events-none absolute left-full ml-3 z-50 hidden rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg whitespace-nowrap group-hover:block border border-white/10">
          {label}
        </span>
      )}

      {/* Ícono */}
      <span className={clsx(
        'flex flex-shrink-0 items-center justify-center rounded-lg transition-all duration-150',
        isCollapsed ? 'h-8 w-8' : 'h-7 w-7',
        isActive
          ? 'text-brand-muted'
          : 'text-[#8B96A8] group-hover:text-[#C5CDD8] group-hover:bg-white/[0.04]',
      )}>
        <IconComponent className={clsx(
          'transition-colors',
          isCollapsed ? 'h-[1.05rem] w-[1.05rem]' : 'h-[0.95rem] w-[0.95rem]',
        )} />
      </span>

      {/* Etiqueta + badge */}
      {!isCollapsed && (
        <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
          <span className={clsx('truncate leading-none', isActive ? 'text-brand-muted' : '')}>
            {label}
          </span>
          {!!badge && badge > 0 && (
            <span className="flex-shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[0.6rem] font-bold text-white leading-none">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
      )}

      {/* Badge en modo colapsado — punto */}
      {isCollapsed && !!badge && badge > 0 && (
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand border-2 border-[#0B1730]" />
      )}
    </button>
  )
}
