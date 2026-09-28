import type { CRMContacto } from '@/types/crm.types'
import { DatosGeneralesTab } from './DatosGeneralesTab'
import { EtiquetasClienteTab } from './EtiquetasClienteTab'

// Fusiona DatosGeneralesTab con Etiquetas (antes pestañas propias del
// expediente) — ahora viven como campos normales dentro de "Información
// general" (tab Resumen), confirmado por el usuario al rediseñar la UX de
// Clientes: 11 pestañas eran demasiadas para algo que en el fondo es solo
// "datos del cliente". "Catalogación" (Tipo/Segmento/Categoría/Industria/
// Clasificación) vive aparte, debajo de Métricas rápidas — ver
// CatalogacionClienteBlock en ResumenTab.tsx. "Acceso al portal" NO se
// incluye aquí — ese flujo se gestiona desde el CRM, no debe duplicarse.
export function InformacionGeneralTab({ cliente }: { cliente: CRMContacto }) {
  return (
    <div className="space-y-5">
      <DatosGeneralesTab cliente={cliente} />

      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Etiquetas</p>
        </div>
        <div className="p-4">
          <EtiquetasClienteTab cliente={cliente} compact />
        </div>
      </div>
    </div>
  )
}
