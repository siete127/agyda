import { useQuery } from '@tanstack/react-query'
import { User, Mail, Phone, Building2, Star, Laptop, TicketIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { ticketsService } from '@/services/tickets.service'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { PRIORIDAD_COLORS, ESTADO_COLORS, ESTADO_LABELS } from '@/types/ticket.types'

export function FichaUsuarioModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data: ficha, isLoading } = useQuery({
    queryKey: ['ficha-usuario', userId],
    queryFn: () => ticketsService.getFichaUsuario(userId),
  })

  return (
    <Modal isOpen onClose={onClose} title="Ficha del usuario" size="md" elevated>
      {isLoading || !ficha ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          {/* Perfil */}
          <div className="rounded-xl border border-surface-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink">{ficha.perfil.nombre}</p>
                <p className="text-[0.7rem] text-ink-tertiary">{ficha.perfil.tipoUsuario}{ficha.perfil.departamento ? ` · ${ficha.perfil.departamento}` : ''}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs text-ink-secondary">
              {ficha.perfil.correo && (
                <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-ink-tertiary" /> {ficha.perfil.correo}</p>
              )}
              {ficha.perfil.telefono && (
                <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-ink-tertiary" /> {ficha.perfil.telefono}</p>
              )}
              {ficha.perfil.departamento && (
                <p className="flex items-center gap-1.5"><Building2 className="h-3 w-3 text-ink-tertiary" /> {ficha.perfil.departamento}</p>
              )}
            </div>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-surface px-2 py-2 text-center">
              <p className="text-lg font-bold text-ink">{ficha.stats.totalTickets}</p>
              <p className="text-[0.6rem] text-ink-tertiary">Total</p>
            </div>
            <div className="rounded-lg bg-surface px-2 py-2 text-center">
              <p className="text-lg font-bold text-ink">{ficha.stats.ticketsAbiertos}</p>
              <p className="text-[0.6rem] text-ink-tertiary">Abiertos</p>
            </div>
            <div className="rounded-lg bg-surface px-2 py-2 text-center">
              <p className="text-lg font-bold text-ink">{ficha.stats.ticketsReabiertos}</p>
              <p className="text-[0.6rem] text-ink-tertiary">Reabiertos</p>
            </div>
            <div className="rounded-lg bg-surface px-2 py-2 text-center">
              <p className="flex items-center justify-center gap-0.5 text-lg font-bold text-ink">
                {ficha.stats.ratingPromedio !== null ? ficha.stats.ratingPromedio.toFixed(1) : '—'}
                {ficha.stats.ratingPromedio !== null && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
              </p>
              <p className="text-[0.6rem] text-ink-tertiary">Rating</p>
            </div>
          </div>

          {/* Tickets abiertos */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-ink-tertiary">
              <TicketIcon className="h-3 w-3" /> Tickets abiertos ({ficha.ticketsAbiertos.length})
            </p>
            {ficha.ticketsAbiertos.length === 0 ? (
              <p className="text-xs text-ink-tertiary">Sin tickets abiertos actualmente.</p>
            ) : (
              <div className="space-y-1">
                {ficha.ticketsAbiertos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-surface-border px-2.5 py-1.5">
                    <span className={clsx('chip text-[0.6rem]', ESTADO_COLORS[t.estado])}>{ESTADO_LABELS[t.estado]}</span>
                    <span className={clsx('chip text-[0.6rem]', PRIORIDAD_COLORS[t.prioridad])}>{t.prioridad}</span>
                    <span className="flex-1 truncate text-xs text-ink-secondary">#{t.id} {t.titulo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activos asignados */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-ink-tertiary">
              <Laptop className="h-3 w-3" /> Activos asignados ({ficha.activos.length})
            </p>
            {ficha.activos.length === 0 ? (
              <p className="text-xs text-ink-tertiary">Sin activos asignados registrados.</p>
            ) : (
              <div className="space-y-1">
                {ficha.activos.map((a) => (
                  <div key={a.id} className="rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-ink-secondary">
                    <p className="font-medium text-ink">{a.nombreEquipo || 'Equipo sin nombre'}</p>
                    <p className="text-[0.68rem] text-ink-tertiary">
                      {[a.marca, a.modelo, a.numeroSerie, a.sistemaOperativo].filter(Boolean).join(' · ') || 'Sin detalles'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
