import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { accessService, type ModuleActions } from '@/services/access.service'
import { useIsAuthenticated } from './useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'

export function useActionAccess() {
  const isAuthenticated = useIsAuthenticated()
  const userId = useAuthStore((s) => s.user?.id)
  const qc = useQueryClient()

  const { data: acciones = {}, isLoading } = useQuery<ModuleActions>({
    queryKey: ['accesos-self-actions', userId],
    queryFn: () => accessService.getSelfActions(),
    enabled: isAuthenticated && !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (!isAuthenticated) return
    const socket = getSocket()
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['accesos-self-actions', userId] })
    }
    socket.on('accesos-updated', handler)
    return () => { socket.off('accesos-updated', handler) }
  }, [isAuthenticated, userId, qc])

  /** ¿El usuario puede hacer `accionKey` dentro de `moduloKey`? Sin datos configurados = permitido. */
  function can(moduloKey: string, accionKey: string): boolean {
    if (isLoading) return false
    const delModulo = acciones[moduloKey]
    if (!delModulo) return true // módulo no reportado por el backend aún = no restringido
    if (delModulo.includes('*')) return true
    return delModulo.includes(accionKey)
  }

  return { acciones, isLoading, can }
}
