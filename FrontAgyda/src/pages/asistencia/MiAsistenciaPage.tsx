import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/axios'
import { EntradaWidget } from '@/components/ui/AsistenciaModal'

interface EntradaRegistro {
  fecha: string
  horaEntrada: string
  horaEsperada: string
  minutosRetardo: number
  esRetardo: boolean
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function fmtFechaLarga(f: string) {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtHora(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const periodo = h >= 12 ? 'p. m.' : 'a. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`
}

export function MiAsistenciaPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)

  const mesStr = `${anio}-${String(mes).padStart(2, '0')}`

  const { data: entradas = [], isLoading } = useQuery<EntradaRegistro[]>({
    queryKey: ['mi-asistencia', mesStr],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/mis-entradas', { params: { mes: mesStr } })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  function irMesAnterior() {
    if (mes === 1) { setMes(12); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }

  function irMesSiguiente() {
    const esHoy = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1
    if (esHoy) return
    if (mes === 12) { setMes(1); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1
  const totalRetardos = entradas.filter(e => e.esRetardo).length
  const totalATiempo = entradas.filter(e => !e.esRetardo).length

  const entradasPorDia = useMemo(() => {
    const map = new Map<number, EntradaRegistro>()
    for (const e of entradas) {
      const dia = Number(e.fecha.slice(0, 10).split('-')[2])
      map.set(dia, e)
    }
    return map
  }, [entradas])

  const celdas = useMemo(() => {
    const diasEnMes = new Date(anio, mes, 0).getDate()
    // getDay(): 0=domingo..6=sábado → lo convertimos a 0=lunes..6=domingo
    const primerDiaSemana = (new Date(anio, mes - 1, 1).getDay() + 6) % 7
    const items: Array<{ dia: number; entrada?: EntradaRegistro } | null> = []
    for (let i = 0; i < primerDiaSemana; i++) items.push(null)
    for (let dia = 1; dia <= diasEnMes; dia++) items.push({ dia, entrada: entradasPorDia.get(dia) })
    return items
  }, [anio, mes, entradasPorDia])

  const esHoyCelda = (dia: number) =>
    esMesActual && dia === hoy.getDate()

  return (
    <div className="space-y-5 animate-fade-in">
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
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Mi Asistencia</h1>
              <p className="mt-0.5 text-xs text-white/50">
                {totalATiempo} a tiempo · {totalRetardos} {totalRetardos === 1 ? 'retardo' : 'retardos'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Widget de entrada de hoy */}
      <EntradaWidget />

      {/* Navegador de mes */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={irMesAnterior}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-brand/40 hover:text-brand transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-gray-700 w-40 text-center">
              {MESES[mes - 1]} {anio}
            </span>
            <button
              onClick={irMesSiguiente}
              disabled={esMesActual}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:text-gray-500"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-[0.72rem] text-gray-400">{entradas.length} registro{entradas.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Cargando...</div>
        ) : entradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <Clock className="h-8 w-8 text-gray-300" />
            <p className="text-sm">Sin registros en {MESES[mes - 1]}</p>
          </div>
        ) : (
          <div className="p-4">
            {/* Encabezado de días de la semana */}
            <div className="grid grid-cols-7 gap-2.5 mb-2">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="text-center text-[0.7rem] font-bold uppercase tracking-wide text-gray-500 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Grilla de días */}
            <div className="grid grid-cols-7 gap-2.5">
              {celdas.map((c, i) => {
                if (!c) return <div key={`empty-${i}`} />
                const { dia, entrada } = c
                const hoyCelda = esHoyCelda(dia)
                return (
                  <div
                    key={dia}
                    title={entrada ? `Entrada ${fmtHora(entrada.horaEntrada)} · Esperada ${fmtHora(entrada.horaEsperada)}` : undefined}
                    className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-1.5 py-2.5 transition-colors
                      ${entrada
                        ? entrada.esRetardo
                          ? 'border-red-300 bg-red-50'
                          : 'border-emerald-300 bg-emerald-50'
                        : 'border-gray-200 bg-gray-50'}
                      ${hoyCelda ? 'ring-2 ring-brand ring-offset-2' : ''}`}
                  >
                    <span className={`text-[0.82rem] font-bold ${entrada ? (entrada.esRetardo ? 'text-red-700' : 'text-emerald-700') : 'text-gray-400'}`}>
                      {dia}
                    </span>
                    {entrada && (
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${entrada.esRetardo ? 'bg-red-500' : 'bg-emerald-500'}`}>
                        {entrada.esRetardo
                          ? <AlertTriangle className="h-3.5 w-3.5 text-white" />
                          : <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </span>
                    )}
                    {entrada && (
                      <span className={`text-[0.68rem] font-bold leading-none ${entrada.esRetardo ? 'text-red-700' : 'text-emerald-700'}`}>
                        {fmtHora(entrada.horaEntrada)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Detalle de retardos del mes */}
            {totalRetardos > 0 && (
              <div className="mt-5 border-t border-gray-200 pt-4 space-y-2">
                <p className="text-[0.72rem] font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Retardos del mes
                </p>
                {entradas.filter(e => e.esRetardo).map((e) => (
                  <div key={e.fecha} className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-500">
                      <AlertTriangle className="h-3.5 w-3.5 text-white" />
                    </span>
                    <span className="text-xs font-semibold text-gray-700 capitalize flex-1 min-w-0 truncate">{fmtFechaLarga(e.fecha)}</span>
                    <span className="text-[0.7rem] font-bold text-red-700 flex-shrink-0">
                      {fmtHora(e.horaEntrada)} · +{e.minutosRetardo} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
