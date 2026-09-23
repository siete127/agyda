import { CCPostulantesGestionTab } from '@/pages/configuracion/ContactCenterTabs'

// Misma pantalla que Configuración → Contact Center → Gestión de postulantes,
// pero como ruta propia visible en el sidebar (grupo "Contact Center") para
// que un agente no tenga que entrar a Configuración para usarla.
export default function PostulantesPage() {
  return (
    <div className="mx-auto max-w-6xl p-5">
      <CCPostulantesGestionTab />
    </div>
  )
}
