import { clsx } from 'clsx'
import { personalizacionService, type Mascota } from '@/services/personalizacion.service'

const CLASE_MOV: Record<Mascota['movimiento'], string> = {
  ninguno: '',
  flotar: 'mascota-flotar',
  saludar: 'mascota-saludar',
  latir: 'mascota-latir',
  balanceo: 'mascota-balanceo',
}
const SPEED: Record<Mascota['velocidad'], number> = { lenta: 1.8, normal: 1, rapida: 0.6 }

/** Render de la mascota del tablero (o de una vista previa). Si la empresa no
 *  configuró ninguna, usa el video del sistema (`/dashboard-mascota.mp4`). */
export function MascotaTablero({ mascota, className }: { mascota: Mascota; className?: string }) {
  const url = mascota.mediaId ? personalizacionService.mediaUrl(mascota.mediaId) : null
  const esVideo = mascota.mediaId ? mascota.tipo === 'video' : true
  const movClase = mascota.mediaId ? CLASE_MOV[mascota.movimiento] : ''

  return (
    <div
      className={clsx('flex h-full w-full items-center justify-center', className)}
      style={{ ['--mascota-speed' as string]: SPEED[mascota.velocidad] }}
    >
      {esVideo ? (
        <video
          src={url ?? '/dashboard-mascota.mp4'}
          poster={url ? undefined : '/dashboard-mascota-poster.jpg'}
          autoPlay loop muted playsInline
          className={clsx('h-full w-full object-contain', movClase)}
        />
      ) : (
        <img
          src={url ?? '/dashboard-mascota-poster.jpg'}
          alt="Mascota de la empresa"
          className={clsx('h-full w-full object-contain', movClase)}
        />
      )}
    </div>
  )
}
