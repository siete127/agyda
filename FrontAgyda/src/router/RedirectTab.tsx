import { Navigate, useSearchParams } from 'react-router-dom'

// Redirige a /atencion-cliente/clientes?tab=<tab> preservando cualquier query
// param existente (casoId, citaId, quejaId, etc.) para no romper deep-links de
// notificaciones ni bookmarks de las URLs viejas.
export function RedirectTab({ tab, extra }: { tab: string; extra?: Record<string, string> }) {
  const [sp] = useSearchParams()
  const params = new URLSearchParams(sp)
  params.set('tab', tab)
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v)
  return <Navigate to={`/atencion-cliente/clientes?${params.toString()}`} replace />
}
