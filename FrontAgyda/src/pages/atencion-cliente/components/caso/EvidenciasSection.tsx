import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Paperclip, Plus, Download, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'

function fmtSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Copiado de CasoDetalleModal.tsx (mismo backend, sin cambios de lógica) —
// aquí sin la restricción de "solo si es incidencia" que tenía el modal viejo,
// ya que el backend nunca restringió evidencias por tipo de caso.
export function EvidenciasSection({ casoId, puedeGestionar }: { casoId: number; puedeGestionar: boolean }) {
  const qc = useQueryClient()
  const queryKey = ['caso-evidencias', casoId]

  const { data: evidencias = [], isLoading } = useQuery({
    queryKey, queryFn: () => casoService.getEvidencias(casoId), staleTime: 15_000,
  })

  const subir = useMutation({
    mutationFn: (file: File) => casoService.subirEvidencia(casoId, file),
    onSuccess: () => { toast.success('Archivo subido'); qc.invalidateQueries({ queryKey }) },
    onError: () => toast.error('Error al subir el archivo'),
  })
  const eliminar = useMutation({
    mutationFn: (id: number) => casoService.deleteEvidencia(id),
    onSuccess: () => { toast.success('Archivo eliminado'); qc.invalidateQueries({ queryKey }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) subir.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-[0.75rem] font-bold text-gray-600">Archivos</p>
        {puedeGestionar && (
          <label className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[0.68rem] font-bold text-white hover:bg-brand-dark transition-colors cursor-pointer">
            {subir.isPending ? <Spinner size="sm" /> : <Plus className="h-3 w-3" />} Adjuntar
            <input type="file" className="hidden" onChange={handleFile} disabled={subir.isPending} />
          </label>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      ) : evidencias.length === 0 ? (
        <p className="pb-6 text-center text-[0.7rem] text-gray-400">Sin archivos adjuntos</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {evidencias.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[0.75rem] font-semibold text-gray-800 truncate">{ev.nombreOriginal}</p>
                  <p className="text-[0.65rem] text-gray-400">{fmtSize(ev.tamanoBytes)} · {new Date(ev.fechaSubida).toLocaleDateString('es-MX')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => casoService.downloadEvidencia(ev.id, ev.nombreOriginal)} title="Descargar" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                  <Download className="h-3.5 w-3.5" />
                </button>
                {puedeGestionar && (
                  <button onClick={() => { if (window.confirm('¿Eliminar este archivo?')) eliminar.mutate(ev.id) }} title="Eliminar" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
