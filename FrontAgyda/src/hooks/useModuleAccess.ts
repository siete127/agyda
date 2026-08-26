import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { accessService } from '@/services/access.service'
import { useIsAuthenticated } from './useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'

export function useModuleAccess() {
  const isAuthenticated = useIsAuthenticated()
  const userId = useAuthStore((s) => s.user?.id)
  const qc = useQueryClient()

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['accesos-self', userId],
    queryFn: () => accessService.getSelfModules(),
    enabled: isAuthenticated && !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })

  // Escuchar evento del backend cuando el admin cambia permisos de este usuario
  useEffect(() => {
    if (!isAuthenticated) return
    const socket = getSocket()
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['accesos-self', userId] })
    }
    socket.on('accesos-updated', handler)
    return () => { socket.off('accesos-updated', handler) }
  }, [isAuthenticated, userId, qc])

  function isAllowed(moduleKey: string): boolean {
    if (isLoading) return false
    if (moduleKey === '*') return true
    // Portal de Áreas: solo navegación, cada área destino ya está protegida por su propio moduleKey.
    if (moduleKey === 'areas-portal') return true
    if (modules.includes('*')) return true
    return modules.includes(moduleKey)
  }

  return { modules, isLoading, isAllowed }
}
