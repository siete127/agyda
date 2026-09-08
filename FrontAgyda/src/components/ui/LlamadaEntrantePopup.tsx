import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Phone, PhoneOff, User, Mail, Calendar, Megaphone } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useSocketEvent } from '@/hooks/useSocket'

// Screen-pop de llamada entrante: cuando webphoneController.incomingCall
// recibe el evento de la central telefónica (VICIdial u otra) y emite
// 'webphone:incomingCall' por socket, este componente muestra al agente
// asignado (userId === mi id) una ventana con los datos de quien llama.
//
// Hoy solo resuelve datos contra "Postulación Totis" (CCO_CAMPANIA_POSTULANTES,
// match por teléfono) porque es el caso pedido — si la llamada no coincide
// con ningún postulante, igual se muestra el número entrante desnudo para
// que el agente sepa que le está sonando algo, sin bloquear el flujo.
interface PostulanteTotis {
  id: number
  nombre: string
  telefono: string
  correo: string | null
  fechaRegistro: string | null
  campania: string | null
}

interface IncomingCallPayload {
  userId: number
  extension: string | null
  neusUsuario: string | null
  leadId: string | number | null
  phone: string | null
  postulanteTotis: PostulanteTotis | null
  timestamp: string
}

interface LlamadaActiva extends IncomingCallPayload {
  uid: number
}

export function LlamadaEntrantePopup() {
  const user = useAuthStore((s) => s.user)
  const [llamada, setLlamada] = useState<LlamadaActiva | null>(null)

  useSocketEvent<IncomingCallPayload>('webphone:incomingCall', (payload) => {
    if (!user?.id || payload.userId !== user.id) return
    setLlamada({ ...payload, uid: Date.now() })
  })

  if (!llamada) return null

  const postulante = llamada.postulanteTotis

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/30 pt-24 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 bg-emerald-500 px-5 py-4">
          <div className="relative flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Phone className="h-5 w-5 text-white" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-white" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.7rem] font-bold text-white/90 uppercase tracking-wide">Llamada entrante</p>
            <p className="text-base font-bold text-white truncate">
              {postulante?.nombre || 'Número desconocido'}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm text-ink">
            <Phone className="h-4 w-4 text-ink-tertiary flex-shrink-0" />
            <span className="font-semibold">{llamada.phone || postulante?.telefono || 'Sin número'}</span>
          </div>

          {postulante ? (
            <>
              <div className="flex items-center gap-2 text-sm text-ink">
                <User className="h-4 w-4 text-ink-tertiary flex-shrink-0" />
                <span>{postulante.nombre}</span>
              </div>
              {postulante.correo && (
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Mail className="h-4 w-4 text-ink-tertiary flex-shrink-0" />
                  <span className="truncate">{postulante.correo}</span>
                </div>
              )}
              {postulante.campania && (
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Megaphone className="h-4 w-4 text-ink-tertiary flex-shrink-0" />
                  <span>Postulación: {postulante.campania}</span>
                </div>
              )}
              {postulante.fechaRegistro && (
                <div className="flex items-center gap-2 text-sm text-ink-secondary">
                  <Calendar className="h-4 w-4 text-ink-tertiary flex-shrink-0" />
                  <span>Se postuló el {new Date(postulante.fechaRegistro).toLocaleDateString('es-MX')}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-secondary">
              Este número no coincide con ninguna postulación registrada.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-app px-5 py-3">
          <button
            onClick={() => setLlamada(null)}
            className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <PhoneOff className="h-4 w-4" /> Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
