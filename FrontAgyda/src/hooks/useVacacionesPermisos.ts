import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from './useActionAccess'

/**
 * Misma regla que el backend (puedeAprobarVacaciones / puedeVerTodasVacaciones):
 * - aprobar: AD con "Aprobar / rechazar" en Vacaciones o en Vacaciones (admin);
 *   si ninguno de los dos módulos está configurado, se permite (compatibilidad).
 * - verTodas: quien puede aprobar, o quien tiene marcada "Ver todas" en Vacaciones (admin).
 */
export function useVacacionesPermisos() {
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const { acciones, isLoading } = useActionAccess()
  if (isLoading) return { puedeAprobar: false, verTodas: false }

  const vac = acciones['vacaciones']
  const adm = acciones['vacaciones-admin']
  const marcada = (lista: string[] | undefined, accion: string) => !!lista && lista.includes(accion)
  const sinConfigurar = (lista: string[] | undefined) => !lista || lista.includes('*')

  const puedeAprobar = isAdmin && (
    marcada(vac, 'aprobar-rechazar') || marcada(adm, 'aprobar-rechazar') || (sinConfigurar(vac) && sinConfigurar(adm))
  )
  return { puedeAprobar, verTodas: puedeAprobar || marcada(adm, 'ver-todas') }
}
