import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  User, FileText, Building2, History, Inbox, Briefcase, Mail, Phone, MapPin,
  Pencil, MoreHorizontal, CalendarCheck, UserCircle, Download,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { GenerarOportunidadModal } from '../components/GenerarOportunidadModal'
import { ResumenTab } from './components/ResumenTab'
import { AtencionTab, type SubAtencion } from './components/AtencionTab'
import { ComercialConsolidadoTab, type SubComercial } from './components/ComercialConsolidadoTab'
import { DocumentosTab } from './components/DocumentosTab'
import { HistorialTab } from './components/HistorialTab'
import { EtiquetasHeaderChips } from './components/EtiquetasHeaderChips'

// Cuerpo del expediente del cliente — extraído de ClientePerfilPage para que lo
// compartan la ruta /clientes/:id (wrapper que lee la URL) y el panel de
// detalle del módulo "Seguimiento de clientes" (le pasa tab/sub por props).
//
// Expediente de 5 pestañas (rediseño UX — antes eran 11):
//   resumen    → Información general (datos + catálogos + etiquetas + acceso
//                portal, antes 8 pestañas separadas) + Métricas rápidas +
//                Actividad reciente
//   atencion   → bitácora + tareas + citas + renovaciones + casos (sub-tabs)
//   comercial  → control de pagos + satisfacción + comercial (sub-tabs)
//   documentos → DocumentosTab
//   actividad  → historial completo (antes una sub-tab de "seguimiento")

export type ExpedienteTab = 'resumen' | 'atencion' | 'comercial' | 'documentos' | 'actividad'
export const EXPEDIENTE_TAB_KEYS: ExpedienteTab[] = ['resumen', 'atencion', 'comercial', 'documentos', 'actividad']

export const EXPEDIENTE_SUB_DEFAULT: Record<'atencion' | 'comercial', string> = {
  atencion: 'bitacora',
  comercial: 'pagos',
}
export const EXPEDIENTE_SUB_VALIDAS: Record<'atencion' | 'comercial', string[]> = {
  atencion: ['bitacora', 'tareas', 'citas', 'renovaciones', 'casos'],
  comercial: ['pagos', 'satisfaccion', 'comercial'],
}

