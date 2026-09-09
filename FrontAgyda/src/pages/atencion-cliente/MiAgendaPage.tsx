import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, CalendarClock, ClipboardCheck, Phone } from 'lucide-react'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui/Spinner'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { TareaRow } from './clientes/components/TareasTab'

type Tab = 'hoy' | 'todas'

export function MiAgendaPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('hoy')

  const { data: agenda, isLoading: cargandoAgenda } = useQuery({
    queryKey: ['mi-agenda'],
    queryFn: () => clienteSeguimientoService.getMiAgenda(),
    staleTime: 15_000,
  })

  const { data: todas = [], isLoading: cargandoTodas } = useQuery({
    queryKey: ['tareas-mias'],
    queryFn: () => clienteSeguimientoService.getTareasMias(),
    staleTime: 15_000,
    enabled: tab === 'todas',
  })

  const pendientesTodas = todas.filter((t) => t.estatus !== 'completada' && t.estatus !== 'cancelada')
  const completadasTodas = todas.filter((t) => t.estatus === 'completada' || t.estatus === 'cancelada')

  const tareasHoy = agenda?.tareas ?? []
  const segsHoy = agenda?.seguimientos ?? []
  const totalHoy = tareasHoy.length + segsHoy.length

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{ backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)', backgroundSize: '200% 100%' }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <CalendarClock className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Mi agenda</h1>
              <p className="mt-0.5 text-xs text-blue-100/80">{totalHoy} pendiente{totalHoy !== 1 ? 's' : ''} para hoy</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(['hoy', 'todas'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('rounded-lg px-3.5 py-1.5 text-[0.78rem] font-semibold transition-colors', tab === t ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            {t === 'hoy' ? 'Hoy' : 'Todas mis tareas'}
          </button>
        ))}
      </div>

      {tab === 'hoy' ? (
        cargandoAgenda ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : totalHoy === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
            <CalendarClock className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Nada pendiente para hoy</p>
          </div>
        ) : (
          <div className="space-y-4">
            {segsHoy.length > 0 && (
              <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                  <Phone className="h-4 w-4 text-brand" />
                  <p className="text-[0.8rem] font-bold text-gray-700">Seguimientos de hoy</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {segsHoy.map((s) => (
                    <Link key={s.seguimientoId} to={`/atencion-cliente/clientes/${s.contactoId}`} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                      <p className="text-[0.82rem] font-semibold text-gray-800">{s.contactoNombre}</p>
                      {s.motivo && <p className="mt-0.5 text-xs text-gray-500">{s.motivo}</p>}
                      <p className="mt-0.5 text-[0.68rem] text-gray-400">Próxima fecha: {new Date(s.proximaFecha + 'T12:00:00').toLocaleDateString('es-MX')}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {tareasHoy.length > 0 && (
              <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                  <ClipboardCheck className="h-4 w-4 text-brand" />
                  <p className="text-[0.8rem] font-bold text-gray-700">Tareas de hoy</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {tareasHoy.map((t) => <TareaRow key={t.id} tarea={t} contactoId={t.contactoId} puedeGestionar showCliente />)}
                </div>
              </div>
            )}
          </div>
        )
      ) : cargandoTodas ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : todas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
          <ClipboardCheck className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Sin tareas asignadas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendientesTodas.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3"><p className="text-[0.8rem] font-bold text-gray-700">Pendientes</p></div>
              <div className="divide-y divide-gray-50">
                {pendientesTodas.map((t) => <TareaRow key={t.id} tarea={t} contactoId={t.contactoId} puedeGestionar showCliente />)}
              </div>
            </div>
          )}
          {completadasTodas.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3"><p className="text-[0.8rem] font-bold text-gray-700">Completadas / canceladas</p></div>
              <div className="divide-y divide-gray-50">
                {completadasTodas.map((t) => <TareaRow key={t.id} tarea={t} contactoId={t.contactoId} puedeGestionar showCliente />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
