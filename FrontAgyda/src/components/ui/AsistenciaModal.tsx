import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
// Los imports anteriores se mantienen para EntradaWidget (usado en MiAsistenciaPage)

interface EntradaHoy {
  id: number
  horaEntrada: string
  horaEsperada: string
  minutosRetardo: number
  esRetardo: boolean
}

interface ActaPendiente {
  id: number
  anio: number
  mes: number
  totalRetardos: number
}

const ROLES_CON_HORARIO = ['AD', 'TI', 'CC']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// El backend ya envía la hora formateada como "HH:mm" (hora local del servidor de BD);
// se formatea aquí a 12h sin volver a pasar por Date/zona horaria del navegador.
function fmtHora(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const periodo = h >= 12 ? 'p. m.' : 'a. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`
}

function ActaModal({ acta }: { acta: ActaPendiente }) {
  const qc = useQueryClient()
  const reconocer = useMutation({
    mutationFn: () => api.post(`/asistencia/acta/${acta.id}/reconocer`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-acta-pendiente'] })
      toast.success('Acta reconocida')
    },
    onError: () => toast.error('No se pudo reconocer el acta'),
  })

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100/50 overflow-hidden animate-slide-up">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#7f1d1d] to-[#b91c1c] px-6 py-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <FileWarning className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Acción Correctiva</h2>
              <p className="mt-0.5 text-xs text-white/70">Debes reconocer este documento para continuar</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1">
            <p className="text-sm font-semibold text-red-800">
              {acta.totalRetardos} retardos en {MESES[acta.mes - 1]} de {acta.anio}
            </p>
            <p className="text-xs text-red-600 leading-relaxed">
              Acumulaste {acta.totalRetardos} retardos durante el mes de {MESES[acta.mes - 1]}, superando el límite permitido.
              Se generó esta acción correctiva de forma automática.
            </p>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Al hacer clic en <strong>"Reconocer y continuar"</strong> confirmas que has sido notificado de esta acción correctiva.
            Recursos Humanos recibirá tu confirmación.
          </p>
          <Button
            isLoading={reconocer.isPending}
            onClick={() => reconocer.mutate()}
            className="w-full justify-center bg-red-600 hover:bg-red-700"
          >
            <CheckCircle2 className="h-4 w-4" /> Reconocer y continuar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// PAUSADO — la asistencia ahora se registra exclusivamente desde BioTime (reloj físico).
// El modal bloqueante y el botón "Marcar entrada" están deshabilitados.
// El modal de actas correctivas (ActaModal) sigue activo porque no depende del checador manual.
export function AsistenciaModal() {
  const rol = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase() ?? '')
  const aplica = ROLES_CON_HORARIO.includes(rol)

  const { data: actaPendiente, isLoading: cargandoActa } = useQuery<ActaPendiente | null>({
    queryKey: ['asistencia-acta-pendiente'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/acta/pendiente')
      return data?.data ?? null
    },
    enabled: aplica,
  })

  // Solo el acta correctiva sigue bloqueando — el modal de "Marcar entrada" está pausado
  if (aplica && !cargandoActa && actaPendiente) {
    return <ActaModal acta={actaPendiente} />
  }

  return null
}

/** Widget compacto para incrustar en una página (ej. Checklist) — muestra el estado ya marcado. */
export function EntradaWidget() {
  const qc = useQueryClient()
  const rol = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase() ?? '')
  const aplica = ROLES_CON_HORARIO.includes(rol)
  const [enviandoW, setEnviandoW] = useState(false)

  const { data: entrada, isLoading } = useQuery<EntradaHoy | null>({
    queryKey: ['asistencia-entrada-hoy'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/entrada/hoy')
      return data?.data ?? null
    },
    enabled: aplica,
  })

  const marcarEntrada = useMutation({
    mutationFn: () => api.post('/asistencia/entrada'),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['asistencia-entrada-hoy'] })
      if (data?.data?.esRetardo) {
        toast.error(`Entrada registrada con retardo (${data.data.minutosRetardo} min)`)
      } else {
        toast.success('Entrada registrada a tiempo')
      }
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) { qc.invalidateQueries({ queryKey: ['asistencia-entrada-hoy'] }); return }
      if (status === 429) { toast.error('Espera un momento antes de intentar de nuevo'); return }
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo registrar la entrada')
    },
    onSettled: () => setEnviandoW(false),
  })

  function handleMarcarW() {
    if (enviandoW || marcarEntrada.isPending) return
    setEnviandoW(true)
    marcarEntrada.mutate()
  }

  if (!aplica) return null

  if (isLoading) {
    return <div className="card p-4 h-[74px] animate-pulse bg-gray-50" />
  }

  if (!entrada) {
    return (
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/8">
            <Clock className="h-4 w-4 text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Aún no registras tu entrada hoy</p>
            <p className="text-xs text-gray-400">Marca tu hora de entrada al llegar</p>
          </div>
        </div>
        <Button size="sm" isLoading={enviandoW || marcarEntrada.isPending} onClick={handleMarcarW}>
          <Clock className="h-3.5 w-3.5" /> Marcar entrada
        </Button>
      </div>
    )
  }

  return (
    <div className={clsx(
      'card p-4 flex items-center gap-3',
      entrada.esRetardo ? 'bg-red-50/60' : 'bg-emerald-50/60',
    )}>
      <div className={clsx(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
        entrada.esRetardo ? 'bg-red-100' : 'bg-emerald-100',
      )}>
        {entrada.esRetardo
          ? <AlertTriangle className="h-4 w-4 text-red-600" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
      </div>
      <div>
        <p className={clsx('text-sm font-semibold', entrada.esRetardo ? 'text-red-700' : 'text-emerald-700')}>
          Entrada registrada a las {fmtHora(entrada.horaEntrada)}
          {entrada.esRetardo && ' — Retardo'}
        </p>
        <p className="text-xs text-gray-400">
          {entrada.esRetardo
            ? `${entrada.minutosRetardo} minutos después de tu hora de entrada (${fmtHora(entrada.horaEsperada)})`
            : `Hora de entrada esperada: ${fmtHora(entrada.horaEsperada)}`}
        </p>
      </div>
    </div>
  )
}
