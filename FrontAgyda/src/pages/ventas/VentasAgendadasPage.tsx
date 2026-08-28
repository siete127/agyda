import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVentasSession } from '@/hooks/useVentasSession'
import { ventasService } from '@/services/ventas.service'
import { VENTA_ESTADO_COLORS, type VentaAgendada } from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { CalendarClock, Phone, CheckCircle2, Trash2, AlertCircle, RefreshCw, Search } from 'lucide-react'

function parseFechaLocal(fechaStr: string): Date {
  if (fechaStr.includes('T') || fechaStr.includes(' ')) {
    return new Date(fechaStr.replace('T', ' ').replace(/\.\d+$/, ''))
  }
  return new Date(fechaStr + 'T12:00:00')
}

export function VentasAgendadasPage() {
  const { isReady, error, retry } = useVentasSession()

  if (!isReady) return (
    <div className="flex min-h-[50vh] items-center justify-center"><Spinner size="lg" /></div>
  )
  if (error) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-gray-500">{error}</p>
      <button onClick={retry} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
    </div>
  )

  return <AgendadasContent />
}

function AgendadasContent() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-agendadas'],
    queryFn:  () => ventasService.getScheduled(),
    staleTime: 30_000,
  })

  const completar = useMutation({
    mutationFn: (id: number) => ventasService.completeScheduled(id),
    onSuccess: () => {
      toast.success('Venta completada')
      qc.invalidateQueries({ queryKey: ['ventas-agendadas'] })
      qc.invalidateQueries({ queryKey: ['ventas-hoy'] })
    },
    onError: () => toast.error('Error al completar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => ventasService.deleteScheduled(id),
    onSuccess: () => {
      toast.success('Venta eliminada')
      qc.invalidateQueries({ queryKey: ['ventas-agendadas'] })
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const filtered = ventas.filter((v) =>
    v.nombreCliente.toLowerCase().includes(search.toLowerCase()) ||
    v.telefonoCliente.includes(search)
  )

  const hoy      = new Date(); hoy.setHours(0, 0, 0, 0)
  const vencidas = filtered.filter((v) => parseFechaLocal(v.fechaAgendada) < hoy)
  const proximas = filtered.filter((v) => parseFechaLocal(v.fechaAgendada) >= hoy)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand" /> Ventas Agendadas
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">{ventas.length} venta{ventas.length !== 1 ? 's' : ''} agendada{ventas.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente o teléfono..."
            className="rounded-xl border border-gray-200 bg-card py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 w-64"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : ventas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200/60 bg-card py-16 gap-3 text-gray-400">
          <CalendarClock className="h-10 w-10 opacity-25" />
          <p className="text-[0.85rem]">No hay ventas agendadas</p>
        </div>
      ) : (
        <div className="space-y-5">
          {vencidas.length > 0 && (
            <Section title="Vencidas" badge={vencidas.length} badgeColor="bg-red-100 text-red-600"
              ventas={vencidas} completar={completar} eliminar={eliminar} />
          )}
          {proximas.length > 0 && (
            <Section title="Próximas" badge={proximas.length} badgeColor="bg-brand/10 text-brand"
              ventas={proximas} completar={completar} eliminar={eliminar} />
          )}
          {filtered.length === 0 && search && (
            <p className="text-center text-sm text-gray-400 py-8">Sin resultados para "{search}"</p>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, badge, badgeColor, ventas, completar, eliminar }: {
  title: string; badge: number; badgeColor: string
  ventas: VentaAgendada[]
  completar: ReturnType<typeof useMutation<void, Error, number>>
  eliminar:  ReturnType<typeof useMutation<void, Error, number>>
}) {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
        <h2 className="text-[0.85rem] font-bold text-gray-800">{title}</h2>
        <span className={clsx('rounded-full px-2 py-0.5 text-[0.68rem] font-bold', badgeColor)}>{badge}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {ventas.map((v) => {
          const fecha = parseFechaLocal(v.fechaAgendada)
          const hoy   = new Date(); hoy.setHours(0, 0, 0, 0)
          const isVencida = fecha < hoy
          return (
            <div key={v.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
              {/* Mini calendario */}
              <div className={clsx(
                'flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl border text-center',
                isVencida ? 'border-red-200 bg-red-50' : 'border-brand/20 bg-brand/5',
              )}>
                <span className={clsx('text-[0.55rem] font-bold uppercase', isVencida ? 'text-red-400' : 'text-brand/60')}>
                  {fecha.toLocaleDateString('es-MX', { month: 'short' })}
                </span>
                <span className={clsx('text-[0.95rem] font-black leading-none', isVencida ? 'text-red-500' : 'text-brand')}>
                  {fecha.getDate()}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[0.85rem] font-semibold text-gray-900 truncate">{v.nombreCliente}</p>
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold', VENTA_ESTADO_COLORS[v.estatus])}>
                    {v.estatus}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-[0.72rem] text-gray-400 flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {v.telefonoCliente}
                  </p>
                  {v.horaAgendada && (
                    <p className="text-[0.72rem] text-gray-400">{v.horaAgendada}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => completar.mutate(v.id)}
                  disabled={completar.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[0.72rem] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Completar
                </button>
                <button
                  onClick={() => { if (confirm('¿Eliminar esta venta agendada?')) eliminar.mutate(v.id) }}
                  disabled={eliminar.isPending}
                  className="rounded-xl border border-red-100 bg-red-50 p-1.5 text-red-400 hover:bg-red-100 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
