import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSoftphoneStore } from '@/stores/softphone.store'
import { contestar, colgar, silenciar, desconectar } from '@/services/softphone.service'
import { useCronometro, formatoDuracion, useTonoTimbre } from '@/hooks/useSoftphone'

const ejecutar = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error(e instanceof Error ? e.message : 'Error'))

/**
 * Llamada del softphone propio (vista PBX) visible fuera de /webphone: una
 * entrante timbra y se puede contestar desde cualquier módulo, y una llamada
 * en curso sigue a la vista. Vive junto a WebphoneFrame (ProtectedRoute) para
 * sobrevivir también a /ventas; al cerrar sesión se desmonta y libera la
 * extensión en el PBX.
 */
export function SoftphoneLlamadaFlotante() {
  const llamada = useSoftphoneStore((s) => s.llamada)
  const location = useLocation()
  const navigate = useNavigate()
  const duracion = useCronometro(llamada?.estado === 'en-llamada' ? llamada.inicio : null)

  // El timbre suena también dentro de /webphone: el panel no lo duplica.
  useTonoTimbre(llamada?.estado === 'timbrando')

  useEffect(() => () => { void desconectar() }, [])

  if (!llamada || location.pathname === '/webphone') return null

  const timbrando = llamada.estado === 'timbrando'
  const enLlamada = llamada.estado === 'en-llamada'

  return (
    <div
      className={clsx(
        'fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card py-2 pl-2 pr-2 shadow-2xl',
        timbrando ? 'border-emerald-300 ring-4 ring-emerald-400/30' : 'border-gray-200',
      )}
    >
      <button
        onClick={() => navigate('/webphone')}
        className="flex min-w-0 items-center gap-2.5 rounded-full py-0.5 pl-1 pr-2 text-left hover:bg-gray-50"
        title="Abrir el teléfono"
      >
        <span
          className={clsx(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white',
            timbrando ? 'animate-pulse bg-emerald-500' : enLlamada ? 'bg-brand' : 'bg-gray-400',
          )}
        >
          {timbrando ? <PhoneIncoming className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate text-sm font-semibold text-ink">
            {llamada.nombre || llamada.numero || 'Número privado'}
          </span>
          <span className="block text-xs text-ink-tertiary">
            {timbrando && 'Llamada entrante'}
            {llamada.estado === 'marcando' && 'Llamando…'}
            {enLlamada && <span className="font-mono tabular-nums text-emerald-600">{llamada.enEspera ? 'En espera · ' : ''}{formatoDuracion(duracion)}</span>}
            {llamada.estado === 'finalizada' && llamada.motivoFin}
          </span>
        </span>
      </button>

      {enLlamada && (
        <button
          onClick={() => silenciar(!llamada.silenciada)}
          className={clsx(
            'flex h-9 w-9 items-center justify-center rounded-full transition',
            llamada.silenciada ? 'bg-brand text-white' : 'bg-gray-100 text-ink-secondary hover:bg-gray-200',
          )}
          title={llamada.silenciada ? 'Activar micrófono' : 'Silenciar'}
        >
          {llamada.silenciada ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
      {timbrando && (
        <button
          onClick={() => ejecutar(contestar)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 text-xs font-bold text-white hover:bg-emerald-600"
        >
          <Phone className="h-4 w-4" /> Contestar
        </button>
      )}
      {llamada.estado !== 'finalizada' && (
        <button
          onClick={() => ejecutar(colgar)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
          title={timbrando ? 'Rechazar' : 'Colgar'}
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
