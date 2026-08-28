import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, User, FileText, Building2, History, ClipboardList, DollarSign, Smile, AlertOctagon, CalendarClock, ListTree } from 'lucide-react'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui/Spinner'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import { DatosGeneralesTab } from './components/DatosGeneralesTab'
import { DocumentosTab } from './components/DocumentosTab'
import { SeguimientoTab } from './components/SeguimientoTab'
import { TareasTab } from './components/TareasTab'
import { PagosTab } from './components/PagosTab'
import { EncuestasTab } from './components/EncuestasTab'
import { IncidenciasTab } from './components/IncidenciasTab'
import { RenovacionesTab } from './components/RenovacionesTab'
import { HistorialTab } from './components/HistorialTab'

type Tab = 'datos' | 'documentos' | 'seguimiento' | 'tareas' | 'pagos' | 'encuestas' | 'incidencias' | 'renovaciones' | 'historial'

export function ClientePerfilPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contactoId = Number(id)
  const [tab, setTab] = useState<Tab>('datos')

  const { data: cliente, isLoading, error } = useQuery({
    queryKey: ['cliente-expediente', contactoId],
    queryFn: () => crmService.getExpediente(contactoId),
    enabled: Number.isFinite(contactoId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !cliente) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm font-semibold text-gray-700">No se pudo cargar el cliente</p>
        <button onClick={() => navigate('/atencion-cliente/clientes')} className="text-xs font-medium text-brand hover:underline">
          Volver a Clientes
        </button>
      </div>
    )
  }

  const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === cliente.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'datos', label: 'Expediente', icon: User },
    { key: 'documentos', label: `Documentación${cliente.conteos?.documentos ? ` (${cliente.conteos.documentos})` : ''}`, icon: FileText },
    { key: 'seguimiento', label: 'Seguimiento', icon: History },
    { key: 'tareas', label: 'Tareas y recordatorios', icon: ClipboardList },
    { key: 'pagos', label: `Control de pagos${cliente.conteos?.pagos ? ` (${cliente.conteos.pagos})` : ''}`, icon: DollarSign },
    { key: 'encuestas', label: `Satisfacción${cliente.conteos?.encuestas ? ` (${cliente.conteos.encuestas})` : ''}`, icon: Smile },
    { key: 'incidencias', label: 'Incidencias', icon: AlertOctagon },
    { key: 'renovaciones', label: 'Renovaciones', icon: CalendarClock },
    { key: 'historial', label: 'Historial', icon: ListTree },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente/clientes')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Clientes
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">{cliente.nombre}</h1>
                <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', cfg.bg, cfg.text)}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                </span>
              </div>
              {cliente.empresa && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-blue-100/80">
                  <Building2 className="h-3 w-3" /> {cliente.empresa}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-all',
              tab === t.key ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'datos' && <DatosGeneralesTab cliente={cliente} />}
      {tab === 'documentos' && <DocumentosTab contactoId={cliente.id} />}
      {tab === 'seguimiento' && <SeguimientoTab contactoId={cliente.id} />}
      {tab === 'tareas' && <TareasTab contactoId={cliente.id} />}
      {tab === 'pagos' && <PagosTab contactoId={cliente.id} />}
      {tab === 'encuestas' && <EncuestasTab contactoId={cliente.id} />}
      {tab === 'incidencias' && <IncidenciasTab contactoId={cliente.id} />}
      {tab === 'renovaciones' && <RenovacionesTab contactoId={cliente.id} />}
      {tab === 'historial' && <HistorialTab contactoId={cliente.id} />}
    </div>
  )
}
