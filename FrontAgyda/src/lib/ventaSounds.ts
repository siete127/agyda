/* Sonidos de notificación de ventas — generados con WebAudio, sin archivos.
   `venta`  → acorde ascendente alegre (aprobada / formalizada / garantizada)
   `rechazo`→ dos tonos graves descendentes (rechazada / declinado / cancelada) */

let ctx: AudioContext | null = null
function audioCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function beep(c: AudioContext, freqStart: number, freqEnd: number, at: number, dur: number, vol = 0.12) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'triangle'
  osc.connect(gain)
  gain.connect(c.destination)
  osc.frequency.setValueAtTime(freqStart, c.currentTime + at)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), c.currentTime + at + dur)
  gain.gain.setValueAtTime(vol, c.currentTime + at)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + at + dur)
  osc.start(c.currentTime + at)
  osc.stop(c.currentTime + at + dur + 0.02)
}

export function playVentaSound() {
  const c = audioCtx()
  if (!c) return
  // Do–Mi–Sol ascendente
  beep(c, 523, 587, 0, 0.14)
  beep(c, 659, 740, 0.13, 0.14)
  beep(c, 784, 880, 0.26, 0.22, 0.14)
}

export function playRechazoSound() {
  const c = audioCtx()
  if (!c) return
  beep(c, 320, 220, 0, 0.18, 0.14)
  beep(c, 240, 150, 0.16, 0.28, 0.12)
}
