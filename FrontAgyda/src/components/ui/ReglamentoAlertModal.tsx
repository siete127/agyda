import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, CheckCircle2, FileText, X, ChevronLeft } from 'lucide-react'
import { api } from '@/lib/axios'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import toast from 'react-hot-toast'

function usePdfBlob(enabled: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    setError(false)
    api.get('/reglamento/pdf?doc=reglamento')
      .then((res) => {
        const base64 = res.data?.data ?? res.data
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        setBlobUrl(url)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [enabled])

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  return { blobUrl, loading, error }
}

export function ReglamentoAlertModal() {
  const qc = useQueryClient()
  const { isAllowed } = useModuleAccess()
  const [showPdf, setShowPdf] = useState(false)

  // Si el módulo 'reglamento' está desactivado para la empresa, /accept
  // devolvería 403 y el modal encerraría al usuario sin salida. En ese caso
  // no se consulta el estado ni se muestra el modal.
  const reglamentoActivo = isAllowed('reglamento')

  const { data, isLoading } = useQuery({
    queryKey: ['reglamento-status'],
    queryFn: async () => {
      const res = await api.get('/reglamento/status')
      const payload = res.data?.data ?? res.data
      return payload as { pending: boolean | number; currentVersion?: number; acceptedVersion?: number }
    },
    staleTime: 60_000,
    enabled: reglamentoActivo,
  })

  const { blobUrl, loading: pdfLoading, error: pdfError } = usePdfBlob(showPdf)

  const aceptar = useMutation({
    mutationFn: () => api.post('/reglamento/accept'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reglamento-status'] })
      toast.success('Reglamento aceptado')
    },
    onError: () => toast.error('Error al aceptar el reglamento'),
  })

  // Mostrar para TODOS los roles si tienen reglamento pendiente
  const pendiente = reglamentoActivo && !isLoading && data != null && (data.pending === true || data.pending === 1)
  if (!pendiente) return null

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      {/* Backdrop — no se puede cerrar */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {showPdf ? (
        /* ── Panel visor de PDF ── */
        <div className="relative flex flex-col w-full max-w-3xl h-[90vh] rounded-2xl bg-card shadow-2xl overflow-hidden animate-slide-up border border-indigo-100">
          {/* Header del visor */}
          <div className="flex items-center justify-between px-5 py-3 bg-indigo-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-white" />
              <span className="text-sm font-bold text-white">Reglamento Interno</span>
            </div>
            <button
              onClick={() => setShowPdf(false)}
              className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Regresar
            </button>
          </div>

          {/* Visor */}
          <div className="flex-1 bg-gray-100">
            {pdfLoading && (
              <div className="flex h-full items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              </div>
            )}
            {pdfError && (
              <div className="flex h-full items-center justify-center text-sm text-red-500">
                No se pudo cargar el PDF. Intenta de nuevo.
              </div>
            )}
            {blobUrl && !pdfLoading && (
              <iframe
                src={blobUrl}
                className="h-full w-full border-0"
                title="Reglamento Interno"
              />
            )}
          </div>

          {/* Footer con botón de aceptar */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-card flex-shrink-0">
            <p className="text-xs text-gray-400">Debes leer el reglamento antes de aceptar.</p>
            <button
              onClick={() => aceptar.mutate()}
              disabled={aceptar.isPending}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {aceptar.isPending
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <CheckCircle2 className="h-4 w-4" />}
              Acepto el reglamento
            </button>
          </div>
        </div>
      ) : (
        /* ── Tarjeta inicial ── */
        <div className="relative w-full max-w-sm rounded-2xl bg-card shadow-2xl overflow-hidden animate-slide-up border-2 border-indigo-100">
          <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-indigo-400" />

          <div className="px-7 py-8 flex flex-col items-center gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 shadow-sm">
              <BookOpen className="h-8 w-8 text-indigo-600" />
            </div>

            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-indigo-500 mb-1">
                Acción requerida
              </p>
              <h2 className="text-base font-bold text-gray-900">Reglamento Interno</h2>
              <p className="mt-2 text-[0.82rem] text-gray-500 max-w-xs leading-relaxed">
                Debes leer y aceptar el reglamento interno antes de continuar usando AGYDA.
              </p>
            </div>

            {/* Ver reglamento → abre visor */}
            <button
              onClick={() => setShowPdf(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors w-full justify-center"
            >
              <FileText className="h-3.5 w-3.5" />
              Ver reglamento
            </button>

            <button
              onClick={() => aceptar.mutate()}
              disabled={aceptar.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {aceptar.isPending
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <CheckCircle2 className="h-4 w-4" />}
              Acepto el reglamento
            </button>

            <p className="text-[0.68rem] text-gray-400">
              No puedes acceder a AGYDA hasta aceptar el reglamento.
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
