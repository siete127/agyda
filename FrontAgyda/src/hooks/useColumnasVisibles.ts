import { useEffect, useState } from 'react'
import { supervisoresService } from '@/services/supervisores.service'

// Vistas guardadas / columnas visibles — Fase 3, punto 3.6 del plan basado
// en PSUP. `columnasDisponibles` es la lista completa que la tabla sabe
// dibujar; lo que se guarda en el backend es solo el subconjunto elegido.
// Una clave guardada que ya no existe en `columnasDisponibles` se descarta
// sola al filtrar — así una tabla vieja no rompe si sus columnas cambian.
export function useColumnasVisibles(tabla: string, columnasDisponibles: { key: string; label: string }[]) {
  const todasLasClaves = columnasDisponibles.map((c) => c.key)
  const [visibles, setVisibles] = useState<string[]>(todasLasClaves)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    let vivo = true
    supervisoresService.getVistaColumnas(tabla)
      .then((guardadas) => {
        if (!vivo) return
        if (guardadas && guardadas.length) {
          const filtradas = guardadas.filter((k) => todasLasClaves.includes(k))
          setVisibles(filtradas.length ? filtradas : todasLasClaves)
        }
        setCargado(true)
      })
      .catch(() => setCargado(true))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla])

  const toggle = (key: string) => {
    setVisibles((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      const ordenado = todasLasClaves.filter((k) => next.includes(k))
      supervisoresService.guardarVistaColumnas(tabla, ordenado).catch(() => { /* silencioso */ })
      return ordenado
    })
  }

  return { visibles, toggle, cargado, esVisible: (key: string) => visibles.includes(key) }
}
