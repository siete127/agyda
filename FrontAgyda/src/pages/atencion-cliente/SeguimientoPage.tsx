import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ListChecks, Clock, AlertCircle, ChevronLeft, Headset, FileQuestion, MessageSquareWarning } from 'lucide-react'
import { api } from '@/lib/axios'
import { clsx } from 'clsx'
import { useSocketEvent } from '@/hooks/useSocket'

interface CasoAbierto {
  tipo: 'consulta' | 'aclaracion' | 'queja'
  id: number
  titulo: string
  clienteNombre: string | null
  estatus: string
  fecha: string
  usuarioNombre?: string
  linkTo: string
}

const TIPO_CFG: Record<CasoAbierto['tipo'], { label: string; icon: typeof Headset; bg: string; text: string }> = {
  consulta:   { label: 'Consulta',    icon: Headset,             bg: 'bg-teal-100',   text: 'text-teal-600' },
  aclaracion: { label: 'Aclaración',  icon: FileQuestion,        bg: 'bg-purple-100', text: 'text-purple-600' },
  queja:      { label: 'Queja',       icon: MessageSquareWarning, bg: 'bg-blue-100',  text: 'text-brand' },
}

const ESTATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pendiente: { label: 'Pendiente',  bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  proceso:   { label: 'En proceso', bg: 'bg-blue-100',  text: 'text-blue-700',  border: 'border-blue-200',  dot: 'bg-blue-500' },
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function SeguimientoPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: casos = [], isLoading, error } = useQuery<CasoAbierto[]>({
    queryKey: ['seguimiento-casos-abiertos'],
    queryFn: async () => {
      const { data } = await api.get('/seguimiento/casos-abiertos')
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  useSocketEvent('consulta:estatus', () => qc.invalidateQueries({ queryKey: ['seguimiento-casos-abiertos'] }))
  useSocketEvent('aclaracion:estatus', () => qc.invalidateQueries({ queryKey: ['seguimiento-casos-abiertos'] }))
  useSocketEvent('queja:estatus', () => qc.invalidateQueries({ queryKey: ['seguimiento-casos-abiertos'] }))

  const pendientes = casos.filter((c) => c.estatus === 'pendiente')
  const enProceso = casos.filter((c) => c.estatus === 'proceso')

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      {/* Header */}
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
              <ListChecks className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Seguimiento de Casos</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">
                {casos.length} caso{casos.length !== 1 ? 's' : ''} abierto{casos.length !== 1 ? 's' : ''} entre Consultas, Aclaraciones y Quejas
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[0.7rem] font-semibold text-amber-500 uppercase tracking-wide">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700 mt-0.5">{pendientes.length}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[0.7rem] font-semibold text-blue-500 uppercase tracking-wide">En proceso</p>
          <p className="text-2xl font-bold text-blue-700 mt-0.5">{enProceso.length}</p>
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar el seguimiento</p>
        </div>
      ) : casos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <ListChecks className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin casos abiertos</p>
            <p className="text-xs text-gray-400 mt-0.5">Todas las consultas, aclaraciones y quejas están resueltas.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {casos.map((c) => {
            const tipoCfg = TIPO_CFG[c.tipo]
            const estCfg = ESTATUS_CFG[c.estatus] ?? ESTATUS_CFG['pendiente']
            const TipoIcon = tipoCfg.icon
            return (
              <button
                key={`${c.tipo}-${c.id}`}
                onClick={() => navigate(c.linkTo)}
                className="w-full flex items-center gap-3 rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 text-left transition-all hover:shadow-md hover:border-brand/40"
              >
                <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', tipoCfg.bg)}>
                  <TipoIcon className={clsx('h-4 w-4', tipoCfg.text)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('text-[0.65rem] font-bold uppercase tracking-wide', tipoCfg.text)}>{tipoCfg.label}</span>
                    {c.clienteNombre && <span className="text-[0.68rem] text-gray-400">· {c.clienteNombre}</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{c.titulo}</p>
                  {c.usuarioNombre && <p className="text-[0.68rem] text-gray-400 truncate">por {c.usuarioNombre}</p>}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', estCfg.bg, estCfg.text, estCfg.border)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', estCfg.dot)} />
                    {estCfg.label}
                  </span>
                  <span className="flex items-center gap-1 text-[0.65rem] text-gray-400">
                    <Clock className="h-3 w-3" /> {fmtFecha(c.fecha)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
