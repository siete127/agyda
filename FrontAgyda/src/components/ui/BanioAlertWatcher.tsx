import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePausaModulos } from '@/hooks/usePausaTipos'
import { useBanioEstado } from '@/hooks/useBanioEstado'
import type { BanioEspacioEstado } from '@/types/pausaTipos.types'

interface Alerta {
  espacio: BanioEspacioEstado
  nombre: string // quien acaba de entrar
  otrosLibres: string[] // otros baños que le corresponden y aún tienen lugar
}

const ESTILO_GENERO = {
  F: { color: '#db2777', emoji: '🚺' },
  M: { color: '#2563eb', emoji: '🚹' },
  mixto: { color: '#7c3aed', emoji: '🚻' },
}

function BanioAlertModal({ alerta, onClose }: { alerta: Alerta; onClose: () => void }) {
  const { color, emoji } = ESTILO_GENERO[alerta.espacio.genero ?? 'mixto']
  const lleno = alerta.espacio.capacidad > 1
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-xs rounded-2xl bg-card shadow-2xl overflow-hidden" style={{ border: `2px solid ${color}33` }}>
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="px-6 py-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl" style={{ background: `${color}15` }}>{emoji}</div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color }}>{alerta.espacio.nombre}</p>
            <p className="text-[0.95rem] font-bold text-gray-800 mt-1">
              {lleno ? `Se llenó: ${alerta.nombre} acaba de entrar` : `${alerta.nombre} está en el baño`}
            </p>
            {alerta.otrosLibres.length > 0 && (
              <p className="mt-1 text-[0.75rem] text-gray-500">Hay lugar en: {alerta.otrosLibres.join(', ')}</p>
            )}
          </div>
          <button onClick={onClose} className="w-full rounded-xl py-2.5 text-[0.85rem] font-bold text-white" style={{ background: color }}>Enterado</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Watcher headless: muestra un aviso cuando se llena uno de los baños que le
// corresponden al usuario (por género y área, según Configuración → Tipos de
// pausa → Baño → Espacios). Con baños de 1 persona es "fulano está en el baño".
// El toggle de baño está en el menú de perfil.
export function BanioAlertWatcher() {
  // Solo quien puede marcar pausas (reports:gestionar-pausas, con el módulo
  // activo en su empresa) usa el baño y recibe estas alertas.
  const { puedePausar } = usePausaModulos()
  const { estado, misEspacios, dentro, myId } = useBanioEstado(puedePausar)

  const [alerta, setAlerta] = useState<Alerta | null>(null)
  const prevRef = useRef<Map<number, string[]> | null>(null) // espacioId -> userIds adentro
  const alertadoRef = useRef<string | null>(null)

  useEffect(() => {
    if (!estado) return
    const antes = prevRef.current
    prevRef.current = new Map(estado.espacios.map((e) => [e.id, e.ocupantes.map((o) => o.userId)]))
    if (!antes || dentro) return // la primera foto no avisa; tampoco si yo estoy adentro
    for (const e of misEspacios) {
      const prev = antes.get(e.id) ?? []
      const llenoAhora = e.ocupantes.length >= e.capacidad
      if (!llenoAhora) continue
      if (prev.length >= e.capacidad) continue // ya estaba lleno
      const nuevo = e.ocupantes.find((o) => !prev.includes(o.userId) && o.userId !== myId)
      if (!nuevo) continue
      const key = `${e.id}:${nuevo.userId}`
      if (alertadoRef.current === key) continue
      alertadoRef.current = key
      const otrosLibres = misEspacios.filter((x) => x.id !== e.id && x.ocupantes.length < x.capacidad).map((x) => x.nombre)
      setAlerta({ espacio: e, nombre: nuevo.nombre, otrosLibres })
      break
    }
  }, [estado, misEspacios, dentro, myId])

  if (!alerta || !puedePausar) return null
  return <BanioAlertModal alerta={alerta} onClose={() => setAlerta(null)} />
}
