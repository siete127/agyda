import { Settings, HardHat } from 'lucide-react'

// Tabs originales (Vistas de Webphone, Credenciales VICIdial, Notificaciones
// por Correo, Mensajería) desactivados temporalmente — módulo en construcción.
// Los componentes siguen existiendo en este mismo folder para reactivarlos
// después sin tener que reescribirlos.
export function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Configuración</h1>
            <p className="text-xs text-blue-200/70">Vistas de Webphone y notificaciones por correo</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200/60 bg-white py-20 shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
          <HardHat className="h-8 w-8 text-amber-500" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800">Módulo en construcción</p>
          <p className="mt-1 max-w-sm text-sm text-gray-400">Estamos trabajando en esta sección. Vuelve pronto.</p>
        </div>
      </div>
    </div>
  )
}
