import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, Inbox, Download, Loader2, UserCheck, Clock, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { livechatService } from '@/services/livechat.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { LivechatHistorialFiltros } from '@/types/livechat.types'

function EstrellasPromedio({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-ink-tertiary">Sin calificaciones</span>
  return (
    <div className="flex items-center gap-1" title={`${rating.toFixed(1)} de 5`}>
      <Star size={13} className="fill-amber-400 text-amber-400" />
      <span className="text-sm font-semibold text-ink">{rating.toFixed(1)}</span>
    </div>
  )
}

// Resumen de calificación promedio por agente, respetando los mismos
// filtros que la lista de abajo — para detectar de un vistazo quién tiene
// mejor/peor calificación sin tener que abrir cada conversación.
function ResumenRatingPorAgente({ filtros }: { filtros: LivechatHistorialFiltros }) {
  const { data: ranking = [], isLoading } = useQuery({
    queryKey: ['livechat-historial-rating', filtros],
    queryFn: () => livechatService.getHistorialRatingPorAgente(filtros),
  })

  if (isLoading) return null
  if (ranking.length === 0) return null

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Calificación promedio por agente</p>
      <div className="flex flex-wrap gap-2">
        {ranking.map((r) => (
          <div key={r.agenteId} className="flex items-center gap-2.5 rounded-lg border border-surface-border bg-card px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{r.agenteNombre || 'Sin nombre'}</p>
              <p className="text-[10px] text-ink-tertiary">{r.totalCalificadas} de {r.totalConversaciones} calificadas</p>
            </div>
            <EstrellasPromedio rating={r.ratingPromedio} />
          </div>
        ))}
      </div>
    </div>
  )
}

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

function formatDuracion(inicioIso: string, cierreIso: string | null): string {
  if (!cierreIso) return '—'
  const inicio = new Date(inicioIso).getTime()
  const cierre = new Date(cierreIso).getTime()
  if (Number.isNaN(inicio) || Number.isNaN(cierre) || cierre < inicio) return '—'
  const minutos = Math.round((cierre - inicio) / 60000)
  if (minutos < 1) return '<1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `${horas} h ${String(resto).padStart(2, '0')} min`
}

function EstrellasRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-ink-tertiary">Sin calificar</span>
  return (
    <div className="flex items-center gap-0.5" title={`${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-ink-tertiary/40'}
        />
      ))}
    </div>
  )
}

// Contenido del historial de conversaciones de Livechat — compartido entre el
// modal de LivechatPage (agentes/supervisores del módulo) y el tab de
// SupervisoresPage (solo admins, ven siempre el historial completo: ahí no
// existe la noción de "mi propio historial").
export function HistorialConversacionesPanel({ puedeSupervisar, agenteId }: { puedeSupervisar: boolean; agenteId?: number }) {
  const [filtros, setFiltros] = useState<LivechatHistorialFiltros>(
    puedeSupervisar ? {} : { agenteId },
  )
  const [texto, setTexto] = useState('')

  const { data: historial = [], isLoading } = useQuery({
    queryKey: ['livechat-historial', filtros],
    queryFn: () => livechatService.getHistorial(filtros),
  })

  const { data: campanias = [] } = useQuery({
    queryKey: ['livechat-campanias'],
    queryFn: () => livechatService.getCampanias(),
    enabled: puedeSupervisar,
  })

  const { data: skills = [] } = useQuery({
    queryKey: ['livechat-grupos', filtros.campaniaId],
    queryFn: () => livechatService.getGrupos(filtros.campaniaId!),
    enabled: puedeSupervisar && filtros.campaniaId != null,
  })

  const exportar = useMutation({
    mutationFn: () => livechatService.exportHistorialCsv(filtros),
    onError: () => toast.error('No se pudo exportar el historial'),
  })

  const aplicarBusqueda = () => {
    setFiltros((prev) => ({ ...prev, texto: texto.trim() || undefined }))
  }

  return (
    <div className="space-y-4">
      {puedeSupervisar && <ResumenRatingPorAgente filtros={filtros} />}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface p-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Desde</label>
          <input
            type="date"
            value={filtros.fechaDesde ?? ''}
            onChange={(e) => setFiltros((prev) => ({ ...prev, fechaDesde: e.target.value || undefined }))}
            className="rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Hasta</label>
          <input
            type="date"
            value={filtros.fechaHasta ?? ''}
            onChange={(e) => setFiltros((prev) => ({ ...prev, fechaHasta: e.target.value || undefined }))}
            className="rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>
        {puedeSupervisar && (
          <>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Campaña</label>
              <select
                value={filtros.campaniaId ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : undefined
                  setFiltros((prev) => ({ ...prev, campaniaId: v, grupoId: undefined }))
                }}
                className="rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
              >
                <option value="">Todas</option>
                {campanias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Skill</label>
              <select
                value={filtros.grupoId ?? ''}
                onChange={(e) => setFiltros((prev) => ({ ...prev, grupoId: e.target.value ? Number(e.target.value) : undefined }))}
                disabled={filtros.campaniaId == null}
                className="rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none disabled:opacity-50"
              >
                <option value="">Todos</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Buscar</label>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarBusqueda()}
              placeholder="Nombre, email, motivo..."
              className="w-full rounded-lg border border-surface-border bg-card pl-8 pr-3 py-1.5 text-sm text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
            />
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={aplicarBusqueda}>Buscar</Button>
        <Button size="sm" variant="ghost" onClick={() => { setFiltros(puedeSupervisar ? {} : { agenteId }); setTexto('') }}>Limpiar</Button>
        <Button size="sm" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
          {exportar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportar CSV
        </Button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : historial.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-tertiary/15 text-ink-tertiary">
              <Inbox size={18} />
            </div>
            <p className="text-sm text-ink-tertiary">Sin conversaciones cerradas para estos filtros</p>
          </div>
        ) : (
          historial.map((c) => (
            <div key={c.id} className="rounded-xl border border-surface-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink truncate">{c.visitanteNombre || 'Anónimo'}</p>
                    {c.motivoCierre && (
                      <span className="shrink-0 rounded-full bg-ink-tertiary/15 px-2 py-0.5 text-[10px] font-semibold text-ink-tertiary">
                        {c.motivoCierre}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-tertiary truncate">
                    {c.visitanteEmail || c.visitanteTelefono || 'Sin contacto'}
                    {c.motivo ? ` · ${c.motivo}` : ''}
                  </p>
                </div>
                <EstrellasRating rating={c.rating} />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-border pt-2.5 text-xs text-ink-tertiary">
                <span className="flex items-center gap-1.5">
                  <UserCheck size={12} />
                  {c.agenteNombre || 'Sin agente'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={12} />
                  {formatFecha(c.fechaInicio)} → {formatFecha(c.fechaCierre)}
                </span>
                <span className="flex items-center gap-1.5 font-medium text-ink-secondary">
                  Duración: {formatDuracion(c.fechaInicio, c.fechaCierre)}
                </span>
              </div>

              {c.comentarioCierre && c.rating && (
                <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs italic text-ink-secondary">
                  "{c.comentarioCierre}"
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
