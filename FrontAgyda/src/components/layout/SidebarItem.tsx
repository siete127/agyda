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
  // 'lg': mismo tamaño que los accesos de nivel raíz (grupos/acordeones) —
  // usado para grupos "sueltos" como Inicio/Noticias/Mensajería. Default
  // ('sm'): tamaño compacto de subitem dentro de un acordeón desplegado.
  size?: 'sm' | 'lg'
}

export function SidebarItem({ to, label, icon, isCollapsed, badge, onClick, size = 'sm' }: SidebarItemProps) {
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
        'group relative flex w-full items-center gap-3 rounded-full text-sm font-semibold',
        'transition-colors select-none outline-none',
        isCollapsed ? 'justify-center px-0' : 'px-4',
        isCollapsed ? (size === 'lg' ? 'py-3.5' : 'py-3') : (size === 'lg' ? 'py-3.5' : 'py-2.5'),
        isActive
          ? 'bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md'
          : 'text-white/70 hover:bg-white/10 hover:text-white',
      )}
    >
      {/* Tooltip en modo colapsado */}
      {isCollapsed && (
        <span className="pointer-events-none absolute left-full ml-3 z-50 hidden rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg whitespace-nowrap group-hover:block border border-white/10">
          {label}
        </span>
      )}

      {/* Ícono */}
      <IconComponent className={clsx(
        'flex-shrink-0',
        isCollapsed
          ? (size === 'lg' ? 'h-5 w-5' : 'h-[1.05rem] w-[1.05rem]')
          : (size === 'lg' ? 'h-[1.1rem] w-[1.1rem]' : 'h-[0.95rem] w-[0.95rem]'),
      )} />

      {/* Etiqueta + badge */}
      {!isCollapsed && (
        <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
          <span className="truncate leading-none">
            {label}
          </span>
          {!!badge && badge > 0 && (
            <span className={clsx(
              'flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none',
              isActive ? 'bg-white/90 text-[#00537f]' : 'bg-brand text-white',
            )}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
      )}

      {/* Badge en modo colapsado — punto */}
      {isCollapsed && !!badge && badge > 0 && (
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand border-2 border-[#0a2f71]" />
      )}
    </button>
  )
}
