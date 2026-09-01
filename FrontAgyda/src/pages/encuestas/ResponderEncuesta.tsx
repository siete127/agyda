import { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Encuesta, RespuestaPayloadItem } from '@/types/encuesta.types'

/* ══════════════════════════════════════
   VISTA RESPONDER — genérica, usada tanto por /mis-encuestas (privada)
   como por /encuesta/:slug (pública). El envío real lo decide el padre
   vía onSubmit, para no acoplar este componente a un endpoint fijo.
══════════════════════════════════════ */
export function ResponderEncuesta({
  encuesta, onDone, onSubmit, isSubmitting, onCancel,
}: {
  encuesta: Encuesta
  onDone: () => void
  onSubmit: (respuestas: RespuestaPayloadItem[]) => Promise<unknown> | void
  isSubmitting?: boolean
  onCancel?: () => void
}) {
  const [respuestas, setRespuestas] = useState<Record<number, string>>({})
  const [enviando, setEnviando] = useState(false)

  const todasRespondidas = encuesta.preguntas.every((p) => respuestas[p.id]?.trim())
  const pending = isSubmitting ?? enviando

  const enviar = async () => {
    setEnviando(true)
    try {
      await onSubmit(Object.entries(respuestas).map(([preguntaId, respuesta]) => ({
        preguntaId: Number(preguntaId), respuesta,
      })))
      onDone()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={onCancel ?? onDone} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a encuestas
      </button>

      <div className="card p-5">
        <h2 className="text-base font-bold text-gray-900">{encuesta.titulo}</h2>
        {encuesta.descripcion && <p className="text-sm text-gray-500 mt-1">{encuesta.descripcion}</p>}
        <p className="mt-2 text-xs text-gray-400">{encuesta.preguntas.length} pregunta{encuesta.preguntas.length !== 1 ? 's' : ''}</p>
      </div>

      {encuesta.preguntas.map((p, i) => (
        <div key={p.id} className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-800">{i + 1}. {p.texto}</p>
          {(p.tipo === 'opcion_multiple' || p.tipo === 'cerrada') && p.opciones.length > 0 ? (
            <div className="space-y-2">
              {p.opciones.map((opt) => (
                <label key={opt} className={clsx(
                  'flex items-center gap-3 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors',
                  respuestas[p.id] === opt ? 'border-brand bg-brand/5' : 'border-gray-100 hover:border-brand/30',
                )}>
                  <div className={clsx(
                    'h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    respuestas[p.id] === opt ? 'border-brand bg-brand' : 'border-gray-300',
                  )}>
                    {respuestas[p.id] === opt && <div className="h-1.5 w-1.5 rounded-full bg-card" />}
                  </div>
                  <input type="radio" name={`p-${p.id}`} value={opt} checked={respuestas[p.id] === opt}
                    onChange={() => setRespuestas({ ...respuestas, [p.id]: opt })} className="sr-only" />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          ) : p.tipo === 'escala' ? (
            <div className="flex items-center gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRespuestas({ ...respuestas, [p.id]: String(n) })}
                  className={clsx(
                    'h-10 w-10 rounded-xl text-sm font-semibold border transition-all',
                    respuestas[p.id] === String(n)
                      ? 'bg-brand text-white border-brand shadow-glow'
                      : 'border-gray-200 text-gray-600 hover:border-brand/50 hover:text-brand',
                  )}>{n}</button>
              ))}
              <span className="text-xs text-gray-400 ml-1">1 = Muy malo · 5 = Excelente</span>
            </div>
          ) : (
            <textarea value={respuestas[p.id] ?? ''} onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
              rows={2} className="field resize-none" placeholder="Escribe tu respuesta..." />
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel ?? onDone}>Cancelar</Button>
        <Button isLoading={pending} disabled={!todasRespondidas} onClick={enviar}>
          Enviar respuestas
        </Button>
      </div>
    </div>
  )
}
