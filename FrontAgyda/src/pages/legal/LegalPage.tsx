import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Scale, FileText, Upload, Trash2, Loader2 } from 'lucide-react'
import { legalService } from '@/services/legal.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { AreaSubItemsGrid } from '@/components/ui/AreaSubItemsGrid'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

export function LegalPage() {
  const qc = useQueryClient()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['legal-documentos'],
    queryFn: () => legalService.getDocumentos(),
    staleTime: 30_000,
  })

  const uploadMutation = useMutation({
    mutationFn: () => legalService.subirDocumento(pendingFile!, titulo.trim(), categoria.trim() || undefined),
    onSuccess: () => {
      setPendingFile(null)
      setTitulo('')
      setCategoria('')
      qc.invalidateQueries({ queryKey: ['legal-documentos'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (nombreArchivo: string) => legalService.eliminarDocumento(nombreArchivo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['legal-documentos'] }),
  })

  function pickFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      setPendingFile(file)
      setTitulo(file.name.replace(/\.[^/.]+$/, ''))
    }
    input.click()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Scale className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Legal y Cumplimiento</h1>
            <p className="text-xs text-blue-200/70">Documentos legales, normativos y de cumplimiento</p>
          </div>
        </div>
      </div>

      <DashboardStatRow
        stats={[
          { key: 'total', icon: FileText, label: 'Documentos', value: docs.length, tone: 'brand' },
        ]}
      />

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Documentos legales</p>
          {!pendingFile && (
            <button
              onClick={pickFile}
              className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10"
            >
              <Upload className="h-3.5 w-3.5" /> Subir documento
            </button>
          )}
        </div>

        {pendingFile && (
          <div className="mb-3 space-y-2 rounded-xl border border-brand/30 bg-brand/5 p-3">
            <p className="truncate text-xs text-ink-secondary">Archivo: {pendingFile.name}</p>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título del documento"
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
            />
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Categoría (opcional)"
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setPendingFile(null); setTitulo(''); setCategoria('') }}
                disabled={uploadMutation.isPending}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-tertiary transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending || !titulo.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" /> Confirmar
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        )}
        {!isLoading && docs.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-tertiary">No hay documentos.</p>
        )}
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-surface px-3 py-2 transition-colors hover:border-brand/30">
              <FileText className="h-4 w-4 flex-shrink-0 text-brand/60" />
              <button
                onClick={() => window.open(legalService.viewUrl(doc.nombreArchivo), '_blank')}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink-secondary transition-colors hover:text-brand"
              >
                {doc.titulo}
              </button>
              {doc.categoria && <span className="chip bg-gray-100 text-gray-600">{doc.categoria}</span>}
              <button
                onClick={() => deleteMutation.mutate(doc.nombreArchivo)}
                disabled={deleteMutation.isPending}
                className="flex-shrink-0 rounded-lg p-1 text-ink-tertiary transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">Módulos de Legal y Cumplimiento</h2>
        <AreaSubItemsGrid areaPath="/legal" items={AREA_SUB_ITEMS['legal']} />
      </div>
    </div>
  )
}
