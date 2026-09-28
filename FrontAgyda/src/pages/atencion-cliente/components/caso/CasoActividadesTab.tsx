import { useQuery } from '@tanstack/react-query'
import {
  FilePlus, RefreshCw, Trash2, Paperclip, FileX, ClipboardCheck, History,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'
import type { CasoActividad } from '@/types/caso.types'

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

function parseDetalle(detalle: string | null): Record<string, unknown> {
  if (!detalle) return {}
  try { return JSON.parse(detalle) } catch { return {} }
}

const ACCION_CONFIG: Record<string, { icon: typeof History; texto: (d: Record<string, unknown>) => string }> = {
  'crear-caso': { icon: FilePlus, texto: () => 'Caso creado' },
  'actualizar-estatus-caso': { icon: RefreshCw, texto: (d) => `Estatus cambiado a ${d.estatus ?? '—'}` },
  'eliminar-caso': { icon: Trash2, texto: () => 'Caso eliminado' },
  'subir-evidencia-caso': { icon: Paperclip, texto: () => 'Archivo adjuntado' },
  'eliminar-evidencia-caso': { icon: FileX, texto: () => 'Archivo eliminado' },
  'crear-accion-correctiva-caso': { icon: ClipboardCheck, texto: () => 'Acción correctiva registrada' },
}

function EventoActividad({ ev }: { ev: CasoActividad }) {
  const cfg = ACCION_CONFIG[ev.accion] ?? { icon: History, texto: () => ev.accion }
  const Icon = cfg.icon
  const detalle = parseDetalle(ev.detalle)
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-700">{cfg.texto(detalle)}</p>
        <p className="mt-0.5 text-[0.68rem] text-gray-400">
          {ev.usuarioNombre ?? 'Sistema'} · {fmtFecha(ev.fecha)}
        </p>
      </div>
    </div>
  )
}

export function CasoActividadesTab({ casoId }: { casoId: number }) {
  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['caso-actividad', casoId],
    queryFn: () => casoService.getActividad(casoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-card overflow-hidden">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : eventos.length === 0 ? (
        <p className="py-10 text-center text-[0.75rem] text-gray-400">Sin actividad registrada</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {eventos.map((ev) => <EventoActividad key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  )
}
