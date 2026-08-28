import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Laptop, Cpu, Monitor, Keyboard, Mouse, ShieldCheck } from 'lucide-react'
import { activoService } from '@/services/activo.service'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const TIPO_ICON = { laptop: Laptop, cpu: Cpu, monitor: Monitor, teclado: Keyboard, mouse: Mouse }
const TIPO_LABEL = { laptop: 'Laptop', cpu: 'CPU', monitor: 'Monitor', teclado: 'Teclado', mouse: 'Mouse' }

/** Modal bloqueante — mismo patrón que ActaRetardosModal / AsistenciaModal. */
export function ActivoTerminosModal() {
  const qc = useQueryClient()

  const { data: activo } = useQuery({
    queryKey: ['activo-pendiente'],
    queryFn: () => activoService.getPendiente(),
  })

  const aceptar = useMutation({
    mutationFn: (id: number) => activoService.aceptarTerminos(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activo-pendiente'] })
      toast.success('Términos aceptados')
    },
    onError: () => toast.error('No se pudo registrar la aceptación'),
  })

  if (!activo) return null

  const Icon = TIPO_ICON[activo.tipo] ?? Laptop

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-md rounded-2xl bg-card shadow-2xl border border-gray-100/50 overflow-hidden animate-slide-up">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Equipo asignado</h2>
              <p className="mt-0.5 text-xs text-white/60">
                {TIPO_LABEL[activo.tipo] ?? activo.tipo} · {activo.marca} {activo.modelo}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-bold text-gray-500 uppercase tracking-wide">
              <ShieldCheck className="h-3.5 w-3.5" />
              Términos y condiciones de uso
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1 text-[0.78rem] leading-relaxed text-gray-600">
              <p>Se te asignó el equipo indicado arriba. Al aceptar estos términos, confirmas que:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Recibes el equipo en buen estado de funcionamiento.</li>
                <li>Eres responsable de su cuidado, uso adecuado y resguardo.</li>
                <li>Reportarás de inmediato cualquier daño, falla o robo a Sistemas.</li>
                <li>El equipo es propiedad de la empresa y deberás devolverlo al término de tu relación laboral o cuando te sea requerido.</li>
                <li>No deberás instalar software no autorizado ni usarlo con fines ajenos a tus funciones.</li>
              </ul>
            </div>
          </div>

          <Button
            isLoading={aceptar.isPending}
            onClick={() => aceptar.mutate(activo.id)}
            className="w-full justify-center"
          >
            Aceptar términos y condiciones
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
