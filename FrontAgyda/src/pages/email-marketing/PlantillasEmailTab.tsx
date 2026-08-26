import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, Edit2, Eye } from 'lucide-react'
import { emailMarketingService } from '@/services/emailMarketing.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { EmailPlantilla } from '@/types/emailMarketing.types'
import toast from 'react-hot-toast'

function PlantillaForm({ plantilla, onDone }: { plantilla?: EmailPlantilla; onDone: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [asunto, setAsunto] = useState(plantilla?.asunto ?? '')
  const [cuerpoHtml, setCuerpoHtml] = useState(plantilla?.cuerpoHtml ?? '')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const preview = useMutation({
    mutationFn: () => emailMarketingService.previewPlantilla(cuerpoHtml, asunto),
    onSuccess: (data) => setPreviewHtml(data.html),
    onError: () => toast.error('No se pudo generar la vista previa'),
  })

  const guardar = useMutation({
    mutationFn: () => plantilla
      ? emailMarketingService.updatePlantilla(plantilla.id, { nombre: nombre.trim(), asunto: asunto.trim(), cuerpoHtml })
      : emailMarketingService.createPlantilla({ nombre: nombre.trim(), asunto: asunto.trim(), cuerpoHtml }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-plantillas'] })
      toast.success(plantilla ? 'Plantilla actualizada' : 'Plantilla creada')
      onDone()
    },
    onError: () => toast.error('No se pudo guardar la plantilla'),
  })

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Boletín mensual"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Asunto <span className="normal-case font-normal text-gray-400">(usa {'{{nombre}}'}, {'{{empresa}}'}, {'{{correo}}'})</span>
          </label>
          <input
            type="text"
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Ej. Hola {{nombre}}, novedades de este mes"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cuerpo (HTML)</label>
          <textarea
            value={cuerpoHtml}
            onChange={(e) => setCuerpoHtml(e.target.value)}
            rows={12}
            placeholder="<h2>Hola {{nombre}}</h2><p>...</p>"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono resize-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Vista previa</label>
            <Button size="sm" variant="ghost" onClick={() => preview.mutate()} disabled={!cuerpoHtml.trim() || preview.isPending}>
              {preview.isPending ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
              Actualizar
            </Button>
          </div>
          <div className="w-full h-[268px] overflow-y-auto rounded-lg border border-gray-300 bg-white p-3 text-sm">
            {previewHtml ? (
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <p className="text-gray-400 text-xs">Escribe el HTML y da clic en "Actualizar" para ver cómo se vería con un contacto de ejemplo.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button size="sm" onClick={() => guardar.mutate()} disabled={!nombre.trim() || !asunto.trim() || !cuerpoHtml.trim() || guardar.isPending}>
          {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  )
}

export function PlantillasEmailTab() {
  const qc = useQueryClient()
  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['email-plantillas'],
    queryFn: () => emailMarketingService.getPlantillas(),
  })
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const eliminar = useMutation({
    mutationFn: (id: number) => emailMarketingService.deletePlantilla(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-plantillas'] })
      toast.success('Plantilla eliminada')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Las plantillas se usan al crear una campaña. Cada correo enviado incluye automáticamente un link real de baja al final.</p>
        {!creando && (
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus size={14} />
            Nueva plantilla
          </Button>
        )}
      </div>

      {creando && <PlantillaForm onDone={() => setCreando(false)} />}

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : plantillas.length === 0 && !creando ? (
        <p className="text-center text-sm text-gray-400 py-10">Todavía no hay plantillas creadas</p>
      ) : (
        <div className="space-y-2">
          {plantillas.map((p) => (
            editandoId === p.id ? (
              <PlantillaForm key={p.id} plantilla={p} onDone={() => setEditandoId(null)} />
            ) : (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 bg-white">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.nombre}</p>
                  <p className="text-xs text-gray-400 truncate">{p.asunto}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setEditandoId(p.id)} className="text-gray-300 hover:text-brand p-1.5"><Edit2 size={14} /></button>
                  <button type="button" onClick={() => { if (window.confirm('¿Eliminar esta plantilla?')) eliminar.mutate(p.id) }} className="text-gray-300 hover:text-red-500 p-1.5"><Trash2 size={14} /></button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
