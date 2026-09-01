import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { detectarGenero } from '@/lib/genero'

interface BanioSlot { ocupado: boolean; porUsuario: string | null; porNombre: string | null; genero: 'M' | 'F'; tiempoId: number | null }
interface BanioStatus { hombres: BanioSlot; mujeres: BanioSlot }

function BanioAlertModal({ slot, onClose }: { slot: BanioSlot; onClose: () => void }) {
  const color = slot.genero === 'F' ? '#db2777' : '#2563eb'
  const emoji = slot.genero === 'F' ? '🚺' : '🚹'
  const label = slot.genero === 'F' ? 'Baño de mujeres' : 'Baño de hombres'
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-xs rounded-2xl bg-card shadow-2xl overflow-hidden" style={{ border: `2px solid ${color}33` }}>
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="px-6 py-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl" style={{ background: `${color}15` }}>{emoji}</div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color }}>{label}</p>
            <p className="text-[0.95rem] font-bold text-gray-800 mt-1">{slot.porNombre} está en el baño</p>
          </div>
          <button onClick={onClose} className="w-full rounded-xl py-2.5 text-[0.85rem] font-bold text-white" style={{ background: color }}>Enterado</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Watcher headless: escucha banio:status por socket y muestra un modal cuando
// alguien del mismo género ocupa el baño. Antes vivía dentro de PausaWidget
// (burbuja flotante, ya eliminada). El toggle de baño está en el menú de perfil.
export function BanioAlertWatcher() {
  const user = useAuthStore((s) => s.user)
  const myId = String(user?.id ?? '')
  const esF = user?.genero ? user.genero === 'F' : detectarGenero(user?.nombres ?? '') === 'F'
  const miKey = esF ? 'mujeres' : 'hombres'

  const [alerta, setAlerta] = useState<BanioSlot | null>(null)
  const prevRef = useRef<BanioStatus | null>(null)
  const alertadoRef = useRef<string | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (!user?.id) return
    const sock = getSocket()
    const onStatus = (data: BanioStatus) => {
      const antes = prevRef.current?.[miKey]
      const ahora = data[miKey]
      const alertKey = ahora.ocupado ? String(ahora.porUsuario) : null
      if (initRef.current && antes && !antes.ocupado && ahora.ocupado
          && String(ahora.porUsuario) !== myId && alertadoRef.current !== alertKey) {
        alertadoRef.current = alertKey
        setAlerta(ahora)
      }
      if (!ahora.ocupado) alertadoRef.current = null
      initRef.current = true
      prevRef.current = data
    }
    const onConn = () => sock.emit('banio:get')
    sock.on('banio:status', onStatus)
    sock.on('connect', onConn)
    if (sock.connected) sock.emit('banio:get')
    return () => { sock.off('banio:status', onStatus); sock.off('connect', onConn) }
  }, [user?.id, myId, miKey])

  if (!alerta) return null
  return <BanioAlertModal slot={alerta} onClose={() => setAlerta(null)} />
}
