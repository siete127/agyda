import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Folder, FileText, ChevronLeft, HardDrive } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { api } from '@/lib/axios'

interface Carpeta {
  id: number
  nombre: string
}

interface ArchivoDrive {
  id: number
  nombre: string
  extension: string
  tamano: number
}

function parseCarpeta(r: Record<string, unknown>): Carpeta {
  return {
    id: Number(r['id'] ?? 0),
    nombre: String(r['nombre'] ?? ''),
  }
}

function parseArchivoDrive(r: Record<string, unknown>): ArchivoDrive {
  return {
    id: Number(r['id'] ?? 0),
    nombre: String(r['nombre'] ?? ''),
    extension: String(r['extension'] ?? '').replace('.', ''),
    tamano: Number(r['tamano'] ?? 0),
  }
}

function formatTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DriveArchivoPickerProps {
  onClose: () => void
  onSeleccionar: (archivo: ArchivoDrive) => void
}

export function DriveArchivoPicker({ onClose, onSeleccionar }: DriveArchivoPickerProps) {
  const [carpetaActual, setCarpetaActual] = useState<Carpeta | null>(null)

  const { data: carpetas = [], isLoading: cargandoCarpetas } = useQuery({
    queryKey: ['mensajeria-drive-carpetas'],
    queryFn: async () => {
      const { data } = await api.get('/drive/carpetas')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseCarpeta)
    },
  })

  const { data: archivos = [], isLoading: cargandoArchivos } = useQuery({
    queryKey: ['mensajeria-drive-archivos', carpetaActual?.id],
    queryFn: async () => {
      if (!carpetaActual) return []
      const { data } = await api.get('/drive/archivos', { params: { carpetaId: carpetaActual.id } })
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseArchivoDrive)
    },
    enabled: !!carpetaActual,
  })

  return (
    <Modal isOpen onClose={onClose} title="Elegir archivo de tu Drive" size="md">
      <div className="space-y-3">
        {carpetaActual && (
          <button
            onClick={() => setCarpetaActual(null)}
            className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Carpetas
          </button>
        )}

        <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100">
          {!carpetaActual ? (
            cargandoCarpetas ? (
              <div className="flex justify-center py-8"><Spinner size="sm" /></div>
            ) : carpetas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                <HardDrive className="h-8 w-8" />
                <p className="text-sm">No tienes carpetas en tu Drive</p>
              </div>
            ) : (
              carpetas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCarpetaActual(c)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                >
                  <Folder className="h-4 w-4 flex-shrink-0 text-brand" />
                  <span className="truncate">{c.nombre}</span>
                </button>
              ))
            )
          ) : cargandoArchivos ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : archivos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
              <FileText className="h-8 w-8" />
              <p className="text-sm">Esta carpeta no tiene archivos</p>
            </div>
          ) : (
            archivos.map((a) => (
              <button
                key={a.id}
                onClick={() => onSeleccionar(a)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="truncate flex-1">{a.nombre}</span>
                <span className="flex-shrink-0 text-xs text-gray-400">{formatTamano(a.tamano)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
