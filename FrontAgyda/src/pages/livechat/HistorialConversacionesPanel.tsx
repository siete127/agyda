import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, Inbox, Download, Loader2, Clock, Star, X, TrendingUp, UserCheck } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { livechatService } from '@/services/livechat.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import type { LivechatHistorialFiltros } from '@/types/livechat.types'

// Color semántico del rating: rojo si va mal, ámbar a medias, verde si va
// bien — así el resumen se lee sin tener que fijarse en el número.
function colorRating(rating: number | null) {
  if (rating == null) return { text: 'text-ink-tertiary', bg: 'bg-ink-tertiary/10', ring: 'ring-ink-tertiary/20' }
  if (rating >= 4) return { text: 'text-emerald-600', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/25' }
  if (rating >= 3) return { text: 'text-amber-600', bg: 'bg-amber-500/10', ring: 'ring-amber-500/25' }
  return { text: 'text-red-600', bg: 'bg-red-500/10', ring: 'ring-red-500/25' }
}

// Tarjeta de resumen de calificación promedio por agente, respetando los
// mismos filtros que la lista de abajo — para detectar de un vistazo quién
// tiene mejor/peor calificación sin abrir conversación por conversación.
function ResumenRatingPorAgente({ filtros }: { filtros: LivechatHistorialFiltros }) {
  const { data: ranking = [], isLoading } = useQuery({
    queryKey: ['livechat-historial-rating', filtros],
    queryFn: () => livechatService.getHistorialRatingPorAgente(filtros),
  })

  // Solo agentes con al menos una conversación calificada — un agente con
  // 0 calificadas no aporta información de calidad al resumen.
  const conCalificaciones = ranking.filter((r) => r.totalCalificadas > 0)
  if (isLoading || conCalificaciones.length === 0) return null

  const ordenado = [...conCalificaciones].sort((a, b) => (b.ratingPromedio ?? -1) - (a.ratingPromedio ?? -1))

  return (
    <div className="rounded-2xl border border-surface-border bg-gradient-to-br from-surface to-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <TrendingUp size={14} />
        </div>
        <p className="text-sm font-semibold text-ink">Calificación por agente</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {ordenado.map((r) => {
          const c = colorRating(r.ratingPromedio)
          return (
            <div
              key={r.agenteId}
              className={clsx('flex items-center gap-2.5 rounded-xl border border-surface-border bg-card px-3 py-2.5 ring-1 ring-inset', c.ring)}
            >
              <Avatar name={r.agenteNombre ?? '?'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink truncate">{r.agenteNombre || 'Sin nombre'}</p>
                <p className="text-[10px] text-ink-tertiary">{r.totalCalificadas}/{r.totalConversaciones} calificadas</p>
              </div>
              <div className={clsx('flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1', c.bg)}>
                {r.ratingPromedio != null ? (
                  <>
                    <Star size={11} className={clsx('fill-current', c.text)} />
                    <span className={clsx('text-xs font-bold', c.text)}>{r.ratingPromedio.toFixed(1)}</span>
                  </>
                ) : (
                  <span className="text-[10px] text-ink-tertiary">—</span>
                )}
              </div>
            </div>
          )
        })}
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
  if (!rating) {
    return (
      <span className="flex-shrink-0 rounded-full bg-ink-tertiary/10 px-2.5 py-1 text-[10px] font-medium text-ink-tertiary">
        Sin calificar
      </span>
    )
  }
  const c = colorRating(rating)
  return (
    <div className={clsx('flex flex-shrink-0 items-center gap-0.5 rounded-full px-2 py-1', c.bg)} title={`${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          className={n <= rating ? clsx('fill-current', c.text) : 'text-ink-tertiary/30'}
        />
      ))}
    </div>
  )
}

function FiltroCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</label>
      {children}
    </div>
  )
}

const campoClase = 'rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition-shadow'

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

  const hayFiltrosActivos = Boolean(
    filtros.fechaDesde || filtros.fechaHasta || filtros.campaniaId || filtros.grupoId || filtros.texto,
  )

  const limpiarFiltros = () => {
    setFiltros(puedeSupervisar ? {} : { agenteId })
    setTexto('')
  }

  return (
    <div className="space-y-4">
      {puedeSupervisar && <ResumenRatingPorAgente filtros={filtros} />}

      <div className="rounded-2xl border border-surface-border bg-surface p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <FiltroCampo label="Desde">
            <input
              type="date"
              value={filtros.fechaDesde ?? ''}
              onChange={(e) => setFiltros((prev) => ({ ...prev, fechaDesde: e.target.value || undefined }))}
              className={campoClase}
            />
          </FiltroCampo>
          <FiltroCampo label="Hasta">
            <input
              type="date"
              value={filtros.fechaHasta ?? ''}
              onChange={(e) => setFiltros((prev) => ({ ...prev, fechaHasta: e.target.value || undefined }))}
              className={campoClase}
            />
          </FiltroCampo>
          {puedeSupervisar && (
            <>
              <FiltroCampo label="Campaña">
                <select
                  value={filtros.campaniaId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined
                    setFiltros((prev) => ({ ...prev, campaniaId: v, grupoId: undefined }))
                  }}
                  className={campoClase}
                >
                  <option value="">Todas</option>
                  {campanias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </FiltroCampo>
              <FiltroCampo label="Skill">
                <select
                  value={filtros.grupoId ?? ''}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, grupoId: e.target.value ? Number(e.target.value) : undefined }))}
                  disabled={filtros.campaniaId == null}
                  className={clsx(campoClase, 'disabled:opacity-50 disabled:cursor-not-allowed')}
                >
                  <option value="">Todos</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </FiltroCampo>
            </>
          )}
          <div className="flex-1 min-w-[180px]">
            <FiltroCampo label="Buscar">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
                <input
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && aplicarBusqueda()}
                  placeholder="Nombre, email, motivo..."
                  className={clsx(campoClase, 'w-full pl-8')}
                />
              </div>
            </FiltroCampo>
          </div>
          <Button size="sm" variant="secondary" onClick={aplicarBusqueda}>Buscar</Button>
          <Button size="sm" onClick={() => exportar.mutate()} disabled={exportar.isPending}>
            {exportar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar CSV
          </Button>
        </div>

        {hayFiltrosActivos && (
          <div className="mt-2.5 flex items-center gap-2 border-t border-surface-border pt-2.5">
            <span className="text-[0.68rem] text-ink-tertiary">Filtros activos</span>
            <button
              onClick={limpiarFiltros}
              className="flex items-center gap-1 rounded-full bg-ink-tertiary/10 px-2 py-0.5 text-[0.68rem] font-medium text-ink-secondary hover:bg-ink-tertiary/20"
            >
              <X size={10} /> Limpiar todo
            </button>
          </div>
        )}
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
            <div key={c.id} className="group rounded-xl border border-surface-border bg-card px-4 py-3 transition-colors hover:border-brand/25">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <Avatar name={c.visitanteNombre ?? 'Anónimo'} size="sm" />
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
