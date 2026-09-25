import { Navigate, Outlet } from 'react-router-dom'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Spinner } from '@/components/ui/Spinner'
import { puedeVerModulo } from './accionVer'

interface Props {
  moduleKey: string
}

export function ModuleRoute({ moduleKey }: Props) {
  const { isLoading, isAllowed } = useModuleAccess()
  const { isLoading: cargandoAcciones, can } = useActionAccess()
  if (isLoading || cargandoAcciones) return (
    <div className="flex h-full items-center justify-center min-h-[40vh]">
      <Spinner size="lg" />
    </div>
  )
  if (!isAllowed(moduleKey) || !puedeVerModulo(moduleKey, can)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
