import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Copy, ChevronRight, Users2, MessagesSquare, Inbox, X } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { LivechatCampania } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { GruposPanel } from './GruposPanel'

// URL base del widget público — el link completo para pegar en la página que
// va a usar esta campaña se arma con ?campaignToken=<token>.
// NOTA: ajustar si el widget de Chat en Vivo no vive en window.location.origin:8080 —
// verificar el dominio/puerto real donde está desplegado el widget público.
const WIDGET_BASE_URL = `${window.location.origin.replace(/:\d+$/, ':8080')}`

// Áreas de negocio disponibles para etiquetar una campaña — determinan qué
// tipo de conversaciones/skill atiende el grupo de agentes de esa campaña.
export const AREAS_CAMPANIA = ['Ventas', 'Soporte', 'Cobranza', 'Atención a Cliente', 'Otro']

function CrearCampaniaForm({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [area, setArea] = useState('')
  const [open, setOpen] = useState(false)

  const crear = useMutation({
    mutationFn: () => livechatService.createCampania({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, area: area || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-campanias'] })
      toast.success('Campaña creada')
      setNombre('')
      setDescripcion('')
      setArea('')
      setOpen(false)
      onCreated()
    },
    onError: () => toast.error('No se pudo crear la campaña'),
  })

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        Nueva campaña
      </Button>
    )
  }

  return (
    <div className="border border-brand/30 rounded-xl p-4 space-y-3 bg-brand/5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-secondary">Nueva campaña</p>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-tertiary hover:text-ink-secondary rounded-lg p-0.5">
          <X size={14} />
        </button>
      </div>
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de la campaña"
        className="w-full rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        autoFocus
      />
      <input
        type="text"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        className="w-full rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
      />
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className="w-full rounded-lg border border-surface-border bg-card px-3 py-1.5 text-sm text-ink-secondary focus:border-brand focus:outline-none"
      >
        <option value="">Área (opcional)</option>
        {AREAS_CAMPANIA.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button size="sm" onClick={() => crear.mutate()} disabled={!nombre.trim() || crear.isPending}>
          {crear.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Crear
        </Button>
      </div>
    </div>
  )
}

function CampaniaRow({ campania, expandida, onToggle }: { campania: LivechatCampania; expandida: boolean; onToggle: () => void }) {
  const qc = useQueryClient()

  const toggleActivo = useMutation({
    mutationFn: () => livechatService.updateCampania(campania.id, { activo: !campania.activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-campanias'] })
      toast.success(campania.activo ? 'Campaña desactivada' : 'Campaña activada')
    },
    onError: () => toast.error('No se pudo actualizar la campaña'),
  })

  const copiarLink = () => {
    const link = `${WIDGET_BASE_URL}/?campaignToken=${campania.token}`
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Link del widget copiado'))
      .catch(() => toast.error('No se pudo copiar el link'))
  }

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden bg-card transition-all',
      expandida ? 'border-brand/40 shadow-sm' : 'border-surface-border',
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronRight size={16} className={clsx('text-ink-tertiary transition-transform shrink-0', expandida && 'rotate-90')} />
          <span className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            campania.activo ? 'bg-brand/15 text-brand' : 'bg-ink-tertiary/15 text-ink-tertiary',
          )}>
            <MessagesSquare size={14} />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink truncate">{campania.nombre}</p>
            {campania.descripcion && <p className="text-xs text-ink-tertiary truncate">{campania.descripcion}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {campania.area && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500">
              {campania.area}
            </span>
          )}
          <span className={clsx(
            'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full',
            campania.activo ? 'bg-emerald-500/15 text-emerald-500' : 'bg-ink-tertiary/15 text-ink-tertiary',
          )}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', campania.activo ? 'bg-emerald-500' : 'bg-ink-tertiary')} />
            {campania.activo ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </button>

      {expandida && (
        <div className="border-t border-surface-border px-4 py-3 space-y-3 bg-surface">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={copiarLink}>
              <Copy size={13} />
              Copiar link del widget
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleActivo.mutate()} disabled={toggleActivo.isPending}>
              {campania.activo ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
          <GruposPanel campaniaId={campania.id} />
        </div>
      )}
    </div>
  )
}

export function CampaniasModal({ onClose }: { onClose: () => void }) {
  const { data: campanias = [], isLoading, refetch } = useQuery({
    queryKey: ['livechat-campanias'],
    queryFn: () => livechatService.getCampanias(),
  })
  const [expandidaId, setExpandidaId] = useState<number | null>(null)

  return (
    <Modal isOpen onClose={onClose} title="Campañas" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5 flex-1">
            <Users2 size={15} className="text-brand shrink-0 mt-0.5" />
            <p className="text-xs text-ink-secondary leading-relaxed">
              Cada campaña puede tener varios grupos de atención, con sus propios agentes, plantillas y motivos de cierre.
            </p>
          </div>
          <CrearCampaniaForm onCreated={refetch} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : campanias.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-tertiary/15 text-ink-tertiary">
              <Inbox size={18} />
            </div>
            <p className="text-sm text-ink-tertiary">Todavía no hay campañas creadas</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {campanias.map((c) => (
              <CampaniaRow
                key={c.id}
                campania={c}
                expandida={expandidaId === c.id}
                onToggle={() => setExpandidaId((prev) => (prev === c.id ? null : c.id))}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