export function ClienteExpediente({ contactoId, tab, sub, onTab, onSub, compact }: {
  contactoId: number
  tab: ExpedienteTab
  sub: string
  onTab: (t: ExpedienteTab) => void
  onSub: (s: string) => void
  compact?: boolean
}) {
  const { isAllowed } = useModuleAccess()
  const { data: usuarios } = useUsuariosSimple()
  const [generarOportunidad, setGenerarOportunidad] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)

  const { data: cliente, isLoading, error } = useQuery({
    queryKey: ['cliente-expediente', contactoId],
    queryFn: () => crmService.getExpediente(contactoId),
    enabled: Number.isFinite(contactoId),
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  }
  if (error || !cliente) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm font-semibold text-gray-700">No se pudo cargar el cliente</p>
      </div>
    )
  }

  const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === cliente.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]
  const puedeGenerarOportunidad = isAllowed('crm') && !!cliente.retencion?.enRiesgo
  const TABS: TabItem<ExpedienteTab>[] = [
    { key: 'resumen', label: 'Resumen', icon: User },
    { key: 'atencion', label: 'Atención', icon: Inbox },
    { key: 'comercial', label: 'Comercial', icon: Briefcase },
    { key: 'documentos', label: 'Documentos', icon: FileText, badge: cliente.conteos?.documentos },
    { key: 'actividad', label: 'Actividad', icon: History },
  ]

  const responsableNombre = usuarios?.find((u) => u.id === cliente.responsableId)?.nombre
  const fechaAlta = cliente.fecha ? new Date(cliente.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  const exportarExpediente = () => {
    const resumen = [
      `Expediente de cliente — ${cliente.nombre}`,
      cliente.empresa ? `Empresa: ${cliente.empresa}` : null,
      `Estatus: ${cfg.label}`,
      cliente.correo ? `Correo: ${cliente.correo}` : null,
      cliente.telefono ? `Teléfono: ${cliente.telefono}` : null,
      cliente.direccion ? `Dirección: ${cliente.direccion}` : null,
      fechaAlta ? `Cliente desde: ${fechaAlta}` : null,
      responsableNombre ? `Ejecutivo asignado: ${responsableNombre}` : null,
      cliente.etiquetas.length ? `Etiquetas: ${cliente.etiquetas.map((e) => e.nombre).join(', ')}` : null,
    ].filter(Boolean).join('\n')
    const blob = new Blob([resumen], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expediente-${cliente.nombre.replace(/\s+/g, '-').toLowerCase()}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setMenuAbierto(false)
  }

  return (
    <div className="space-y-5 animate-fade-in" onClick={() => menuAbierto && setMenuAbierto(false)}>
      <div className={clsx('overflow-hidden rounded-2xl bg-[#0B1220]', compact ? 'p-4' : 'p-5')}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={clsx('flex flex-shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white', compact ? 'h-11 w-11' : 'h-12 w-12')}>
              {cliente.nombre?.slice(0, 2).toUpperCase() || <User className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">{cliente.nombre}</h1>
                <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', cfg.bg, cfg.text)}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                </span>
              </div>
              {cliente.empresa && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                  <Building2 className="h-3 w-3" /> {cliente.empresa}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
                {cliente.correo && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-gray-500" /> {cliente.correo}</span>}
                {cliente.telefono && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-gray-500" /> {cliente.telefono}</span>}
                {cliente.direccion && <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-gray-500" /> {cliente.direccion}</span>}
              </div>
              <div className="mt-2">
                <EtiquetasHeaderChips cliente={cliente} />
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            {puedeGenerarOportunidad && (
              <button
                onClick={() => setGenerarOportunidad(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-brand-dark transition-colors"
              >
                <Briefcase className="h-4 w-4" /> Generar oportunidad
              </button>
            )}
            <button className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[0.78rem] font-semibold text-gray-200 hover:bg-white/5 transition-colors">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuAbierto && (
                <div className="absolute right-0 top-9 z-10 w-52 rounded-xl border border-gray-100 bg-card py-1.5 shadow-lg">
                  <button
                    onClick={exportarExpediente}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar expediente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 text-xs text-gray-400">
          {fechaAlta && <span className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5" /> Cliente desde {fechaAlta}</span>}
          {responsableNombre && <span className="flex items-center gap-1.5"><UserCircle className="h-3.5 w-3.5" /> Ejecutivo asignado: {responsableNombre}</span>}
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={onTab} />

      {tab === 'resumen' && <ResumenTab cliente={cliente} />}
      {tab === 'atencion' && (
        <AtencionTab
          contactoId={cliente.id}
          clienteNombre={cliente.nombre}
          sub={sub as SubAtencion}
          onSubChange={onSub}
        />
      )}
      {tab === 'comercial' && (
        <ComercialConsolidadoTab
          contactoId={cliente.id}
          sub={sub as SubComercial}
          onSubChange={onSub}
          conteos={cliente.conteos}
          oportunidades={cliente.oportunidades}
        />
      )}
      {tab === 'documentos' && <DocumentosTab contactoId={cliente.id} />}
      {tab === 'actividad' && <HistorialTab contactoId={cliente.id} />}

      {generarOportunidad && cliente.retencion && (
        <GenerarOportunidadModal
          contactoId={cliente.id}
          contactoNombre={cliente.nombre}
          tituloSugerido={`Retención — ${cliente.nombre}`}
          contextoNota={`Generada desde el expediente del cliente (evaluación de retención: ${cliente.retencion.estatus}).${cliente.retencion.motivo ? `\n\nMotivo: ${cliente.retencion.motivo}` : ''}`}
          onClose={() => setGenerarOportunidad(false)}
        />
      )}
    </div>
  )
}
