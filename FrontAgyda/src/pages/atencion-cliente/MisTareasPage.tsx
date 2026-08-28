import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ClipboardCheck } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { TareaRow } from './clientes/components/TareasTab'

export function MisTareasPage() {
  const navigate = useNavigate()

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['tareas-mias'],
    queryFn: () => clienteSeguimientoService.getTareasMias(),
    staleTime: 15_000,
  })

  const pendientes = tareas.filter((t) => t.estatus !== 'completada' && t.estatus !== 'cancelada')
  const completadas = tareas.filter((t) => t.estatus === 'completada' || t.estatus === 'cancelada')

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <ClipboardCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Mis tareas</h1>
              <p className="mt-0.5 text-xs text-blue-100/80">{pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : tareas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
          <ClipboardCheck className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Sin tareas asignadas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendientes.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-[0.8rem] font-bold text-gray-700">Pendientes</p>
              </div>
              <div className="divide-y divide-gray-50">
                {pendientes.map((t) => <TareaRow key={t.id} tarea={t} contactoId={t.contactoId} puedeGestionar showCliente />)}
              </div>
            </div>
          )}
          {completadas.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-[0.8rem] font-bold text-gray-700">Completadas / canceladas</p>
              </div>
              <div className="divide-y divide-gray-50">
                {completadas.map((t) => <TareaRow key={t.id} tarea={t} contactoId={t.contactoId} puedeGestionar showCliente />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
