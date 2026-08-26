import { Navigate, Outlet } from 'react-router-dom'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  moduleKey: string
}

export function ModuleRoute({ moduleKey }: Props) {
  const { isLoading, isAllowed } = useModuleAccess()
  if (isLoading) return (
    <div className="flex h-full items-center justify-center min-h-[40vh]">
      <Spinner size="lg" />
    </div>
  )
  if (!isAllowed(moduleKey)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
