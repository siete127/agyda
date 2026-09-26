import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import type { CRMContacto } from '@/types/crm.types'
import { DatosGeneralesTab } from './DatosGeneralesTab'
import { CatalogoSelectInline } from './CatalogoSelectInline'
import { EtiquetasClienteTab } from './EtiquetasClienteTab'

// Fusiona DatosGeneralesTab con los campos que antes eran pestañas propias
// del expediente (Tipo, Segmento, Categoría, Industria, Clasificación,
// Etiquetas) — ahora viven como campos normales dentro de "Información
// general" (tab Resumen), confirmado por el usuario al rediseñar la UX de
// Clientes: 11 pestañas eran demasiadas para algo que en el fondo es solo
// "datos del cliente". "Acceso al portal" NO se incluye aquí — ese flujo se
// gestiona desde el CRM, no debe duplicarse en este expediente.
export function InformacionGeneralTab({ cliente }: { cliente: CRMContacto }) {
  return (
    <div className="space-y-5">
      <DatosGeneralesTab cliente={cliente} />

      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Catalogación</p>
        </div>
        <div className="p-4 space-y-3">
          <CatalogoSelectInline
            cliente={cliente} label="Tipo de cliente" service={crmCatalogosClienteService.tipos}
            queryKey="crm-catalogo-tipos-cliente" campo="tipoClienteId" valorActualId={cliente.tipoClienteId}
          />
          <CatalogoSelectInline
            cliente={cliente} label="Segmento" service={crmCatalogosClienteService.segmentos}
            queryKey="crm-catalogo-segmentos" campo="segmentoId" valorActualId={cliente.segmentoId}
          />
          <CatalogoSelectInline
            cliente={cliente} label="Categoría" service={crmCatalogosClienteService.categorias}
            queryKey="crm-catalogo-categorias-cliente" campo="categoriaId" valorActualId={cliente.categoriaId}
          />
          <CatalogoSelectInline
            cliente={cliente} label="Industria" service={crmCatalogosClienteService.industrias}
            queryKey="crm-catalogo-industrias" campo="industriaId" valorActualId={cliente.industriaId}
          />
          <CatalogoSelectInline
            cliente={cliente} label="Clasificación" service={crmCatalogosClienteService.clasificaciones}
            queryKey="crm-catalogo-clasificaciones-cliente" campo="clasificacionId" valorActualId={cliente.clasificacionId}
          />
        </div>
      </div>

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
