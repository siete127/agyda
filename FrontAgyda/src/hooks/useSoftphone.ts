import { useEffect, useState } from 'react'

// Segundos transcurridos desde `inicio` (epoch ms), re-renderizando cada segundo.
export function useCronometro(inicio: number | null): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!inicio) return
    setAhora(Date.now())
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inicio])
  return inicio ? Math.max(0, Math.floor((ahora - inicio) / 1000)) : 0
}

export function formatoDuracion(seg: number): string {
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h ? `${h}:${mmss}` : mmss
}

// Timbre de llamada entrante generado con Web Audio (sin archivo de audio):
// doble tono 440+480 Hz, 1.2 s sonando cada 3 s, mientras `activo`.
export function useTonoTimbre(activo: boolean): void {
  useEffect(() => {
    if (!activo) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ctx.resume().catch(() => {})
    const sonar = () => {
      const t = ctx.currentTime
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.12, t + 0.03)
      gain.gain.setValueAtTime(0.12, t + 1.15)
      gain.gain.linearRampToValueAtTime(0, t + 1.2)
      gain.connect(ctx.destination)
      for (const f of [440, 480]) {
        const osc = ctx.createOscillator()
        osc.frequency.value = f
        osc.connect(gain)
        osc.start(t)
        osc.stop(t + 1.2)
      }
    }
    sonar()
    const id = setInterval(sonar, 3000)
    return () => { clearInterval(id); ctx.close().catch(() => {}) }
  }, [activo])
}
