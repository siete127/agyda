import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSocket } from '@/lib/socket'
import { pausaTiposService } from '@/services/pausaTipos.service'
import { PAUSA_TIPOS_DEFAULT, type PausaTipo, type UsoPausa } from '@/types/pausaTipos.types'
import { useModuleAccess } from './useModuleAccess'
import { useActionAccess } from './useActionAccess'

// Qué partes del sistema de pausas tiene la empresa/usuario. `isAllowed` y
// `can` ya descuentan los módulos desactivados para la empresa, así que esto
// sirve igual para empresas existentes y nuevas.
//   puedePausar → puede marcar sus pausas (reports:gestionar-pausas).
//   modulos     → en qué módulos puede contar una pausa (los que la empresa tiene).
export function usePausaModulos() {
  const { isAllowed, isLoading: cargandoModulos } = useModuleAccess()
  const { can, isLoading: cargandoAcciones } = useActionAccess()
  const modulos: Record<UsoPausa, boolean> = {
    asistencia: isAllowed('asistencia') || isAllowed('asistencia-personal'),
    nomina: isAllowed('nomina'),
    contact_center: isAllowed('operaciones') || isAllowed('contact-center'),
  }
  return {
    cargando: cargandoModulos || cargandoAcciones,
    puedePausar: can('reports', 'gestionar-pausas'),
    modulos,
  }
}

export const PAUSA_TIPOS_QUERY_KEY = ['pausa-tipos'] as const

// Tipos de pausa configurados (Configuración → Tipos de pausa), activos e
// inactivos. Se refresca solo cuando alguien los edita (socket).
export function usePausaTipos() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: PAUSA_TIPOS_QUERY_KEY,
    queryFn: () => pausaTiposService.list(),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    const sock = getSocket()
    const onUpdate = () => qc.invalidateQueries({ queryKey: PAUSA_TIPOS_QUERY_KEY })
    sock.on('pausa-tipos:updated', onUpdate)
    return () => { sock.off('pausa-tipos:updated', onUpdate) }
  }, [qc])

  // Mientras carga (o si falla) se usan los 4 tipos por default.
  const tipos: PausaTipo[] = query.data ?? PAUSA_TIPOS_DEFAULT
  const porId = (statusId: number | null | undefined) => tipos.find((t) => t.statusId === statusId)
  // El tipo con semáforo de ocupación (el baño): lo maneja el socket banio:*.
  const banioId = tipos.find((t) => t.controlOcupacion)?.statusId ?? 3
  return { ...query, tipos, activos: tipos.filter((t) => t.activo), porId, banioId }
}
