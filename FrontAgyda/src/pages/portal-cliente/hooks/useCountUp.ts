import { useEffect, useRef, useState } from 'react'

/**
 * Anima un número contando desde 0 hasta `end` al montar (o cuando `end`
 * cambia). Sin dependencias externas — mismo efecto visual que los
 * "count up" de librerías tipo React Bits, con un ease-out simple
 * (cubic) para que la animación desacelere hacia el final en vez de
 * moverse a velocidad constante.
 */
export function useCountUp(end: number, durationMs = 900) {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    startRef.current = null
    cancelAnimationFrame(frameRef.current)

    function step(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * end))
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, durationMs])

  return value
}
