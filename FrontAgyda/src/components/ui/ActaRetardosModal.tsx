import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { asistenciaReporteService } from '@/services/asistenciaReporte.service'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const MESES_LABEL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Modal bloqueante — mismo patrón que "Registra tu entrada" (AsistenciaModal). */
export function ActaRetardosModal() {
  const qc = useQueryClient()

  const { data: acta } = useQuery({
    queryKey: ['acta-pendiente'],
    queryFn: () => asistenciaReporteService.getActaPendiente(),
  })

  const reconocer = useMutation({
    mutationFn: (actaId: number) => asistenciaReporteService.reconocerActa(actaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acta-pendiente'] })
      toast.success('Acción correctiva reconocida')
    },
    onError: () => toast.error('No se pudo registrar el reconocimiento'),
  })

  if (!acta) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100/50 overflow-hidden animate-slide-up">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#7A1B1B] to-[#D82B2B] px-6 py-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Acción correctiva por retardos</h2>
              <p className="mt-0.5 text-xs text-white/60">
                {MESES_LABEL[acta.mes - 1]} {acta.anio}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Acumulaste <span className="font-bold text-gray-800">{acta.totalRetardos} retardos</span> este mes, por lo que se generó
            una acción correctiva. Debes aceptar este aviso para continuar.
          </p>
          <Button
            isLoading={reconocer.isPending}
            onClick={() => reconocer.mutate(acta.id)}
            className="w-full justify-center"
          >
            Aceptar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
