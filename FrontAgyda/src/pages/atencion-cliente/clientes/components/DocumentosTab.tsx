import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { FileText, Plus, Download, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { crmService } from '@/services/crm.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import type { CRMDocumentoCliente } from '@/types/crm.types'

const CATEGORIAS = [
  { key: 'identificacion', label: 'Identificación' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'comprobante_pago', label: 'Comprobante de pago' },
  { key: 'comprobante_domicilio', label: 'Comprobante de domicilio' },
  { key: 'factura', label: 'Factura' },
  { key: 'otro', label: 'Otro' },
]
const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.label]))

function fmtSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DocumentosTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const puedeGestionar = can('atencion-cliente', 'clientes-documentos')

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['clientes-documentos', contactoId],
    queryFn: () => crmService.getDocumentosCliente(contactoId),
    staleTime: 15_000,
  })

  const upload = useMutation({
    mutationFn: (file: File) => crmService.uploadDocumentoCliente(contactoId, file),
    onSuccess: () => { toast.success('Documento subido'); qc.invalidateQueries({ queryKey: ['clientes-documentos', contactoId] }) },
    onError: () => toast.error('Error al subir documento'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, visible }: { id: number; visible: boolean }) => crmService.toggleDocumentoPortal(id, visible),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes-documentos', contactoId] }),
    onError: () => toast.error('Error al actualizar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => crmService.deleteDocumentoCliente(id),
    onSuccess: () => { toast.success('Documento eliminado'); qc.invalidateQueries({ queryKey: ['clientes-documentos', contactoId] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Documentos del expediente</p>
        {puedeGestionar && (
          <label className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors cursor-pointer">
            {upload.isPending ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />} Subir documento
            <input type="file" className="hidden" onChange={handleFile} disabled={upload.isPending} />
          </label>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : documentos.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin documentos subidos</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {documentos.map((d: CRMDocumentoCliente) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{d.nombreOriginal}</p>
                  <p className="text-[0.68rem] text-gray-400">
                    {d.categoria && CATEGORIA_LABEL[d.categoria] ? `${CATEGORIA_LABEL[d.categoria]} · ` : ''}
                    {fmtSize(d.tamanoBytes)} · {new Date(d.fechaSubida).toLocaleDateString('es-MX')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', d.visiblePortal ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                  {d.visiblePortal ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {d.visiblePortal ? 'En portal' : 'Interno'}
                </span>
                <button onClick={() => crmService.downloadDocumentoCliente(d.id, d.nombreOriginal)} title="Descargar" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                  <Download className="h-3.5 w-3.5" />
                </button>
                {puedeGestionar && (
                  <>
                    <button onClick={() => toggle.mutate({ id: d.id, visible: !d.visiblePortal })} title={d.visiblePortal ? 'Ocultar del portal' : 'Mostrar en portal'} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
                      {d.visiblePortal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => { if (window.confirm('¿Eliminar este documento?')) eliminar.mutate(d.id) }}
                      title="Eliminar"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
