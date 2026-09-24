import { useEffect, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { detectarGenero } from '@/lib/genero'
import { aplicaEspacio, type BanioEstado } from '@/types/pausaTipos.types'

// Estado en vivo de los baños (socket banio:status) visto por el usuario
// actual: qué espacios le corresponden por género y área, si está adentro y
// si todos los suyos están llenos. El servidor decide al entrar; esto solo
// refleja el estado para el menú y los avisos.
export function useBanioEstado(enabled = true) {
  const user = useAuthStore((s) => s.user)
  const myId = String(user?.id ?? '')
  const genero: 'M' | 'F' = user?.genero === 'F' || user?.genero === 'M' ? user.genero : detectarGenero(user?.nombres ?? '')
  const area = (user?.tipoUsuario ?? '').toUpperCase()

  const [estado, setEstado] = useState<BanioEstado | null>(null)
  useEffect(() => {
    if (!enabled) return
    const sock = getSocket()
    // Un servidor viejo manda solo { hombres, mujeres }: sin espacios.
    const onStatus = (data: Partial<BanioEstado>) =>
      setEstado({ espacios: data?.espacios ?? [], sinEspacio: data?.sinEspacio ?? [] })
    const onConn = () => sock.emit('banio:get')
    sock.on('banio:status', onStatus)
    sock.on('connect', onConn)
    if (sock.connected) sock.emit('banio:get')
    return () => { sock.off('banio:status', onStatus); sock.off('connect', onConn) }
  }, [enabled])

  const espacios = estado?.espacios ?? []
  const misEspacios = espacios.filter((e) => aplicaEspacio(e, genero, area))
  const espacioDentro = espacios.find((e) => e.ocupantes.some((o) => o.userId === myId)) ?? null
  const dentro = !!espacioDentro || !!estado?.sinEspacio.some((o) => o.userId === myId)
  // Sin espacios que le correspondan, entra sin semáforo: nunca está "lleno".
  const lleno = !dentro && misEspacios.length > 0 && misEspacios.every((e) => e.ocupantes.length >= e.capacidad)

  return {
    estado,
    myId,
    genero,
    area,
    misEspacios,
    espacioDentro,
    dentro,
    lleno,
    ocupantes: misEspacios.flatMap((e) => e.ocupantes),
    variosEspacios: espacios.length > 1,
  }
}
