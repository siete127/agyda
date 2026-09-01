import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Users2, Layers, UserRound, MessagesSquare, Inbox, Trash2 } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { LivechatCampania, LivechatGrupo } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { AgentesDeGrupo } from './GruposPanel'

const SIN_AREA = 'Sin área asignada'

// Un color estable por área (hash simple del nombre) para que cada bloque se
// distinga de un vistazo sin tener que leer la etiqueta cada vez.
const PALETAS_AREA = [
  { chip: 'bg-indigo-500/15 text-indigo-500', ring: 'ring-indigo-500/15' },
  { chip: 'bg-sky-500/15 text-sky-500', ring: 'ring-sky-500/15' },
  { chip: 'bg-amber-500/15 text-amber-500', ring: 'ring-amber-500/15' },
  { chip: 'bg-rose-500/15 text-rose-500', ring: 'ring-rose-500/15' },
  { chip: 'bg-emerald-500/15 text-emerald-500', ring: 'ring-emerald-500/15' },
  { chip: 'bg-violet-500/15 text-violet-500', ring: 'ring-violet-500/15' },
]
const PALETA_SIN_AREA = { chip: 'bg-ink-tertiary/15 text-ink-tertiary', ring: 'ring-surface-border' }

function paletaDeArea(area: string): typeof PALETAS_AREA[number] {
  if (area === SIN_AREA) return PALETA_SIN_AREA
  let hash = 0
  for (let i = 0; i < area.length; i++) hash = (hash * 31 + area.charCodeAt(i)) >>> 0
  return PALETAS_AREA[hash % PALETAS_AREA.length]
}

function GrupoConAgentes({ grupo, campaniaId }: { grupo: LivechatGrupo; campaniaId: number }) {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const { data: agentes = [] } = useQuery({
    queryKey: ['livechat-grupo-agentes', grupo.id],
    queryFn: () => livechatService.getAgentesDeGrupo(grupo.id),
    enabled: abierto,
  })

  const [confirmarOpen, setConfirmarOpen] = useState(false)

  const eliminar = useMutation({
    mutationFn: () => livechatService.deleteGrupo(grupo.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-grupos', campaniaId] })
      toast.success('Grupo eliminado')
    },
    onError: () => toast.error('No se pudo eliminar el grupo'),
  })

  return (
    <div className={clsx(
      'rounded-lg border overflow-hidden bg-card transition-colors',
      abierto ? 'border-brand/40' : 'border-surface-border',
    )}>
      <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex flex-1 min-w-0 items-center gap-2 text-left"
        >
          <ChevronRight size={13} className={clsx('text-ink-tertiary transition-transform shrink-0', abierto && 'rotate-90')} />
          <span className="text-sm leading-none">{grupo.icono}</span>
          <span className="text-sm font-medium text-ink-secondary flex-1 min-w-0 truncate">{grupo.nombre}</span>
        </button>
        {abierto && agentes.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-tertiary shrink-0">
            <UserRound size={11} />
            {agentes.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => setConfirmarOpen(true)}
          disabled={eliminar.isPending}
          title="Eliminar grupo"
          className="shrink-0 rounded-lg p-1 text-ink-tertiary hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {abierto && (
        <div className="border-t border-surface-border px-3 py-2.5 bg-surface">
          <AgentesDeGrupo grupoId={grupo.id} />
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmarOpen}
        onClose={() => setConfirmarOpen(false)}
        onConfirm={() => eliminar.mutate()}
        title="Eliminar grupo"
        message={`¿Eliminar el grupo "${grupo.nombre}"? Los agentes asignados dejarán de pertenecer a él. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        isPending={eliminar.isPending}
        elevated
      />
    </div>
  )
}

function CampaniaConGrupos({ campania }: { campania: LivechatCampania }) {
  const [expandida, setExpandida] = useState(false)
  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['livechat-grupos', campania.id],
    queryFn: () => livechatService.getGrupos(campania.id),
    enabled: expandida,
  })

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden bg-card transition-all',
      expandida ? 'border-brand/40 shadow-sm' : 'border-surface-border',
    )}>
      <button
        type="button"
        onClick={() => setExpandida((v) => !v)}
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
          <p className="font-medium text-ink truncate">{campania.nombre}</p>
        </div>
        <span className={clsx(
          'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0',
          campania.activo ? 'bg-emerald-500/15 text-emerald-500' : 'bg-ink-tertiary/15 text-ink-tertiary',
        )}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', campania.activo ? 'bg-emerald-500' : 'bg-ink-tertiary')} />
          {campania.activo ? 'Activa' : 'Inactiva'}
        </span>
      </button>
      {expandida && (
        <div className="border-t border-surface-border px-4 py-3 space-y-2 bg-surface">
          {isLoading ? (
            <div className="flex justify-center py-3"><Spinner size="sm" /></div>
          ) : grupos.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-ink-tertiary py-1">
              <Inbox size={13} />
              Esta campaña todavía no tiene grupos de atención
            </p>
          ) : (
            grupos.map((g) => <GrupoConAgentes key={g.id} grupo={g} campaniaId={campania.id} />)
          )}
        </div>
      )}
    </div>
  )
}

export function UsuariosCampaniasModal({ onClose }: { onClose: () => void }) {
  const { data: campanias = [], isLoading } = useQuery({
    queryKey: ['livechat-campanias'],
    queryFn: () => livechatService.getCampanias(),
  })

  const porArea = campanias.reduce<Record<string, LivechatCampania[]>>((acc, c) => {
    const area = c.area?.trim() || SIN_AREA
    if (!acc[area]) acc[area] = []
    acc[area].push(c)
    return acc
  }, {})
  const areas = Object.keys(porArea).sort((a, b) => (a === SIN_AREA ? 1 : b === SIN_AREA ? -1 : a.localeCompare(b)))

  return (
    <Modal isOpen onClose={onClose} title="Grupo de Agentes" size="xl">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5">
          <Users2 size={15} className="text-brand shrink-0 mt-0.5" />
          <p className="text-xs text-ink-secondary leading-relaxed">
            Cada campaña está etiquetada por área de negocio. Expande una campaña para asignar agentes a sus
            grupos de atención. Para crear campañas o grupos nuevos, usá "Campañas".
          </p>
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
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
            {areas.map((area) => {
              const paleta = paletaDeArea(area)
              return (
                <div key={area} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={clsx('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full', paleta.chip)}>
                      <Layers size={11} />
                      {area}
                    </span>
                    <span className="text-[11px] font-medium text-ink-tertiary">
                      {porArea[area].length} campaña{porArea[area].length === 1 ? '' : 's'}
                    </span>
                    <div className="h-px flex-1 bg-surface-border" />
                  </div>
                  <div className={clsx('space-y-2 rounded-2xl ring-1 ring-inset p-2', paleta.ring)}>
                    {porArea[area].map((c) => <CampaniaConGrupos key={c.id} campania={c} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
