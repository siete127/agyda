import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MessageCircle, X, Loader2, BellRing, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalClienteService } from '@/services/portalCliente.service'
import { mensajeriaService } from '@/services/mensajeria.service'
import { useMensajeriaStore } from '@/stores/mensajeria.store'
import { usePortalAcciones } from '@/hooks/usePortalAcciones'
import { Avatar } from '@/components/ui/Avatar'
import { MensajeriaFloatingBubble } from '@/components/ui/MensajeriaFloatingBubble'

// Botón flotante del portal para hablar con su asesor (responsable del
// contacto en el CRM). El chat es un DM de Mensajería: se abre con la misma
// ventana flotante del panel interno y el asesor contesta desde su Mensajería.
// Sin asesor: leyenda + "Notificar" (avisa al grupo "Asesor de clientes").
export function PortalChatAsesor() {
  const { puede, isLoading: cargandoAcciones } = usePortalAcciones()
  const habilitado = !cargandoAcciones && puede('chatear-asesor')
  const setCanales = useMensajeriaStore((s) => s.setCanales)
  const abrirChatFlotante = useMensajeriaStore((s) => s.abrirChatFlotante)
  const [panel, setPanel] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const { data: asesor, isLoading } = useQuery({
    queryKey: ['portal-asesor'],
    queryFn: () => portalClienteService.getAsesor(),
    enabled: habilitado,
    staleTime: 60_000,
  })
  // Sus conversaciones (solo la del asesor) en el store: así la burbuja de
  // "mensaje nuevo" puede abrir la ventana aunque no la haya abierto antes.
  const { data: canales } = useQuery({
    queryKey: ['portal-mensajeria-canales'],
    queryFn: () => mensajeriaService.getMisCanales(),
    enabled: habilitado && !!asesor,
  })
  useEffect(() => { if (canales) setCanales(canales) }, [canales, setCanales])

  const abrirChat = useMutation({
    mutationFn: () => portalClienteService.abrirChatAsesor(),
    onSuccess: (canal) => {
      const actuales = useMensajeriaStore.getState().canales
      setCanales([canal, ...actuales.filter((c) => c.id !== canal.id)])
      abrirChatFlotante(canal.id)
      setPanel(false)
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo abrir el chat'),
  })

  const notificar = useMutation({
    mutationFn: () => portalClienteService.notificarSinAsesor(mensaje.trim() || undefined),
    onSuccess: () => {
      toast.success('Listo: avisamos al equipo para que te asignen un asesor')
      setMensaje('')
      setPanel(false)
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo avisar al equipo'),
  })

  if (!habilitado) return null

  const alPulsar = () => {
    if (asesor) abrirChat.mutate()
    else setPanel((v) => !v)
  }

  return (
    <>
      {/* Ventanas de chat abiertas y avisos de mensajes nuevos (mismo componente del panel interno). */}
      {asesor && <MensajeriaFloatingBubble />}

      {panel && !asesor && (
        <div className="fixed bottom-24 right-6 z-[160] w-80 overflow-hidden rounded-2xl border border-surface-border bg-card shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between bg-brand px-4 py-3 text-white">
            <p className="text-sm font-semibold">Tu asesor</p>
            <button onClick={() => setPanel(false)} className="rounded-lg p-1 hover:bg-white/15"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3">
              <UserX className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <p className="text-[0.8rem] text-amber-800">
                <b>Aún no se te ha asignado un asesor.</b> Avisa al equipo y en cuanto te asignen uno podrás chatear con él desde aquí.
              </p>
            </div>
            <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={500} rows={3}
              placeholder="¿En qué te podemos ayudar? (opcional)"
              className="w-full resize-none rounded-xl border border-surface-border bg-card px-3 py-2 text-sm outline-none focus:border-brand" />
            <button onClick={() => notificar.mutate()} disabled={notificar.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {notificar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Notificar
            </button>
          </div>
        </div>
      )}

      <button
        onClick={alPulsar}
        disabled={isLoading || abrirChat.isPending}
        title={asesor ? `Chatear con ${asesor.nombre}` : 'Chatear con tu asesor'}
        className="group fixed bottom-6 right-6 z-[150] flex items-center gap-2.5 rounded-full bg-brand py-2.5 pl-2.5 pr-4 text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-70"
      >
        {asesor ? (
          <span className="rounded-full ring-2 ring-white/70"><Avatar src={asesor.fotoUrl} name={asesor.nombre} size="sm" /></span>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
            {abrirChat.isPending || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          </span>
        )}
        <span className="text-left leading-tight">
          <span className="block text-[0.8rem] font-semibold">{asesor ? 'Chatear con mi asesor' : 'Mi asesor'}</span>
          {asesor && <span className="block max-w-[10rem] truncate text-[0.66rem] text-white/80">{asesor.nombre}</span>}
        </span>
      </button>
    </>
  )
}
