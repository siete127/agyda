import { Navigate } from 'react-router-dom'

// El historial de reuniones ahora vive como pestaña dentro de ReunionesPage
// (toggle Próximas/Historial) en vez de ser una página aparte enlazada desde
// el sidebar — se conserva esta ruta como deep-link válido, redirigiendo a
// la pestaña correspondiente.
export function ReunionesHistorialPage() {
  return <Navigate to="/portal-cliente/reuniones?tab=historial" replace />
}
