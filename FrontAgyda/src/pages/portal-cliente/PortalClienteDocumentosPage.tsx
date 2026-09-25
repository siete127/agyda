import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { FileText, Download, Loader2, FolderOpen, Upload, Eye, X, ImageIcon } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalDocumento } from '@/types/portalCliente.types'
import { usePortalAcciones } from '@/hooks/usePortalAcciones'
import { Modal } from '@/components/ui/Modal'
import { PortalHero } from './components/PortalHero'
import { PortalBreadcrumb } from './components/PortalBreadcrumb'
import documentosHero from '@/assets/documentos-hero.png'

function formatTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Tipos que el navegador puede mostrar sin descargar.
function tipoVista(d: PortalDocumento): 'pdf' | 'imagen' | 'texto' | null {
  const mime = (d.mimeType || '').toLowerCase()
  const ext = d.nombreOriginal.toLowerCase().split('.').pop() ?? ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'imagen'
  if (mime.startsWith('text/') || ['txt', 'csv', 'xml'].includes(ext)) return 'texto'
  return null
}

const ACEPTA = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.xml'
const MAX_MB = 20

// Vista previa en un modal (PDF, imagen o texto). La URL del Blob se libera al cerrar.
function VistaDocumento({ doc, onClose, onDescargar }: { doc: PortalDocumento; onClose: () => void; onDescargar: () => void }) {
  const tipo = tipoVista(doc)
  const [url, setUrl] = useState<string | null>(null)
  const [texto, setTexto] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let u: string | null = null
    let vivo = true
    portalClienteService.obtenerDocumentoBlob(doc.id).then(async (blob) => {
      if (!vivo) return
      if (tipo === 'texto') { setTexto(await blob.text()); return }
      // El tipo del Blob manda cómo lo pinta el navegador (PDF dentro del iframe).
      const tipado = tipo === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob
      u = URL.createObjectURL(tipado)
      setUrl(u)
    }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false; if (u) URL.revokeObjectURL(u) }
  }, [doc.id, tipo])

  return (
    <Modal isOpen onClose={onClose} title={doc.nombreOriginal} size="xl">
      <div className="flex flex-col gap-3">
        <div className="flex h-[70vh] items-center justify-center overflow-hidden rounded-xl bg-surface">
          {error ? (
            <p className="text-sm text-ink-tertiary">No se pudo cargar el documento.</p>
          ) : tipo === 'texto' ? (
            texto == null ? <Loader2 className="h-6 w-6 animate-spin text-brand" /> : (
              <pre className="h-full w-full overflow-auto whitespace-pre-wrap p-4 text-xs text-ink">{texto}</pre>
            )
          ) : !url ? (
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          ) : tipo === 'pdf' ? (
            <iframe src={url} title={doc.nombreOriginal} className="h-full w-full" />
          ) : (
            <img src={url} alt={doc.nombreOriginal} className="max-h-full max-w-full object-contain" />
          )}
        </div>
        <div className="flex justify-end">
          <button onClick={onDescargar} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-surface">
            <Download className="h-4 w-4" /> Descargar
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function PortalClienteDocumentosPage() {
  const qc = useQueryClient()
  const { puede } = usePortalAcciones()
  const puedeSubir = puede('subir-documentos')
  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['portal-documentos'],
    queryFn: () => portalClienteService.getDocumentos(),
  })
  const [descargando, setDescargando] = useState<number | null>(null)
  const [viendo, setViendo] = useState<PortalDocumento | null>(null)
  const [pendiente, setPendiente] = useState<File | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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

  const subir = useMutation({
    mutationFn: () => portalClienteService.subirDocumento(pendiente!, descripcion.trim() || undefined),
    onSuccess: () => {
      toast.success('Documento enviado a tu asesor')
      setPendiente(null)
      setDescripcion('')
      qc.invalidateQueries({ queryKey: ['portal-documentos'] })
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo subir el documento'),
  })

  function elegirArchivo(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`El archivo pesa más de ${MAX_MB} MB`); return }
    setPendiente(f)
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PortalBreadcrumb seccion="Documentos" />

      <PortalHero icon={FileText} titulo="Documentos" descripcion="Archivos que hemos compartido contigo y los que tú nos envías." imagen={documentosHero} />

      {puedeSubir && (
        <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
          <input ref={inputRef} type="file" accept={ACEPTA} className="hidden"
            onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = '' }} />
          {!pendiente ? (
            <button type="button" onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); elegirArchivo(e.dataTransfer.files?.[0]) }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border px-4 py-7 text-center transition hover:border-brand hover:bg-brand/5">
              <Upload className="h-6 w-6 text-brand" />
              <span className="text-sm font-semibold text-ink">Enviar un documento</span>
              <span className="text-[11px] text-ink-tertiary">Arrastra aquí o haz clic · PDF, imágenes, Office, CSV, TXT, ZIP o XML · máx. {MAX_MB} MB</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-surface px-3.5 py-3">
                <FileText className="h-5 w-5 flex-shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{pendiente.name}</p>
                  <p className="text-[11px] text-ink-tertiary">{formatTamano(pendiente.size)}</p>
                </div>
                <button onClick={() => setPendiente(null)} title="Quitar" className="ml-auto rounded-lg p-1 text-ink-tertiary hover:bg-card"><X className="h-4 w-4" /></button>
              </div>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500}
                placeholder="Descripción (opcional)"
                className="rounded-xl border border-surface-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand sm:w-64" />
              <button onClick={() => subir.mutate()} disabled={subir.isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {subir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar
              </button>
            </div>
          )}
        </div>
      )}

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
            {documentos.map((d) => {
              const vista = tipoVista(d)
              return (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-surface-border px-3.5 py-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    {vista === 'imagen' ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                      <span className="truncate">{d.nombreOriginal}</span>
                      <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        d.subidoPorCliente ? 'bg-emerald-50 text-emerald-700' : 'bg-brand/10 text-brand')}>
                        {d.subidoPorCliente ? 'Enviado por ti' : 'De tu asesor'}
                      </span>
                    </p>
                    <span className="text-[11px] text-ink-tertiary">
                      {formatFecha(d.fechaSubida)} · {formatTamano(d.tamanoBytes)}
                      {d.subidoPorCliente && d.subidoPorNombre ? ` · ${d.subidoPorNombre}` : ''}
                      {d.descripcion ? ` · ${d.descripcion}` : ''}
                    </span>
                  </div>
                  {vista && (
                    <button type="button" onClick={() => setViendo(d)} title="Ver"
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-tertiary transition-colors hover:bg-brand/10 hover:text-brand">
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
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
              )
            })}
          </div>
        )}
      </div>

      {viendo && <VistaDocumento doc={viendo} onClose={() => setViendo(null)} onDescargar={() => descargar(viendo)} />}
    </div>
  )
}
