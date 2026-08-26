import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, Trash2, Globe2, Lock, Copy } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { capacitacionExamenService, type PreguntaExamenDraft } from '@/services/capacitacionExamen.service'
import type { PreguntaExamenTipo, TipoAccesoExamen } from '@/types/capacitacionExamen.types'

const PREGUNTA_VACIA: PreguntaExamenDraft = { texto: '', tipo: 'abierta', puntos: 1, opciones: [{ texto: '', esCorrecta: true }, { texto: '', esCorrecta: false }] }

export function ExamenFormModal({ cursoId, onClose }: { cursoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipoAcceso, setTipoAcceso] = useState<TipoAccesoExamen>('privado')
  const [puntajeMinimo, setPuntajeMinimo] = useState('70')
  const [preguntas, setPreguntas] = useState<PreguntaExamenDraft[]>([{ ...PREGUNTA_VACIA, opciones: PREGUNTA_VACIA.opciones.map((o) => ({ ...o })) }])
  const [linkCreado, setLinkCreado] = useState<string | null>(null)

  const addPregunta = () => setPreguntas([...preguntas, { texto: '', tipo: 'abierta', puntos: 1, opciones: [{ texto: '', esCorrecta: true }, { texto: '', esCorrecta: false }] }])
  const removePregunta = (i: number) => setPreguntas(preguntas.filter((_, idx) => idx !== i))
  const updatePregunta = (i: number, patch: Partial<PreguntaExamenDraft>) => setPreguntas(preguntas.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const updateOpcion = (i: number, opIdx: number, patch: Partial<{ texto: string; esCorrecta: boolean }>) =>
    setPreguntas(preguntas.map((p, idx) => idx !== i ? p : {
      ...p,
      opciones: p.opciones.map((o, oi) => oi === opIdx ? { ...o, ...patch } : (patch.esCorrecta ? { ...o, esCorrecta: false } : o)),
    }))
  const addOpcion = (i: number) => setPreguntas(preguntas.map((p, idx) => idx === i ? { ...p, opciones: [...p.opciones, { texto: '', esCorrecta: false }] } : p))
  const removeOpcion = (i: number, opIdx: number) => setPreguntas(preguntas.map((p, idx) => idx === i ? { ...p, opciones: p.opciones.filter((_, oi) => oi !== opIdx) } : p))

  const canSave = titulo.trim().length > 0
    && preguntas.every((p) => p.texto.trim() && (p.tipo === 'abierta' || (p.opciones.length >= 2 && p.opciones.every((o) => o.texto.trim()) && p.opciones.some((o) => o.esCorrecta))))

  const crear = useMutation({
    mutationFn: () => capacitacionExamenService.create(cursoId, {
      titulo, descripcion: descripcion || undefined, tipoAcceso,
      puntajeMinimo: Number(puntajeMinimo) || 70,
      preguntas: preguntas.map((p) => ({ ...p, opciones: p.tipo === 'cerrada' ? p.opciones : [] })),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['capacitacion-examenes', cursoId] })
      toast.success('Examen creado')
      if (tipoAcceso === 'publico' && data?.slugPublico) {
        setLinkCreado(`${window.location.origin}/examen/${data.slugPublico}`)
      } else {
        onClose()
      }
    },
    onError: () => toast.error('Error al crear el examen'),
  })

  if (linkCreado) {
    return (
      <Modal isOpen onClose={onClose} title="Examen público creado" size="sm">
        <div className="space-y-4 text-center py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
            <Globe2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm text-gray-600">Comparte este enlace para que cualquier persona pueda presentar el examen, sin necesidad de iniciar sesión.</p>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <input readOnly value={linkCreado} className="flex-1 bg-transparent text-xs text-gray-700 outline-none" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => { navigator.clipboard.writeText(linkCreado); toast.success('Enlace copiado') }}
              className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-brand/90 transition-colors flex-shrink-0"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
          <Button onClick={onClose} className="w-full">Listo</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Nuevo examen" size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de acceso</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTipoAcceso('privado')}
              className={clsx('flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all', tipoAcceso === 'privado' ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand/30')}>
              <span className="flex items-center gap-1.5 text-[0.78rem] font-bold text-gray-800"><Lock className="h-3.5 w-3.5 text-brand" /> Privado</span>
              <span className="text-[0.68rem] text-gray-400">Solo usuarios de la intranet, con sesión iniciada</span>
            </button>
            <button type="button" onClick={() => setTipoAcceso('publico')}
              className={clsx('flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all', tipoAcceso === 'publico' ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand/30')}>
              <span className="flex items-center gap-1.5 text-[0.78rem] font-bold text-gray-800"><Globe2 className="h-3.5 w-3.5 text-brand" /> Público</span>
              <span className="text-[0.68rem] text-gray-400">Cualquiera con el enlace, sin necesidad de sesión</span>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Ej. Examen final — Inducción general" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="field resize-none" placeholder="Opcional" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Puntaje mínimo para aprobar (%)</label>
          <input type="number" min="0" max="100" value={puntajeMinimo} onChange={(e) => setPuntajeMinimo(e.target.value)} className="field w-32" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Preguntas</span>
            <button onClick={addPregunta} className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:bg-brand/8 rounded-lg px-2 py-1 transition-colors">
              <Plus className="h-3 w-3" /> Agregar
            </button>
          </div>

          <div className="space-y-3">
            {preguntas.map((p, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-[0.68rem] font-bold text-gray-400">{i + 1}.</span>
                  <input value={p.texto} onChange={(e) => updatePregunta(i, { texto: e.target.value })} className="field flex-1 text-sm" placeholder="Texto de la pregunta" />
                  {preguntas.length > 1 && (
                    <button onClick={() => removePregunta(i)} className="mt-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 pl-4">
                  {(['abierta', 'cerrada'] as PreguntaExamenTipo[]).map((t) => (
                    <button key={t} onClick={() => updatePregunta(i, { tipo: t })}
                      className={clsx('rounded-lg px-2 py-1 text-[0.68rem] font-semibold border transition-colors', p.tipo === t ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-500 hover:border-brand/30')}>
                      {t === 'abierta' ? 'Abierta' : 'Cerrada (opciones)'}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-[0.65rem] text-gray-400">Puntos</span>
                    <input type="number" min="1" value={p.puntos} onChange={(e) => updatePregunta(i, { puntos: Number(e.target.value) || 1 })} className="field w-16 py-1 text-[0.72rem]" />
                  </div>
                </div>
                {p.tipo === 'cerrada' && (
                  <div className="pl-4 space-y-1.5">
                    {p.opciones.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button" onClick={() => updateOpcion(i, oi, { esCorrecta: true })}
                          title="Marcar como respuesta correcta"
                          className={clsx('h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors', o.esCorrecta ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300')}
                        />
                        <input value={o.texto} onChange={(e) => updateOpcion(i, oi, { texto: e.target.value })} className="field flex-1 text-xs py-1.5" placeholder={`Opción ${oi + 1}`} />
                        {p.opciones.length > 2 && (
                          <button onClick={() => removeOpcion(i, oi)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addOpcion(i)} className="text-[0.68rem] font-semibold text-brand hover:underline">+ Agregar opción</button>
                    <p className="text-[0.62rem] text-gray-400">Marca el círculo de la opción correcta.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-white pb-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!canSave} onClick={() => crear.mutate()}>
            Crear examen
          </Button>
        </div>
      </div>
    </Modal>
  )
}
