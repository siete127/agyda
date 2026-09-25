import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { ChevronRight, FileText, Download, Loader2, FolderOpen } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalDocumento } from '@/types/portalCliente.types'
import { PortalHero } from './components/PortalHero'

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Documentos</span>
    </div>
  )
}

function formatTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function PortalClienteDocumentosPage() {
  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['portal-documentos'],
    queryFn: () => portalClienteService.getDocumentos(),
  })
  const [descargando, setDescargando] = useState<number | null>(null)

  async function descargar(d: PortalDocumento) {
    setDescargando(d.id)
    try {
      await portalClienteService.descargarDocumento(d.id, d.nombreOriginal)
    } catch {
      toast.error('No se pudo descargar el documento')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />

      <PortalHero icon={FileText} titulo="Documentos" descripcion="Archivos que hemos compartido contigo." />

      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface" />
        ) : documentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-tertiary">
              <FolderOpen className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-ink">Aún no tienes documentos disponibles.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {documentos.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-surface-border px-3.5 py-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{d.nombreOriginal}</p>
                  <span className="text-[11px] text-ink-tertiary">{formatFecha(d.fechaSubida)} · {formatTamano(d.tamanoBytes)}</span>
                </div>
                <button
                  type="button"
                  disabled={descargando === d.id}
                  onClick={() => descargar(d)}
                  className={clsx(
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-tertiary transition-colors hover:bg-brand/10 hover:text-brand',
                    descargando === d.id && 'cursor-not-allowed opacity-60'
                  )}
                  title="Descargar"
                >
                  {descargando === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
