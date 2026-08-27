import { Info } from 'lucide-react'

export function GeneralTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-semibold text-ink">Configuración de Tecnología/TI</p>
            <p className="mt-1 text-sm text-ink-tertiary">
              Este módulo centraliza la administración del flujo de soporte de Tecnología/TI: catálogos,
              técnicos, reglas de asignación, canales de contacto (chat en vivo, chatbot) y el ciclo de
              vida de los tickets. Usa el menú lateral para navegar entre secciones.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
