import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

interface RoleRouteProps {
  allowedRoles: string[]
}

export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const user = useAuthStore((s) => s.user)
  const tipo = user?.tipoUsuario?.toUpperCase() ?? ''

  if (allowedRoles.length > 0 && !allowedRoles.includes(tipo)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
