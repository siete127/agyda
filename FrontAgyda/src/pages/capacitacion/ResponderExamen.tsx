import { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ExamenDetalle, ExamenResultado, RespuestaExamenItem } from '@/types/capacitacionExamen.types'

// Vista genérica de "responder examen" — usada tanto desde el curso (privada,
// con sesión) como desde el link público (/examen/:slug, sin sesión). El
// envío real lo decide el padre vía onSubmit, igual que ResponderEncuesta.
export function ResponderExamen({
  examen, onCancel, onSubmit, isSubmitting,
}: {
  examen: ExamenDetalle
  onCancel: () => void
  onSubmit: (respuestas: RespuestaExamenItem[]) => Promise<ExamenResultado>
  isSubmitting?: boolean
}) {
  const [respuestas, setRespuestas] = useState<Record<number, RespuestaExamenItem>>({})
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ExamenResultado | null>(null)

  const todasRespondidas = examen.preguntas.every((p) => {
    const r = respuestas[p.id]
    return p.tipo === 'cerrada' ? !!r?.opcionId : !!r?.texto?.trim()
  })
  const pending = isSubmitting ?? enviando

  const enviar = async () => {
    setEnviando(true)
    try {
      const payload = Object.values(respuestas)
      const res = await onSubmit(payload)
      setResultado(res)
    } finally {
      setEnviando(false)
    }
  }

  if (resultado) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="card p-8 text-center space-y-4">
          <div className={clsx(
            'mx-auto flex h-16 w-16 items-center justify-center rounded-2xl',
            resultado.aprobado ? 'bg-emerald-100' : 'bg-red-100',
          )}>
            {resultado.aprobado ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <XCircle className="h-8 w-8 text-red-500" />}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{resultado.aprobado ? '¡Aprobado!' : 'No aprobado'}</h2>
          <p className="text-sm text-gray-500">
            Obtuviste <span className="font-bold text-gray-800">{resultado.puntajeObtenido}</span> de{' '}
            <span className="font-bold text-gray-800">{resultado.puntajeTotal}</span> puntos ({resultado.porcentaje}%)
          </p>
          <Button variant="ghost" onClick={onCancel}>Volver</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver
      </button>

      <div className="card p-5">
        <h2 className="text-base font-bold text-gray-900">{examen.titulo}</h2>
        {examen.descripcion && <p className="text-sm text-gray-500 mt-1">{examen.descripcion}</p>}
        <p className="mt-2 text-xs text-gray-400">{examen.preguntas.length} pregunta{examen.preguntas.length !== 1 ? 's' : ''} · mínimo para aprobar: {examen.puntajeMinimo}%</p>
      </div>

      {examen.preguntas.map((p, i) => (
        <div key={p.id} className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-800">{i + 1}. {p.texto}</p>
          {p.tipo === 'cerrada' ? (
            <div className="space-y-2">
              {p.opciones.map((opt) => {
                const seleccionada = respuestas[p.id]?.opcionId === opt.id
                return (
                  <label key={opt.id} className={clsx(
                    'flex items-center gap-3 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors',
                    seleccionada ? 'border-brand bg-brand/5' : 'border-gray-100 hover:border-brand/30',
                  )}>
                    <div className={clsx(
                      'h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                      seleccionada ? 'border-brand bg-brand' : 'border-gray-300',
                    )}>
                      {seleccionada && <div className="h-1.5 w-1.5 rounded-full bg-card" />}
                    </div>
                    <input
                      type="radio" name={`p-${p.id}`} value={opt.id} checked={seleccionada}
                      onChange={() => setRespuestas({ ...respuestas, [p.id]: { preguntaId: p.id, opcionId: opt.id } })}
                      className="sr-only"
                    />
                    <span className="text-sm text-gray-700">{opt.texto}</span>
                  </label>
                )
              })}
            </div>
          ) : (
            <textarea
              value={respuestas[p.id]?.texto ?? ''}
              onChange={(e) => setRespuestas({ ...respuestas, [p.id]: { preguntaId: p.id, texto: e.target.value } })}
              rows={3} className="field resize-none" placeholder="Escribe tu respuesta..."
            />
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button isLoading={pending} disabled={!todasRespondidas} onClick={enviar}>
          Enviar examen
        </Button>
      </div>
    </div>
  )
}
